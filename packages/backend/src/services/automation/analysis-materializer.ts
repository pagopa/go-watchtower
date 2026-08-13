import crypto from "node:crypto";
import { Prisma } from "@go-watchtower/database";
import {
  AnalysisApplyBlockCodes,
  AnalysisOrigins,
  AutomationAnalysisApplyStatuses,
  AutomationExecutionOutcomes,
  AutomationReviewStatuses,
  ANALYSIS_APPLY_DIAGNOSTICS_LIMITS,
  assessQuality,
  validateAnalysis,
  type AnalysisApplyBlockCode,
  type AnalysisApplyDiagnosticsV1,
  type AnalysisApplyRuleIssue,
  type AnalysisOrigin,
  type AnalysisSubject,
  type AutomationAnalysisApplyStatus,
  type AutomationMode,
  type AutomationExecutionOutcome,
  type AutomationReviewStatus,
  type TrackingEntry,
} from "@go-watchtower/shared";

import { routeAnalysis, isApplyingMode } from "./lifecycle-core.js";
import { supersedePendingReviews } from "./review-supersede.js";
import { ANALYSIS_DRAFT_MAX_BYTES } from "./analysis-draft-schema.js";
import { parseAnalysisDraft } from "./analysis-draft-parser.js";
import type { KnownCaseAnalysisDraft } from "./analysis-draft-schema.js";
import { checkIgnoreDetails } from "./ignore-details-validator.js";

type Tx = Prisma.TransactionClient;

/** Tolleranza di skew fra `firedAt` e il `now` di materializzazione. */
const TEMPORAL_SKEW_TOLERANCE_MS = 0;
/** `traceId` del contratto analisi: entry oltre il bound sono escluse, mai troncate. */
const MAX_TRACE_ID_LENGTH = 255;
/** Identificatore di tracking che descrive l'esecuzione, non l'errore analizzato. */
const AUTOMATION_EXECUTION_ID = "AUTOMATION_EXECUTION_ID";

export interface MaterializeInput {
  readonly tx: Tx;
  readonly executionId: string;
  readonly alarmEventId: string;
  readonly outcome: AutomationExecutionOutcome;
  /** Modo effettivo dell'apply: override globale se presente, altrimenti quello del lancio. */
  readonly effectiveMode: AutomationMode;
  readonly analysisDraft: unknown;
  readonly tracking: unknown;
  /** Service principal: resta `operatorId`/`createdById` delle analisi automatiche. */
  readonly operatorUserId: string;
  readonly now: Date;
}

export interface MaterializeResult {
  readonly applyStatus: AutomationAnalysisApplyStatus;
  readonly reviewStatus: AutomationReviewStatus;
  /** Analisi creata/aggiornata, oppure quella già linkata nei rami senza scrittura. */
  readonly analysisId: string | null;
  readonly diagnostics: AnalysisApplyDiagnosticsV1 | null;
  /** Draft da persistere: il payload entro budget, o il solo digest se oversize. */
  readonly draftToPersist: Prisma.InputJsonValue | null;
}

/**
 * Materializza l'analisi automatica dentro la transazione serializable del
 * `complete`, fail-closed sui dati dichiarati (§5.6).
 *
 * Un blocco non produce mai un'analisi parziale: zero scritture, `BLOCKED` con
 * diagnostica e HTTP 200, così il worker non ritenta. L'apply riuscito lascia
 * sempre l'analisi `IN_PROGRESS` con l'evento aperto: solo la conferma umana
 * promuove `proposedStatus` (§4.8).
 *
 * @param input - Contesto di transazione, esito, draft e tracking del callback
 * @returns Esito dell'apply, review, diagnostica e draft da persistere
 */
