import { prisma, Prisma, type AutomaticRunbookExecution } from "@go-watchtower/database";
import {
  AnalysisOrigins,
  AutomationAnalysisApplyStatuses,
  AutomationExecutionOutcomes,
  AutomationReviewStatuses,
  SystemEventActions,
  SystemEventResources,
  isTerminalExecutionStatus,
  validateAnalysis,
  assessQuality,
} from "@go-watchtower/shared";

import { isRetryableTransactionError } from "../../utils/transaction-retry.js";
import { parseAnalysisDraft } from "./analysis-draft-parser.js";
import { buildScoringSubject } from "./analysis-scoring-subject.js";

type Tx = Prisma.TransactionClient;

export type ReviewDecision = "CONFIRMED" | "REJECTED";

export type ReviewConflict =
  | "REVIEW_NOT_APPLICABLE"
  | "REVIEW_NOT_TERMINAL"
  | "REVIEW_ALREADY_DECIDED"
  | "REVIEW_SUPERSEDED"
  | "REVIEW_TARGET_CHANGED"
  | "REVIEW_INVARIANT_VIOLATION";

export type ReviewResult =
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "CONFLICT"; readonly conflict: ReviewConflict; readonly reviewStatus?: string }
  | { readonly kind: "OK"; readonly execution: AutomaticRunbookExecution; readonly alreadyReviewed: boolean };

export interface ReviewActor {
  readonly userId: string;
  readonly label: string;
}

/**
 * Applica la decisione umana sull'esito automatico, in transazione serializable.
 *
 * È il **commit umano** degli effetti proposti dal runbook: `CONFIRMED` promuove
 * `proposedStatus` e può risolvere l'evento, `REJECTED` conserva la bozza per
 * audit lasciando l'allarme aperto. La transizione usa compare-and-set su
 * `PENDING` e verifica `lastAppliedExecutionId`, così una conferma lenta o una
 * scheda obsoleta non può approvare una versione già sostituita (§5.9.1).
 *
 * @param id - Execution da revisionare
 * @param decision - Decisione umana
 * @param note - Motivazione; obbligatoria e non vuota sul rifiuto (validata dallo schema)
 * @param actor - Operatore che decide
 * @param now - Istante della decisione
 * @returns Execution aggiornata, conflitto allowlisted, o assenza
 */
export async function reviewExecution(
  id: string,
  decision: ReviewDecision,
  note: string | undefined,
  actor: ReviewActor,
  now: Date = new Date(),
): Promise<ReviewResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runReviewTransaction(id, decision, note, actor, now);
    } catch (error) {
      if (error instanceof ReviewConflictSignal) {
        // La transazione è stata annullata: nessuna scrittura sopravvive. L'evento
        // tecnico va quindi scritto fuori, altrimenti il rollback lo porterebbe via.
        if (error.conflict === "REVIEW_INVARIANT_VIOLATION") {
          await recordInvariantViolation(id, actor, decision);
        }
        return {
          kind: "CONFLICT",
          conflict: error.conflict,
          ...(error.reviewStatus === undefined ? {} : { reviewStatus: error.reviewStatus }),
        };
      }
      // Due decisioni simultanee sulla stessa execution collidono sul lock in
      // isolamento serializable. È il caso normale di due operatori che cliccano
      // insieme, non un guasto: al retry la transazione trova la decisione già
      // presa e risponde `ALREADY_DECIDED` (o il replay idempotente). Stessa
      // sorte per un deadlock (40P01): l'ordine di lock è unico in tutti i
      // flussi, ma un ciclo residuo va comunque ritentato, non propagato.
      if (attempt < SERIALIZATION_RETRIES && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }
}

const SERIALIZATION_RETRIES = 3;

/**
 * Segnala un conflitto **abortendo** la transazione.
 *
 * Il callback di `$transaction` committa se ritorna normalmente: un conflitto
 * restituito invece che lanciato lascerebbe a database esattamente le scritture
 * che la risposta 409 dichiara non applicate (§5.9.1 passo 5).
 */
class ReviewConflictSignal extends Error {
  constructor(
    readonly conflict: ReviewConflict,
    readonly reviewStatus?: string,
  ) {
    super(conflict);
    this.name = "ReviewConflictSignal";
  }
}

