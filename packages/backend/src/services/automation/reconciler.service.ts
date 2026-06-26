import { prisma, Prisma, markQueued } from "@go-watchtower/database";
import {
  AutomationExecutionStatuses as ES,
  AutomationAttemptStatuses as ATS,
  AutomationSystemErrorCodes as ERR,
  AutomationDispatchKinds,
  AutomationLifecycleBudgets,
  SystemEventActions,
  SystemEventResources,
} from "@go-watchtower/shared";
import { decideSafetyNet, decideReaper, decideFinalizer } from "./lifecycle-core.js";
import { toSnapshot, lockExecution } from "./execution.service.js";
import { dispatchExecution, type SqsSender } from "./dispatcher.js";
import type { RegionalQueueRegistry } from "./queue-registry.js";
import type { AutomaticAlarmAnalysisCommandV1 } from "./sqs-command.js";

/**
 * Job schedulato reconciler/reaper/safety-net/finalizer (OPUS-03 §9.9/§9.11).
 * Le decisioni sono delegate al nucleo puro testato; qui si selezionano i
 * candidati con gli indici `[status, …]` e si applica la CAS sotto lock di riga.
 * Idempotente: salta terminali e ri-verifica sotto lock.
 *
 * NON anticipa mai il retry di SQS e NON consuma la DLQ. Il re-dispatch dei
 * PENDING_DISPATCH verso SQS richiede l'adapter dispatcher/registry (infra,
 * Wave 2/3): qui il reconciler chiude solo per cap/deadline via safety-net.
 */

export interface ReconcilerConfig {
  readonly attemptLeaseMarginMs?: number;
  readonly heartbeatStaleThresholdMs?: number;
  readonly maxReceiveCount?: number;
  readonly batchSize?: number;
  readonly dispatchCap?: number;
}

export interface ReconcilerTickResult {
  readonly dispatched: number;
  readonly leaseReleased: number;
  readonly heartbeatStaleAlerts: number;
  readonly terminalized: number;
  readonly finalizedCancellations: number;
}

/** Dipendenze opzionali per il re-dispatch dei PENDING_DISPATCH (Flow 1/2 outbox). */
export interface DispatchDeps {
  readonly registry: RegionalQueueRegistry;
  readonly sender: SqsSender;
}

type Tx = Prisma.TransactionClient;

async function auditSystem(tx: Tx, action: string, executionId: string, metadata: Record<string, unknown>): Promise<void> {
  await tx.systemEvent.create({
    data: {
      action,
      resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
      resourceId: executionId,
      userId: null,
      metadata: { actorType: "SYSTEM", ...metadata },
    },
  });
}

/** RUNNING con lease hard scaduto → RETRY_PENDING (non-terminale); heartbeat stale → solo allarme. */
async function reapStaleRunning(
  now: Date,
  marginMs: number,
  heartbeatStaleThresholdMs: number,
  batchSize: number,
): Promise<{ leaseReleased: number; heartbeatStaleAlerts: number }> {
  let leaseReleased = 0;
  let heartbeatStaleAlerts = 0;
  const candidates = await prisma.automaticRunbookExecution.findMany({
    where: { status: ES.RUNNING },
    select: { id: true },
    take: batchSize,
    orderBy: { lastHeartbeatAt: "asc" },
  });
  for (const { id } of candidates) {
    const outcome = await prisma.$transaction(async (tx) => {
      const row = await lockExecution(tx, id);
      if (!row || row.status !== ES.RUNNING) return "skip";
      const decision = decideReaper(toSnapshot(row), now, marginMs, heartbeatStaleThresholdMs, row.lastHeartbeatAt);
      if (decision.kind === "TERMINALIZE_LOCAL_TIMEOUT") {
        if (row.activeAttemptId) {
          await tx.automaticRunbookAttempt.update({
            where: { id: row.activeAttemptId },
            data: { status: ATS.INTERRUPTED, errorCode: ERR.LOCAL_RUN_TIMED_OUT, finishedAt: now },
          });
        }
        await tx.automaticRunbookExecution.update({
          where: { id },
          data: {
            status: ES.FAILED,
            errorCode: ERR.LOCAL_RUN_TIMED_OUT,
            activeAttemptId: null,
            workerDeadlineAt: null,
            completedAt: now,
          },
        });
        await auditSystem(tx, SystemEventActions.AUTOMATION_EXECUTION_FAILED, id, { reason: ERR.LOCAL_RUN_TIMED_OUT });
        return "released";
      }
      if (decision.kind === "RELEASE_LEASE_RETRY_PENDING") {
        if (row.activeAttemptId) {
          await tx.automaticRunbookAttempt.update({
            where: { id: row.activeAttemptId },
            data: { status: ATS.INTERRUPTED, errorCode: "LEASE_EXPIRED_REAPED", finishedAt: now },
          });
        }
        await tx.automaticRunbookExecution.update({
          where: { id },
          data: { status: ES.RETRY_PENDING, activeAttemptId: null, workerDeadlineAt: null },
        });
        await auditSystem(tx, SystemEventActions.AUTOMATION_EXECUTION_RETRIED, id, { reason: "LEASE_EXPIRED_REAPED" });
        return "released";
      }
      if (decision.kind === "HEARTBEAT_STALE_ALERT") return "alert";
      return "skip";
    });
    if (outcome === "released") leaseReleased += 1;
    else if (outcome === "alert") heartbeatStaleAlerts += 1;
  }
  return { leaseReleased, heartbeatStaleAlerts };
}

