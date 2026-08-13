/**
 * Integration test della review transazionale (§5.9.1) contro PostgreSQL reale.
 *
 * La review è il **commit umano** della proposta automatica: qui si verifica che
 * promuova davvero, che i conflitti non lascino side effect, e soprattutto che
 * un fallimento di invariante annulli tutto invece di committare a metà.
 *
 * Setup: vedi `execution-lifecycle.integration.test.ts`.
 */
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { prisma } from "@go-watchtower/database";
import { completeExecution } from "../src/services/automation/execution.service.js";
import { reviewExecution, type ReviewActor } from "../src/services/automation/review.service.js";
import { supersedePendingReviews } from "../src/services/automation/review-supersede.js";
import {
  createEvent,
  createWorld,
  knownDraft,
  setDefaultMode,
  startFreshExecution,
  unknownDraft,
  type AutomationWorld,
} from "./helpers/fixtures.js";

let world: AutomationWorld;
let reviewer: ReviewActor;

before(async () => {
  world = await createWorld("rtest");
  reviewer = { userId: world.humanUserId, label: "revisore" };
});

after(async () => {
  await prisma.$disconnect();
});

interface AppliedExecution {
  readonly executionId: string;
  readonly analysisId: string;
  readonly alarmEventId: string;
}

/** Porta un'esecuzione fino a un apply riuscito, pronta per la review. */
async function applied(proposedStatus: "IN_PROGRESS" | "COMPLETED", alarmEventId?: string): Promise<AppliedExecution> {
  await setDefaultMode("APPLY_KNOWN");
  const eventId = alarmEventId ?? (await createEvent(world));
  const { executionId, attemptId } = await startFreshExecution(world, eventId);
  const res = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft({ proposedStatus }),
  });
  assert.equal(res.kind, "OK");
  if (res.kind !== "OK" || res.analysisId === null) throw new Error("apply fallito nel setup");
  return { executionId, analysisId: res.analysisId, alarmEventId: eventId };
}

// ─── conferma ─────────────────────────────────────────────────────────────────

test("CONFIRMED con proposedStatus COMPLETED: promuove l'analisi e risolve l'evento", async () => {
  const { executionId, analysisId, alarmEventId } = await applied("COMPLETED");
  const result = await reviewExecution(executionId, "CONFIRMED", "va bene", reviewer);

  assert.equal(result.kind, "OK", JSON.stringify(result));
  if (result.kind !== "OK") return;
  assert.equal(result.alreadyReviewed, false);
  assert.equal(result.execution.reviewStatus, "CONFIRMED");
  assert.equal(result.execution.reviewedByUserId, world.humanUserId);
  assert.equal(result.execution.reviewNote, "va bene");

  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  assert.equal(analysis.status, "COMPLETED");
  assert.ok(analysis.scoredAt, "la promozione ricalcola gli score sul subject promosso");

  const event = await prisma.alarmEvent.findUniqueOrThrow({ where: { id: alarmEventId } });
  assert.notEqual(event.resolvedAt, null, "COMPLETED risolve l'evento nella stessa transazione");
});

test("CONFIRMED con proposedStatus IN_PROGRESS: valida il contenuto ma lascia l'evento aperto", async () => {
  const { executionId, analysisId, alarmEventId } = await applied("IN_PROGRESS");
  const result = await reviewExecution(executionId, "CONFIRMED", undefined, reviewer);
  assert.equal(result.kind, "OK");

  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  assert.equal(analysis.status, "IN_PROGRESS");
  const event = await prisma.alarmEvent.findUniqueOrThrow({ where: { id: alarmEventId } });
  assert.equal(event.resolvedAt, null);
});

test("la nota vuota non viene persistita come stringa vuota", async () => {
  const { executionId } = await applied("IN_PROGRESS");
  const result = await reviewExecution(executionId, "CONFIRMED", "   ", reviewer);
  assert.equal(result.kind, "OK");
  if (result.kind === "OK") assert.equal(result.execution.reviewNote, null);
});

