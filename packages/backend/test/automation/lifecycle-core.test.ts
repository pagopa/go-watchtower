import assert from "node:assert/strict";
import test from "node:test";
import {
  AutomationExecutionStatuses as S,
  AutomationAttemptStatuses,
  AutomationExecutionOutcomes,
  AutomationModes,
  AnalysisOrigins,
} from "@go-watchtower/shared";
import {
  decideStart,
  decideProgress,
  decideComplete,
  decideFail,
  decideCancel,
  decideCancelAck,
  decideSafetyNet,
  decideReaper,
  decideFinalizer,
  routeAnalysis,
} from "../../src/services/automation/lifecycle-core.js";
import type {
  ActiveAttemptSnapshot,
  ExecutionSnapshot,
  DeliveryMetadata,
  LifecycleBudgets,
} from "../../src/services/automation/lifecycle-types.js";

const NOW = new Date("2026-06-22T12:00:00.000Z");

const BUDGETS: LifecycleBudgets = {
  attemptLeaseMarginMs: 60_000,
  cycleBudgetMs: 6_000_000, // > visibility timeout
  queueDeliveryBudgetMs: 1_000_000,
  dispatchBudgetMs: 900_000,
  dlqRetentionMs: 1_209_600_000,
};

function exec(overrides: Partial<ExecutionSnapshot>): ExecutionSnapshot {
  return {
    id: "exec-1",
    status: S.QUEUED,
    outcome: null,
    errorCode: null,
    activeAttemptId: null,
    workerDeadlineAt: null,
    deadlineAt: new Date(NOW.getTime() + 1_000_000),
    deliveryCycle: 1,
    cycleReceiveCount: 0,
    sqsMessageId: "m-1",
    totalWorkerAttempts: 0,
    cancelRequestId: null,
    cancelRequestedAt: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<ActiveAttemptSnapshot>): ActiveAttemptSnapshot {
  return {
    id: "att-1",
    status: AutomationAttemptStatuses.RUNNING,
    sqsMessageId: "m-1",
    cycleReceiveCount: 1,
    deliveryCycle: 1,
    attemptNumber: 1,
    heartbeatSequence: 0,
    completionPayloadHash: null,
    completionHashVersion: null,
    errorCode: null,
    ...overrides,
  };
}

function delivery(overrides: Partial<DeliveryMetadata>): DeliveryMetadata {
  return {
    sqsMessageId: "m-1",
    approximateReceiveCount: 1,
    workerDeadlineAt: new Date(NOW.getTime() + 720_000),
    ...overrides,
  };
}

// ─── start ────────────────────────────────────────────────────────────────────

test("start: terminal execution → ALREADY_TERMINAL no-op", () => {
  const d = decideStart(exec({ status: S.SUCCEEDED }), null, delivery({}), NOW, BUDGETS);
  assert.equal(d.action, "NO_OP");
  assert.equal(d.response.disposition, "ALREADY_TERMINAL");
});

test("start: CANCEL_REQUESTED → control signal, no attempt", () => {
  const d = decideStart(
    exec({
      status: S.CANCEL_REQUESTED,
      activeAttemptId: "att-1",
      workerDeadlineAt: new Date(NOW.getTime() + 100_000),
      cancelRequestId: "cr-1",
      cancelRequestedAt: NOW,
    }),
    attempt({}),
    delivery({ sqsMessageId: "m-2", approximateReceiveCount: 2 }),
    NOW,
    BUDGETS,
  );
  assert.equal(d.action, "NO_OP");
  assert.equal(d.response.disposition, "CANCEL_REQUESTED");
  if (d.response.disposition === "CANCEL_REQUESTED") assert.equal(d.response.cancelRequestId, "cr-1");
});

test("start: same delivery tuple → ALREADY_STARTED idempotent replay (same token)", () => {
  const running = exec({
    status: S.RUNNING,
    activeAttemptId: "att-1",
    workerDeadlineAt: new Date(NOW.getTime() + 100_000),
  });
  const d = decideStart(running, attempt({ sqsMessageId: "m-1", cycleReceiveCount: 1 }), delivery({ sqsMessageId: "m-1", approximateReceiveCount: 1 }), NOW, BUDGETS);
  assert.equal(d.action, "IDEMPOTENT_REPLAY");
  assert.equal(d.response.disposition, "ALREADY_STARTED");
  if (d.response.disposition === "ALREADY_STARTED") assert.equal(d.response.attemptId, "att-1");
});

test("start: different tuple + valid lease → ALREADY_RUNNING (no owner token exposed)", () => {
  const running = exec({
    status: S.RUNNING,
    activeAttemptId: "att-1",
    workerDeadlineAt: new Date(NOW.getTime() + 100_000),
  });
  const d = decideStart(running, attempt({ sqsMessageId: "m-1", cycleReceiveCount: 1 }), delivery({ sqsMessageId: "m-1", approximateReceiveCount: 2 }), NOW, BUDGETS);
  assert.equal(d.action, "NO_OP");
  assert.equal(d.response.disposition, "ALREADY_RUNNING");
  assert.ok(!("attemptId" in d.response));
});

test("start: different tuple + expired lease → takeover START, old attempt interrupted", () => {
  const running = exec({
    status: S.RUNNING,
    activeAttemptId: "att-1",
    workerDeadlineAt: new Date(NOW.getTime() - 120_000), // expired beyond margin
    totalWorkerAttempts: 1,
  });
  const d = decideStart(running, attempt({ sqsMessageId: "m-1", cycleReceiveCount: 1 }), delivery({ sqsMessageId: "m-1", approximateReceiveCount: 2 }), NOW, BUDGETS);
  assert.equal(d.action, "START");
  if (d.action === "START") {
    assert.equal(d.takeoverAttemptId, "att-1");
    assert.equal(d.nextAttemptNumber, 2);
    assert.equal(d.incrementsTotalWorkerAttempts, true);
  }
});

test("start: runnable QUEUED without lease → START new attempt #1", () => {
  const d = decideStart(exec({ status: S.QUEUED }), null, delivery({}), NOW, BUDGETS);
  assert.equal(d.action, "START");
  if (d.action === "START") {
    assert.equal(d.takeoverAttemptId, null);
    assert.equal(d.nextAttemptNumber, 1);
    assert.equal(d.opensNewCycle, false);
  }
});

test("start: redrive with new sqsMessageId opens a new cycle", () => {
  const d = decideStart(
    exec({ status: S.RETRY_PENDING, sqsMessageId: "m-old", deliveryCycle: 1 }),
    null,
    delivery({ sqsMessageId: "m-new", approximateReceiveCount: 1 }),
    NOW,
    BUDGETS,
  );
  assert.equal(d.action, "START");
  if (d.action === "START") {
    assert.equal(d.opensNewCycle, true);
    assert.equal(d.nextDeliveryCycle, 2);
  }
});

// ─── progress ──────────────────────────────────────────────────────────────────

test("progress: stale token → 200 staleAttempt, no write", () => {
  const running = exec({ status: S.RUNNING, activeAttemptId: "att-1", workerDeadlineAt: NOW });
  const d = decideProgress(running, attempt({ id: "att-1", heartbeatSequence: 5 }), { attemptId: "OTHER", phase: "x", heartbeatSequence: 6 });
  assert.equal(d.action, "STALE_ATTEMPT");
  assert.equal(d.response.staleAttempt, true);
});

test("progress: lower sequence ignored, equal idempotent, higher updates", () => {
  const running = exec({ status: S.RUNNING, activeAttemptId: "att-1", workerDeadlineAt: NOW });
  const a = attempt({ id: "att-1", heartbeatSequence: 5 });
  assert.equal(decideProgress(running, a, { attemptId: "att-1", phase: "x", heartbeatSequence: 4 }).action, "IGNORE_STALE_SEQUENCE");
  assert.equal(decideProgress(running, a, { attemptId: "att-1", phase: "x", heartbeatSequence: 5 }).action, "IDEMPOTENT");
  assert.equal(decideProgress(running, a, { attemptId: "att-1", phase: "x", heartbeatSequence: 6 }).action, "UPDATE_HEARTBEAT");
});

test("progress: always surfaces cancelRequested when CANCEL_REQUESTED", () => {
  const cr = exec({ status: S.CANCEL_REQUESTED, activeAttemptId: "att-1", workerDeadlineAt: NOW, cancelRequestId: "cr-9", cancelRequestedAt: NOW });
  const d = decideProgress(cr, attempt({ id: "att-1", heartbeatSequence: 1 }), { attemptId: "att-1", phase: "x", heartbeatSequence: 2 });
  assert.equal(d.response.cancelRequested, true);
  assert.equal(d.response.cancelRequestId, "cr-9");
});

// ─── complete ────────────────────────────────────────────────────────────────

test("complete: active token applies, status derived from outcome (never forced SUCCEEDED)", () => {
  const running = exec({ status: S.RUNNING, activeAttemptId: "att-1", workerDeadlineAt: NOW });
  const a = attempt({ id: "att-1" });
  const known = decideComplete(running, a, { attemptId: "att-1", outcome: AutomationExecutionOutcomes.KNOWN_CASE, recomputedHash: "h" });
  assert.deepEqual(known, { kind: "APPLY", derivedStatus: S.SUCCEEDED });
  const cfg = decideComplete(running, a, { attemptId: "att-1", outcome: AutomationExecutionOutcomes.CONFIGURATION_ERROR, recomputedHash: "h" });
  assert.deepEqual(cfg, { kind: "APPLY", derivedStatus: S.FAILED });
  const noRb = decideComplete(running, a, { attemptId: "att-1", outcome: AutomationExecutionOutcomes.NO_RUNBOOK, recomputedHash: "h" });
  assert.deepEqual(noRb, { kind: "APPLY", derivedStatus: S.SKIPPED });
});

test("complete: stale token → STALE_ATTEMPT, no apply", () => {
  const running = exec({ status: S.RUNNING, activeAttemptId: "att-1", workerDeadlineAt: NOW });
  const d = decideComplete(running, attempt({ id: "att-1" }), { attemptId: "OTHER", outcome: AutomationExecutionOutcomes.KNOWN_CASE, recomputedHash: "h" });
  assert.equal(d.kind, "STALE_ATTEMPT");
});

test("complete: cancel won the race → CANCELLATION_REQUESTED, no apply", () => {
  const cr = exec({ status: S.CANCEL_REQUESTED, activeAttemptId: "att-1", workerDeadlineAt: NOW, cancelRequestId: "cr", cancelRequestedAt: NOW });
  const d = decideComplete(cr, attempt({ id: "att-1" }), { attemptId: "att-1", outcome: AutomationExecutionOutcomes.KNOWN_CASE, recomputedHash: "h" });
  assert.equal(d.kind, "CANCELLATION_REQUESTED");
});

test("complete: replay same attempt + same hash → idempotent; different hash → MISMATCH", () => {
  const terminal = exec({ status: S.SUCCEEDED });
  const completed = attempt({ id: "att-1", status: AutomationAttemptStatuses.COMPLETED, completionPayloadHash: "HASH-A" });
  assert.equal(
    decideComplete(terminal, completed, { attemptId: "att-1", outcome: AutomationExecutionOutcomes.KNOWN_CASE, recomputedHash: "HASH-A" }).kind,
    "ALREADY_TERMINAL_IDEMPOTENT",
  );
  assert.equal(
    decideComplete(terminal, completed, { attemptId: "att-1", outcome: AutomationExecutionOutcomes.KNOWN_CASE, recomputedHash: "HASH-B" }).kind,
    "IDEMPOTENCY_PAYLOAD_MISMATCH",
  );
});

// ─── fail ────────────────────────────────────────────────────────────────────

test("fail: ACTIVE_ATTEMPT from RUNNING with active token → FAIL; stale token → STALE", () => {
  const running = exec({ status: S.RUNNING, activeAttemptId: "att-1", workerDeadlineAt: NOW });
  assert.equal(decideFail(running, attempt({ id: "att-1" }), { scope: "ACTIVE_ATTEMPT", attemptId: "att-1", errorCode: "INVALID_COMMAND" }).kind, "FAIL");
  assert.equal(decideFail(running, attempt({ id: "att-1" }), { scope: "ACTIVE_ATTEMPT", attemptId: "x", errorCode: "INVALID_COMMAND" }).kind, "STALE_ATTEMPT");
});

test("fail: PRE_START allowed only from runnable states", () => {
  assert.equal(decideFail(exec({ status: S.QUEUED }), null, { scope: "PRE_START", errorCode: "UNSUPPORTED_COMMAND_VERSION" }).kind, "FAIL");
  assert.equal(decideFail(exec({ status: S.RUNNING, activeAttemptId: "att-1", workerDeadlineAt: NOW }), null, { scope: "PRE_START", errorCode: "INVALID_COMMAND" }).kind, "REJECT_NOT_RUNNABLE");
});

test("fail: terminal idempotency vs conflict", () => {
  assert.equal(decideFail(exec({ status: S.FAILED, errorCode: "INVALID_COMMAND" }), null, { scope: "PRE_START", errorCode: "INVALID_COMMAND" }).kind, "ALREADY_TERMINAL_IDEMPOTENT");
  assert.equal(decideFail(exec({ status: S.SUCCEEDED }), null, { scope: "PRE_START", errorCode: "INVALID_COMMAND" }).kind, "CONFLICT_TERMINAL");
});

test("fail: CANCEL_REQUESTED is excluded", () => {
  assert.equal(decideFail(exec({ status: S.CANCEL_REQUESTED, activeAttemptId: "att-1", workerDeadlineAt: NOW, cancelRequestId: "c", cancelRequestedAt: NOW }), attempt({ id: "att-1" }), { scope: "ACTIVE_ATTEMPT", attemptId: "att-1", errorCode: "INTERNAL_INVARIANT" }).kind, "CANCELLATION_REQUESTED");
});

// ─── cancel (human) ────────────────────────────────────────────────────────────

test("cancel: state mapping", () => {
  assert.equal(decideCancel(exec({ status: S.QUEUED })).kind, "IMMEDIATE_CANCEL");
  assert.equal(decideCancel(exec({ status: S.PENDING_DISPATCH })).kind, "IMMEDIATE_CANCEL");
  assert.equal(decideCancel(exec({ status: S.RUNNING, activeAttemptId: "a", workerDeadlineAt: NOW })).kind, "REQUEST_CANCEL");
  assert.equal(decideCancel(exec({ status: S.CANCEL_REQUESTED, activeAttemptId: "a", workerDeadlineAt: NOW, cancelRequestId: "c", cancelRequestedAt: NOW })).kind, "ALREADY_REQUESTED");
  assert.equal(decideCancel(exec({ status: S.SUCCEEDED })).kind, "CANNOT_CANCEL_TERMINAL");
});

// ─── cancel/ack (service) ────────────────────────────────────────────────────

test("cancel/ack: only owner with matching requestId+attemptId finalizes", () => {
  const cr = exec({ status: S.CANCEL_REQUESTED, activeAttemptId: "att-1", workerDeadlineAt: NOW, cancelRequestId: "cr-1", cancelRequestedAt: NOW });
  assert.equal(decideCancelAck(cr, attempt({ id: "att-1" }), { cancelRequestId: "cr-1", attemptId: "att-1" }).kind, "FINALIZE_CANCEL");
  assert.equal(decideCancelAck(cr, attempt({ id: "att-1" }), { cancelRequestId: "WRONG", attemptId: "att-1" }).kind, "MISMATCH");
  assert.equal(decideCancelAck(cr, attempt({ id: "att-1" }), { cancelRequestId: "cr-1", attemptId: "WRONG" }).kind, "MISMATCH");
  assert.equal(decideCancelAck(exec({ status: S.CANCELLED, cancelRequestId: "cr-1", cancelRequestedAt: NOW }), null, { cancelRequestId: "cr-1", attemptId: "att-1" }).kind, "ALREADY_TERMINAL_IDEMPOTENT");
  assert.equal(decideCancelAck(exec({ status: S.RUNNING, activeAttemptId: "att-1", workerDeadlineAt: NOW }), attempt({ id: "att-1" }), { cancelRequestId: "cr-1", attemptId: "att-1" }).kind, "NOT_REQUESTED");
});

// ─── safety-net / reaper / finalizer ──────────────────────────────────────────

test("safety-net: state-aware error code mapping past deadline", () => {
  const past = new Date(NOW.getTime() - 1000);
  assert.equal(decideSafetyNet(exec({ status: S.PENDING_DISPATCH, deadlineAt: past }), NOW, false).kind === "TERMINALIZE" && decideSafetyNet(exec({ status: S.PENDING_DISPATCH, deadlineAt: past }), NOW, false).errorCode, "DISPATCH_FAILED");
  assert.equal(decideSafetyNet(exec({ status: S.QUEUED, deadlineAt: past, totalWorkerAttempts: 0 }), NOW, false).errorCode, "QUEUE_DELIVERY_TIMED_OUT");
  assert.equal(decideSafetyNet(exec({ status: S.RUNNING, deadlineAt: past, activeAttemptId: "a", workerDeadlineAt: past }), NOW, true).errorCode, "DEAD_LETTERED");
  assert.equal(decideSafetyNet(exec({ status: S.RUNNING, deadlineAt: past, activeAttemptId: "a", workerDeadlineAt: past }), NOW, false).errorCode, "TIMED_OUT");
});

test("safety-net: not expired and CANCEL_REQUESTED excluded → NONE", () => {
  assert.equal(decideSafetyNet(exec({ status: S.QUEUED, deadlineAt: new Date(NOW.getTime() + 1000) }), NOW, false).kind, "NONE");
  assert.equal(decideSafetyNet(exec({ status: S.CANCEL_REQUESTED, deadlineAt: new Date(NOW.getTime() - 1000), activeAttemptId: "a", workerDeadlineAt: NOW, cancelRequestId: "c", cancelRequestedAt: NOW }), NOW, false).kind, "NONE");
});

test("reaper: heartbeat stale (valid lease) only alerts; expired lease releases to RETRY_PENDING", () => {
  const validLease = exec({ status: S.RUNNING, activeAttemptId: "a", workerDeadlineAt: new Date(NOW.getTime() + 100_000) });
  assert.equal(decideReaper(validLease, NOW, 60_000, 30_000, new Date(NOW.getTime() - 60_000)).kind, "HEARTBEAT_STALE_ALERT");
  const expiredLease = exec({ status: S.RUNNING, activeAttemptId: "a", workerDeadlineAt: new Date(NOW.getTime() - 120_000) });
  assert.equal(decideReaper(expiredLease, NOW, 60_000, 30_000, NOW).kind, "RELEASE_LEASE_RETRY_PENDING");
});

test("finalizer: closes CANCEL_REQUESTED only past worker deadline + margin", () => {
  const before = exec({ status: S.CANCEL_REQUESTED, activeAttemptId: "a", workerDeadlineAt: new Date(NOW.getTime() + 10_000), cancelRequestId: "c", cancelRequestedAt: NOW });
  assert.equal(decideFinalizer(before, NOW, 60_000).kind, "NONE");
  const after = exec({ status: S.CANCEL_REQUESTED, activeAttemptId: "a", workerDeadlineAt: new Date(NOW.getTime() - 120_000), cancelRequestId: "c", cancelRequestedAt: NOW });
  assert.equal(decideFinalizer(after, NOW, 60_000).kind, "FINALIZE_SYSTEM_CANCEL");
});

// ─── routing (3 branches) ──────────────────────────────────────────────────────

test("routeAnalysis: non-analysis-bearing outcomes → EXECUTION_ONLY even if analysisId null", () => {
  for (const outcome of [AutomationExecutionOutcomes.NO_DATA, AutomationExecutionOutcomes.NO_RUNBOOK, AutomationExecutionOutcomes.CONFIGURATION_ERROR, AutomationExecutionOutcomes.EXECUTION_ERROR]) {
    assert.equal(routeAnalysis({ outcome, appliedMode: AutomationModes.APPLY_ALL, alarmEventAnalysisId: null, existingAnalysisOrigin: null }).kind, "EXECUTION_ONLY");
  }
});

test("routeAnalysis: SHADOW and non-applying mode → EXECUTION_ONLY", () => {
  assert.equal(routeAnalysis({ outcome: AutomationExecutionOutcomes.KNOWN_CASE, appliedMode: AutomationModes.SHADOW, alarmEventAnalysisId: null, existingAnalysisOrigin: null }).kind, "EXECUTION_ONLY");
  assert.equal(routeAnalysis({ outcome: AutomationExecutionOutcomes.UNKNOWN_CASE, appliedMode: AutomationModes.APPLY_KNOWN, alarmEventAnalysisId: null, existingAnalysisOrigin: null }).kind, "EXECUTION_ONLY");
});

test("routeAnalysis: 3 branches on analysisId + origin when mode applies", () => {
  assert.equal(routeAnalysis({ outcome: AutomationExecutionOutcomes.KNOWN_CASE, appliedMode: AutomationModes.APPLY_ALL, alarmEventAnalysisId: null, existingAnalysisOrigin: null }).kind, "CREATE_ANALYSIS");
  assert.equal(routeAnalysis({ outcome: AutomationExecutionOutcomes.KNOWN_CASE, appliedMode: AutomationModes.APPLY_KNOWN, alarmEventAnalysisId: "an-1", existingAnalysisOrigin: AnalysisOrigins.AUTOMATIC }).kind, "UPDATE_AUTOMATIC_ANALYSIS");
  assert.equal(routeAnalysis({ outcome: AutomationExecutionOutcomes.UNKNOWN_CASE, appliedMode: AutomationModes.APPLY_ALL, alarmEventAnalysisId: "an-1", existingAnalysisOrigin: AnalysisOrigins.MANUAL }).kind, "HUMAN_ANALYSIS_PAYLOAD_ONLY");
  assert.equal(routeAnalysis({ outcome: AutomationExecutionOutcomes.UNKNOWN_CASE, appliedMode: AutomationModes.APPLY_ALL, alarmEventAnalysisId: "an-1", existingAnalysisOrigin: AnalysisOrigins.HYBRID }).kind, "HUMAN_ANALYSIS_PAYLOAD_ONLY");
});
