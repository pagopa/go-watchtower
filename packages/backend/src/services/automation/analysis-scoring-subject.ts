import type { Prisma } from "@go-watchtower/database";
import type { AnalysisSubject, TrackingEntry } from "@go-watchtower/shared";

type Tx = Prisma.TransactionClient;

/**
 * Costruisce il subject di validazione/scoring da un'analisi persistita.
 *
 * Include `origin`, senza il quale l'engine applicherebbe le regole piene anche
 * alle automatiche e il rescore divergerebbe dall'apply (§4.7).
 *
 * @param tx - Client di transazione o Prisma client
 * @param analysisId - Analisi da leggere
 * @returns Il subject pronto per `validateAnalysis`/`assessQuality`
 */
export async function buildScoringSubject(tx: Tx, analysisId: string): Promise<AnalysisSubject> {
  const a = await tx.alarmAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
    select: {
      analysisDate: true,
      firstAlarmAt: true,
      lastAlarmAt: true,
      occurrences: true,
      isOnCall: true,
      analysisType: true,
      ignoreReasonCode: true,
      errorDetails: true,
      conclusionNotes: true,
      origin: true,
      runbook: { select: { id: true } },
      finalActions: { include: { finalAction: { select: { id: true, name: true } } } },
      resources: { include: { resource: { select: { id: true } } } },
      downstreams: { include: { downstream: { select: { id: true } } } },
      links: true,
      trackingIds: true,
      _count: { select: { alarmEvents: true } },
    },
  });

  return {
    analysisDate: a.analysisDate.toISOString(),
    firstAlarmAt: a.firstAlarmAt.toISOString(),
    lastAlarmAt: a.lastAlarmAt.toISOString(),
    occurrences: a.occurrences,
    isOnCall: a.isOnCall,
    analysisType: a.analysisType,
    ignoreReasonCode: a.ignoreReasonCode,
    errorDetails: a.errorDetails,
    conclusionNotes: a.conclusionNotes,
    runbook: a.runbook ? { id: a.runbook.id } : null,
    finalActions: a.finalActions.map((af) => ({ id: af.finalAction.id, name: af.finalAction.name })),
    resources: a.resources.map((ar) => ({ id: ar.resource.id })),
    downstreams: a.downstreams.map((ad) => ({ id: ad.downstream.id })),
    links: a.links as unknown as { url: string }[],
    trackingIds: a.trackingIds as unknown as TrackingEntry[],
    linkedEventsCount: a._count.alarmEvents,
    origin: a.origin,
  };
}
