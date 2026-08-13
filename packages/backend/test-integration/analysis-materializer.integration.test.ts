/**
 * Integration test della materializzazione fail-closed (§5.6) contro un
 * PostgreSQL reale. Verifica i codici di blocco e la loro **precedenza**, la
 * valutazione senza scritture per kind, l'apply e la sostituzione atomica.
 *
 * L'invariante che tiene tutto insieme: un blocco non scrive **niente**, e non
 * è mai un errore di trasporto — l'esecuzione resta `SUCCEEDED` e la risposta
 * 200, così il worker non ritenta un problema di configurazione.
 *
 * Setup: vedi `execution-lifecycle.integration.test.ts`.
 */
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { prisma } from "@go-watchtower/database";
import { completeExecution } from "../src/services/automation/execution.service.js";
import { buildShadowReport } from "../src/services/automation/shadow-report.service.js";
import {
  createDownstream,
  createEvent,
  createFinalAction,
  createIgnoreReason,
  createResource,
  createWorld,
  knownDraft,
  setDefaultMode,
  startFreshExecution,
  suffix,
  unknownDraft,
  type AutomationWorld,
} from "./helpers/fixtures.js";

let world: AutomationWorld;

before(async () => {
  world = await createWorld("mtest");
});

after(async () => {
  await prisma.$disconnect();
});

interface Materialized {
  readonly applyStatus: string;
  readonly reviewStatus: string;
  readonly analysisId: string | null;
  readonly diagnostics: {
    blockCode?: string;
    evaluatedOnly?: boolean;
    wouldApplyStatus?: string;
    contextValidationStatus?: string;
    unresolvedReferences?: Record<string, unknown>;
    warnings?: { ruleId: string; message: string }[];
    draftDigest?: { sha256: string; byteLength: number };
  } | null;
}

/** Completa un KNOWN_CASE e restituisce l'esito di materializzazione persistito. */
async function complete(draft: unknown, alarmEventId?: string, outcome = "KNOWN_CASE"): Promise<Materialized> {
  const { executionId, attemptId } = await startFreshExecution(world, alarmEventId);
  const res = await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: outcome as "KNOWN_CASE",
    ...(draft === undefined ? {} : { analysisDraft: draft }),
  });
  assert.equal(res.kind, "OK", `complete: ${JSON.stringify(res)}`);
  const row = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: executionId } });
  assert.equal(row.status, "SUCCEEDED", "un blocco non è un fallimento di esecuzione");
  return {
    applyStatus: row.analysisApplyStatus,
    reviewStatus: row.reviewStatus,
    analysisId: row.analysisId,
    diagnostics: row.analysisApplyDiagnostics as Materialized["diagnostics"],
  };
}

async function analysesFor(alarmEventId: string): Promise<number> {
  const event = await prisma.alarmEvent.findUniqueOrThrow({ where: { id: alarmEventId } });
  return event.analysisId === null ? 0 : 1;
}

// ─── codici di blocco ─────────────────────────────────────────────────────────

test("MISSING_DRAFT: KNOWN_CASE senza draft non materializza", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const result = await complete(undefined);
  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "MISSING_DRAFT");
  assert.equal(result.reviewStatus, "NOT_REQUIRED", "un BLOCKED non è una review");
  assert.equal(result.analysisId, null);
});

test("INVALID_DRAFT: draft che non rispetta lo schema semantico", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const result = await complete({ schemaVersion: 1, kind: "KNOWN_CASE", conclusionNotes: "x" });
  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "INVALID_DRAFT");
});

test("INVALID_DRAFT: kind sbagliato per l'outcome dichiarato", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const result = await complete(unknownDraft());
  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "INVALID_DRAFT");
});

test("DRAFT_TOO_LARGE: oltre budget si conserva solo il digest, mai il payload", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const oversized = knownDraft({ conclusionNotes: "x".repeat(4000), errorDetails: "y".repeat(4000) });
  // 64 KiB di riferimenti: il budget è sul serializzato raw.
  const draft = { ...oversized, downstreams: Array.from({ length: 64 }, () => "d".repeat(255)) };
  const result = await complete({ ...draft, links: Array.from({ length: 64 }, (_, i) => ({ url: `https://example.test/${"p".repeat(900)}/${i}` })) });

  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "DRAFT_TOO_LARGE");
  assert.ok(result.diagnostics?.draftDigest, "il digest sostituisce il draft fuori budget");
  assert.ok(result.diagnostics.draftDigest.byteLength > 64 * 1024);
});