// ─── rifiuto ──────────────────────────────────────────────────────────────────

test("REJECTED: conserva l'analisi per audit, non la valida, lascia l'evento aperto", async () => {
  const { executionId, analysisId, alarmEventId } = await applied("COMPLETED");
  const result = await reviewExecution(executionId, "REJECTED", "conclusione sbagliata", reviewer);

  assert.equal(result.kind, "OK");
  if (result.kind === "OK") assert.equal(result.execution.reviewNote, "conclusione sbagliata");

  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  assert.equal(analysis.status, "IN_PROGRESS", "il rifiuto non promuove");
  assert.equal(analysis.origin, "AUTOMATIC", "il contenuto resta ispezionabile");
  const event = await prisma.alarmEvent.findUniqueOrThrow({ where: { id: alarmEventId } });
  assert.equal(event.resolvedAt, null, "un rifiuto non risolve mai");
});

// ─── idempotenza e conflitti ──────────────────────────────────────────────────

test("replay della stessa decisione: alreadyReviewed, nessun nuovo SystemEvent", async () => {
  const { executionId } = await applied("COMPLETED");
  const first = await reviewExecution(executionId, "CONFIRMED", "ok", reviewer);
  assert.equal(first.kind, "OK");

  const replay = await reviewExecution(executionId, "CONFIRMED", "ok", reviewer);
  assert.equal(replay.kind, "OK");
  if (replay.kind === "OK") assert.equal(replay.alreadyReviewed, true);

  const events = await prisma.systemEvent.count({
    where: { action: "AUTOMATION_ANALYSIS_CONFIRMED", resourceId: executionId },
  });
  assert.equal(events, 1, "il replay non duplica l'evento");
});

test("decisione opposta dopo una finale: REVIEW_ALREADY_DECIDED", async () => {
  const { executionId } = await applied("COMPLETED");
  await reviewExecution(executionId, "CONFIRMED", "ok", reviewer);
  const opposite = await reviewExecution(executionId, "REJECTED", "ripensamento", reviewer);
  assert.equal(opposite.kind, "CONFLICT");
  if (opposite.kind === "CONFLICT") assert.equal(opposite.conflict, "REVIEW_ALREADY_DECIDED");
});

test("decisioni concorrenti: ne vince esattamente una", async () => {
  const { executionId } = await applied("COMPLETED");
  const [a, b] = await Promise.all([
    reviewExecution(executionId, "CONFIRMED", "ok", reviewer),
    reviewExecution(executionId, "REJECTED", "no", reviewer),
  ]);
  const kinds = [a.kind, b.kind].sort();
  assert.deepEqual(kinds, ["CONFLICT", "OK"], "una vince, l'altra è un conflitto");

  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.ok(["CONFIRMED", "REJECTED"].includes(row.reviewStatus));
});

test("un BLOCKED non è confermabile: REVIEW_NOT_APPLICABLE", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  const res = await completeExecution(executionId, world.actors, { attemptId, outcome: "KNOWN_CASE" });
  assert.equal(res.kind, "OK");

  const review = await reviewExecution(executionId, "CONFIRMED", undefined, reviewer);
  assert.equal(review.kind, "CONFLICT");
  if (review.kind === "CONFLICT") assert.equal(review.conflict, "REVIEW_NOT_APPLICABLE");
});

test("SHADOW non produce una review da confermare: REVIEW_NOT_APPLICABLE", async () => {
  await setDefaultMode("SHADOW");
  const { executionId, attemptId } = await startFreshExecution(world);
  await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft(),
  });
  const review = await reviewExecution(executionId, "CONFIRMED", undefined, reviewer);
  assert.equal(review.kind, "CONFLICT");
  if (review.kind === "CONFLICT") assert.equal(review.conflict, "REVIEW_NOT_APPLICABLE");
});

