import {
  prisma,
  Prisma,
  type AutomaticRunbookExecution,
  type AutomaticRunbookAttempt,
} from "@go-watchtower/database";
import {
  AutomationExecutionStatuses as ES,
  AutomationAttemptStatuses as ATS,
  AutomationModes,
  AutomationReviewStatuses,
  AutomationExecutionOutcomes,
  AutomationLifecycleBudgets,
  OUTCOME_TO_STATUS,
  ANALYSIS_BEARING_OUTCOMES,
  SystemEventActions,
  SystemEventResources,
  type AutomationExecutionOutcome,
  type AnalysisOrigin,
} from "@go-watchtower/shared";
import {
  decideStart,
  decideProgress,
  decideComplete,
  decideFail,
  decideCancel,
  decideCancelAck,
  routeAnalysis,
} from "./lifecycle-core.js";
import crypto from "node:crypto";
import { AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION, type AutomaticAlarmAnalysisCommandV1 } from "./sqs-command.js";
import type {
  ActiveAttemptSnapshot,
  ExecutionSnapshot,
  DeliveryMetadata,
  LifecycleBudgets,
} from "./lifecycle-types.js";
import { computeCompletionHash } from "./completion-hash.js";

/**
 * Servizio transazionale del lifecycle automation (OPUS-03 §9.3/§9.7).
 * Le decisioni (race/idempotenza/fencing/cancellazione) sono delegate al nucleo
 * puro testato; qui si applica il `SELECT ... FOR UPDATE` e la CAS sotto lock.
 *
 * ⚠️ Verificato a livello di type-check + nucleo puro; l'integrazione DB end-to-end
 * di questi handler è coperta dai test di integrazione (gated su DATABASE_URL),
 * non dai test unit. Vedi report.
 */

type Tx = Prisma.TransactionClient;

const CYCLE_BUDGET_MS = 6 * 60 * 60 * 1000; // > visibilityTimeout (90m) + margine (§11.2)

function budgets(): LifecycleBudgets {
  return {
    attemptLeaseMarginMs: AutomationLifecycleBudgets.ATTEMPT_LEASE_MARGIN_MS,
    cycleBudgetMs: CYCLE_BUDGET_MS,
    queueDeliveryBudgetMs: AutomationLifecycleBudgets.DISPATCH_BUDGET_MS,
    dispatchBudgetMs: AutomationLifecycleBudgets.DISPATCH_BUDGET_MS,
    dlqRetentionMs: 14 * 24 * 60 * 60 * 1000,
  };
}

export function toSnapshot(row: AutomaticRunbookExecution): ExecutionSnapshot {
  return {
    id: row.id,
    status: row.status,
    outcome: row.outcome,
    errorCode: row.errorCode,
    activeAttemptId: row.activeAttemptId,
    workerDeadlineAt: row.workerDeadlineAt,
    deadlineAt: row.deadlineAt,
    deliveryCycle: row.deliveryCycle,
    cycleReceiveCount: row.cycleReceiveCount,
    sqsMessageId: row.sqsMessageId,
    totalWorkerAttempts: row.totalWorkerAttempts,
    cancelRequestId: row.cancelRequestId,
    cancelRequestedAt: row.cancelRequestedAt,
  };
}

function toAttemptSnapshot(row: AutomaticRunbookAttempt): ActiveAttemptSnapshot {
  return {
    id: row.id,
    status: row.status,
    sqsMessageId: row.sqsMessageId,
    cycleReceiveCount: row.cycleReceiveCount,
    deliveryCycle: row.deliveryCycle,
    attemptNumber: row.attemptNumber,
    heartbeatSequence: row.heartbeatSequence,
    completionPayloadHash: row.completionPayloadHash,
    completionHashVersion: row.completionHashVersion,
    errorCode: row.errorCode,
  };
}

