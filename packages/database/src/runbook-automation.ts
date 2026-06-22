import { prisma } from "./client.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AutomationExecutionStatuses,
  AutomationTriggerKinds,
  AutomationModes,
  AutomationLifecycleBudgets,
  AUTOMATION_DEFAULT_MODE_SETTING_KEY,
  AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION,
  type AutomationMode,
} from "@go-watchtower/shared";
import crypto from "node:crypto";

/**
 * Primitive di Flow 1 (execution-as-outbox, OPUS-03 §8.2/§9.4) condivise tra
 * Slack Ingester e backend: la create idempotente dell'esecuzione iniziale e la
 * CAS `markQueued`. Vivono nel layer database (puro Prisma, niente AWS/typebox)
 * così entrambi i consumer le importano senza dipendenze incrociate.
 */

const COMMAND_VERSION = AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION;

async function resolveDefaultMode(): Promise<AutomationMode> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: AUTOMATION_DEFAULT_MODE_SETTING_KEY },
  });
  const value = typeof setting?.value === "string" ? setting.value : AutomationModes.SHADOW;
  if (value === AutomationModes.APPLY_ALL || value === AutomationModes.APPLY_KNOWN) {
    return value;
  }
  return AutomationModes.SHADOW;
}

export interface EnsureInitialExecutionResult {
  readonly executionId: string;
  /** true se questa chiamata ha creato la riga; false se era già presente (dedup). */
  readonly created: boolean;
}

/**
 * Crea (idempotente) l'esecuzione iniziale per un AlarmEvent (Flow 1 Slack).
 * Idempotenza enforced a livello DB: `requestKey = "SLACK:<alarmEventId>"`
 * `@unique` + `INSERT … ON CONFLICT DO NOTHING` (Prisma `createMany` skipDuplicates)
 * + re-`SELECT` → chiamate concorrenti convergono sulla **stessa** riga/executionId.
 * Una chiamata deduplicata NON rinnova `deadlineAt`.
 */
export async function ensureInitialExecution(
  alarmEventId: string,
  now: Date = new Date(),
): Promise<EnsureInitialExecutionResult> {
  const requestKey = `SLACK:${alarmEventId}`;

  const existing = await prisma.automaticRunbookExecution.findUnique({
    where: { requestKey },
    select: { id: true },
  });
  if (existing) {
    return { executionId: existing.id, created: false };
  }

  const event = await prisma.alarmEvent.findUnique({
    where: { id: alarmEventId },
    include: { alarm: { select: { name: true } } },
  });
  if (!event) {
    throw new Error(`AlarmEvent ${alarmEventId} not found`);
  }
  if (!event.alarmId || !event.alarm) {
    throw new Error(`AlarmEvent ${alarmEventId} has no linked alarm; cannot create automatic execution`);
  }

  const executionId = crypto.randomUUID();
  const appliedMode = await resolveDefaultMode();
  const command = {
    schemaVersion: COMMAND_VERSION,
    executionId,
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
    trigger: { kind: AutomationTriggerKinds.SLACK_INGESTER },
  };

  // INSERT … ON CONFLICT (request_key) DO NOTHING
  const inserted = await prisma.automaticRunbookExecution.createMany({
    data: [
      {
        id: executionId,
        requestKey,
        alarmEventId: event.id,
        productId: event.productId,
        environmentId: event.environmentId,
        alarmId: event.alarmId,
        status: AutomationExecutionStatuses.PENDING_DISPATCH,
        triggerKind: AutomationTriggerKinds.SLACK_INGESTER,
        appliedMode,
        inputSnapshot: command satisfies Prisma.InputJsonValue,
        deadlineAt: new Date(now.getTime() + AutomationLifecycleBudgets.DISPATCH_BUDGET_MS),
      },
    ],
    skipDuplicates: true,
  });

  if (inserted.count === 1) {
    return { executionId, created: true };
  }

  // Race persa: un'altra chiamata ha creato la riga; convergi sulla sua.
  const winner = await prisma.automaticRunbookExecution.findUnique({
    where: { requestKey },
    select: { id: true },
  });
  if (!winner) {
    throw new Error(`ensureInitialExecution: row vanished for ${requestKey}`);
  }
  return { executionId: winner.id, created: false };
}

export interface MarkQueuedResult {
  readonly transitioned: boolean;
}

/**
 * CAS `PENDING_DISPATCH → QUEUED` dopo un SendMessage riuscito: valorizza
 * `queuedAt` e rinnova `deadlineAt = now + queueDeliveryBudget` nella stessa CAS
 * (§9.8). Se il worker ha già fatto `start` (stato non più PENDING_DISPATCH) la
 * CAS è no-op e non sovrascrive stato/cycle deadline.
 */
export async function markQueued(
  executionId: string,
  queueDeliveryBudgetMs: number,
  now: Date = new Date(),
): Promise<MarkQueuedResult> {
  const result = await prisma.automaticRunbookExecution.updateMany({
    where: { id: executionId, status: AutomationExecutionStatuses.PENDING_DISPATCH },
    data: {
      status: AutomationExecutionStatuses.QUEUED,
      queuedAt: now,
      deadlineAt: new Date(now.getTime() + queueDeliveryBudgetMs),
    },
  });
  return { transitioned: result.count === 1 };
}
