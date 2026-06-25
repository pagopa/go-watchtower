import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import pg from "pg";

/**
 * Seed DEMO per la console "Runbook automatici" (NON per produzione).
 * Inserisce ~8 esecuzioni in stati/esiti diversi referenziando AlarmEvent reali.
 * Idempotente: ripulisce le righe demo (ID fissi) e le ricrea.
 *
 *   pnpm --filter @go-watchtower/database exec tsx scripts/seed-automation-demo.ts
 *   CLEAN_ONLY=1 pnpm --filter @go-watchtower/database exec tsx scripts/seed-automation-demo.ts
 */

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EID = (n: number) => `0d0e0001-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`;
const AID = (n: number) => `0d0e0a01-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`;
const EXEC_IDS = Array.from({ length: 8 }, (_, i) => EID(i + 1));

const DEMO_HASH = "a".repeat(64);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

interface EventRef {
  id: string;
  productId: string;
  environmentId: string;
  alarmId: string;
  name: string;
  awsRegion: string;
  awsAccountId: string;
}

function command(event: EventRef, executionId: string) {
  return {
    schemaVersion: "1.0.0",
    executionId,
    alarmEvent: {
      id: event.id,
      productId: event.productId,
      environmentId: event.environmentId,
      alarmId: event.alarmId,
      alarmName: event.name,
      firedAt: minutesAgo(30).toISOString(),
      awsAccountId: event.awsAccountId,
      awsRegion: event.awsRegion,
    },
    trigger: { kind: "SLACK_INGESTOR" },
  };
}

async function cleanup(): Promise<void> {
  // Sposta in uno stato senza lease/cancellazione per poter cancellare senza
  // violare i CHECK, poi elimina attempt ed esecuzioni demo.
  await prisma.automaticRunbookExecution.updateMany({
    where: { id: { in: EXEC_IDS } },
    data: {
      status: "SKIPPED",
      activeAttemptId: null,
      workerDeadlineAt: null,
      cancelledAt: null,
      cancelRequestId: null,
      cancelRequestedAt: null,
      cancellationFinalizedBy: null,
      outcome: null,
      errorCode: null,
    },
  });
  await prisma.automaticRunbookAttempt.deleteMany({ where: { executionId: { in: EXEC_IDS } } });
  await prisma.automaticRunbookExecution.deleteMany({ where: { id: { in: EXEC_IDS } } });
}