/** Lock di riga su una execution (FOR UPDATE) dentro una transazione. */
export async function lockExecution(tx: Tx, id: string): Promise<AutomaticRunbookExecution | null> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM automatic_runbook_executions WHERE id = ${id}::uuid FOR UPDATE`,
  );
  if (locked.length === 0) return null;
  return tx.automaticRunbookExecution.findUnique({ where: { id } });
}

async function loadAttempt(tx: Tx, attemptId: string | null): Promise<AutomaticRunbookAttempt | null> {
  if (attemptId === null) return null;
  return tx.automaticRunbookAttempt.findUnique({ where: { id: attemptId } });
}

export interface StartResult {
  readonly response:
    | { disposition: "START" | "ALREADY_STARTED"; attemptId: string; workerDeadlineAt: string }
    | { disposition: "ALREADY_RUNNING"; workerDeadlineAt: string }
    | { disposition: "CANCEL_REQUESTED"; cancelRequestId: string }
    | { disposition: "ALREADY_TERMINAL"; status: "SUCCEEDED" | "SKIPPED" | "FAILED" | "CANCELLED" };
  readonly notFound?: boolean;
}

/** Clampa workerDeadlineAt del client a now + lambda timeout + skew (§9.7). */
function clampWorkerDeadline(clientDeadline: string, now: Date): Date {
  const max = now.getTime() + AutomationLifecycleBudgets.CONFIGURED_LAMBDA_TIMEOUT_MS + 30_000;
  const parsed = Date.parse(clientDeadline);
  const candidate = Number.isNaN(parsed) ? max : parsed;
  return new Date(Math.min(candidate, max));
}

export async function startExecution(
  id: string,
  request: { sqsMessageId: string; approximateReceiveCount: number; workerDeadlineAt: string },
  now: Date = new Date(),
): Promise<StartResult> {
  return prisma.$transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    if (!row) return { notFound: true } as StartResult;

    const delivery: DeliveryMetadata = {
      sqsMessageId: request.sqsMessageId,
      approximateReceiveCount: request.approximateReceiveCount,
      workerDeadlineAt: clampWorkerDeadline(request.workerDeadlineAt, now),
    };
    const activeAttempt = await loadAttempt(tx, row.activeAttemptId);
    const decision = decideStart(
      toSnapshot(row),
      activeAttempt ? toAttemptSnapshot(activeAttempt) : null,
      delivery,
      now,
      budgets(),
    );

    if (decision.action === "NO_OP" || decision.action === "IDEMPOTENT_REPLAY") {
      return { response: decision.response };
    }

    // action === START: takeover + new attempt + lease acquisition.
    if (decision.takeoverAttemptId !== null) {
      await tx.automaticRunbookAttempt.update({
        where: { id: decision.takeoverAttemptId },
        data: { status: ATS.INTERRUPTED, errorCode: "LEASE_EXPIRED_TAKEOVER", finishedAt: now },
      });
    }
    const attempt = await tx.automaticRunbookAttempt.create({
      data: {
        executionId: id,
        attemptNumber: decision.nextAttemptNumber,
        deliveryCycle: decision.nextDeliveryCycle,
        cycleReceiveCount: decision.nextCycleReceiveCount,
        sqsMessageId: delivery.sqsMessageId,
        status: ATS.RUNNING,
        heartbeatSequence: 0,
        workerDeadlineAt: delivery.workerDeadlineAt,
      },
    });
    await tx.automaticRunbookExecution.update({
      where: { id },
      data: {
        status: ES.RUNNING,
        activeAttemptId: attempt.id,
        workerDeadlineAt: delivery.workerDeadlineAt,
        deadlineAt: decision.nextDeadlineAt,
        deliveryCycle: decision.nextDeliveryCycle,
        cycleReceiveCount: decision.nextCycleReceiveCount,
        sqsMessageId: delivery.sqsMessageId,
        totalWorkerAttempts: { increment: 1 },
        startedAt: row.startedAt ?? now,
      },
    });
    return {
      response: {
        disposition: decision.takeoverAttemptId !== null ? "START" : "START",
        attemptId: attempt.id,
        workerDeadlineAt: delivery.workerDeadlineAt.toISOString(),
      },
    };
  });
}

export interface ProgressResult {
  readonly notFound?: boolean;
  readonly response: {
    cancelRequested: boolean;
    staleAttempt?: boolean;
    cancelRequestId?: string;
    cancelRequestedAt?: string;
  };
}

export async function progressExecution(
  id: string,
  request: { attemptId: string; phase: string; heartbeatSequence: number },
): Promise<ProgressResult> {
  return prisma.$transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    if (!row) return { notFound: true, response: { cancelRequested: false } };
    const activeAttempt = await loadAttempt(tx, row.activeAttemptId);
    const decision = decideProgress(
      toSnapshot(row),
      activeAttempt ? toAttemptSnapshot(activeAttempt) : null,
      request,
    );
    if (decision.action === "UPDATE_HEARTBEAT" && activeAttempt) {
      await tx.automaticRunbookAttempt.update({
        where: { id: activeAttempt.id },
        data: { heartbeatSequence: decision.heartbeatSequence, phase: decision.phase, lastHeartbeatAt: new Date() },
      });
      await tx.automaticRunbookExecution.update({
        where: { id },
        data: { lastHeartbeatAt: new Date() },
      });
    }
    return { response: decision.response };
  });
}

export type CompleteResult =
  | { kind: "OK"; status: string; outcome: AutomationExecutionOutcome | null; analysisId: string | null; appliedMode: string }
  | { kind: "ALREADY_TERMINAL"; status: string }
  | { kind: "IDEMPOTENCY_PAYLOAD_MISMATCH"; status: string }
  | { kind: "STALE_ATTEMPT"; status: string }
  | { kind: "CANCELLATION_REQUESTED" }
  | { kind: "NOT_FOUND" };

function conclusionForOutcome(outcome: AutomationExecutionOutcome, runbookKey: string | undefined): string {
  const label =
    outcome === AutomationExecutionOutcomes.KNOWN_CASE ? "Caso noto" : "Caso non riconosciuto (da revisionare)";
  return runbookKey ? `${label} — runbook ${runbookKey} (analisi automatica)` : `${label} (analisi automatica)`;
}

/**
 * complete: gate idempotenza/cancel/fencing + hash canonico + apply atomico (§9.3).
 * Routing a 3 rami su `AlarmEvent.analysisId` + `origin` (§9.2) sotto lock
 * `AlarmEvent`; gate su esito + modo (`routeAnalysis`). `actorUserId` è il service
 * principal: resta `operatorId`/`createdById` delle analisi automatiche (§9.6).
 */
export async function completeExecution(
  id: string,
  actorUserId: string,
  request: {
    attemptId: string;
    outcome: AutomationExecutionOutcome;
    bytesScanned?: string;
    recordsScanned?: string;
    recordsMatched?: string;
    queryCount?: number;
    runbookKey?: string;
    runbookVersion?: string;
    engineExecutionId?: string;
    errorCode?: string;
    errorMessage?: string;
    analysisPayload?: unknown;
    resultSummary?: unknown;
    tracking?: unknown;
  },
  now: Date = new Date(),
): Promise<CompleteResult> {
  // Hash canonico sul DTO normalizzato (chiavi senza attemptId? il contratto usa
  // executionId+attemptId come chiave; l'hash copre il payload normalizzato).
  const { attemptId: _omit, ...hashable } = request;
  const { hash, version } = computeCompletionHash(hashable);

  return prisma.$transaction(
    async (tx) => {
      const row = await lockExecution(tx, id);
      if (!row) return { kind: "NOT_FOUND" };
      const tokenAttempt = await loadAttempt(tx, request.attemptId);
      const decision = decideComplete(
        toSnapshot(row),
        tokenAttempt ? toAttemptSnapshot(tokenAttempt) : null,
        { attemptId: request.attemptId, outcome: request.outcome, recomputedHash: hash },
      );

      switch (decision.kind) {
        case "ALREADY_TERMINAL_IDEMPOTENT":
          return { kind: "ALREADY_TERMINAL", status: decision.status };
        case "IDEMPOTENCY_PAYLOAD_MISMATCH":
          return { kind: "IDEMPOTENCY_PAYLOAD_MISMATCH", status: decision.status };
        case "STALE_ATTEMPT":
          return { kind: "STALE_ATTEMPT", status: row.status };
        case "CANCELLATION_REQUESTED":
          return { kind: "CANCELLATION_REQUESTED" };
        case "APPLY":
          break;
        default: {
          const exhaustive: never = decision;
          throw new Error(`Unhandled complete decision ${JSON.stringify(exhaustive)}`);
        }
      }

      const derivedStatus = OUTCOME_TO_STATUS[request.outcome];
      const appliedMode = await resolveAutomationMode(tx);

      // Chiudi l'attempt COMPLETED con hash/versione (invariante DB §9.4).
      await tx.automaticRunbookAttempt.update({
        where: { id: request.attemptId },
        data: {
          status: ATS.COMPLETED,
          completionPayloadHash: hash,
          completionHashVersion: version,
          retryDisposition: "COMPLETE_OUTCOME",
          finishedAt: now,
        },
      });

      // Routing a 3 rami (§9.2/§9.3 2b): solo esiti analysis-bearing + modo che applica.
      const trackingJson = (request.tracking ?? []) as Prisma.InputJsonValue;
      let resolvedAnalysisId: string | null = row.analysisId;
      let analysisApplied = false;

      if (ANALYSIS_BEARING_OUTCOMES.includes(request.outcome)) {
        // Lock AlarmEvent + re-read analysisId (serializza run concorrenti).
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM alarm_events WHERE id = ${row.alarmEventId}::uuid FOR UPDATE`,
        );
        const event = await tx.alarmEvent.findUnique({
          where: { id: row.alarmEventId },
          select: { analysisId: true, firedAt: true, alarmId: true, productId: true, environmentId: true },
        });
        if (event) {
          let existingOrigin: AnalysisOrigin | null = null;
          if (event.analysisId) {
            const linked = await tx.alarmAnalysis.findUnique({
              where: { id: event.analysisId },
              select: { origin: true },
            });
            existingOrigin = linked?.origin ?? null;
          }
          const routing = routeAnalysis({
            outcome: request.outcome,
            appliedMode,
            alarmEventAnalysisId: event.analysisId,
            existingAnalysisOrigin: existingOrigin,
          });
          const conclusion = conclusionForOutcome(request.outcome, request.runbookKey);

          if (routing.kind === "CREATE_ANALYSIS" && event.alarmId) {
            // Ramo 1: crea analisi AUTOMATIC (occurrences=1) e linka l'evento.
            const created = await tx.alarmAnalysis.create({
              data: {
                analysisDate: event.firedAt,
                firstAlarmAt: event.firedAt,
                lastAlarmAt: event.firedAt,
                occurrences: 1,
                origin: "AUTOMATIC",
                alarmId: event.alarmId,
                productId: event.productId,
                environmentId: event.environmentId,
                operatorId: actorUserId,
                createdById: actorUserId,
                conclusionNotes: conclusion,
                trackingIds: trackingJson,
                lastAppliedExecutionId: id,
              },
            });
            await tx.alarmEvent.update({
              where: { id: row.alarmEventId },
              data: { analysisId: created.id, linkedAt: now },
            });
            resolvedAnalysisId = created.id;
            analysisApplied = true;
          } else if (routing.kind === "UPDATE_AUTOMATIC_ANALYSIS" && event.analysisId) {
            // Ramo 2: aggiorna in place; avanza lastAppliedExecutionId; occurrences resta 1.
            await tx.alarmAnalysis.update({
              where: { id: event.analysisId },
              data: {
                conclusionNotes: conclusion,
                trackingIds: trackingJson,
                lastAlarmAt: event.firedAt,
                lastAppliedExecutionId: id,
              },
            });
            resolvedAnalysisId = event.analysisId;
            analysisApplied = true;
          } else {
            // Ramo 3 (analisi umana) o EXECUTION_ONLY (SHADOW/modo non-applicante):
            // nessuna scrittura su alarm_analyses; cross-ref all'eventuale analisi linkata.
            resolvedAnalysisId = event.analysisId;
          }
        }
      }

      const reviewStatus =
        request.outcome === AutomationExecutionOutcomes.UNKNOWN_CASE
          ? AutomationReviewStatuses.PENDING
          : AutomationReviewStatuses.NOT_REQUIRED;

      await tx.automaticRunbookExecution.update({
        where: { id },
        data: {
          status: derivedStatus,
          outcome: request.outcome,
          appliedMode,
          reviewStatus,
          analysisId: resolvedAnalysisId,
          activeAttemptId: null,
          workerDeadlineAt: null,
          runbookKey: request.runbookKey ?? row.runbookKey,
          runbookVersion: request.runbookVersion ?? row.runbookVersion,
          engineExecutionId: request.engineExecutionId ?? row.engineExecutionId,
          errorCode: request.errorCode ?? null,
          errorMessage: request.errorMessage ?? null,
          queryCount: request.queryCount ?? null,
          bytesScanned: request.bytesScanned !== undefined ? BigInt(request.bytesScanned) : null,
          recordsScanned: request.recordsScanned !== undefined ? BigInt(request.recordsScanned) : null,
          recordsMatched: request.recordsMatched !== undefined ? BigInt(request.recordsMatched) : null,
          analysisPayload: request.analysisPayload ?? Prisma.DbNull,
          resultSummary: request.resultSummary ?? Prisma.DbNull,
          completedAt: now,
        },
      });

      // Audit nella stessa transazione (§9.3/§13). actorType/serviceId in metadata
      // (lo schema SystemEvent non ha colonne dedicate; estensione futura).
      const completedAction =
        derivedStatus === ES.FAILED
          ? SystemEventActions.AUTOMATION_EXECUTION_FAILED
          : SystemEventActions.AUTOMATION_EXECUTION_COMPLETED;
      await tx.systemEvent.create({
        data: {
          action: completedAction,
          resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
          resourceId: id,
          userId: actorUserId,
          metadata: { actorType: "SERVICE", outcome: request.outcome, appliedMode },
        },
      });
      if (analysisApplied) {
        await tx.systemEvent.create({
          data: {
            action: SystemEventActions.AUTOMATION_ANALYSIS_APPLIED,
            resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
            resourceId: id,
            userId: actorUserId,
            metadata: { actorType: "SERVICE", analysisId: resolvedAnalysisId, outcome: request.outcome },
          },
        });
      }

      return {
        kind: "OK",
        status: derivedStatus,
        outcome: request.outcome,
        analysisId: resolvedAnalysisId,
        appliedMode,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function resolveAutomationMode(tx: Tx): Promise<"SHADOW" | "APPLY_KNOWN" | "APPLY_ALL"> {
  const setting = await tx.systemSetting.findUnique({ where: { key: "automation.defaultMode" } });
  const value = typeof setting?.value === "string" ? setting.value : AutomationModes.SHADOW;
  if (value === AutomationModes.APPLY_ALL || value === AutomationModes.APPLY_KNOWN) {
    return value;
  }
  return AutomationModes.SHADOW;
}

export type FailResult =
  | { kind: "OK"; status: string }
  | { kind: "ALREADY_TERMINAL"; status: string }
  | { kind: "CONFLICT_TERMINAL"; status: string }
  | { kind: "STALE_ATTEMPT" }
  | { kind: "CANCELLATION_REQUESTED" }
  | { kind: "REJECT_NOT_RUNNABLE" }
  | { kind: "NOT_FOUND" };

export async function failExecution(
  id: string,
  request: { scope: "PRE_START" | "ACTIVE_ATTEMPT"; attemptId?: string; errorCode: string; errorMessage: string; failedPhase: string },
  now: Date = new Date(),
): Promise<FailResult> {
  return prisma.$transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    if (!row) return { kind: "NOT_FOUND" };
    const tokenAttempt = await loadAttempt(tx, request.scope === "ACTIVE_ATTEMPT" ? request.attemptId ?? null : null);
    const decision = decideFail(toSnapshot(row), tokenAttempt ? toAttemptSnapshot(tokenAttempt) : null, request);

    switch (decision.kind) {
      case "ALREADY_TERMINAL_IDEMPOTENT":
        return { kind: "ALREADY_TERMINAL", status: decision.status };
      case "CONFLICT_TERMINAL":
        return { kind: "CONFLICT_TERMINAL", status: decision.status };
      case "STALE_ATTEMPT":
        return { kind: "STALE_ATTEMPT" };
      case "CANCELLATION_REQUESTED":
        return { kind: "CANCELLATION_REQUESTED" };
      case "REJECT_NOT_RUNNABLE":
        return { kind: "REJECT_NOT_RUNNABLE" };
      case "FAIL":
        break;
      default: {
        const exhaustive: never = decision;
        throw new Error(`Unhandled fail decision ${JSON.stringify(exhaustive)}`);
      }
    }

    if (request.scope === "ACTIVE_ATTEMPT" && request.attemptId) {
      await tx.automaticRunbookAttempt.update({
        where: { id: request.attemptId },
        data: { status: ATS.FAILED, errorCode: request.errorCode, errorMessage: request.errorMessage, retryDisposition: "FAIL_EXECUTION", finishedAt: now },
      });
    }
    await tx.automaticRunbookExecution.update({
      where: { id },
      data: {
        status: ES.FAILED,
        errorCode: request.errorCode,
        errorMessage: request.errorMessage,
        failedStepId: request.failedPhase,
        activeAttemptId: null,
        workerDeadlineAt: null,
        completedAt: now,
      },
    });
    return { kind: "OK", status: ES.FAILED };
  });
}

