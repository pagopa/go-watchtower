import type {
  AutomationExecutionStatus,
  AutomationExecutionOutcome,
  AutomationAttemptStatus,
  AutomationMode,
  AutomationDispatchKind,
  AutomationSystemErrorCode,
  AnalysisOrigin,
} from "@go-watchtower/shared";

/**
 * Tipi del nucleo di decisione lifecycle (EVO-WATCHTINTEG-OPUS-03 §9.3/§9.7/§9.9/§9.11).
 * Le funzioni del core sono pure: ricevono uno snapshot dello stato + la richiesta
 * e restituiscono una decisione (risposta wire + istruzioni CAS) che la route applica
 * dentro la transazione con `SELECT ... FOR UPDATE`. Questo rende race, idempotenza,
 * fencing e cancellazione testabili senza database.
 */

/**
 * Snapshot di un attempt (l'attivo, oppure quello referenziato dal token in un
 * replay terminale). La route risolve l'attempt corrispondente al token.
 */
export interface ActiveAttemptSnapshot {
  readonly id: string;
  readonly status: AutomationAttemptStatus;
  readonly sqsMessageId: string;
  readonly cycleReceiveCount: number;
  readonly deliveryCycle: number;
  readonly attemptNumber: number;
  readonly heartbeatSequence: number;
  readonly completionPayloadHash: string | null;
  readonly completionHashVersion: string | null;
  readonly errorCode: string | null;
}

/** Snapshot dell'execution sotto lock. */
export interface ExecutionSnapshot {
  readonly id: string;
  readonly dispatchKind: AutomationDispatchKind;
  readonly status: AutomationExecutionStatus;
  readonly outcome: AutomationExecutionOutcome | null;
  readonly errorCode: string | null;
  readonly activeAttemptId: string | null;
  readonly workerDeadlineAt: Date | null;
  readonly deadlineAt: Date;
  readonly deliveryCycle: number;
  readonly cycleReceiveCount: number;
  readonly sqsMessageId: string | null;
  readonly totalWorkerAttempts: number;
  readonly cancelRequestId: string | null;
  readonly cancelRequestedAt: Date | null;
}

/** Metadati di consegna SQS (≠ body del comando), già clampati dal backend. */
export interface DeliveryMetadata {
  readonly sqsMessageId: string;
  readonly approximateReceiveCount: number;
  /** Già limitato a now + configuredLambdaTimeout + clockSkew dalla route. */
  readonly workerDeadlineAt: Date;
}

/** Budget lifecycle in ms (forniti da config + registry retention). */
export interface LifecycleBudgets {
  readonly attemptLeaseMarginMs: number;
  readonly cycleBudgetMs: number;
  readonly queueDeliveryBudgetMs: number;
  readonly dispatchBudgetMs: number;
  readonly dlqRetentionMs: number;
}

// ─── start ────────────────────────────────────────────────────────────────────

export type TerminalStatus = "SUCCEEDED" | "SKIPPED" | "FAILED" | "CANCELLED";

export type StartExecutionResponse =
  | { readonly disposition: "START"; readonly attemptId: string; readonly workerDeadlineAt: string }
  | { readonly disposition: "ALREADY_STARTED"; readonly attemptId: string; readonly workerDeadlineAt: string }
  | { readonly disposition: "ALREADY_RUNNING"; readonly workerDeadlineAt: string }
  | { readonly disposition: "CANCEL_REQUESTED"; readonly cancelRequestId: string }
  | { readonly disposition: "ALREADY_TERMINAL"; readonly status: TerminalStatus };

/** Istruzioni CAS prodotte dalla decisione di `start`. */
export type StartDecision =
  | {
      // delivery non-owner / no-op: ACK senza motore, nessuna scrittura.
      readonly action: "NO_OP";
      readonly response: StartExecutionResponse;
    }
  | {
      // retry HTTP della stessa tuple: nessun nuovo attempt/contatore/audit.
      readonly action: "IDEMPOTENT_REPLAY";
      readonly response: StartExecutionResponse;
    }
  | {
      // crea attempt e acquisisce il lease (eventuale takeover del precedente).
      readonly action: "START";
      readonly response: StartExecutionResponse;
      readonly takeoverAttemptId: string | null; // → INTERRUPTED/LEASE_EXPIRED_TAKEOVER
      readonly opensNewCycle: boolean; // redrive con nuovo sqsMessageId
      readonly nextDeliveryCycle: number;
      readonly nextCycleReceiveCount: number;
      readonly nextAttemptNumber: number;
      readonly nextDeadlineAt: Date; // primo start del ciclo → now + cycleBudget
      readonly workerDeadlineAt: Date;
      readonly incrementsTotalWorkerAttempts: true;
    };

// ─── progress ───────────────────────────────────────────────────────────────

