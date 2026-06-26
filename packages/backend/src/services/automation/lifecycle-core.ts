import {
  AutomationExecutionStatuses,
  AutomationExecutionOutcomes,
  AutomationAttemptStatuses,
  AutomationDispatchKinds,
  AutomationModes,
  AutomationSystemErrorCodes,
  AnalysisOrigins,
  OUTCOME_TO_STATUS,
  ANALYSIS_BEARING_OUTCOMES,
  isTerminalExecutionStatus,
} from "@go-watchtower/shared";
import type {
  ActiveAttemptSnapshot,
  AnalysisRouting,
  AnalysisRoutingInput,
  CancelAckDecision,
  CancelDecision,
  CompleteGateOutcome,
  DeliveryMetadata,
  ExecutionSnapshot,
  FailDecision,
  FinalizerDecision,
  LifecycleBudgets,
  ProgressDecision,
  ReaperDecision,
  SafetyNetDecision,
  StartDecision,
  TerminalStatus,
} from "./lifecycle-types.js";

const S = AutomationExecutionStatuses;

function asTerminalStatus(status: ExecutionSnapshot["status"]): TerminalStatus {
  // Caller guarantees the status is terminal.
  return status as TerminalStatus;
}

function leaseStillValid(
  execution: ExecutionSnapshot,
  now: Date,
  marginMs: number,
): boolean {
  if (execution.workerDeadlineAt === null) {
    return false;
  }
  return now.getTime() <= execution.workerDeadlineAt.getTime() + marginMs;
}

function isSameDeliveryTuple(
  attempt: ActiveAttemptSnapshot,
  delivery: DeliveryMetadata,
): boolean {
  return (
    attempt.sqsMessageId === delivery.sqsMessageId &&
    attempt.cycleReceiveCount === delivery.approximateReceiveCount
  );
}

/**
 * Arbitra il lease di `start` sotto lock (§9.7). Deterministica per snapshot:
 * la transazione + l'indice parziale `one_running_per_execution` risolvono la
 * concorrenza fra due `start` con tuple diverse (un solo `START`).
 */
export function decideStart(
  execution: ExecutionSnapshot,
  activeAttempt: ActiveAttemptSnapshot | null,
  delivery: DeliveryMetadata,
  now: Date,
  budgets: LifecycleBudgets,
): StartDecision {
  // 1. stato terminale
  if (isTerminalExecutionStatus(execution.status)) {
    return {
      action: "NO_OP",
      response: { disposition: "ALREADY_TERMINAL", status: asTerminalStatus(execution.status) },
    };
  }

  // 2. CANCEL_REQUESTED: control signal, nessuna apertura attempt; la delivery
  //    non possiede il fencing token dell'owner e fa solo ACK.
  if (execution.status === S.CANCEL_REQUESTED) {
    return {
      action: "NO_OP",
      response: {
        disposition: "CANCEL_REQUESTED",
        // cancelRequestId è valorizzato in CANCEL_REQUESTED (CHECK DB).
        cancelRequestId: execution.cancelRequestId ?? "",
      },
    };
  }

  // 3-4. esiste un attempt attivo (status RUNNING con lease)
  if (execution.status === S.RUNNING && activeAttempt !== null) {
    if (isSameDeliveryTuple(activeAttempt, delivery)) {
      // retry HTTP della stessa tuple → ALREADY_STARTED, no-op su contatori/deadline/audit.
      return {
        action: "IDEMPOTENT_REPLAY",
        response: {
          disposition: "ALREADY_STARTED",
          attemptId: activeAttempt.id,
          // conserva la deadline hard del lease corrente
          workerDeadlineAt: (execution.workerDeadlineAt ?? delivery.workerDeadlineAt).toISOString(),
        },
      };
    }

    if (leaseStillValid(execution, now, budgets.attemptLeaseMarginMs)) {
      // delivery diversa, lease ancora valido → ALREADY_RUNNING (token owner non esposto).
      return {
        action: "NO_OP",
        response: {
          disposition: "ALREADY_RUNNING",
          workerDeadlineAt: (execution.workerDeadlineAt ?? delivery.workerDeadlineAt).toISOString(),
        },
      };
    }

    // lease hard scaduto → takeover atomico.
    return buildStartDecision(execution, delivery, activeAttempt.id, budgets);
  }

  // 5. stato runnable senza lease (PENDING_DISPATCH|QUEUED|RETRY_PENDING)
  return buildStartDecision(execution, delivery, null, budgets);
}

