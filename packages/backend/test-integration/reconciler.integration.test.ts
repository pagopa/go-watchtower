/**
 * Integration test del reconciler/reaper/safety-net/finalizer contro PostgreSQL
 * reale (gated su DATABASE_URL). Verifica le transizioni di chiusura del ciclo di
 * vita (§9.9/§9.11) rispettando i CHECK lease/cancellazione del DB.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import { prisma } from "@go-watchtower/database";
import { RUNBOOK_AUTOMATION_SERVICE_ID } from "@go-watchtower/shared";
import { startExecution, createManualExecution, requestCancel } from "../src/services/automation/execution.service.js";
import { runReconcilerTick } from "../src/services/automation/reconciler.service.js";
import { registerCapabilityCatalogFor } from "./helpers/capability-catalog.js";

let humanUserId: string;
let productId: string;
let environmentId: string;
let alarmId: string;

before(async () => {
  const svc = await prisma.user.findUnique({ where: { serviceId: RUNBOOK_AUTOMATION_SERVICE_ID } });
  assert.ok(svc);
  const human = await prisma.user.findFirst({ where: { principalType: "HUMAN" } });
  assert.ok(human);
  humanUserId = human.id;
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({ data: { name: `rtest-${suffix}` } });
  productId = product.id;
  environmentId = (await prisma.environment.create({ data: { name: `env-${suffix}`, productId } })).id;
  const alarmName = `alarm-${suffix}`;
  alarmId = (await prisma.alarm.create({ data: { name: alarmName, productId } })).id;
  await registerCapabilityCatalogFor([alarmName]);
});

after(async () => {
  await prisma.$disconnect();
});

async function newExecution(): Promise<string> {
  const event = await prisma.alarmEvent.create({
    data: {
      name: `evt-${crypto.randomUUID().slice(0, 8)}`,
      firedAt: new Date("2026-06-22T10:00:00.000Z"),
      awsRegion: "eu-south-1",
      awsAccountId: "170533023216",
      productId,
      environmentId,
      alarmId,
    },
  });
  const res = await createManualExecution(event.id, "WATCHTOWER_API", { userId: humanUserId, label: "t" });
  if (res.kind !== "OK") throw new Error("setup");
  return res.execution.id;
}

const past = new Date(Date.now() - 5 * 60 * 1000);
const future = new Date(Date.now() + 60 * 60 * 1000);
const delivery = () => ({ sqsMessageId: "m-1", approximateReceiveCount: 1, workerDeadlineAt: future.toISOString() });

test("reaper: RUNNING with expired lease (deadline still future) → RETRY_PENDING, attempt INTERRUPTED", async () => {
  const id = await newExecution();
  await startExecution(id, delivery());
  // force the hard lease into the past, keep lifecycle deadline in the future
  await prisma.automaticRunbookExecution.update({ where: { id }, data: { workerDeadlineAt: past, deadlineAt: future } });
  await runReconcilerTick({ attemptLeaseMarginMs: 0 });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.equal(row?.status, "RETRY_PENDING");
  assert.equal(row?.activeAttemptId, null);
  const interrupted = await prisma.automaticRunbookAttempt.count({ where: { executionId: id, status: "INTERRUPTED" } });
  assert.equal(interrupted, 1);
});

test("safety-net: QUEUED with zero attempts past deadline → FAILED/QUEUE_DELIVERY_TIMED_OUT", async () => {
  const id = await newExecution();
  await prisma.automaticRunbookExecution.update({
    where: { id },
    data: { status: "QUEUED", queuedAt: past, deadlineAt: past },
  });
  await runReconcilerTick({ attemptLeaseMarginMs: 0 });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.equal(row?.status, "FAILED");
  assert.equal(row?.errorCode, "QUEUE_DELIVERY_TIMED_OUT");
});

test("safety-net: PENDING_DISPATCH past deadline → FAILED/DISPATCH_FAILED", async () => {
  const id = await newExecution();
  await prisma.automaticRunbookExecution.update({ where: { id }, data: { deadlineAt: past } });
  await runReconcilerTick({ attemptLeaseMarginMs: 0 });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.equal(row?.status, "FAILED");
  assert.equal(row?.errorCode, "DISPATCH_FAILED");
});

test("finalizer: CANCEL_REQUESTED past worker deadline → CANCELLED/SYSTEM", async () => {
  const id = await newExecution();
  await startExecution(id, delivery());
  const cancel = await requestCancel(id, "stop", { userId: humanUserId, label: "t" });
  assert.equal(cancel.kind, "OK");
  // push the hard deadline into the past; keep lifecycle deadline future (safety-net excludes CANCEL_REQUESTED anyway)
  await prisma.automaticRunbookExecution.update({ where: { id }, data: { workerDeadlineAt: past, deadlineAt: future } });
  await runReconcilerTick({ attemptLeaseMarginMs: 0 });
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.equal(row?.status, "CANCELLED");
  assert.equal(row?.cancellationFinalizedBy, "SYSTEM");
  assert.equal(row?.cancelledAt !== null, true);
});