export type CancelAckResult =
  | { kind: "OK"; status: string }
  | { kind: "ALREADY_TERMINAL"; status: string }
  | { kind: "MISMATCH" }
  | { kind: "NOT_REQUESTED" }
  | { kind: "NOT_FOUND" };

export async function acknowledgeCancellation(
  id: string,
  request: { cancelRequestId: string; attemptId: string; partialTelemetry?: unknown },
  now: Date = new Date(),
): Promise<CancelAckResult> {
  return prisma.$transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    if (!row) return { kind: "NOT_FOUND" };
    const activeAttempt = await loadAttempt(tx, row.activeAttemptId);
    const decision = decideCancelAck(toSnapshot(row), activeAttempt ? toAttemptSnapshot(activeAttempt) : null, request);

    switch (decision.kind) {
      case "ALREADY_TERMINAL_IDEMPOTENT":
        return { kind: "ALREADY_TERMINAL", status: decision.status };
      case "MISMATCH":
        return { kind: "MISMATCH" };
      case "NOT_REQUESTED":
        return { kind: "NOT_REQUESTED" };
      case "FINALIZE_CANCEL":
        break;
      default: {
        const exhaustive: never = decision;
        throw new Error(`Unhandled cancel-ack decision ${JSON.stringify(exhaustive)}`);
      }
    }

    await tx.automaticRunbookAttempt.update({
      where: { id: request.attemptId },
      data: { status: ATS.CANCELLED, retryDisposition: "CANCEL_EXECUTION", finishedAt: now },
    });
    await tx.automaticRunbookExecution.update({
      where: { id },
      data: {
        status: ES.CANCELLED,
        activeAttemptId: null,
        workerDeadlineAt: null,
        cancelledAt: now,
        completedAt: now,
        cancellationFinalizedBy: "WORKER",
        reviewStatus: AutomationReviewStatuses.NOT_REQUIRED,
        resultSummary: (request.partialTelemetry ?? Prisma.DbNull),
      },
    });
    return { kind: "OK", status: ES.CANCELLED };
  });
}

