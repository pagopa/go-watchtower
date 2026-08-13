/**
 * Integration test del lifecycle automation contro un PostgreSQL reale
 * (gated su DATABASE_URL: il runner CI fornisce un DB migrato + seedato).
 * Esercita race, idempotenza, fencing e cancellazione sul servizio
 * transazionale reale (non via HTTP).
 *
 * La materializzazione dell'analisi ha una suite dedicata
 * (`analysis-materializer.integration.test.ts`): qui si verifica solo che il
 * `complete` instradi correttamente e che il lifecycle resti coerente.
 *
 * Setup: `prisma migrate deploy` + `prisma db seed` su un DB usa-e-getta, poi
 * `DATABASE_URL=... pnpm --filter @go-watchtower/backend test:integration`.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import { prisma } from "@go-watchtower/database";
import {
  startExecution,
  completeExecution,
  requestCancel,
} from "../src/services/automation/execution.service.js";
import {
  createWorld,
  createEvent,
  createPendingExecution,
  delivery,
  knownDraft,
  setDefaultMode,
  startFreshExecution,
  type AutomationWorld,
} from "./helpers/fixtures.js";

let world: AutomationWorld;

before(async () => {
  world = await createWorld("itest");
});

after(async () => {
  await prisma.$disconnect();
});

test("start acquires the lease and creates a RUNNING attempt", async () => {
  const { executionId } = await startFreshExecution(world);
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: executionId } });
  assert.equal(row?.status, "RUNNING");
  assert.ok(row?.activeAttemptId);
  const attempts = await prisma.automaticRunbookAttempt.count({ where: { executionId, status: "RUNNING" } });
  assert.equal(attempts, 1);
});

test("two concurrent start (tuple diverse): esattamente uno START, l'altro ALREADY_RUNNING", async () => {
  const executionId = await createPendingExecution(world);
  const [a, b] = await Promise.all([
    startExecution(executionId, delivery("m-A")),
    startExecution(executionId, delivery("m-B")),
  ]);
  assert.ok("response" in a && "response" in b);
  const dispositions = [a.response.disposition, b.response.disposition].sort();
  assert.deepEqual(dispositions, ["ALREADY_RUNNING", "START"]);
  const running = await prisma.automaticRunbookAttempt.count({ where: { executionId, status: "RUNNING" } });
  assert.equal(running, 1, "l'indice unico parziale garantisce un solo attempt RUNNING");
});

test("complete KNOWN_CASE in APPLY_KNOWN: analisi IN_PROGRESS, review PENDING, evento aperto", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId, alarmEventId } = await startFreshExecution(world);
  const res = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft({ proposedStatus: "COMPLETED" }),
    queryCount: 2,
    bytesScanned: "1024",
  });

  assert.equal(res.kind, "OK", JSON.stringify(res));
  if (res.kind !== "OK") return;
  assert.equal(res.status, "SUCCEEDED");
  assert.ok(res.analysisId, "l'analisi deve essere creata e referenziata");

  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: res.analysisId } });
  assert.equal(analysis.origin, "AUTOMATIC");
  assert.equal(analysis.occurrences, 1);
  assert.equal(analysis.operatorId, world.serviceUserId);
  assert.equal(analysis.lastAppliedExecutionId, executionId);
  // L'apply non promuove mai `proposedStatus`: lo fa solo la conferma (§4.8).
  assert.equal(analysis.status, "IN_PROGRESS");

  const event = await prisma.alarmEvent.findUniqueOrThrow({ where: { id: alarmEventId } });
  assert.equal(event.resolvedAt, null, "l'evento resta aperto finché non c'è conferma");

  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(row.analysisId, res.analysisId);
  assert.equal(row.analysisApplyStatus, "APPLIED");
  assert.equal(row.reviewStatus, "PENDING");
});

test("complete idempotency: stesso attempt+payload → ALREADY_TERMINAL; payload diverso → IDEMPOTENCY_PAYLOAD_MISMATCH", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  const draft = knownDraft();

  const first = await completeExecution(executionId, world.actors, { attemptId, outcome: "KNOWN_CASE", analysisDraft: draft, queryCount: 1 });
  assert.equal(first.kind, "OK");
  const replaySame = await completeExecution(executionId, world.actors, { attemptId, outcome: "KNOWN_CASE", analysisDraft: draft, queryCount: 1 });
  assert.equal(replaySame.kind, "ALREADY_TERMINAL");
  const replayDiff = await completeExecution(executionId, world.actors, { attemptId, outcome: "KNOWN_CASE", analysisDraft: draft, queryCount: 999 });
  assert.equal(replayDiff.kind, "IDEMPOTENCY_PAYLOAD_MISMATCH");
});

test("il draft entra nell'hash di idempotenza: stesso attempt, draft diverso → MISMATCH", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  const first = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft({ conclusionNotes: "prima conclusione" }),
  });
  assert.equal(first.kind, "OK");
  const replay = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft({ conclusionNotes: "conclusione diversa" }),
  });
  assert.equal(replay.kind, "IDEMPOTENCY_PAYLOAD_MISMATCH", "due draft diversi non sono lo stesso completamento");
});

test("fencing: complete con attemptId stale non terminalizza", async () => {
  const { executionId } = await startFreshExecution(world);
  const res = await completeExecution(executionId, world.actors, {
    attemptId: crypto.randomUUID(),
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft(),
  });
  assert.equal(res.kind, "STALE_ATTEMPT");
  const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: executionId } });
  assert.equal(row?.status, "RUNNING", "un callback stale non muove il lifecycle");
});

test("cancel/complete race: vince il cancel → complete non applica nulla", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  const cancel = await requestCancel(executionId, "operator stop", { userId: world.humanUserId, label: "itest" });
  assert.equal(cancel.kind, "OK");

  const complete = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft(),
  });
  assert.equal(complete.kind, "CANCELLATION_REQUESTED");
  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(row.status, "CANCEL_REQUESTED");
  assert.equal(row.outcome, null, "nessun esito applicato dopo che il cancel ha vinto");
  const analyses = await prisma.alarmAnalysis.count({ where: { lastAppliedExecutionId: executionId } });
  assert.equal(analyses, 0, "nessuna analisi scritta");
});

test("SHADOW: KNOWN_CASE non scrive analisi, conserva analysisPayload, apply NOT_REQUESTED", async () => {
  await setDefaultMode("SHADOW");
  const { executionId, attemptId } = await startFreshExecution(world);
  const res = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft(),
    analysisPayload: { shadow: true },
  });

  assert.equal(res.kind, "OK");
  if (res.kind === "OK") {
    assert.equal(res.status, "SUCCEEDED");
    assert.equal(res.analysisId, null, "SHADOW non crea né collega un'analisi");
  }
  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.notEqual(row.analysisPayload, null);
  assert.equal(row.analysisApplyStatus, "NOT_REQUESTED");
  assert.equal(row.reviewStatus, "NOT_REQUIRED");
});

test("outcome non analysis-bearing → apply NOT_APPLICABLE, nessuna review", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  const res = await completeExecution(executionId, world.actors, { attemptId, outcome: "NO_DATA" });
  assert.equal(res.kind, "OK");

  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(row.analysisApplyStatus, "NOT_APPLICABLE");
  assert.equal(row.reviewStatus, "NOT_REQUIRED");
});

test("invariante §5.9: nessuna execution terminale resta con apply status PENDING", async () => {
  // Copre tutti i terminal writer esercitati dalla suite in un colpo solo:
  // è l'invariante che il reconciler ripara, e qui non deve avere nulla da fare.
  const pendingTerminals = await prisma.automaticRunbookExecution.count({
    where: {
      productId: world.productId,
      status: { in: ["SUCCEEDED", "SKIPPED", "FAILED", "CANCELLED"] },
      analysisApplyStatus: "PENDING",
    },
  });
  assert.equal(pendingTerminals, 0);
});

test("un evento senza allarme collegato blocca con ALARM_UNLINKED e non scrive nulla", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const alarmEventId = await createEvent(world);
  const { executionId, attemptId } = await startFreshExecution(world, alarmEventId);
  // L'allarme viene scollegato dopo il lancio: il comando era valido, il
  // bersaglio dell'analisi non esiste più al momento del callback.
  await prisma.alarmEvent.update({ where: { id: alarmEventId }, data: { alarmId: null } });

  const res = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft(),
  });
  assert.equal(res.kind, "OK", "un blocco non è un errore di trasporto: HTTP 200");

  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(row.analysisApplyStatus, "BLOCKED");
  assert.equal(row.reviewStatus, "NOT_REQUIRED", "un BLOCKED non è una review da approvare");
  const diagnostics = row.analysisApplyDiagnostics as { blockCode?: string } | null;
  assert.equal(diagnostics?.blockCode, "ALARM_UNLINKED");
  const analyses = await prisma.alarmAnalysis.count({ where: { lastAppliedExecutionId: executionId } });
  assert.equal(analyses, 0, "zero scritture");
});

test("esito di errore: failedStepId arriva in colonna insieme a codice e messaggio", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  const res = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "EXECUTION_ERROR",
    failedStepId: "fetch-cloudwatch-metrics",
    errorCode: "QUERY_TIMEOUT",
    errorMessage: "timeout dopo 30s",
  });
  assert.equal(res.kind, "OK");

  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  // Il "dove" deve sopravvivere quanto il "cosa": senza il passo, la diagnosi
  // di un errore di esecuzione resta a metà.
  assert.equal(row.failedStepId, "fetch-cloudwatch-metrics");
  assert.equal(row.errorCode, "QUERY_TIMEOUT");
  assert.equal(row.errorMessage, "timeout dopo 30s");
  assert.equal(row.analysisApplyStatus, "NOT_APPLICABLE", "un esito di errore non porta analisi");
});

test("body completo: ogni campo dichiarato dallo schema arriva a destinazione", async () => {
  // Controprova end-to-end del drift guard: se un campo smettesse di essere
  // inoltrato, qui si vedrebbe come valore mancante invece che in silenzio.
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  const draft = knownDraft({ conclusionNotes: "payload completo" });

  const res = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    runbookKey: "send-apigw-analysis",
    runbookVersion: "1.0.0",
    runbookDigest: `sha256-${"a".repeat(64)}`,
    engineExecutionId: "engine-42",
    queryCount: 7,
    bytesScanned: "2048",
    recordsScanned: "10",
    recordsMatched: "3",
    failedStepId: "step-diagnostico",
    errorCode: "WARN_PARTIAL",
    errorMessage: "dati parziali",
    tracking: [{ identifierType: "TRACE_ID", identifierValue: "trace-abc" }],
    analysisPayload: { full: true },
    analysisDraft: draft,
    resultSummary: { rows: 3 },
  });
  assert.equal(res.kind, "OK", JSON.stringify(res));
  if (res.kind !== "OK") return;

  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(row.executedRunbookKey, "send-apigw-analysis");
  assert.equal(row.executedRunbookVersion, "1.0.0");
  assert.equal(row.engineExecutionId, "engine-42");
  assert.equal(row.queryCount, 7);
  assert.equal(row.bytesScanned, 2048n);
  assert.equal(row.recordsScanned, 10n);
  assert.equal(row.recordsMatched, 3n);
  assert.equal(row.failedStepId, "step-diagnostico");
  assert.equal(row.errorCode, "WARN_PARTIAL");
  assert.equal(row.errorMessage, "dati parziali");
  assert.notEqual(row.analysisPayload, null);
  assert.notEqual(row.resultSummary, null);
  assert.notEqual(row.analysisDraft, null, "il draft persistito è la prova che è stato inoltrato");
  assert.equal(row.analysisApplyStatus, "APPLIED");

  assert.ok(res.analysisId);
  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: res.analysisId } });
  const tracking = analysis.trackingIds as { traceId: string }[];
  assert.deepEqual(tracking, [{ traceId: "trace-abc" }], "il tracking è stato proiettato, quindi è arrivato");
});