async function runReviewTransaction(
  id: string,
  decision: ReviewDecision,
  note: string | undefined,
  actor: ReviewActor,
  now: Date,
): Promise<ReviewResult> {
  return await prisma.$transaction(
    async (tx) => {
      const execution = await lockExecution(tx, id);
      if (execution === null) return { kind: "NOT_FOUND" };

      // Replay della stessa decisione: idempotente, nessun nuovo side effect.
      if (execution.reviewStatus === decision) {
        return { kind: "OK", execution, alreadyReviewed: true };
      }
      checkReviewable(execution);

      const trimmedNote = note?.trim();
      const reviewData = {
        reviewStatus: decision === "CONFIRMED" ? AutomationReviewStatuses.CONFIRMED : AutomationReviewStatuses.REJECTED,
        reviewedByUserId: actor.userId,
        reviewedByLabel: actor.label,
        reviewedAt: now,
        reviewNote: trimmedNote === undefined || trimmedNote === "" ? null : trimmedNote,
      };

      // Un unknown non ha analisi da mutare: la decisione vale sul solo esito.
      if (execution.outcome === AutomationExecutionOutcomes.UNKNOWN_CASE) {
        const updated = await applyCompareAndSet(tx, id, reviewData);
        if (updated === null) throw new ReviewConflictSignal("REVIEW_ALREADY_DECIDED");
        await writeSystemEvent(tx, id, actor, {
          action:
            decision === "CONFIRMED"
              ? SystemEventActions.AUTOMATION_OUTCOME_CONFIRMED
              : SystemEventActions.AUTOMATION_OUTCOME_REJECTED,
          metadata: { outcome: execution.outcome },
        });
        return { kind: "OK", execution: updated, alreadyReviewed: false };
      }

      const target = await loadAndVerifyTarget(tx, execution);

      const updated = await applyCompareAndSet(tx, id, reviewData);
      if (updated === null) throw new ReviewConflictSignal("REVIEW_ALREADY_DECIDED");

      const promoted = await applyDecisionEffects(tx, {
        decision,
        analysisId: target.analysisId,
        alarmEventId: execution.alarmEventId,
        proposedStatus: target.proposedStatus,
        now,
      });
      if (!promoted) throw new ReviewConflictSignal("REVIEW_INVARIANT_VIOLATION");

      await writeSystemEvent(tx, id, actor, {
        action:
          decision === "CONFIRMED"
            ? SystemEventActions.AUTOMATION_ANALYSIS_CONFIRMED
            : SystemEventActions.AUTOMATION_ANALYSIS_REJECTED,
        metadata: {
          analysisId: target.analysisId,
          proposedStatus: target.proposedStatus,
          confirmationMode: "UNCHANGED",
        },
      });
      return { kind: "OK", execution: updated, alreadyReviewed: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function lockExecution(tx: Tx, id: string): Promise<AutomaticRunbookExecution | null> {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM automatic_runbook_executions WHERE id = ${id}::uuid FOR UPDATE`);
  return await tx.automaticRunbookExecution.findUnique({ where: { id } });
}

/** Matrice §4.8.1: chi è revisionabile e chi no. Lancia il conflitto, non lo ritorna. */
function checkReviewable(execution: AutomaticRunbookExecution): void {
  if (!isTerminalExecutionStatus(execution.status)) {
    throw new ReviewConflictSignal("REVIEW_NOT_TERMINAL");
  }
  if (
    execution.reviewStatus === AutomationReviewStatuses.CONFIRMED ||
    execution.reviewStatus === AutomationReviewStatuses.REJECTED
  ) {
    throw new ReviewConflictSignal("REVIEW_ALREADY_DECIDED", execution.reviewStatus);
  }
  // `BLOCKED` è una coda di remediation, non una review: non esiste un artefatto
  // da approvare. Shadow, ramo umano e non-analysis-bearing sono NOT_REQUIRED.
  if (execution.reviewStatus !== AutomationReviewStatuses.PENDING) {
    throw new ReviewConflictSignal("REVIEW_NOT_APPLICABLE", execution.reviewStatus);
  }
}

interface ReviewTarget {
  readonly analysisId: string;
  readonly proposedStatus: "IN_PROGRESS" | "COMPLETED";
}

/**
 * Verifica che la proposta sia ancora quella corrente e che il bersaglio non sia
 * cambiato sotto i piedi della decisione.
 */
async function loadAndVerifyTarget(tx: Tx, execution: AutomaticRunbookExecution): Promise<ReviewTarget> {
  if (execution.analysisApplyStatus !== AutomationAnalysisApplyStatuses.APPLIED || execution.analysisId === null) {
    throw new ReviewConflictSignal("REVIEW_NOT_APPLICABLE");
  }

  // Lock esplicito di evento e analisi (§5.9.1 passo 3): sono i due bersagli
  // che la decisione muterà, e senza `FOR UPDATE` la verifica di coerenza
  // sarebbe una lettura che una transazione concorrente può invalidare.
  //
  // L'ordine è vincolante, non estetico: execution → evento → analisi, lo stesso
  // che tiene il `complete` (lock execution, poi `lockAndReadEvent`, poi
  // `writeAnalysis`). Prenderli in ordine inverso apre un ciclo di attesa reale
  // — un re-apply che tiene l'evento e vuole l'analisi contro una review che
  // tiene l'analisi e vuole l'evento — cioè un deadlock, non una serializzazione.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM alarm_events WHERE id = ${execution.alarmEventId}::uuid FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM alarm_analyses WHERE id = ${execution.analysisId}::uuid FOR UPDATE`);

  const analysis = await tx.alarmAnalysis.findUnique({
    where: { id: execution.analysisId },
    select: { id: true, origin: true, lastAppliedExecutionId: true },
  });
  if (analysis === null) throw new ReviewConflictSignal("REVIEW_INVARIANT_VIOLATION");
  if (analysis.origin !== AnalysisOrigins.AUTOMATIC) {
    throw new ReviewConflictSignal("REVIEW_TARGET_CHANGED");
  }
  // Una versione già sostituita da un re-apply non è più approvabile.
  if (analysis.lastAppliedExecutionId !== execution.id) {
    throw new ReviewConflictSignal("REVIEW_SUPERSEDED");
  }

  const event = await tx.alarmEvent.findUnique({
    where: { id: execution.alarmEventId },
    select: { analysisId: true, resolvedAt: true },
  });
  if (event === null || event.analysisId !== execution.analysisId || event.resolvedAt !== null) {
    throw new ReviewConflictSignal("REVIEW_TARGET_CHANGED");
  }

  // Lettura difensiva: `proposedStatus` vive nel draft persistito, non in colonna.
  const parsed = parseAnalysisDraft(execution.analysisDraft);
  if (parsed.kind !== "OK" || parsed.draft.kind !== "KNOWN_CASE") {
    throw new ReviewConflictSignal("REVIEW_INVARIANT_VIOLATION");
  }
  return { analysisId: analysis.id, proposedStatus: parsed.draft.proposedStatus };
}

/**
 * Traccia fuori transazione il fallimento dell'invariante di promozione.
 *
 * @param executionId - Execution su cui la decisione è stata annullata
 * @param actor - Operatore che aveva richiesto la decisione
 * @param decision - Decisione richiesta e non applicata
 */
async function recordInvariantViolation(
  executionId: string,
  actor: ReviewActor,
  decision: ReviewDecision,
): Promise<void> {
  await prisma.systemEvent.create({
    data: {
      action: SystemEventActions.AUTOMATION_ANALYSIS_REVIEW_INVARIANT_VIOLATION,
      resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
      resourceId: executionId,
      userId: actor.userId,
      metadata: { actorType: "HUMAN", executionId, decision, applied: false },
    },
  });
}

async function applyCompareAndSet(
  tx: Tx,
  id: string,
  data: Prisma.AutomaticRunbookExecutionUpdateManyMutationInput,
): Promise<AutomaticRunbookExecution | null> {
  // CAS su PENDING: due decisioni concorrenti, una sola vince.
  const affected = await tx.automaticRunbookExecution.updateMany({
    where: { id, reviewStatus: AutomationReviewStatuses.PENDING },
    data,
  });
  if (affected.count === 0) return null;
  return await tx.automaticRunbookExecution.findUniqueOrThrow({ where: { id } });
}

interface DecisionEffects {
  readonly decision: ReviewDecision;
  readonly analysisId: string;
  readonly alarmEventId: string;
  readonly proposedStatus: "IN_PROGRESS" | "COMPLETED";
  readonly now: Date;
}

/**
 * Effetti atomici della decisione su analisi ed evento (§4.8.1).
 *
 * `REJECTED` non elimina e non scollega: il contenuto automatico resta
 * ispezionabile, ma l'analisi non è validata e l'allarme non è risolto.
 *
 * @returns `false` se la promozione produrrebbe un'analisi non più valida
 */
async function applyDecisionEffects(tx: Tx, effects: DecisionEffects): Promise<boolean> {
  if (effects.decision === "REJECTED") return true;

  const status = effects.proposedStatus;
  await tx.alarmAnalysis.update({ where: { id: effects.analysisId }, data: { status } });

  // Re-scoring sul subject promosso: gli score devono descrivere lo stato corrente.
  const subject = await buildScoringSubject(tx, effects.analysisId);
  const validation = validateAnalysis(subject);
  if (validation.errors.length > 0) return false;
  await tx.alarmAnalysis.update({
    where: { id: effects.analysisId },
    data: {
      validationScore: validation.score,
      qualityScore: assessQuality(subject).score,
      scoredAt: effects.now,
    },
  });

  if (status === "COMPLETED") {
    await tx.alarmEvent.updateMany({
      where: { id: effects.alarmEventId, resolvedAt: null },
      data: { resolvedAt: effects.now },
    });
  }
  return true;
}

interface SystemEventInput {
  readonly action: string;
  readonly metadata: Record<string, unknown>;
}

async function writeSystemEvent(tx: Tx, executionId: string, actor: ReviewActor, input: SystemEventInput): Promise<void> {
  await tx.systemEvent.create({
    data: {
      action: input.action,
      resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
      resourceId: executionId,
      userId: actor.userId,
      metadata: { actorType: "HUMAN", executionId, ...input.metadata },
    },
  });
}