test("UNRESOLVED_REFERENCES: riferimenti dichiarati e non censiti, elencati per categoria", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const result = await complete(
    knownDraft({ downstreams: ["downstream-inesistente"], finalActions: ["Azione inesistente"] }),
  );
  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "UNRESOLVED_REFERENCES");
  assert.deepEqual(result.diagnostics?.unresolvedReferences, {
    downstreams: ["downstream-inesistente"],
    finalActions: ["Azione inesistente"],
  });
});

test("UNRESOLVED_REFERENCES: ignore reason inesistente", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const result = await complete(
    knownDraft({ analysisType: "IGNORABLE", ignoreReasonCode: `assente-${suffix()}` }),
  );
  assert.equal(result.diagnostics?.blockCode, "UNRESOLVED_REFERENCES");
  assert.ok(result.diagnostics?.unresolvedReferences?.["ignoreReasonCode"]);
});

test("RESOURCE_TYPE_MISMATCH: il tipo dichiarato non coincide con il censimento", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const name = `res-${suffix()}`;
  await createResource(world, name, "LAMBDA");
  const result = await complete(knownDraft({ resources: [{ name, type: "DYNAMODB" }] }));
  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "RESOURCE_TYPE_MISMATCH");
});

test("il tipo omesso è sempre legittimo: stessa risorsa senza `type` applica", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const name = `res-${suffix()}`;
  await createResource(world, name, "LAMBDA");
  const result = await complete(knownDraft({ resources: [{ name }] }));
  assert.equal(result.applyStatus, "APPLIED");
});

test("INVALID_IGNORE_DETAILS: dettagli non conformi al detailsSchema della reason", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const code = `reason-${suffix()}`;
  await createIgnoreReason(code, {
    type: "object",
    properties: { ticket: { type: "string" } },
    required: ["ticket"],
    additionalProperties: false,
  });
  const result = await complete(
    knownDraft({ analysisType: "IGNORABLE", ignoreReasonCode: code, ignoreDetails: { ticket: 42 } }),
  );
  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "INVALID_IGNORE_DETAILS");
});

test("VALIDATION_ERRORS: IGNORABLE senza ignoreReasonCode", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const result = await complete(knownDraft({ analysisType: "IGNORABLE" }));
  assert.equal(result.applyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "VALIDATION_ERRORS");
});

// ─── precedenza (§5.6) ────────────────────────────────────────────────────────

test("precedenza: DRAFT_TOO_LARGE vince su INVALID_DRAFT", async () => {
  await setDefaultMode("APPLY_KNOWN");
  // Draft strutturalmente invalido *e* fuori budget: il budget è il passo 3,
  // la validazione semantica il passo 4.
  const result = await complete({ kind: "NONSENSE", blob: "z".repeat(70 * 1024) });
  assert.equal(result.diagnostics?.blockCode, "DRAFT_TOO_LARGE");
});

test("precedenza: UNRESOLVED_REFERENCES vince su RESOURCE_TYPE_MISMATCH", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const name = `res-${suffix()}`;
  await createResource(world, name, "LAMBDA");
  const result = await complete(
    knownDraft({ resources: [{ name, type: "DYNAMODB" }], downstreams: ["assente"] }),
  );
  assert.equal(result.diagnostics?.blockCode, "UNRESOLVED_REFERENCES");
});

// ─── valutazione senza scritture, per kind ────────────────────────────────────

test("SHADOW + KNOWN_CASE valido: NOT_REQUESTED con wouldApplyStatus APPLIED", async () => {
  await setDefaultMode("SHADOW");
  const result = await complete(knownDraft());
  assert.equal(result.applyStatus, "NOT_REQUESTED");
  assert.equal(result.reviewStatus, "NOT_REQUIRED");
  assert.equal(result.diagnostics?.evaluatedOnly, true);
  assert.equal(result.diagnostics?.wouldApplyStatus, "APPLIED");
});

test("SHADOW + KNOWN_CASE senza draft: wouldApplyStatus BLOCKED con il codice", async () => {
  await setDefaultMode("SHADOW");
  const result = await complete(undefined);
  assert.equal(result.applyStatus, "NOT_REQUESTED");
  assert.equal(result.diagnostics?.wouldApplyStatus, "BLOCKED");
  assert.equal(result.diagnostics?.blockCode, "MISSING_DRAFT");
});