/** Safety-net state-aware: ogni stato runnable oltre la propria deadline → terminale. */
async function runSafetyNet(now: Date, maxReceiveCount: number, batchSize: number): Promise<number> {
  let terminalized = 0;
  const candidates = await prisma.automaticRunbookExecution.findMany({
    where: {
      status: { in: [ES.PENDING_DISPATCH, ES.QUEUED, ES.RUNNING, ES.RETRY_PENDING] },
      deadlineAt: { lt: now },
    },
    select: { id: true },
    take: batchSize,
    orderBy: { deadlineAt: "asc" },
  });
  for (const { id } of candidates) {
    const did = await prisma.$transaction(async (tx) => {
      const row = await lockExecution(tx, id);
      if (!row) return false;
      const inDlq =
        (row.status === ES.RUNNING || row.status === ES.RETRY_PENDING) &&
        row.cycleReceiveCount >= maxReceiveCount;
      const decision = decideSafetyNet(toSnapshot(row), now, inDlq);
      if (decision.kind !== "TERMINALIZE") return false;
      if (row.activeAttemptId) {
        await tx.automaticRunbookAttempt.update({
          where: { id: row.activeAttemptId },
          data: { status: ATS.INTERRUPTED, errorCode: decision.errorCode, finishedAt: now },
        });
      }
      await tx.automaticRunbookExecution.update({
        where: { id },
        data: {
          status: ES.FAILED,
          errorCode: decision.errorCode,
          activeAttemptId: null,
          workerDeadlineAt: null,
          completedAt: now,
        },
      });
      await auditSystem(tx, SystemEventActions.AUTOMATION_EXECUTION_FAILED, id, { reason: decision.errorCode });
      return true;
    });
    if (did) terminalized += 1;
  }
  return terminalized;
}

/** Finalizer SYSTEM: CANCEL_REQUESTED non confermato oltre la deadline hard → CANCELLED. */
async function runFinalizer(now: Date, marginMs: number, batchSize: number): Promise<number> {
  let finalized = 0;
  const candidates = await prisma.automaticRunbookExecution.findMany({
    where: { status: ES.CANCEL_REQUESTED },
    select: { id: true },
    take: batchSize,
    orderBy: { workerDeadlineAt: "asc" },
  });
  for (const { id } of candidates) {
    const did = await prisma.$transaction(async (tx) => {
      const row = await lockExecution(tx, id);
      if (!row || row.status !== ES.CANCEL_REQUESTED) return false;
      const decision = decideFinalizer(toSnapshot(row), now, marginMs);
      if (decision.kind !== "FINALIZE_SYSTEM_CANCEL") return false;
      if (row.activeAttemptId) {
        await tx.automaticRunbookAttempt.update({
          where: { id: row.activeAttemptId },
          data: { status: ATS.INTERRUPTED, errorCode: "CANCEL_FINALIZED_SYSTEM", finishedAt: now },
        });
      }
      await tx.automaticRunbookExecution.update({
        where: { id },
        data: {
          status: ES.CANCELLED,
          activeAttemptId: null,
          workerDeadlineAt: null,
          cancelledAt: now,
          completedAt: now,
          cancellationFinalizedBy: "SYSTEM",
        },
      });
      await auditSystem(tx, SystemEventActions.AUTOMATION_EXECUTION_CANCELLED, id, { finalizedBy: "SYSTEM" });
      return true;
    });
    if (did) finalized += 1;
  }
  return finalized;
}

/**
 * Re-dispatch dei PENDING_DISPATCH (execution-as-outbox, §8.2/§9.8). NON tiene il
 * lock di riga durante l'I/O di rete: legge la riga, fa dispatch (registry+send),
 * poi applica una CAS guardata su `status = PENDING_DISPATCH` (idempotente: se il
 * worker ha già fatto `start` la CAS è no-op). `markQueued` rinnova il
 * queue-delivery budget dalla retention reale della coda.
 */