async function main(): Promise<void> {
  console.log("🤖 Demo seed Runbook automatici\n");

  await cleanup();
  if (process.env["CLEAN_ONLY"] === "1") {
    console.log("🧹 Righe demo rimosse.");
    return;
  }

  const events = (await prisma.alarmEvent.findMany({
    where: { alarmId: { not: null } },
    take: 8,
    orderBy: { firedAt: "desc" },
    select: { id: true, productId: true, environmentId: true, alarmId: true, name: true, awsRegion: true, awsAccountId: true },
  })) as Array<{ id: string; productId: string; environmentId: string; alarmId: string | null; name: string; awsRegion: string; awsAccountId: string }>;

  if (events.length === 0) {
    throw new Error("Nessun AlarmEvent con alarmId trovato: impossibile creare esecuzioni demo.");
  }
  const ev = (i: number): EventRef => {
    const e = events[i % events.length]!;
    return { id: e.id, productId: e.productId, environmentId: e.environmentId, alarmId: e.alarmId!, name: e.name, awsRegion: e.awsRegion, awsAccountId: e.awsAccountId };
  };

  function base(event: EventRef, id: string) {
    return {
      id,
      alarmEventId: event.id,
      productId: event.productId,
      environmentId: event.environmentId,
      alarmId: event.alarmId,
      appliedMode: "SHADOW" as const,
      runbookKey: event.name,
      runbookVersion: "1.0.0",
      inputSnapshot: command(event, id) as object,
      deadlineAt: minutesFromNow(15),
    };
  }

  // 1) PENDING_DISPATCH
  await prisma.automaticRunbookExecution.create({
    data: { ...base(ev(0), EID(1)), status: "PENDING_DISPATCH", triggerKind: "SLACK_INGESTOR" },
  });

  // 2) QUEUED
  await prisma.automaticRunbookExecution.create({
    data: { ...base(ev(1), EID(2)), status: "QUEUED", triggerKind: "SLACK_INGESTOR", queuedAt: minutesAgo(2) },
  });

  // 3) RUNNING (+ attempt RUNNING + lease) — in transazione per il trigger deferred
  await prisma.$transaction(async (tx) => {
    await tx.automaticRunbookExecution.create({
      data: { ...base(ev(2), EID(3)), status: "PENDING_DISPATCH", triggerKind: "WATCHTOWER_UI" },
    });
    await tx.automaticRunbookAttempt.create({
      data: {
        id: AID(3), executionId: EID(3), attemptNumber: 1, deliveryCycle: 1, cycleReceiveCount: 1,
        sqsMessageId: "demo-msg-3", status: "RUNNING", phase: "query", heartbeatSequence: 3,
        startedAt: minutesAgo(4), lastHeartbeatAt: minutesAgo(1), workerDeadlineAt: minutesFromNow(11),
      },
    });
    await tx.automaticRunbookExecution.update({
      where: { id: EID(3) },
      data: {
        status: "RUNNING", activeAttemptId: AID(3), workerDeadlineAt: minutesFromNow(11),
        startedAt: minutesAgo(4), lastHeartbeatAt: minutesAgo(1), totalWorkerAttempts: 1,
      },
    });
  });

  // 4) SUCCEEDED / KNOWN_CASE (+ attempt COMPLETED)
  await prisma.automaticRunbookExecution.create({
    data: {
      ...base(ev(3), EID(4)), status: "SUCCEEDED", outcome: "KNOWN_CASE", triggerKind: "SLACK_INGESTOR",
      reviewStatus: "NOT_REQUIRED", totalWorkerAttempts: 1, startedAt: minutesAgo(20), completedAt: minutesAgo(18),
      durationMs: 120_000, queryCount: 3, bytesScanned: BigInt(204800), recordsScanned: BigInt(1500), recordsMatched: BigInt(3),
    },
  });
  await prisma.automaticRunbookAttempt.create({
    data: {
      id: AID(4), executionId: EID(4), attemptNumber: 1, deliveryCycle: 1, cycleReceiveCount: 1,
      sqsMessageId: "demo-msg-4", status: "COMPLETED", phase: "apply", heartbeatSequence: 5,
      retryDisposition: "COMPLETE_OUTCOME", completionPayloadHash: DEMO_HASH, completionHashVersion: "WT-COMPLETE-SHA256-V1",
      startedAt: minutesAgo(20), finishedAt: minutesAgo(18), durationMs: 120_000,
    },
  });

  // 5) SUCCEEDED / UNKNOWN_CASE — da revisionare (review PENDING)
  await prisma.automaticRunbookExecution.create({
    data: {
      ...base(ev(4), EID(5)), status: "SUCCEEDED", outcome: "UNKNOWN_CASE", triggerKind: "WATCHTOWER_API",
      reviewStatus: "PENDING", totalWorkerAttempts: 1, startedAt: minutesAgo(40), completedAt: minutesAgo(38),
      durationMs: 95_000, queryCount: 2, bytesScanned: BigInt(51200),
    },
  });
  await prisma.automaticRunbookAttempt.create({
    data: {
      id: AID(5), executionId: EID(5), attemptNumber: 1, deliveryCycle: 1, cycleReceiveCount: 1,
      sqsMessageId: "demo-msg-5", status: "COMPLETED", retryDisposition: "COMPLETE_OUTCOME",
      completionPayloadHash: DEMO_HASH, completionHashVersion: "WT-COMPLETE-SHA256-V1",
      startedAt: minutesAgo(40), finishedAt: minutesAgo(38),
    },
  });

  // 6) FAILED / CONFIGURATION_ERROR
  await prisma.automaticRunbookExecution.create({
    data: {
      ...base(ev(5), EID(6)), status: "FAILED", outcome: "CONFIGURATION_ERROR", triggerKind: "SLACK_INGESTOR",
      totalWorkerAttempts: 1, startedAt: minutesAgo(60), completedAt: minutesAgo(59),
      errorCode: "CONFIGURATION_ERROR", errorMessage: "OAM link assente per l'account sorgente (demo)",
    },
  });

  // 7) CANCELLED (immediate)
  await prisma.automaticRunbookExecution.create({
    data: {
      ...base(ev(6), EID(7)), status: "CANCELLED", triggerKind: "WATCHTOWER_UI",
      cancelRequestId: "0d0e0c01-0000-7000-8000-000000000007", cancelRequestedAt: minutesAgo(10),
      cancelledAt: minutesAgo(10), completedAt: minutesAgo(10), cancellationFinalizedBy: "IMMEDIATE",
      cancelReason: "Annullata manualmente (demo)", reviewStatus: "NOT_REQUIRED",
    },
  });

  // 8) RETRY_PENDING "in DLQ" (cycleReceiveCount >= maxReceiveCount), figlia della #4
  await prisma.automaticRunbookExecution.create({
    data: {
      ...base(ev(3), EID(8)), status: "RETRY_PENDING", triggerKind: "RETRY", parentExecutionId: EID(4),
      totalWorkerAttempts: 5, deliveryCycle: 1, cycleReceiveCount: 5, startedAt: minutesAgo(8),
    },
  });

  const created = await prisma.automaticRunbookExecution.findMany({
    where: { id: { in: EXEC_IDS } },
    select: { id: true, status: true, outcome: true },
    orderBy: { id: "asc" },
  });
  console.log(`✅ ${created.length} esecuzioni demo create:`);
  for (const c of created) console.log(`   ${c.id}  ${c.status}${c.outcome ? " / " + c.outcome : ""}`);
  console.log("\nℹ️  Per rimuoverle: CLEAN_ONLY=1 pnpm --filter @go-watchtower/database exec tsx scripts/seed-automation-demo.ts");
}

main()
  .catch((e: unknown) => {
    console.error("❌ Demo seed fallito:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