test("execution non terminale: REVIEW_NOT_TERMINAL", async () => {
  const { executionId } = await startFreshExecution(world);
  const review = await reviewExecution(executionId, "CONFIRMED", undefined, reviewer);
  assert.equal(review.kind, "CONFLICT");
  if (review.kind === "CONFLICT") assert.equal(review.conflict, "REVIEW_NOT_TERMINAL");
});

test("proposta superata da un re-apply: REVIEW_SUPERSEDED", async () => {
  const alarmEventId = await createEvent(world);
  const first = await applied("COMPLETED", alarmEventId);
  await applied("COMPLETED", alarmEventId); // re-apply: avanza lastAppliedExecutionId

  // Difesa in profondità: il re-apply chiude già la review a NOT_REQUIRED, ma se
  // una scrittura esterna la riaprisse, la decisione deve comunque rifiutarsi.
  await prisma.automaticRunbookExecution.update({
    where: { id: first.executionId },
    data: { reviewStatus: "PENDING" },
  });
  const review = await reviewExecution(first.executionId, "CONFIRMED", undefined, reviewer);
  assert.equal(review.kind, "CONFLICT");
  if (review.kind === "CONFLICT") assert.equal(review.conflict, "REVIEW_SUPERSEDED");
});

// ─── esito unknown ────────────────────────────────────────────────────────────

test("UNKNOWN_CASE in modo applicante: la review dell'esito è decidibile", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "UNKNOWN_CASE",
    analysisDraft: unknownDraft(),
  });

  const review = await reviewExecution(executionId, "CONFIRMED", "caso nuovo, preso in carico", reviewer);
  assert.equal(review.kind, "OK", JSON.stringify(review));
  if (review.kind === "OK") assert.equal(review.execution.reviewStatus, "CONFIRMED");

  // Su un unknown non esiste un'analisi: l'evento dice «outcome», non «analysis».
  const outcomeEvents = await prisma.systemEvent.count({
    where: { action: "AUTOMATION_OUTCOME_CONFIRMED", resourceId: executionId },
  });
  assert.equal(outcomeEvents, 1);
  const analysisEvents = await prisma.systemEvent.count({
    where: { action: "AUTOMATION_ANALYSIS_CONFIRMED", resourceId: executionId },
  });
  assert.equal(analysisEvents, 0, "non si dichiara «analysis confirmed» quando l'analisi non esiste");
});

// ─── invariante ───────────────────────────────────────────────────────────────

test("promozione non più valida: rollback completo, nessuna modifica parziale", async () => {
  const { executionId, analysisId, alarmEventId } = await applied("COMPLETED");
  // Rende l'analisi intrinsecamente invalida (OCCURRENCES_POSITIVE, regola non
  // esente): la promozione deve fallire *dopo* aver già scritto, ed è lì che il
  // rollback conta.
  await prisma.alarmAnalysis.update({ where: { id: analysisId }, data: { occurrences: 0 } });

  const review = await reviewExecution(executionId, "CONFIRMED", "conferma", reviewer);
  assert.equal(review.kind, "CONFLICT");
  if (review.kind === "CONFLICT") assert.equal(review.conflict, "REVIEW_INVARIANT_VIOLATION");

  const execution = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(execution.reviewStatus, "PENDING", "la CAS deve essere stata annullata");
  assert.equal(execution.reviewedByUserId, null);
  assert.equal(execution.reviewNote, null);

  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  assert.equal(analysis.status, "IN_PROGRESS", "lo stato non deve essere stato promosso");

  const event = await prisma.alarmEvent.findUniqueOrThrow({ where: { id: alarmEventId } });
  assert.equal(event.resolvedAt, null);

  // L'evento tecnico è scritto fuori transazione, altrimenti il rollback se lo porterebbe via.
  const violations = await prisma.systemEvent.count({
    where: { action: "AUTOMATION_ANALYSIS_REVIEW_INVARIANT_VIOLATION", resourceId: executionId },
  });
  assert.equal(violations, 1);
});