function buildStartDecision(
  execution: ExecutionSnapshot,
  delivery: DeliveryMetadata,
  takeoverAttemptId: string | null,
  budgets: LifecycleBudgets,
): StartDecision {
  // Un redrive con nuovo sqsMessageId apre un nuovo ciclo solo quando acquisisce
  // il lease: deliveryCycle++, reset cycleReceiveCount, rinnovo deadlineAt.
  const opensNewCycle =
    execution.sqsMessageId !== null && execution.sqsMessageId !== delivery.sqsMessageId;
  const nextDeliveryCycle = opensNewCycle ? execution.deliveryCycle + 1 : execution.deliveryCycle;
  const nextCycleReceiveCount = delivery.approximateReceiveCount;
  // Primo start del ciclo → now + cycleBudget; per il takeover/redrive si rinnova.
  const nextDeadlineAt = new Date(delivery.workerDeadlineAt.getTime() + budgets.cycleBudgetMs);
  return {
    action: "START",
    response: {
      disposition: "START",
      attemptId: "", // assegnato dalla route alla creazione dell'attempt
      workerDeadlineAt: delivery.workerDeadlineAt.toISOString(),
    },
    takeoverAttemptId,
    opensNewCycle,
    nextDeliveryCycle,
    nextCycleReceiveCount,
    nextAttemptNumber: execution.totalWorkerAttempts + 1,
    nextDeadlineAt,
    workerDeadlineAt: delivery.workerDeadlineAt,
    incrementsTotalWorkerAttempts: true,
  };
}

/**
 * Heartbeat/fase vincolati all'attemptId (§9.7). Un token non attivo →
 * `200 staleAttempt` senza scritture; sequence inferiore stale; uguale idempotente.
 */
export function decideProgress(
  execution: ExecutionSnapshot,
  activeAttempt: ActiveAttemptSnapshot | null,
  request: { attemptId: string; phase: string; heartbeatSequence: number },
): ProgressDecision {
  const cancelState = cancelStateResponse(execution);

  if (
    activeAttempt === null ||
    execution.activeAttemptId !== request.attemptId ||
    activeAttempt.id !== request.attemptId
  ) {
    return { action: "STALE_ATTEMPT", response: { ...cancelState, staleAttempt: true } };
  }

  if (request.heartbeatSequence < activeAttempt.heartbeatSequence) {
    return { action: "IGNORE_STALE_SEQUENCE", response: cancelState };
  }
  if (request.heartbeatSequence === activeAttempt.heartbeatSequence) {
    return { action: "IDEMPOTENT", response: cancelState };
  }
  return {
    action: "UPDATE_HEARTBEAT",
    response: cancelState,
    heartbeatSequence: request.heartbeatSequence,
    phase: request.phase,
  };
}

function cancelStateResponse(execution: ExecutionSnapshot): {
  cancelRequested: boolean;
  cancelRequestId?: string;
  cancelRequestedAt?: string;
} {
  if (execution.status === S.CANCEL_REQUESTED && execution.cancelRequestId !== null) {
    return {
      cancelRequested: true,
      cancelRequestId: execution.cancelRequestId,
      ...(execution.cancelRequestedAt !== null
        ? { cancelRequestedAt: execution.cancelRequestedAt.toISOString() }
        : {}),
    };
  }
  return { cancelRequested: false };
}