// ─── human operations ─────────────────────────────────────────────────────────

export interface Actor {
  readonly userId: string;
  readonly label: string;
}

export type RequestCancelResult =
  | { kind: "OK"; status: string; cancelRequestId: string | null }
  | { kind: "ALREADY"; status: string; cancelRequestId: string | null }
  | { kind: "CANNOT_CANCEL_TERMINAL"; status: string }
  | { kind: "NOT_FOUND" };

export async function requestCancel(
  id: string,
  reason: string | undefined,
  actor: Actor,
  now: Date = new Date(),
): Promise<RequestCancelResult> {
  return prisma.$transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    if (!row) return { kind: "NOT_FOUND" };
    const decision = decideCancel(toSnapshot(row));

    switch (decision.kind) {
      case "ALREADY_REQUESTED":
      case "ALREADY_CANCELLED":
        return { kind: "ALREADY", status: row.status, cancelRequestId: row.cancelRequestId };
      case "CANNOT_CANCEL_TERMINAL":
        return { kind: "CANNOT_CANCEL_TERMINAL", status: decision.status };
      case "IMMEDIATE_CANCEL": {
        const cancelRequestId = crypto.randomUUID();
        await tx.automaticRunbookExecution.update({
          where: { id },
          data: {
            status: ES.CANCELLED,
            cancelRequestId,
            cancelRequestedAt: now,
            cancelReason: reason ?? null,
            cancelRequestedByUserId: actor.userId,
            cancelRequestedByLabel: actor.label,
            cancelledAt: now,
            completedAt: now,
            cancellationFinalizedBy: "IMMEDIATE",
            reviewStatus: AutomationReviewStatuses.NOT_REQUIRED,
          },
        });
        return { kind: "OK", status: ES.CANCELLED, cancelRequestId };
      }
      case "REQUEST_CANCEL": {
        const cancelRequestId = crypto.randomUUID();
        await tx.automaticRunbookExecution.update({
          where: { id },
          data: {
            status: ES.CANCEL_REQUESTED,
            cancelRequestId,
            cancelRequestedAt: now,
            cancelReason: reason ?? null,
            cancelRequestedByUserId: actor.userId,
            cancelRequestedByLabel: actor.label,
          },
        });
        return { kind: "OK", status: ES.CANCEL_REQUESTED, cancelRequestId };
      }
      default: {
        const exhaustive: never = decision;
        throw new Error(`Unhandled cancel decision ${JSON.stringify(exhaustive)}`);
      }
    }
  });
}