test("UNKNOWN_CASE non ha un would-apply: solo contextValidationStatus", async () => {
  await setDefaultMode("SHADOW");
  const result = await complete(unknownDraft(), undefined, "UNKNOWN_CASE");
  assert.equal(result.applyStatus, "NOT_REQUESTED");
  assert.equal(result.diagnostics?.contextValidationStatus, "VALID");
  assert.equal(result.diagnostics?.wouldApplyStatus, undefined, "un unknown non è «applicabile»");
  assert.equal(result.reviewStatus, "NOT_REQUIRED", "in shadow non c'è nulla da verificare");
});

test("UNKNOWN_CASE in modo applicante: review PENDING dell'esito, zero scritture", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const alarmEventId = await createEvent(world);
  const result = await complete(unknownDraft(), alarmEventId, "UNKNOWN_CASE");
  assert.equal(result.applyStatus, "NOT_REQUESTED", "un unknown non materializza mai in v1");
  assert.equal(result.reviewStatus, "PENDING", "in modo applicante l'esito va verificato (§4.8)");
  assert.equal(await analysesFor(alarmEventId), 0);
});

test("UNKNOWN_CASE con contesto malformato: INVALID, comunque nessuna materializzazione", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const result = await complete({ schemaVersion: 1, kind: "UNKNOWN_CASE_CONTEXT", resources: "no" }, undefined, "UNKNOWN_CASE");
  assert.equal(result.diagnostics?.contextValidationStatus, "INVALID");
  assert.equal(result.applyStatus, "NOT_REQUESTED");
});

// ─── apply ────────────────────────────────────────────────────────────────────

test("apply completo: riferimenti censiti collegati, stato IN_PROGRESS, evento aperto", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const resourceName = `res-${suffix()}`;
  const downstreamName = `down-${suffix()}`;
  const finalActionName = `act-${suffix()}`;
  await createResource(world, resourceName, "LAMBDA");
  await createDownstream(world, downstreamName);
  await createFinalAction(world, finalActionName);

  const alarmEventId = await createEvent(world);
  const result = await complete(
    knownDraft({
      resources: [{ name: resourceName, type: "LAMBDA" }],
      downstreams: [downstreamName],
      finalActions: [finalActionName],
      links: [{ url: "https://example.test/runbook" }],
    }),
    alarmEventId,
  );

  assert.equal(result.applyStatus, "APPLIED");
  assert.equal(result.reviewStatus, "PENDING");
  assert.ok(result.analysisId);
  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({
    where: { id: result.analysisId },
    include: { resources: true, downstreams: true, finalActions: true },
  });
  assert.equal(analysis.status, "IN_PROGRESS");
  assert.equal(analysis.resources.length, 1);
  assert.equal(analysis.downstreams.length, 1);
  assert.equal(analysis.finalActions.length, 1);
});

test("ramo umano: un'analisi MANUAL collegata non viene mai sovrascritta", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const alarmEventId = await createEvent(world);
  const manual = await prisma.alarmAnalysis.create({
    data: {
      analysisDate: new Date(),
      firstAlarmAt: new Date("2026-06-22T10:00:00.000Z"),
      lastAlarmAt: new Date("2026-06-22T10:00:00.000Z"),
      occurrences: 1,
      isOnCall: false,
      analysisType: "ANALYZABLE",
      conclusionNotes: "analisi umana",
      origin: "MANUAL",
      status: "IN_PROGRESS",
      alarmId: world.alarmId,
      productId: world.productId,
      environmentId: world.environmentId,
      operatorId: world.humanUserId,
      createdById: world.humanUserId,
    },
  });
  await prisma.alarmEvent.update({ where: { id: alarmEventId }, data: { analysisId: manual.id } });

  const result = await complete(knownDraft({ conclusionNotes: "sovrascrittura automatica" }), alarmEventId);
  assert.equal(result.applyStatus, "PRESERVED_HUMAN");
  assert.equal(result.reviewStatus, "NOT_REQUIRED");
  const after = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: manual.id } });
  assert.equal(after.conclusionNotes, "analisi umana", "il contenuto umano resta intatto");
  assert.equal(after.origin, "MANUAL");
});