/**
 * Decisione completa di `complete` (§9.3 passo 1 + §9.7 idempotenza/fencing).
 * `tokenAttempt` è l'attempt referenziato dal token (l'attivo RUNNING in apply,
 * oppure il COMPLETED di un replay, oppure null). Il routing apply a 3 rami è una
 * decisione separata (`routeAnalysis`). La chiave canonica è executionId+attemptId
 * e l'hash è ricalcolato dal backend; il body non contiene resultHash.
 */
export function decideComplete(
  execution: ExecutionSnapshot,
  tokenAttempt: ActiveAttemptSnapshot | null,
  request: { attemptId: string; outcome: ExecutionSnapshot["outcome"]; recomputedHash: string },
): CompleteGateOutcome {
  if (isTerminalExecutionStatus(execution.status)) {
    const terminal = asTerminalStatus(execution.status);
    // Replay dello stesso attempt già COMPLETED: confronta l'hash persistito.
    if (
      tokenAttempt !== null &&
      tokenAttempt.id === request.attemptId &&
      tokenAttempt.status === AutomationAttemptStatuses.COMPLETED &&
      tokenAttempt.completionPayloadHash !== null
    ) {
      return tokenAttempt.completionPayloadHash === request.recomputedHash
        ? { kind: "ALREADY_TERMINAL_IDEMPOTENT", status: terminal }
        : { kind: "IDEMPOTENCY_PAYLOAD_MISMATCH", status: terminal };
    }
    // Terminale ma token non è l'attempt completato: ACK alreadyTerminal, no apply.
    return { kind: "ALREADY_TERMINAL_IDEMPOTENT", status: terminal };
  }

  if (execution.status === S.CANCEL_REQUESTED) {
    // cancel ha vinto la race: complete non applica nulla.
    return { kind: "CANCELLATION_REQUESTED" };
  }

  // Fencing: il token deve coincidere con l'attempt attivo RUNNING.
  if (
    tokenAttempt === null ||
    execution.activeAttemptId !== request.attemptId ||
    tokenAttempt.id !== request.attemptId
  ) {
    return { kind: "STALE_ATTEMPT" };
  }

  if (request.outcome === null) {
    // outcome obbligatorio per complete; la route valida prima via schema.
    return { kind: "STALE_ATTEMPT" };
  }

  return { kind: "APPLY", derivedStatus: OUTCOME_TO_STATUS[request.outcome] };
}

/**
 * `fail` permanente allowlisted (§9.7). Post-start richiede il fencing token;
 * pre-start usa la delivery tuple da stato runnable.
 */
export function decideFail(
  execution: ExecutionSnapshot,
  tokenAttempt: ActiveAttemptSnapshot | null,
  request: { scope: "PRE_START" | "ACTIVE_ATTEMPT"; attemptId?: string; errorCode: string },
): FailDecision {
  if (isTerminalExecutionStatus(execution.status)) {
    // Ripetere lo stesso fail è idempotente; un terminale differente è conflitto.
    if (execution.status === S.FAILED && execution.errorCode === request.errorCode) {
      return { kind: "ALREADY_TERMINAL_IDEMPOTENT", status: asTerminalStatus(execution.status) };
    }
    return { kind: "CONFLICT_TERMINAL", status: asTerminalStatus(execution.status) };
  }

  if (execution.status === S.CANCEL_REQUESTED) {
    return { kind: "CANCELLATION_REQUESTED" };
  }

  if (request.scope === "ACTIVE_ATTEMPT") {
    if (execution.status !== S.RUNNING) {
      return { kind: "REJECT_NOT_RUNNABLE" };
    }
    if (
      tokenAttempt === null ||
      execution.activeAttemptId !== request.attemptId ||
      tokenAttempt.id !== request.attemptId
    ) {
      return { kind: "STALE_ATTEMPT" };
    }
    return { kind: "FAIL" };
  }

  // PRE_START: solo da PENDING_DISPATCH|QUEUED|RETRY_PENDING, senza creare attempt.
  if (
    execution.status === S.PENDING_DISPATCH ||
    execution.status === S.QUEUED ||
    execution.status === S.RETRY_PENDING
  ) {
    return { kind: "FAIL" };
  }
  return { kind: "REJECT_NOT_RUNNABLE" };
}