export type ReviewResult =
  | { kind: "OK"; reviewStatus: string }
  | { kind: "NOT_FOUND" };

export async function reviewExecution(
  id: string,
  decision: "CONFIRMED" | "REJECTED",
  actor: Actor,
  now: Date = new Date(),
): Promise<ReviewResult> {
  const existing = await prisma.automaticRunbookExecution.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { kind: "NOT_FOUND" };
  await prisma.automaticRunbookExecution.update({
    where: { id },
    data: {
      reviewStatus: decision === "CONFIRMED" ? AutomationReviewStatuses.CONFIRMED : AutomationReviewStatuses.REJECTED,
      reviewedByUserId: actor.userId,
      reviewedByLabel: actor.label,
      reviewedAt: now,
    },
  });
  return { kind: "OK", reviewStatus: decision };
}

export type CreateResult =
  | { kind: "OK"; execution: AutomaticRunbookExecution }
  | { kind: "ALARM_EVENT_NOT_FOUND" }
  | { kind: "ALARM_EVENT_NOT_LINKABLE"; reason: string };

/**
 * Crea una execution manuale (Flow 2) in PENDING_DISPATCH (execution-as-outbox).
 * L'enqueue su SQS è eseguito dal dispatcher (Wave 2/3, adapter AWS non ancora
 * presente): qui si persiste la riga e lo snapshot del comando.
 */