export async function materializeAutomaticAnalysis(input: MaterializeInput): Promise<MaterializeResult> {
  // 1. Gate sull'esito: gli outcome senza analisi non hanno nulla da applicare.
  if (!isAnalysisBearing(input.outcome)) {
    return notApplicable();
  }

  const event = await lockAndReadEvent(input.tx, input.alarmEventId);
  if (event === null) return notApplicable();

  const existingOrigin = await readLinkedAnalysisOrigin(input.tx, event.analysisId);
  // Decisione a 3 rami condivisa con il resto del lifecycle: qui non si duplica.
  const routing = routeAnalysis({
    outcome: input.outcome,
    appliedMode: input.effectiveMode,
    alarmEventAnalysisId: event.analysisId,
    existingAnalysisOrigin: existingOrigin as AnalysisOrigin | null,
  });
  const applying = routing.kind === "CREATE_ANALYSIS" || routing.kind === "UPDATE_AUTOMATIC_ANALYSIS";
  const humanBranch = routing.kind === "HUMAN_ANALYSIS_PAYLOAD_ONLY";

  // 2. Un unknown non materializza mai in v1: si valuta soltanto il contesto.
  // La review dipende dal *modo*, non dal routing: `routeAnalysis` risponde
  // sempre EXECUTION_ONLY sugli unknown, quindi `applying` qui sarebbe sempre
  // falso e la review dell'esito non nascerebbe mai (§4.8).
  if (input.outcome === AutomationExecutionOutcomes.UNKNOWN_CASE) {
    return evaluateUnknownContext(input, isApplyingMode(input.effectiveMode));
  }

  // 3. Ramo umano: l'analisi esistente è di un operatore e non va mai sovrascritta.
  if (humanBranch) {
    const evaluation = await evaluateKnownDraft(input, event);
    return {
      applyStatus: AutomationAnalysisApplyStatuses.PRESERVED_HUMAN,
      reviewStatus: AutomationReviewStatuses.NOT_REQUIRED,
      analysisId: event.analysisId,
      diagnostics: evaluateOnlyDiagnostics(evaluation),
      draftToPersist: evaluation.draftToPersist,
    };
  }

  const evaluation = await evaluateKnownDraft(input, event);

  // 4. Modi non applicanti: stessa pipeline, nessuna scrittura (§4.6).
  if (!applying) {
    return {
      applyStatus: AutomationAnalysisApplyStatuses.NOT_REQUESTED,
      reviewStatus: AutomationReviewStatuses.NOT_REQUIRED,
      analysisId: event.analysisId,
      diagnostics: evaluateOnlyDiagnostics(evaluation),
      draftToPersist: evaluation.draftToPersist,
    };
  }

  // 5. Blocco: zero scritture, coda remediation, nessuna review da confermare.
  if (evaluation.kind === "BLOCKED") {
    return {
      applyStatus: AutomationAnalysisApplyStatuses.BLOCKED,
      reviewStatus: AutomationReviewStatuses.NOT_REQUIRED,
      analysisId: event.analysisId,
      diagnostics: blockedDiagnostics(evaluation),
      draftToPersist: evaluation.draftToPersist,
    };
  }

  // 6. Apply: create o sostituzione atomica, sempre IN_PROGRESS ed evento aperto.
  const analysisId = await writeAnalysis(input, event, evaluation);
  return {
    applyStatus: AutomationAnalysisApplyStatuses.APPLIED,
    reviewStatus: AutomationReviewStatuses.PENDING,
    analysisId,
    diagnostics: appliedDiagnostics(evaluation),
    draftToPersist: evaluation.draftToPersist,
  };
}

// ─── gate ─────────────────────────────────────────────────────────────────────

function isAnalysisBearing(outcome: AutomationExecutionOutcome): boolean {
  return (
    outcome === AutomationExecutionOutcomes.KNOWN_CASE || outcome === AutomationExecutionOutcomes.UNKNOWN_CASE
  );
}

function notApplicable(): MaterializeResult {
  return {
    applyStatus: AutomationAnalysisApplyStatuses.NOT_APPLICABLE,
    reviewStatus: AutomationReviewStatuses.NOT_REQUIRED,
    analysisId: null,
    diagnostics: null,
    draftToPersist: null,
  };
}