/** Richiesta di annullamento HUMAN (§9.7 cancel). */
export function decideCancel(execution: ExecutionSnapshot): CancelDecision {
  switch (execution.status) {
    case S.PENDING_DISPATCH:
    case S.QUEUED:
    case S.RETRY_PENDING:
      return { kind: "IMMEDIATE_CANCEL" };
    case S.RUNNING:
      return { kind: "REQUEST_CANCEL" };
    case S.CANCEL_REQUESTED:
      return { kind: "ALREADY_REQUESTED" };
    case S.CANCELLED:
      return { kind: "ALREADY_CANCELLED" };
    case S.SUCCEEDED:
    case S.SKIPPED:
    case S.FAILED:
      return { kind: "CANNOT_CANCEL_TERMINAL", status: asTerminalStatus(execution.status) };
    default:
      return { kind: "CANNOT_CANCEL_TERMINAL", status: asTerminalStatus(execution.status) };
  }
}

/** Ack cooperativo del lifecycle actor (§9.7 cancel/ack). */
export function decideCancelAck(
  execution: ExecutionSnapshot,
  activeAttempt: ActiveAttemptSnapshot | null,
  request: { cancelRequestId: string; attemptId: string },
): CancelAckDecision {
  if (execution.status === S.CANCELLED) {
    return { kind: "ALREADY_TERMINAL_IDEMPOTENT", status: "CANCELLED" };
  }
  if (execution.status !== S.CANCEL_REQUESTED) {
    return { kind: "NOT_REQUESTED" };
  }
  if (
    execution.cancelRequestId !== request.cancelRequestId ||
    execution.activeAttemptId !== request.attemptId ||
    activeAttempt === null ||
    activeAttempt.id !== request.attemptId
  ) {
    return { kind: "MISMATCH" };
  }
  return { kind: "FINALIZE_CANCEL" };
}

// ─── reconciler / safety-net / finalizer (§9.9/§9.11) ─────────────────────────

/**
 * Safety-net state-aware: seleziona deadlineAt < now (mai nullable) e deriva il
 * terminale dallo stato. CANCEL_REQUESTED è escluso (finalizer dedicato).
 */
export function decideSafetyNet(
  execution: ExecutionSnapshot,
  now: Date,
  inDlq: boolean,
): SafetyNetDecision {
  if (isTerminalExecutionStatus(execution.status) || execution.status === S.CANCEL_REQUESTED) {
    return { kind: "NONE" };
  }
  if (now.getTime() <= execution.deadlineAt.getTime()) {
    return { kind: "NONE" };
  }
  switch (execution.status) {
    case S.PENDING_DISPATCH:
      if (execution.dispatchKind === AutomationDispatchKinds.CLI) {
        return { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.LOCAL_RUN_TIMED_OUT };
      }
      return { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.DISPATCH_FAILED };
    case S.QUEUED:
      if (execution.dispatchKind === AutomationDispatchKinds.CLI) {
        return { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.LOCAL_RUN_TIMED_OUT };
      }
      return execution.totalWorkerAttempts === 0
        ? { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.QUEUE_DELIVERY_TIMED_OUT }
        : { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.TIMED_OUT };
    case S.RUNNING:
      if (execution.dispatchKind === AutomationDispatchKinds.CLI) {
        return { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.LOCAL_RUN_TIMED_OUT };
      }
      return inDlq
        ? { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.DEAD_LETTERED }
        : { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.TIMED_OUT };
    case S.RETRY_PENDING:
      return inDlq
        ? { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.DEAD_LETTERED }
        : { kind: "TERMINALIZE", errorCode: AutomationSystemErrorCodes.TIMED_OUT };
    default:
      return { kind: "NONE" };
  }
}