export async function createManualExecution(
  alarmEventId: string,
  triggerKind: "WATCHTOWER_UI" | "WATCHTOWER_API",
  actor: Actor,
  now: Date = new Date(),
): Promise<CreateResult> {
  const event = await prisma.alarmEvent.findUnique({
    where: { id: alarmEventId },
    include: { alarm: true },
  });
  if (!event) return { kind: "ALARM_EVENT_NOT_FOUND" };
  if (!event.alarmId || !event.alarm) {
    return { kind: "ALARM_EVENT_NOT_LINKABLE", reason: "alarm event has no linked alarm" };
  }

  const id = crypto.randomUUID();
  const command: AutomaticAlarmAnalysisCommandV1 = {
    schemaVersion: AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION,
    executionId: id,
    alarmEvent: {
      id: event.id,
      productId: event.productId,
      environmentId: event.environmentId,
      alarmId: event.alarmId,
      alarmName: event.alarm.name,
      firedAt: event.firedAt.toISOString(),
      awsAccountId: event.awsAccountId,
      awsRegion: event.awsRegion,
    },
    trigger: { kind: triggerKind, actorId: actor.userId },
  };
  const appliedMode = await resolveAutomationMode(prisma);

  const execution = await prisma.automaticRunbookExecution.create({
    data: {
      id,
      alarmEventId: event.id,
      productId: event.productId,
      environmentId: event.environmentId,
      alarmId: event.alarmId,
      status: ES.PENDING_DISPATCH,
      triggerKind,
      triggeredByUserId: actor.userId,
      triggeredByLabel: actor.label,
      appliedMode,
      inputSnapshot: command,
      deadlineAt: new Date(now.getTime() + AutomationLifecycleBudgets.DISPATCH_BUDGET_MS),
    },
  });
  return { kind: "OK", execution };
}