interface LockedEvent {
  readonly id: string;
  readonly analysisId: string | null;
  readonly firedAt: Date;
  readonly alarmId: string | null;
  readonly alarmName: string | null;
  readonly alarmRunbookId: string | null;
  readonly productId: string;
  readonly environmentId: string;
  readonly priorityCode: string;
}

async function lockAndReadEvent(tx: Tx, alarmEventId: string): Promise<LockedEvent | null> {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM alarm_events WHERE id = ${alarmEventId}::uuid FOR UPDATE`);
  const event = await tx.alarmEvent.findUnique({
    where: { id: alarmEventId },
    select: {
      id: true,
      analysisId: true,
      firedAt: true,
      alarmId: true,
      productId: true,
      environmentId: true,
      priorityCode: true,
      alarm: { select: { name: true, runbookId: true, productId: true } },
    },
  });
  if (event === null) return null;
  return {
    id: event.id,
    analysisId: event.analysisId,
    firedAt: event.firedAt,
    alarmId: event.alarmId,
    alarmName: event.alarm?.name ?? null,
    alarmRunbookId: event.alarm?.productId === event.productId ? (event.alarm?.runbookId ?? null) : null,
    productId: event.productId,
    environmentId: event.environmentId,
    priorityCode: event.priorityCode,
  };
}

async function readLinkedAnalysisOrigin(tx: Tx, analysisId: string | null): Promise<string | null> {
  if (analysisId === null) return null;
  const linked = await tx.alarmAnalysis.findUnique({ where: { id: analysisId }, select: { origin: true } });
  return linked?.origin ?? null;
}

// ─── valutazione del draft ────────────────────────────────────────────────────

interface ResolvedRefs {
  readonly resourceIds: ReadonlyArray<string>;
  readonly downstreamIds: ReadonlyArray<string>;
  readonly finalActionIds: ReadonlyArray<string>;
  readonly runbookId: string | null;
}

type Evaluation =
  | {
      readonly kind: "BLOCKED";
      readonly blockCode: AnalysisApplyBlockCode;
      readonly unresolved?: AnalysisApplyDiagnosticsV1["unresolvedReferences"];
      readonly errors?: ReadonlyArray<AnalysisApplyRuleIssue>;
      readonly warnings: ReadonlyArray<AnalysisApplyRuleIssue>;
      readonly draftDigest?: { readonly sha256: string; readonly byteLength: number };
      readonly draftToPersist: Prisma.InputJsonValue | null;
    }
  | {
      readonly kind: "READY";
      readonly draft: KnownCaseAnalysisDraft;
      readonly refs: ResolvedRefs;
      readonly subject: AnalysisSubject;
      readonly trackingEntries: ReadonlyArray<TrackingEntry>;
      readonly analysisDate: Date;
      readonly isOnCall: boolean;
      readonly warnings: ReadonlyArray<AnalysisApplyRuleIssue>;
      readonly draftToPersist: Prisma.InputJsonValue | null;
    };

async function evaluateKnownDraft(input: MaterializeInput, event: LockedEvent): Promise<Evaluation> {
  const warnings: AnalysisApplyRuleIssue[] = [];

  // Passo 1 (§5.6): senza allarme il bersaglio dell'analisi non esiste più.
  if (event.alarmId === null) {
    return blocked(AnalysisApplyBlockCodes.ALARM_UNLINKED, warnings, null);
  }

  // Passo 3: budget raw. Un draft oversize non entra mai nel database.
  const serialized = input.analysisDraft === undefined ? null : JSON.stringify(input.analysisDraft);
  if (serialized !== null && Buffer.byteLength(serialized, "utf8") > ANALYSIS_DRAFT_MAX_BYTES) {
    const digest = {
      sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
      byteLength: Buffer.byteLength(serialized, "utf8"),
    };
    return {
      kind: "BLOCKED",
      blockCode: AnalysisApplyBlockCodes.DRAFT_TOO_LARGE,
      warnings,
      draftDigest: digest,
      draftToPersist: digest,
    };
  }

  // Passo 4: validazione semantica contro l'artifact contrattuale.
  const parsed = parseAnalysisDraft(input.analysisDraft);
  if (parsed.kind === "MISSING") {
    return blocked(AnalysisApplyBlockCodes.MISSING_DRAFT, warnings, null);
  }
  if (parsed.kind === "INVALID" || parsed.draft.kind !== "KNOWN_CASE") {
    return blocked(AnalysisApplyBlockCodes.INVALID_DRAFT, warnings, toJson(input.analysisDraft));
  }
  const draft = parsed.draft;
  const draftJson = toJson(draft);

  // Passo 5: inferenze. `analysisDate` è il now di materializzazione e deve
  // risultare successivo al primo allarme, altrimenti le date sono incoerenti.
  const analysisDate = input.now;
  if (analysisDate.getTime() - event.firedAt.getTime() <= TEMPORAL_SKEW_TOLERANCE_MS) {
    return blocked(AnalysisApplyBlockCodes.TEMPORAL_INCOHERENCE, warnings, draftJson);
  }

  // Passo 6: reverse lookup batch, solo sui riferimenti dichiarati.
  const lookup = await resolveReferences(input.tx, event.productId, draft);
  if (lookup.kind === "UNRESOLVED") {
    return {
      kind: "BLOCKED",
      blockCode: AnalysisApplyBlockCodes.UNRESOLVED_REFERENCES,
      unresolved: lookup.unresolved,
      warnings,
      draftToPersist: draftJson,
    };
  }
  if (lookup.kind === "TYPE_MISMATCH") {
    return blocked(AnalysisApplyBlockCodes.RESOURCE_TYPE_MISMATCH, warnings, draftJson);
  }

  // Passo 7: ignoreDetails contro il detailsSchema della reason censita.
  if (draft.ignoreReasonCode !== undefined) {
    const reason = await input.tx.ignoreReason.findUnique({
      where: { code: draft.ignoreReasonCode },
      select: { detailsSchema: true },
    });
    const check = checkIgnoreDetails(reason?.detailsSchema ?? null, draft.ignoreDetails);
    if (check.kind !== "VALID") {
      return blocked(AnalysisApplyBlockCodes.INVALID_IGNORE_DETAILS, warnings, draftJson);
    }
  }

  // Passo 8: runbook documentale — mai bloccante, ogni esito è tracciato (§5.7).
  const runbookId = await resolveDocumentRunbook(input.tx, event, draft, warnings);

  const isOnCall = await resolveOnCall(input.tx, event.priorityCode);
  const trackingEntries = projectTracking(input.tracking, warnings);

  // Passo 9: validazione con le sole regole attive. `AnalysisSubject` non ha il
  // campo `status`, quindi proposta e stato persistito danno lo stesso esito:
  // una sola passata copre entrambi.
  const subject = buildSubject({ draft, event, analysisDate, isOnCall, refs: { ...lookup.refs, runbookId }, trackingEntries });
  const validation = validateAnalysis(subject);
  if (validation.errors.length > 0) {
    return {
      kind: "BLOCKED",
      blockCode: AnalysisApplyBlockCodes.VALIDATION_ERRORS,
      errors: boundIssues(validation.errors),
      warnings: boundIssues([...warnings, ...validation.warnings]),
      draftToPersist: draftJson,
    };
  }

  return {
    kind: "READY",
    draft,
    refs: { ...lookup.refs, runbookId },
    subject,
    trackingEntries,
    analysisDate,
    isOnCall,
    warnings: boundIssues([...warnings, ...validation.warnings]),
    draftToPersist: draftJson,
  };
}

function blocked(
  blockCode: AnalysisApplyBlockCode,
  warnings: ReadonlyArray<AnalysisApplyRuleIssue>,
  draftToPersist: Prisma.InputJsonValue | null,
): Evaluation {
  return { kind: "BLOCKED", blockCode, warnings: boundIssues(warnings), draftToPersist };
}

// ─── lookup ───────────────────────────────────────────────────────────────────

type LookupResult =
  | { readonly kind: "OK"; readonly refs: Omit<ResolvedRefs, "runbookId"> }
  | { readonly kind: "UNRESOLVED"; readonly unresolved: AnalysisApplyDiagnosticsV1["unresolvedReferences"] }
  | { readonly kind: "TYPE_MISMATCH" };

async function resolveReferences(tx: Tx, productId: string, draft: KnownCaseAnalysisDraft): Promise<LookupResult> {
  const resourceNames = draft.resources.map((r) => r.name.trim());
  const downstreamNames = draft.downstreams.map((d) => d.trim());
  const finalActionNames = draft.finalActions.map((f) => f.trim());

  const [resources, downstreams, finalActions, reason] = await Promise.all([
    resourceNames.length === 0
      ? []
      : tx.resource.findMany({
          where: { productId, name: { in: resourceNames } },
          select: { id: true, name: true, type: { select: { name: true } } },
        }),
    downstreamNames.length === 0
      ? []
      : tx.downstream.findMany({ where: { productId, name: { in: downstreamNames } }, select: { id: true, name: true } }),
    finalActionNames.length === 0
      ? []
      : tx.finalAction.findMany({
          where: { productId, name: { in: finalActionNames } },
          select: { id: true, name: true },
        }),
    draft.ignoreReasonCode === undefined
      ? null
      : tx.ignoreReason.findUnique({ where: { code: draft.ignoreReasonCode }, select: { code: true } }),
  ]);

  const missingResources = missing(resourceNames, resources.map((r) => r.name));
  const missingDownstreams = missing(downstreamNames, downstreams.map((d) => d.name));
  const missingFinalActions = missing(finalActionNames, finalActions.map((f) => f.name));
  const missingReason = draft.ignoreReasonCode !== undefined && reason === null;

  if (
    missingResources.length > 0 ||
    missingDownstreams.length > 0 ||
    missingFinalActions.length > 0 ||
    missingReason
  ) {
    return {
      kind: "UNRESOLVED",
      unresolved: {
        ...(missingResources.length > 0 ? { resources: bound(missingResources) } : {}),
        ...(missingDownstreams.length > 0 ? { downstreams: bound(missingDownstreams) } : {}),
        ...(missingFinalActions.length > 0 ? { finalActions: bound(missingFinalActions) } : {}),
        ...(missingReason && draft.ignoreReasonCode !== undefined
          ? { ignoreReasonCode: draft.ignoreReasonCode }
          : {}),
      },
    };
  }

  // Il tipo si verifica solo quando il draft lo dichiara: dichiararlo sbagliato
  // è un errore di configurazione, ometterlo è sempre legittimo.
  const byName = new Map(resources.map((r) => [r.name, r]));
  for (const declared of draft.resources) {
    if (declared.type === undefined) continue;
    if (byName.get(declared.name.trim())?.type?.name !== declared.type) return { kind: "TYPE_MISMATCH" };
  }

  return {
    kind: "OK",
    refs: {
      resourceIds: resources.map((r) => r.id),
      downstreamIds: downstreams.map((d) => d.id),
      finalActionIds: finalActions.map((f) => f.id),
    },
  };
}

function missing(declared: ReadonlyArray<string>, found: ReadonlyArray<string>): ReadonlyArray<string> {
  const present = new Set(found);
  return [...new Set(declared.filter((name) => !present.has(name)))];
}

function bound(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return values.slice(0, ANALYSIS_APPLY_DIAGNOSTICS_LIMITS.MAX_UNRESOLVED_PER_CATEGORY);
}

/** Decision table del runbook documentale (§5.7): mai bloccante, sempre tracciato. */
async function resolveDocumentRunbook(
  tx: Tx,
  event: LockedEvent,
  draft: KnownCaseAnalysisDraft,
  warnings: AnalysisApplyRuleIssue[],
): Promise<string | null> {
  const declared =
    draft.runbookName === undefined
      ? null
      : await tx.runbook.findFirst({
          where: { productId: event.productId, name: draft.runbookName },
          select: { id: true },
        });

  if (event.alarmRunbookId !== null) {
    if (draft.runbookName !== undefined && declared === null) {
      warnings.push({ ruleId: "RUNBOOK_NAME_UNRESOLVED", message: `Runbook "${draft.runbookName}" non censito` });
    } else if (declared !== null && declared.id !== event.alarmRunbookId) {
      warnings.push({ ruleId: "RUNBOOK_MISMATCH", message: "Il runbook dichiarato differisce da quello dell'allarme" });
    }
    return event.alarmRunbookId;
  }

  if (declared !== null) return declared.id;
  if (draft.runbookName !== undefined) {
    warnings.push({ ruleId: "RUNBOOK_NAME_UNRESOLVED", message: `Runbook "${draft.runbookName}" non censito` });
    return null;
  }

  // Fallback sul nome canonico dell'allarme, non su quello dell'evento.
  const fallback =
    event.alarmName === null
      ? null
      : await tx.runbook.findFirst({
          where: { productId: event.productId, name: event.alarmName },
          select: { id: true },
        });
  if (fallback === null) {
    warnings.push({ ruleId: "RUNBOOK_NOT_FOUND", message: "Nessun runbook documentale collegabile" });
    return null;
  }
  return fallback.id;
}

async function resolveOnCall(tx: Tx, priorityCode: string): Promise<boolean> {
  const priority = await tx.priorityLevel.findUnique({
    where: { code: priorityCode },
    select: { countsAsOnCall: true },
  });
  return priority?.countsAsOnCall ?? false;
}

// ─── tracking ─────────────────────────────────────────────────────────────────

interface WireTrackingEntry {
  readonly identifierType?: string;
  readonly identifierValue?: string;
  readonly timestamp?: string;
}

/**
 * Proietta il tracking del callback nel `TrackingEntry` dell'analisi.
 *
 * Il contratto del callback ammette `identifierValue` fino a 512, quello
 * dell'analisi `traceId` fino a 255: le entry oltre il bound sono **escluse con
 * warning**, mai troncate — un id troncato è un id sbagliato.
 */
function projectTracking(tracking: unknown, warnings: AnalysisApplyRuleIssue[]): ReadonlyArray<TrackingEntry> {
  if (!Array.isArray(tracking)) return [];
  const entries: TrackingEntry[] = [];
  for (const raw of tracking as ReadonlyArray<WireTrackingEntry>) {
    const value = raw.identifierValue;
    if (typeof value !== "string" || value === "") continue;
    if (raw.identifierType === AUTOMATION_EXECUTION_ID) continue;
    if (value.length > MAX_TRACE_ID_LENGTH) {
      warnings.push({ ruleId: "TRACKING_ENTRY_TOO_LONG", message: "Entry di tracking oltre 255 caratteri esclusa" });
      continue;
    }
    entries.push({ traceId: value, ...(raw.timestamp === undefined ? {} : { timestamp: raw.timestamp }) });
  }
  return entries;
}

// ─── subject ──────────────────────────────────────────────────────────────────

interface SubjectInput {
  readonly draft: KnownCaseAnalysisDraft;
  readonly event: LockedEvent;
  readonly analysisDate: Date;
  readonly isOnCall: boolean;
  readonly refs: ResolvedRefs;
  readonly trackingEntries: ReadonlyArray<TrackingEntry>;
}

function buildSubject(input: SubjectInput): AnalysisSubject {
  const firedAt = input.event.firedAt.toISOString();
  return {
    analysisDate: input.analysisDate.toISOString(),
    firstAlarmAt: firedAt,
    lastAlarmAt: firedAt,
    occurrences: 1,
    isOnCall: input.isOnCall,
    analysisType: input.draft.analysisType,
    ignoreReasonCode: input.draft.ignoreReasonCode ?? null,
    errorDetails: input.draft.errorDetails ?? null,
    conclusionNotes: input.draft.conclusionNotes,
    runbook: input.refs.runbookId === null ? null : { id: input.refs.runbookId },
    finalActions: input.refs.finalActionIds.map((id) => ({ id, name: "" })),
    resources: input.refs.resourceIds.map((id) => ({ id })),
    downstreams: input.refs.downstreamIds.map((id) => ({ id })),
    links: [...input.draft.links],
    trackingIds: [...input.trackingEntries],
    // L'evento in corso è l'unico collegato all'analisi automatica.
    linkedEventsCount: 1,
    origin: AnalysisOrigins.AUTOMATIC,
  };
}

// ─── scrittura ────────────────────────────────────────────────────────────────

async function writeAnalysis(
  input: MaterializeInput,
  event: LockedEvent,
  evaluation: Extract<Evaluation, { kind: "READY" }>,
): Promise<string> {
  const { draft, refs, subject, trackingEntries } = evaluation;
  const scores = {
    validationScore: validateAnalysis(subject).score,
    qualityScore: assessQuality(subject).score,
    scoredAt: input.now,
  };

  const data = {
    analysisDate: evaluation.analysisDate,
    firstAlarmAt: event.firedAt,
    lastAlarmAt: event.firedAt,
    occurrences: 1,
    isOnCall: evaluation.isOnCall,
    analysisType: draft.analysisType,
    // L'apply non promuove mai lo stato proposto: lo fa solo la conferma (§4.8).
    status: "IN_PROGRESS" as const,
    errorDetails: draft.errorDetails ?? null,
    conclusionNotes: draft.conclusionNotes,
    ignoreReasonCode: draft.ignoreReasonCode ?? null,
    ignoreDetails: draft.ignoreDetails === undefined ? Prisma.DbNull : (draft.ignoreDetails as Prisma.InputJsonValue),
    runbookId: refs.runbookId,
    links: [...draft.links] as unknown as Prisma.InputJsonValue,
    trackingIds: [...trackingEntries] as unknown as Prisma.InputJsonValue,
    lastAppliedExecutionId: input.executionId,
    ...scores,
  };

  if (event.analysisId === null) {
    const created = await input.tx.alarmAnalysis.create({
      data: {
        ...data,
        origin: AnalysisOrigins.AUTOMATIC,
        alarmId: event.alarmId as string,
        productId: event.productId,
        environmentId: event.environmentId,
        operatorId: input.operatorUserId,
        createdById: input.operatorUserId,
        resources: { create: refs.resourceIds.map((resourceId) => ({ resourceId })) },
        downstreams: { create: refs.downstreamIds.map((downstreamId) => ({ downstreamId })) },
        finalActions: { create: refs.finalActionIds.map((finalActionId) => ({ finalActionId })) },
      },
      select: { id: true },
    });
    await input.tx.alarmEvent.update({
      where: { id: event.id },
      data: { analysisId: created.id, linkedAt: input.now, resolvedAt: null },
    });
    return created.id;
  }

  // Ramo 2: sostituzione atomica del contenuto, con reset di stato ed evento.
  const analysisId = event.analysisId;
  await input.tx.analysisResource.deleteMany({ where: { analysisId } });
  await input.tx.analysisDownstream.deleteMany({ where: { analysisId } });
  await input.tx.analysisFinalAction.deleteMany({ where: { analysisId } });
  await input.tx.alarmAnalysis.update({
    where: { id: analysisId },
    data: {
      ...data,
      updatedById: input.operatorUserId,
      resources: { create: refs.resourceIds.map((resourceId) => ({ resourceId })) },
      downstreams: { create: refs.downstreamIds.map((downstreamId) => ({ downstreamId })) },
      finalActions: { create: refs.finalActionIds.map((finalActionId) => ({ finalActionId })) },
    },
  });
  await input.tx.alarmEvent.update({ where: { id: event.id }, data: { resolvedAt: null } });
  await supersedePendingReviews(input.tx, { analysisId }, {
    reason: "RE_APPLY",
    supersededByExecutionId: input.executionId,
    exceptExecutionId: input.executionId,
  });
  return analysisId;
}

// ─── unknown context ──────────────────────────────────────────────────────────

/**
 * Un `UNKNOWN_CASE` non materializza mai in v1: si valuta solo la validità del
 * contesto come segnale di readiness, senza promettere alcuna materializzazione.
 */
async function evaluateUnknownContext(input: MaterializeInput, applying: boolean): Promise<MaterializeResult> {
  const parsed = parseAnalysisDraft(input.analysisDraft);
  const valid = parsed.kind === "OK" && parsed.draft.kind === "UNKNOWN_CASE_CONTEXT";
  await Promise.resolve();
  return {
    applyStatus: AutomationAnalysisApplyStatuses.NOT_REQUESTED,
    // In modo applicante l'esito unknown resta da verificare; in shadow no.
    reviewStatus: applying ? AutomationReviewStatuses.PENDING : AutomationReviewStatuses.NOT_REQUIRED,
    analysisId: null,
    diagnostics: {
      schemaVersion: 1,
      evaluatedOnly: true,
      contextValidationStatus: valid ? "VALID" : "INVALID",
    },
    draftToPersist: input.analysisDraft === undefined ? null : toJson(input.analysisDraft),
  };
}

// ─── diagnostica ──────────────────────────────────────────────────────────────

function evaluateOnlyDiagnostics(evaluation: Evaluation): AnalysisApplyDiagnosticsV1 {
  return {
    schemaVersion: 1,
    evaluatedOnly: true,
    wouldApplyStatus: evaluation.kind === "READY" ? "APPLIED" : "BLOCKED",
    ...(evaluation.kind === "BLOCKED" ? { blockCode: evaluation.blockCode } : {}),
    ...(evaluation.kind === "BLOCKED" && evaluation.unresolved !== undefined
      ? { unresolvedReferences: evaluation.unresolved }
      : {}),
    ...(evaluation.warnings.length > 0 ? { warnings: evaluation.warnings } : {}),
  };
}

function blockedDiagnostics(evaluation: Extract<Evaluation, { kind: "BLOCKED" }>): AnalysisApplyDiagnosticsV1 {
  return {
    schemaVersion: 1,
    blockCode: evaluation.blockCode,
    ...(evaluation.unresolved === undefined ? {} : { unresolvedReferences: evaluation.unresolved }),
    ...(evaluation.errors === undefined ? {} : { errors: evaluation.errors }),
    ...(evaluation.warnings.length > 0 ? { warnings: evaluation.warnings } : {}),
    ...(evaluation.draftDigest === undefined ? {} : { draftDigest: evaluation.draftDigest }),
  };
}

function appliedDiagnostics(
  evaluation: Extract<Evaluation, { kind: "READY" }>,
): AnalysisApplyDiagnosticsV1 | null {
  if (evaluation.warnings.length === 0) return null;
  return { schemaVersion: 1, warnings: evaluation.warnings };
}

function boundIssues(issues: ReadonlyArray<AnalysisApplyRuleIssue>): ReadonlyArray<AnalysisApplyRuleIssue> {
  return issues.slice(0, ANALYSIS_APPLY_DIAGNOSTICS_LIMITS.MAX_ISSUES).map((issue) => ({
    ruleId: issue.ruleId,
    message: issue.message.slice(0, ANALYSIS_APPLY_DIAGNOSTICS_LIMITS.MAX_MESSAGE_LENGTH),
  }));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