/**
 * Reaper dei RUNNING (§9.9): heartbeat stale ma lease valido → solo allarme;
 * oltre `workerDeadlineAt + margine` → rilascio lease non-terminale (RETRY_PENDING).
 */
export function decideReaper(
  execution: ExecutionSnapshot,
  now: Date,
  marginMs: number,
  heartbeatStaleThresholdMs: number,
  lastHeartbeatAt: Date | null,
): ReaperDecision {
  if (execution.status !== S.RUNNING) {
    return { kind: "NONE" };
  }
  const leaseExpired =
    execution.workerDeadlineAt !== null &&
    now.getTime() > execution.workerDeadlineAt.getTime() + marginMs;
  if (leaseExpired) {
    if (execution.dispatchKind === AutomationDispatchKinds.CLI) {
      return { kind: "TERMINALIZE_LOCAL_TIMEOUT" };
    }
    return { kind: "RELEASE_LEASE_RETRY_PENDING" };
  }
  const heartbeatStale =
    lastHeartbeatAt !== null &&
    now.getTime() > lastHeartbeatAt.getTime() + heartbeatStaleThresholdMs;
  if (heartbeatStale) {
    return { kind: "HEARTBEAT_STALE_ALERT" };
  }
  return { kind: "NONE" };
}

/**
 * Finalizer SYSTEM (§9.11): chiude CANCEL_REQUESTED non confermato solo oltre la
 * deadline hard certa dell'invocazione.
 */
export function decideFinalizer(
  execution: ExecutionSnapshot,
  now: Date,
  marginMs: number,
): FinalizerDecision {
  if (execution.status !== S.CANCEL_REQUESTED) {
    return { kind: "NONE" };
  }
  if (
    execution.workerDeadlineAt !== null &&
    now.getTime() > execution.workerDeadlineAt.getTime() + marginMs
  ) {
    return { kind: "FINALIZE_SYSTEM_CANCEL" };
  }
  return { kind: "NONE" };
}

// ─── routing analisi a 3 rami (§9.2/§9.3) ─────────────────────────────────────

/**
 * Decide se e come scrivere `AlarmAnalysis` (§9.2). Gate sull'esito + modo:
 * solo KNOWN_CASE/UNKNOWN_CASE creano analisi e solo se il modo li applica.
 */
export function routeAnalysis(input: AnalysisRoutingInput): AnalysisRouting {
  // 2a: esiti senza analisi → solo execution, anche se analysisId è null.
  if (!ANALYSIS_BEARING_OUTCOMES.includes(input.outcome)) {
    return { kind: "EXECUTION_ONLY" };
  }

  // gate sul modo di rollout
  const modeApplies =
    input.appliedMode === AutomationModes.APPLY_ALL ||
    (input.appliedMode === AutomationModes.APPLY_KNOWN &&
      input.outcome === AutomationExecutionOutcomes.KNOWN_CASE);
  if (!modeApplies) {
    // SHADOW o modo che non applica quell'esito → execution.analysisPayload (2c).
    return { kind: "EXECUTION_ONLY" };
  }

  // routing 3 rami su AlarmEvent.analysisId + origin
  if (input.alarmEventAnalysisId === null) {
    return { kind: "CREATE_ANALYSIS" }; // ramo 1
  }
  if (input.existingAnalysisOrigin === AnalysisOrigins.AUTOMATIC) {
    return { kind: "UPDATE_AUTOMATIC_ANALYSIS" }; // ramo 2
  }
  // MANUAL o HYBRID → ramo 3: niente AlarmAnalysis, solo analysisPayload.
  return { kind: "HUMAN_ANALYSIS_PAYLOAD_ONLY" };
}