export type RetryResult =
  | { kind: "OK"; execution: AutomaticRunbookExecution }
  | { kind: "NOT_FOUND" };

/** Re-launch: nuova execution figlia (parentExecutionId), mai riapre la riga. */
export async function retryExecution(id: string, actor: Actor, now: Date = new Date()): Promise<RetryResult> {
  const parent = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  if (!parent) return { kind: "NOT_FOUND" };
  const childId = crypto.randomUUID();
  const snapshot = parent.inputSnapshot as unknown as AutomaticAlarmAnalysisCommandV1;
  const command: AutomaticAlarmAnalysisCommandV1 = {
    ...snapshot,
    executionId: childId,
    trigger: { kind: "RETRY", actorId: actor.userId, parentExecutionId: parent.id },
  };
  const appliedMode = await resolveAutomationMode(prisma);
  const execution = await prisma.automaticRunbookExecution.create({
    data: {
      id: childId,
      parentExecutionId: parent.id,
      alarmEventId: parent.alarmEventId,
      productId: parent.productId,
      environmentId: parent.environmentId,
      alarmId: parent.alarmId,
      status: ES.PENDING_DISPATCH,
      triggerKind: "RETRY",
      triggeredByUserId: actor.userId,
      triggeredByLabel: actor.label,
      appliedMode,
      inputSnapshot: command,
      deadlineAt: new Date(now.getTime() + AutomationLifecycleBudgets.DISPATCH_BUDGET_MS),
    },
  });
  return { kind: "OK", execution };
}
