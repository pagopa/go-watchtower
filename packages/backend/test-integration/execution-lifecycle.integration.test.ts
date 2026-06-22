/**
 * Integration test del lifecycle automation contro un PostgreSQL reale
 * (gated su DATABASE_URL: il runner CI fornisce un DB migrato + seedato).
 * Esercita race, idempotenza, fencing, cancellazione e apply a 3 rami sul
 * servizio transazionale reale (non via HTTP).
 *
 * Setup: `prisma migrate deploy` + `prisma db seed` su un DB usa-e-getta, poi
 * `DATABASE_URL=... pnpm --filter @go-watchtower/backend test:integration`.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import { prisma } from "@go-watchtower/database";
import { RUNBOOK_AUTOMATION_SERVICE_ID } from "@go-watchtower/shared";
import {
  startExecution,
  completeExecution,
  requestCancel,
  createManualExecution,
} from "../src/services/automation/execution.service.js";

const RUNBOOK_AUTOMATION_SERVICE_ID_VALUE = RUNBOOK_AUTOMATION_SERVICE_ID;

let actorUserId: string;
let productId: string;
let environmentId: string;
let alarmId: string;
let humanUserId: string;

const created = { products: [] as string[] };

before(async () => {
  const svc = await prisma.user.findUnique({ where: { serviceId: RUNBOOK_AUTOMATION_SERVICE_ID_VALUE } });
  assert.ok(svc, "service principal must be seeded (run prisma db seed)");
  actorUserId = svc.id;

  const human = await prisma.user.findFirst({ where: { principalType: "HUMAN" } });
  assert.ok(human, "a human user must exist (seed admin)");
  humanUserId = human.id;

  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({ data: { name: `itest-${suffix}` } });
  productId = product.id;
  created.products.push(product.id);
  const env = await prisma.environment.create({ data: { name: `env-${suffix}`, productId } });
  environmentId = env.id;
  const alarm = await prisma.alarm.create({ data: { name: `alarm-${suffix}`, productId } });
  alarmId = alarm.id;
});

after(async () => {
  // Best-effort cleanup (DB usa-e-getta; le execution sono append-only/Restrict).
  await prisma.$disconnect();
});

async function freshEvent(): Promise<string> {
  const e = await prisma.alarmEvent.create({
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
  return e.id;
}

async function newExecution(): Promise<string> {
  const eventId = await freshEvent();
  const res = await createManualExecution(eventId, "WATCHTOWER_API", { userId: humanUserId, label: "tester" });
  assert.equal(res.kind, "OK");
  if (res.kind !== "OK") throw new Error("setup failed");
  return res.execution.id;
}

async function setMode(mode: "SHADOW" | "APPLY_KNOWN" | "APPLY_ALL"): Promise<void> {
  await prisma.systemSetting.update({ where: { key: "automation.defaultMode" }, data: { value: mode } });
}

const delivery = (msg: string, recv = 1) => ({
  sqsMessageId: msg,
  approximateReceiveCount: recv,
  workerDeadlineAt: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
});

test("start acquires the lease and creates a RUNNING attempt", async () => {
  const id = await newExecution();
  const r = await startExecution(id, delivery("m-1"));
  assert.equal(r.response.disposition, "START");
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.equal(row?.status, "RUNNING");
  assert.ok(row?.activeAttemptId);
  const attempts = await prisma.automaticRunbookAttempt.count({ where: { executionId: id, status: "RUNNING" } });
  assert.equal(attempts, 1);
});

test("two concurrent start (different tuples): exactly one START, the other ALREADY_RUNNING; one RUNNING attempt", async () => {
  const id = await newExecution();
  const [a, b] = await Promise.all([startExecution(id, delivery("m-A", 1)), startExecution(id, delivery("m-B", 1))]);
  const dispositions = [a.response.disposition, b.response.disposition].sort();
  assert.deepEqual(dispositions, ["ALREADY_RUNNING", "START"]);
  const running = await prisma.automaticRunbookAttempt.count({ where: { executionId: id, status: "RUNNING" } });
  assert.equal(running, 1, "partial unique index guarantees a single RUNNING attempt");
});

test("complete KNOWN_CASE with APPLY_ALL → branch 1 creates AUTOMATIC analysis, links event, SUCCEEDED", async () => {
  await setMode("APPLY_ALL");
  const id = await newExecution();
  const start = await startExecution(id, delivery("m-1"));
  assert.equal(start.response.disposition, "START");
  const attemptId = "attemptId" in start.response ? start.response.attemptId : "";
  const res = await completeExecution(id, actorUserId, { attemptId, outcome: "KNOWN_CASE", queryCount: 2, bytesScanned: "1024", runbookKey: "alarm-x" });
  assert.equal(res.kind, "OK");
  if (res.kind === "OK") {
    assert.equal(res.status, "SUCCEEDED");
    assert.ok(res.analysisId, "analysis must be created and cross-referenced");
    const analysis = await prisma.alarmAnalysis.findUnique({ where: { id: res.analysisId! } });
    assert.equal(analysis?.origin, "AUTOMATIC");
    assert.equal(analysis?.occurrences, 1);
    assert.equal(analysis?.operatorId, actorUserId);
    assert.equal(analysis?.lastAppliedExecutionId, id);
    const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
    assert.equal(row?.analysisId, res.analysisId);
    assert.equal(row?.reviewStatus, "NOT_REQUIRED"); // KNOWN_CASE
  }
});

test("complete idempotency: same attempt+payload → ALREADY_TERMINAL; different payload → IDEMPOTENCY_PAYLOAD_MISMATCH", async () => {
  await setMode("APPLY_ALL");
  const id = await newExecution();
  const start = await startExecution(id, delivery("m-1"));
  const attemptId = "attemptId" in start.response ? start.response.attemptId : "";
  const first = await completeExecution(id, actorUserId, { attemptId, outcome: "KNOWN_CASE", queryCount: 1 });
  assert.equal(first.kind, "OK");
  const replaySame = await completeExecution(id, actorUserId, { attemptId, outcome: "KNOWN_CASE", queryCount: 1 });
  assert.equal(replaySame.kind, "ALREADY_TERMINAL");
  const replayDiff = await completeExecution(id, actorUserId, { attemptId, outcome: "KNOWN_CASE", queryCount: 999 });
  assert.equal(replayDiff.kind, "IDEMPOTENCY_PAYLOAD_MISMATCH");
});

test("fencing: complete with a stale attemptId does not terminalize", async () => {
  const id = await newExecution();
  await startExecution(id, delivery("m-1"));
  const res = await completeExecution(id, actorUserId, { attemptId: crypto.randomUUID(), outcome: "KNOWN_CASE" });
  assert.equal(res.kind, "STALE_ATTEMPT");
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.equal(row?.status, "RUNNING", "stale callback must not change lifecycle");
});

test("cancel/complete race: cancel wins → complete applies nothing (CANCELLATION_REQUESTED)", async () => {
  await setMode("APPLY_ALL");
  const id = await newExecution();
  const start = await startExecution(id, delivery("m-1"));
  const attemptId = "attemptId" in start.response ? start.response.attemptId : "";
  const cancel = await requestCancel(id, "operator stop", { userId: humanUserId, label: "tester" });
  assert.equal(cancel.kind, "OK");
  const complete = await completeExecution(id, actorUserId, { attemptId, outcome: "KNOWN_CASE" });
  assert.equal(complete.kind, "CANCELLATION_REQUESTED");
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.equal(row?.status, "CANCEL_REQUESTED");
  assert.equal(row?.outcome, null, "no outcome applied after cancel won");
});

test("re-run on an AUTOMATIC-linked event → branch 2 updates in place, occurrences stays 1, lastApplied advances", async () => {
  await setMode("APPLY_ALL");
  const eventId = await freshEvent();
  // first run: branch 1
  const r1 = await createManualExecution(eventId, "WATCHTOWER_API", { userId: humanUserId, label: "t" });
  assert.equal(r1.kind, "OK");
  const id1 = r1.kind === "OK" ? r1.execution.id : "";
  const s1 = await startExecution(id1, delivery("m-1"));
  const a1 = "attemptId" in s1.response ? s1.response.attemptId : "";
  const c1 = await completeExecution(id1, actorUserId, { attemptId: a1, outcome: "KNOWN_CASE" });
  assert.equal(c1.kind, "OK");
  const analysisId = c1.kind === "OK" ? c1.analysisId : null;
  assert.ok(analysisId);

  // second run on the SAME event: branch 2 (update in place)
  const r2 = await createManualExecution(eventId, "WATCHTOWER_API", { userId: humanUserId, label: "t" });
  const id2 = r2.kind === "OK" ? r2.execution.id : "";
  const s2 = await startExecution(id2, delivery("m-2"));
  const a2 = "attemptId" in s2.response ? s2.response.attemptId : "";
  const c2 = await completeExecution(id2, actorUserId, { attemptId: a2, outcome: "UNKNOWN_CASE" });
  assert.equal(c2.kind, "OK");
  if (c2.kind === "OK") assert.equal(c2.analysisId, analysisId, "same analysis updated in place");
  const analysis = await prisma.alarmAnalysis.findUnique({ where: { id: analysisId! } });
  assert.equal(analysis?.occurrences, 1, "AUTOMATIC analysis stays 1:1");
  assert.equal(analysis?.lastAppliedExecutionId, id2, "lastApplied advanced to the re-run");
  const exec2 = await prisma.automaticRunbookExecution.findUnique({ where: { id: id2 } });
  assert.equal(exec2?.reviewStatus, "PENDING", "UNKNOWN_CASE → review PENDING");
});

test("SHADOW mode: KNOWN_CASE writes no AlarmAnalysis, stores analysisPayload, execution SUCCEEDED", async () => {
  await setMode("SHADOW");
  const id = await newExecution();
  const start = await startExecution(id, delivery("m-1"));
  const attemptId = "attemptId" in start.response ? start.response.attemptId : "";
  const res = await completeExecution(id, actorUserId, { attemptId, outcome: "KNOWN_CASE", analysisPayload: { shadow: true } });
  assert.equal(res.kind, "OK");
  if (res.kind === "OK") {
    assert.equal(res.status, "SUCCEEDED");
    assert.equal(res.analysisId, null, "SHADOW does not link/create an analysis");
  }
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id } });
  assert.notEqual(row?.analysisPayload, null);
});