test("re-apply: sostituzione atomica, occurrences invariato, lastApplied avanza", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const alarmEventId = await createEvent(world);

  const first = await complete(knownDraft({ conclusionNotes: "prima" }), alarmEventId);
  assert.equal(first.applyStatus, "APPLIED");
  const analysisId = first.analysisId;
  assert.ok(analysisId);

  const second = await complete(knownDraft({ conclusionNotes: "seconda" }), alarmEventId);
  assert.equal(second.applyStatus, "APPLIED");
  assert.equal(second.analysisId, analysisId, "stessa analisi aggiornata in place");

  const analysis = await prisma.alarmAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  assert.equal(analysis.conclusionNotes, "seconda");
  assert.equal(analysis.occurrences, 1, "l'analisi automatica resta 1:1 con l'evento");
  assert.equal(analysis.status, "IN_PROGRESS", "il re-apply riporta sempre a IN_PROGRESS");
  assert.equal(analysis.updatedById, world.serviceUserId);
});

test("re-apply: la review precedente diventa NOT_REQUIRED con AUTOMATION_ANALYSIS_REVIEW_SUPERSEDED", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const alarmEventId = await createEvent(world);

  const first = await complete(knownDraft({ conclusionNotes: "v1" }), alarmEventId);
  const firstExecution = await prisma.automaticRunbookExecution.findFirstOrThrow({
    where: { alarmEventId, reviewStatus: "PENDING" },
  });
  assert.equal(first.reviewStatus, "PENDING");

  await complete(knownDraft({ conclusionNotes: "v2" }), alarmEventId);

  const superseded = await prisma.automaticRunbookExecution.findUniqueOrThrow({ where: { id: firstExecution.id } });
  assert.equal(superseded.reviewStatus, "NOT_REQUIRED", "la proposta superata esce dalla coda review");
  const events = await prisma.systemEvent.count({
    where: { action: "AUTOMATION_ANALYSIS_REVIEW_SUPERSEDED", resourceId: firstExecution.id },
  });
  assert.equal(events, 1, "la chiusura di sistema lascia traccia");
});

// ─── SystemEvent di apply (§5.10) ─────────────────────────────────────────────

test("BLOCKED emette AUTOMATION_ANALYSIS_BLOCKED con il codice, per la coda remediation", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const { executionId, attemptId } = await startFreshExecution(world);
  await completeExecution(executionId, world.actors, { attemptId, outcome: "KNOWN_CASE" });

  const event = await prisma.systemEvent.findFirstOrThrow({
    where: { action: "AUTOMATION_ANALYSIS_BLOCKED", resourceId: executionId },
  });
  assert.equal((event.metadata as { blockCode?: string }).blockCode, "MISSING_DRAFT");
});

test("PRESERVED_HUMAN emette il proprio evento: l'automazione si è fermata, non ha fallito", async () => {
  await setDefaultMode("APPLY_KNOWN");
  const alarmEventId = await createEvent(world);
  const manual = await prisma.alarmAnalysis.create({
    data: {
      analysisDate: new Date(),
      firstAlarmAt: new Date("2026-06-22T10:00:00.000Z"),
      lastAlarmAt: new Date("2026-06-22T10:00:00.000Z"),
      occurrences: 1,
      isOnCall: false,
      analysisType: "ANALYZABLE",
      conclusionNotes: "umana",
      origin: "MANUAL",
      status: "IN_PROGRESS",
      alarmId: world.alarmId,
      productId: world.productId,
      environmentId: world.environmentId,
      operatorId: world.humanUserId,
      createdById: world.humanUserId,
    },
  });
  await prisma.alarmEvent.update({ where: { id: alarmEventId }, data: { analysisId: manual.id } });

  const { executionId, attemptId } = await startFreshExecution(world, alarmEventId);
  await completeExecution(executionId, world.actors, {
    attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft(),
  });
  const events = await prisma.systemEvent.count({
    where: { action: "AUTOMATION_ANALYSIS_PRESERVED_HUMAN", resourceId: executionId },
  });
  assert.equal(events, 1);
});