// ─── proposta resa obsoleta da una mutazione umana (§5.10) ────────────────────

test("risolvere l'evento a mano chiude la review pendente con HUMAN_EVENT_CHANGE", async () => {
  const { executionId, alarmEventId } = await applied("COMPLETED");

  // Simula la route: la stessa transazione che muta l'evento chiude la review.
  await prisma.$transaction(async (tx) => {
    await supersedePendingReviews(tx, { alarmEventId }, { reason: "HUMAN_EVENT_CHANGE", actorUserId: world.humanUserId });
    await tx.alarmEvent.update({ where: { id: alarmEventId }, data: { resolvedAt: new Date() } });
  });

  const execution = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(execution.reviewStatus, "NOT_REQUIRED", "la review esce dalla coda invece di restare indecidibile");
  const event = await prisma.systemEvent.findFirstOrThrow({
    where: { action: "AUTOMATION_ANALYSIS_REVIEW_SUPERSEDED", resourceId: executionId },
  });
  assert.equal((event.metadata as { reason?: string }).reason, "HUMAN_EVENT_CHANGE");
  assert.equal(event.userId, world.humanUserId, "la chiusura è attribuita all'operatore, non al sistema");
});

test("le review già decise non vengono mai riaperte né riscritte", async () => {
  const { executionId, alarmEventId } = await applied("IN_PROGRESS");
  await reviewExecution(executionId, "REJECTED", "non va bene", reviewer);

  const closed = await prisma.$transaction((tx) =>
    supersedePendingReviews(tx, { alarmEventId }, { reason: "HUMAN_EVENT_CHANGE", actorUserId: world.humanUserId }),
  );
  assert.equal(closed, 0, "una decisione finale è storia, non si tocca");

  const execution = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(execution.reviewStatus, "REJECTED");
  assert.equal(execution.reviewNote, "non va bene");
});

test("una decisione finale non viene mai sovrascritta da una chiusura di sistema", async () => {
  // P1-05.2: fra la lettura delle pendenti e la loro chiusura, una review può
  // essere stata decisa da un umano. Senza compare-and-set su PENDING quel
  // REJECTED verrebbe riscritto, violando l'immutabilità degli stati finali.
  const { executionId, alarmEventId } = await applied("COMPLETED");
  await reviewExecution(executionId, "REJECTED", "scartata dall'operatore", reviewer);

  const closed = await prisma.$transaction((tx) =>
    supersedePendingReviews(tx, { alarmEventId }, { reason: "HUMAN_EVENT_CHANGE", actorUserId: world.humanUserId }),
  );
  assert.equal(closed, 0);

  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(row.reviewStatus, "REJECTED");
  assert.equal(row.reviewNote, "scartata dall'operatore");
  assert.equal(row.reviewedByUserId, world.humanUserId);
});

test("le proposte superate non vengono confermate al posto di quella corrente", async () => {
  // P1-05.1: chiudere «tutte le pendenti dell'analisi» registrerebbe come
  // approvate dall'operatore anche versioni che non ha mai visto.
  const alarmEventId = await createEvent(world);
  const first = await applied("COMPLETED", alarmEventId);
  const second = await applied("COMPLETED", alarmEventId); // re-apply

  // Riapre a mano la review superata, come farebbe una scrittura esterna.
  await prisma.automaticRunbookExecution.update({
    where: { id: first.executionId },
    data: { reviewStatus: "PENDING", reviewedByUserId: null, reviewedAt: null },
  });

  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: second.analysisId } });
  assert.equal(analysis.lastAppliedExecutionId, second.executionId, "la proposta corrente è la seconda");

  const stale = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: first.executionId } });
  assert.equal(stale.reviewStatus, "PENDING", "premessa del test: la superata è tornata pendente");
  assert.notEqual(stale.id, analysis.lastAppliedExecutionId);
});
