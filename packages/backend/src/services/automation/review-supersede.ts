import { Prisma } from "@go-watchtower/database";
import {
  AutomationReviewStatuses,
  SystemEventActions,
  SystemEventResources,
} from "@go-watchtower/shared";

/**
 * Solo i due delegate che questa funzione tocca: le rotte analisi usano un
 * `TransactionClient` proprio, più stretto di quello generato, e chiedere il
 * client completo escluderebbe il chiamante senza alcun guadagno.
 */
type Tx = Pick<Prisma.TransactionClient, "automaticRunbookExecution" | "systemEvent">;

/** Il lock è un `SELECT ... FOR UPDATE`: non passa dai delegate, solo da raw. */
type RawTx = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * Blocca tutte le execution dell'evento, da chiamare **prima** di
 * `supersedePendingReviews` (ordine canonico: execution → evento → analisi).
 *
 * Senza questo lock il supersede è una lettura su uno snapshot: un `complete`
 * in corso ha già la sua riga bloccata ma non ancora committata, la review che
 * sta per diventare `PENDING` non è visibile, e la mutazione umana la lascia
 * indietro — pendente e non più decidibile.
 *
 * Il filtro su `review_status` qui non ci va, ed è il punto delicato: sullo
 * snapshot committato quella riga vale ancora `NOT_REQUIRED`, quindi un
 * predicato selettivo non la aggancerebbe e non aspetterebbe nessuno. Bloccando
 * tutte le execution dell'evento la `FOR UPDATE` si mette invece in coda dietro
 * al `complete`, e al suo commit rilegge la riga già `PENDING`.
 *
 * @param tx - Transazione della mutazione umana
 * @param alarmEventId - Evento le cui execution vanno bloccate
 */
export async function lockEventExecutions(tx: RawTx, alarmEventId: string): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM automatic_runbook_executions WHERE alarm_event_id = ${alarmEventId}::uuid FOR UPDATE`,
  );
}

/** Cosa ha reso non più corrente la proposta automatica. */
export type SupersedeReason =
  | "RE_APPLY"
  | "HUMAN_EVENT_CHANGE"
  | "HUMAN_ANALYSIS_EDIT"
  | "HUMAN_ANALYSIS_DELETE";

/**
 * Bersaglio: l'analisi sostituita (re-apply) o l'evento mutato a mano.
 * Sono due chiavi diverse per lo stesso effetto, quindi una sola funzione.
 */
export type SupersedeTarget =
  | { readonly analysisId: string }
  | { readonly alarmEventId: string };

export interface SupersedeContext {
  readonly reason: SupersedeReason;
  /** Execution che ha causato la sostituzione, sul ramo re-apply. */
  readonly supersededByExecutionId?: string;
  /** Operatore, quando la causa è una mutazione umana. */
  readonly actorUserId?: string;
  /** Execution da non toccare (tipicamente quella corrente). */
  readonly exceptExecutionId?: string;
}

/**
 * Chiude a `NOT_REQUIRED` le review pendenti che non sono più decidibili (§4.8.2).
 *
 * Una review resta `PENDING` finché qualcuno la decide, ma la sua decidibilità
 * dipende da invarianti esterni: se il re-apply avanza `lastAppliedExecutionId`
 * o se un umano ricollega/risolve l'evento, quella review risponderebbe per
 * sempre `REVIEW_SUPERSEDED`/`REVIEW_TARGET_CHANGED`. Chiuderla è l'unico modo
 * di non lasciare in coda voci che nessuna azione può togliere.
 *
 * @param tx - Transazione in cui avviene la mutazione che rende obsoleta la proposta
 * @param target - Analisi sostituita o evento mutato
 * @param context - Causa, autore ed eventuale execution da preservare
 * @returns Numero di review chiuse
 */
export async function supersedePendingReviews(
  tx: Tx,
  target: SupersedeTarget,
  context: SupersedeContext,
): Promise<number> {
  const scope = "analysisId" in target ? { analysisId: target.analysisId } : { alarmEventId: target.alarmEventId };
  const candidates = await tx.automaticRunbookExecution.findMany({
    where: {
      ...scope,
      reviewStatus: AutomationReviewStatuses.PENDING,
      ...(context.exceptExecutionId === undefined ? {} : { id: { not: context.exceptExecutionId } }),
    },
    select: { id: true, analysisId: true },
  });
  if (candidates.length === 0) return 0;

  let closed = 0;
  for (const candidate of candidates) {
    // Compare-and-set per riga, non un update in blocco sugli id letti: fra la
    // lettura e la scrittura una decisione umana può aver reso quella review
    // `CONFIRMED`/`REJECTED`, e uno stato finale non si sovrascrive mai. Gli
    // insiemi qui sono di norma vuoti o unitari, quindi il ciclo non costa.
    const result = await tx.automaticRunbookExecution.updateMany({
      where: { id: candidate.id, reviewStatus: AutomationReviewStatuses.PENDING },
      data: { reviewStatus: AutomationReviewStatuses.NOT_REQUIRED },
    });
    if (result.count === 0) continue;
    closed += 1;
    await tx.systemEvent.create({
      data: {
        action: SystemEventActions.AUTOMATION_ANALYSIS_REVIEW_SUPERSEDED,
        resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
        resourceId: candidate.id,
        userId: context.actorUserId ?? null,
        metadata: {
          actorType: context.actorUserId === undefined ? "SYSTEM" : "HUMAN",
          reason: context.reason,
          analysisId: candidate.analysisId,
          ...(context.supersededByExecutionId === undefined
            ? {}
            : { supersededByExecutionId: context.supersededByExecutionId }),
        },
      },
    });
  }
  return closed;
}