async function dispatchPendingExecutions(
  deps: DispatchDeps,
  now: Date,
  dispatchCap: number,
  reconcilerMarginMs: number,
  batchSize: number,
): Promise<number> {
  let dispatched = 0;
  const candidates = await prisma.automaticRunbookExecution.findMany({
    where: { status: ES.PENDING_DISPATCH, dispatchKind: AutomationDispatchKinds.SQS },
    select: { id: true, inputSnapshot: true, dispatchAttempts: true, deadlineAt: true },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  for (const row of candidates) {
    // Cap/deadline → DISPATCH_FAILED (CAS guardata).
    if (now > row.deadlineAt || row.dispatchAttempts >= dispatchCap) {
      await terminalizePendingDispatch(row.id, ERR.DISPATCH_FAILED, now);
      continue;
    }

    const command = row.inputSnapshot as unknown as AutomaticAlarmAnalysisCommandV1;
    const result = await dispatchExecution(command, deps.registry, deps.sender);

    switch (result.kind) {
      case "QUEUED": {
        const budgetMs = result.messageRetentionSeconds * 1000 + reconcilerMarginMs;
        const cas = await markQueued(row.id, budgetMs, now);
        if (cas.transitioned) {
          await prisma.automaticRunbookExecution.updateMany({
            where: { id: row.id },
            data: { sqsMessageId: result.sqsMessageId },
          });
          dispatched += 1;
        }
        break;
      }
      case "TRANSIENT":
        // Resta PENDING_DISPATCH, ritenta al prossimo tick (M2).
        await prisma.automaticRunbookExecution.updateMany({
          where: { id: row.id, status: ES.PENDING_DISPATCH },
          data: { dispatchAttempts: { increment: 1 } },
        });
        break;
      case "REGION_NOT_ONBOARDED":
        await terminalizePendingDispatch(row.id, ERR.REGION_NOT_ONBOARDED, now);
        break;
      case "QUEUE_REGISTRY_INVALID":
        await terminalizePendingDispatch(row.id, ERR.QUEUE_REGISTRY_INVALID, now);
        break;
      case "INVALID_COMMAND":
        // Non dovrebbe accadere (comando costruito da WT); chiudi prudenzialmente.
        await terminalizePendingDispatch(row.id, ERR.DISPATCH_FAILED, now);
        break;
      default: {
        const exhaustive: never = result;
        throw new Error(`Unhandled dispatch result ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return dispatched;
}

async function terminalizePendingDispatch(
  id: string,
  errorCode: string,
  now: Date,
): Promise<void> {
  const res = await prisma.automaticRunbookExecution.updateMany({
    where: { id, status: ES.PENDING_DISPATCH },
    data: { status: ES.FAILED, errorCode, completedAt: now },
  });
  if (res.count === 1) {
    await prisma.systemEvent.create({
      data: {
        action: SystemEventActions.AUTOMATION_EXECUTION_FAILED,
        resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
        resourceId: id,
        userId: null,
        metadata: { actorType: "SYSTEM", reason: errorCode },
      },
    });
  }
}

/** Esegue un tick completo del reconciler (es. ogni minuto). */
export async function runReconcilerTick(
  config: ReconcilerConfig = {},
  deps?: DispatchDeps,
  now: Date = new Date(),
): Promise<ReconcilerTickResult> {
  const marginMs = config.attemptLeaseMarginMs ?? AutomationLifecycleBudgets.ATTEMPT_LEASE_MARGIN_MS;
  const heartbeatStaleThresholdMs = config.heartbeatStaleThresholdMs ?? 3 * 60 * 1000;
  const maxReceiveCount = config.maxReceiveCount ?? 5;
  const batchSize = config.batchSize ?? 200;
  const dispatchCap = config.dispatchCap ?? 5;

  const dispatched = deps
    ? await dispatchPendingExecutions(deps, now, dispatchCap, AutomationLifecycleBudgets.RECONCILER_MARGIN_MS, batchSize)
    : 0;
  const reap = await reapStaleRunning(now, marginMs, heartbeatStaleThresholdMs, batchSize);
  const terminalized = await runSafetyNet(now, maxReceiveCount, batchSize);
  const finalizedCancellations = await runFinalizer(now, marginMs, batchSize);

  return {
    dispatched,
    leaseReleased: reap.leaseReleased,
    heartbeatStaleAlerts: reap.heartbeatStaleAlerts,
    terminalized,
    finalizedCancellations,
  };
}

export { reapStaleRunning, runSafetyNet, runFinalizer, dispatchPendingExecutions };
