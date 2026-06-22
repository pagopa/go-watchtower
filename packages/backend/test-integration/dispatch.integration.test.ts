/**
 * Integration test di Flow 1 (ensureInitialExecution/markQueued) e del re-dispatch
 * del reconciler contro PostgreSQL reale (gated su DATABASE_URL). Il send SQS e la
 * lettura SSM sono dietro port fake (nessun accesso AWS reale).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { before, after } from "node:test";
import { prisma, ensureInitialExecution, markQueued } from "@go-watchtower/database";
import { runReconcilerTick } from "../src/services/automation/reconciler.service.js";
import {
  RegionalQueueRegistry,
  TransientSsmError,
  type SsmParameterReader,
} from "../src/services/automation/queue-registry.js";
import type { SqsSender } from "../src/services/automation/dispatcher.js";

let productId: string;
let environmentId: string;
let alarmId: string;

const UPSTREAM = path.resolve(
  import.meta.dirname,
  "../../../contracts/runbook-automation/v1/upstream/go-automation/fixtures",
);
const validRegistryJson = readFileSync(path.join(UPSTREAM, "queue-registry.valid.json"), "utf-8"); // eu-south-1
const missingRegionJson = readFileSync(path.join(UPSTREAM, "queue-registry.missing-region.json"), "utf-8"); // eu-west-1

before(async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  productId = (await prisma.product.create({ data: { name: `dtest-${suffix}` } })).id;
  environmentId = (await prisma.environment.create({ data: { name: `env-${suffix}`, productId } })).id;
  alarmId = (await prisma.alarm.create({ data: { name: `alarm-${suffix}`, productId } })).id;
});

after(async () => {
  await prisma.$disconnect();
});

async function freshEvent(region = "eu-south-1"): Promise<string> {
  const e = await prisma.alarmEvent.create({
    data: {
      name: `evt-${crypto.randomUUID().slice(0, 8)}`,
      firedAt: new Date("2026-06-22T10:00:00.000Z"),
      awsRegion: region,
      awsAccountId: "170533023216",
      productId,
      environmentId,
      alarmId,
    },
  });
  return e.id;
}

function registryFrom(json: string): RegionalQueueRegistry {
  const reader: SsmParameterReader = { read: () => Promise.resolve(json) };
  return new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
}

const okSender = (): SqsSender => ({ send: () => Promise.resolve({ messageId: `sqs-${crypto.randomUUID().slice(0, 8)}` }) });

test("ensureInitialExecution is idempotent under concurrency (same executionId, one created)", async () => {
  const eventId = await freshEvent();
  const [a, b] = await Promise.all([ensureInitialExecution(eventId), ensureInitialExecution(eventId)]);
  assert.equal(a.executionId, b.executionId, "both calls converge on the same execution");
  assert.equal([a.created, b.created].filter(Boolean).length, 1, "exactly one call created the row");
  const rows = await prisma.automaticRunbookExecution.findMany({ where: { alarmEventId: eventId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "PENDING_DISPATCH");
  assert.equal(rows[0]?.requestKey, `SLACK:${eventId}`);
  assert.equal(rows[0]?.triggerKind, "SLACK_INGESTER");
});

test("markQueued CAS: PENDING_DISPATCH → QUEUED once; no-op otherwise", async () => {
  const eventId = await freshEvent();
  const { executionId } = await ensureInitialExecution(eventId);
  const first = await markQueued(executionId, 345_600_000);
  assert.equal(first.transitioned, true);
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: executionId } });
  assert.equal(row?.status, "QUEUED");
  assert.notEqual(row?.queuedAt, null);
  const second = await markQueued(executionId, 345_600_000);
  assert.equal(second.transitioned, false, "already QUEUED → no-op");
});

test("reconciler dispatch: PENDING_DISPATCH → QUEUED on successful send", async () => {
  const eventId = await freshEvent("eu-south-1");
  const { executionId } = await ensureInitialExecution(eventId);
  await runReconcilerTick({}, { registry: registryFrom(validRegistryJson), sender: okSender() });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: executionId } });
  assert.equal(row?.status, "QUEUED");
  assert.notEqual(row?.sqsMessageId, null);
});

test("reconciler dispatch: region not onboarded → FAILED/REGION_NOT_ONBOARDED", async () => {
  const eventId = await freshEvent("eu-south-1"); // registry only has eu-west-1
  const { executionId } = await ensureInitialExecution(eventId);
  await runReconcilerTick({}, { registry: registryFrom(missingRegionJson), sender: okSender() });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: executionId } });
  assert.equal(row?.status, "FAILED");
  assert.equal(row?.errorCode, "REGION_NOT_ONBOARDED");
});

test("reconciler dispatch: transient SSM → stays PENDING_DISPATCH, dispatchAttempts++", async () => {
  const eventId = await freshEvent("eu-south-1");
  const { executionId } = await ensureInitialExecution(eventId);
  const reader: SsmParameterReader = { read: () => Promise.reject(new TransientSsmError("throttled")) };
  const registry = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
  await runReconcilerTick({}, { registry, sender: okSender() });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: executionId } });
  assert.equal(row?.status, "PENDING_DISPATCH");
  assert.equal(row?.dispatchAttempts, 1);
});

test("reconciler dispatch: past dispatch deadline → FAILED/DISPATCH_FAILED", async () => {
  const eventId = await freshEvent("eu-south-1");
  const { executionId } = await ensureInitialExecution(eventId);
  await prisma.automaticRunbookExecution.update({
    where: { id: executionId },
    data: { deadlineAt: new Date(Date.now() - 60_000) },
  });
  await runReconcilerTick({}, { registry: registryFrom(validRegistryJson), sender: okSender() });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: executionId } });
  assert.equal(row?.status, "FAILED");
  assert.equal(row?.errorCode, "DISPATCH_FAILED");
});