export interface ProgressExecutionResponse {
  readonly cancelRequested: boolean;
  readonly staleAttempt?: boolean;
  readonly cancelRequestId?: string;
  readonly cancelRequestedAt?: string;
}

export type ProgressDecision =
  | { readonly action: "STALE_ATTEMPT"; readonly response: ProgressExecutionResponse }
  | { readonly action: "IDEMPOTENT"; readonly response: ProgressExecutionResponse }
  | { readonly action: "IGNORE_STALE_SEQUENCE"; readonly response: ProgressExecutionResponse }
  | {
      readonly action: "UPDATE_HEARTBEAT";
      readonly response: ProgressExecutionResponse;
      readonly heartbeatSequence: number;
      readonly phase: string;
    };

// ─── complete (gate + idempotency + fencing; routing separato) ────────────────

export type CompleteGateOutcome =
  | { readonly kind: "ALREADY_TERMINAL_IDEMPOTENT"; readonly status: TerminalStatus }
  | { readonly kind: "IDEMPOTENCY_PAYLOAD_MISMATCH"; readonly status: TerminalStatus }
  | { readonly kind: "STALE_ATTEMPT" }
  | { readonly kind: "CANCELLATION_REQUESTED" }
  | { readonly kind: "APPLY"; readonly derivedStatus: AutomationExecutionStatus };

// ─── fail ─────────────────────────────────────────────────────────────────────

export type FailDecision =
  | { readonly kind: "ALREADY_TERMINAL_IDEMPOTENT"; readonly status: TerminalStatus }
  | { readonly kind: "CONFLICT_TERMINAL"; readonly status: TerminalStatus }
  | { readonly kind: "STALE_ATTEMPT" }
  | { readonly kind: "CANCELLATION_REQUESTED" }
  | { readonly kind: "REJECT_NOT_RUNNABLE" } // 409/422 a seconda dello scope
  | { readonly kind: "FAIL" };

// ─── cancel (human) ───────────────────────────────────────────────────────────

export type CancelDecision =
  | { readonly kind: "IMMEDIATE_CANCEL" } // PENDING_DISPATCH|QUEUED|RETRY_PENDING → CANCELLED
  | { readonly kind: "REQUEST_CANCEL" } // RUNNING → CANCEL_REQUESTED
  | { readonly kind: "ALREADY_REQUESTED" } // idempotente, preserva primo attore/motivo
  | { readonly kind: "ALREADY_CANCELLED" }
  | { readonly kind: "CANNOT_CANCEL_TERMINAL"; readonly status: TerminalStatus };

// ─── cancel/ack (lifecycle actor) ──────────────────────────────────────────────

export type CancelAckDecision =
  | { readonly kind: "ALREADY_TERMINAL_IDEMPOTENT"; readonly status: TerminalStatus }
  | { readonly kind: "FINALIZE_CANCEL" } // CANCEL_REQUESTED → CANCELLED (cooperative worker ack)
  | { readonly kind: "MISMATCH" } // 409 CANCELLATION_REQUEST_MISMATCH
  | { readonly kind: "NOT_REQUESTED" }; // 409 CANCELLATION_NOT_REQUESTED

// ─── reconciler / safety-net / finalizer ──────────────────────────────────────

export type SafetyNetDecision =
  | { readonly kind: "NONE" }
  | { readonly kind: "TERMINALIZE"; readonly errorCode: AutomationSystemErrorCode };

export type ReaperDecision =
  | { readonly kind: "NONE" }
  | { readonly kind: "HEARTBEAT_STALE_ALERT" }
  | { readonly kind: "RELEASE_LEASE_RETRY_PENDING" } // RUNNING → RETRY_PENDING
  | { readonly kind: "TERMINALIZE_LOCAL_TIMEOUT" }; // CLI RUNNING → FAILED

export type FinalizerDecision =
  | { readonly kind: "NONE" }
  | { readonly kind: "FINALIZE_SYSTEM_CANCEL" };

// ─── routing analisi (§9.2) ──────────────────────────────────────────────────

export type AnalysisRouting =
  | { readonly kind: "EXECUTION_ONLY" } // 2a o SHADOW/non-applicante
  | { readonly kind: "CREATE_ANALYSIS" } // ramo 1
  | { readonly kind: "UPDATE_AUTOMATIC_ANALYSIS" } // ramo 2
  | { readonly kind: "HUMAN_ANALYSIS_PAYLOAD_ONLY" }; // ramo 3

export interface AnalysisRoutingInput {
  readonly outcome: AutomationExecutionOutcome;
  readonly appliedMode: AutomationMode;
  readonly alarmEventAnalysisId: string | null;
  readonly existingAnalysisOrigin: AnalysisOrigin | null;
}