test("la risposta del complete espone l'esito di apply: il worker distingue APPLIED da BLOCKED", async () => {
  await setDefaultMode("APPLY_KNOWN");

  const ok = await startFreshExecution(world);
  const okResult = await completeExecution(ok.executionId, world.actors, {
    attemptId: ok.attemptId,
    outcome: "KNOWN_CASE",
    analysisDraft: knownDraft(),
  });
  assert.equal(okResult.kind, "OK");
  if (okResult.kind === "OK") {
    assert.equal(okResult.analysisApplyStatus, "APPLIED");
    assert.equal(okResult.analysisApplyBlockCode, undefined);
  }

  const blocked = await startFreshExecution(world);
  const blockedResult = await completeExecution(blocked.executionId, world.actors, {
    attemptId: blocked.attemptId,
    outcome: "KNOWN_CASE",
  });
  assert.equal(blockedResult.kind, "OK");
  if (blockedResult.kind === "OK") {
    assert.equal(blockedResult.analysisApplyStatus, "BLOCKED");
    assert.equal(blockedResult.analysisApplyBlockCode, "MISSING_DRAFT", "la causa arriva al worker");
  }
});

test("le statistiche espongono le dimensioni di §4.8.5: apply, review, blocchi per causa", async () => {
  await setDefaultMode("APPLY_KNOWN");
  await complete(undefined); // BLOCKED / MISSING_DRAFT
  await complete(knownDraft()); // APPLIED / review PENDING

  const [byApply, byReview, blocked] = await Promise.all([
    prisma.automaticRunbookExecution.groupBy({ by: ["analysisApplyStatus"], _count: true }),
    prisma.automaticRunbookExecution.groupBy({ by: ["reviewStatus"], _count: true }),
    prisma.automaticRunbookExecution.findMany({
      where: { analysisApplyStatus: "BLOCKED" },
      select: { analysisApplyDiagnostics: true },
    }),
  ]);
  const applied = byApply.find((row) => row.analysisApplyStatus === "APPLIED");
  assert.ok(applied && applied._count > 0, "l'aggregato per apply status è popolabile");
  const pending = byReview.find((row) => row.reviewStatus === "PENDING");
  assert.ok(pending && pending._count > 0);
  // Il blockCode vive nel JSON: se smettesse di essere leggibile, la coda
  // remediation perderebbe la causa e resterebbe un contatore muto.
  const codes = blocked.map((row) => (row.analysisApplyDiagnostics as { blockCode?: string } | null)?.blockCode);
  assert.ok(codes.includes("MISSING_DRAFT"));
});

// ─── shadow readiness report (Fase 5) ─────────────────────────────────────────

test("shadow report: separa le capability pronte da quelle con censimento incompleto", async () => {
  await setDefaultMode("SHADOW");
  // Mondo isolato: il report aggrega l'intera finestra del prodotto, quindi
  // riusare quello della suite mescolerebbe gli esiti dei test precedenti.
  const scoped = await createWorld("stest-mixed");
  const evaluate = async (draft: unknown): Promise<void> => {
    const { executionId, attemptId } = await startFreshExecution(scoped);
    await completeExecution(executionId, scoped.actors, {
      attemptId,
      outcome: "KNOWN_CASE",
      analysisDraft: draft,
    });
  };
  await evaluate(knownDraft());
  await evaluate(knownDraft({ downstreams: ["assente-dal-censimento"] }));

  const report = await buildShadowReport(30, scoped.productId);
  assert.equal(report.capabilities.length, 1, "una sola capability per questo prodotto");
  const capability = report.capabilities[0];
  assert.ok(capability);
  assert.equal(capability.evaluated, 2);
  assert.equal(capability.wouldApply, 1);
  assert.equal(capability.wouldBlock, 1);
  assert.equal(capability.blockedByCode["UNRESOLVED_REFERENCES"], 1);
  assert.deepEqual(capability.unresolvedReferences, ["downstream:assente-dal-censimento"]);
  // Un solo blocco nella finestra basta a non essere pronti: attivare con
  // blocchi noti sposterebbe il problema nella coda remediation.
  assert.equal(capability.ready, false);
  assert.equal(report.readyCapabilities, 0);
});

test("shadow report: una capability senza known case valutati non è «pronta», è non misurata", async () => {
  await setDefaultMode("SHADOW");
  const isolated = await createWorld("stest");
  const report = await buildShadowReport(30, isolated.productId);
  assert.deepEqual(report.capabilities, []);
  assert.equal(report.totalCapabilities, 0);
  assert.equal(report.readyCapabilities, 0);
});
