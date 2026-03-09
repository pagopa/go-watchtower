import type { PrismaClient } from "@go-watchtower/database";
import { validateAnalysis, assessQuality, type AnalysisSubject, type TrackingEntry } from "@go-watchtower/shared";

type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type ScoringClient = PrismaClient | TransactionClient;

async function fetchSubjectForScoring(
  id: string,
  prisma: ScoringClient
): Promise<AnalysisSubject> {
  const a = await prisma.alarmAnalysis.findUniqueOrThrow({
    where: { id },
    select: {
      analysisDate:     true,
      firstAlarmAt:     true,
      lastAlarmAt:      true,
      occurrences:      true,
      isOnCall:         true,
      analysisType:     true,
      ignoreReasonCode: true,
      errorDetails:     true,
      conclusionNotes:  true,
      runbook:          { select: { id: true } },
      finalActions:     { include: { finalAction: { select: { id: true, name: true } } } },
      resources:        { include: { resource: { select: { id: true } } } },
      downstreams:      { include: { downstream: { select: { id: true } } } },
      links:            true,
      trackingIds:      true,
    },
  });

  return {
    analysisDate:     a.analysisDate.toISOString(),
    firstAlarmAt:     a.firstAlarmAt.toISOString(),
    lastAlarmAt:      a.lastAlarmAt.toISOString(),
    occurrences:      a.occurrences,
    isOnCall:         a.isOnCall,
    analysisType:     a.analysisType as 'ANALYZABLE' | 'IGNORABLE',
    ignoreReasonCode: a.ignoreReasonCode,
    errorDetails:     a.errorDetails,
    conclusionNotes:  a.conclusionNotes,
    runbook:          a.runbook ? { id: a.runbook.id } : null,
    finalActions:     a.finalActions.map((af) => ({ id: af.finalAction.id, name: af.finalAction.name })),
    resources:        a.resources.map((ar) => ({ id: ar.resource.id })),
    downstreams:      a.downstreams.map((ad) => ({ id: ad.downstream.id })),
    links:            (a.links as unknown as { url: string }[]),
    trackingIds:      (a.trackingIds as unknown as TrackingEntry[]),
  };
}

export async function scoreAnalysis(
  id: string,
  prisma: ScoringClient
): Promise<void> {
  const subject = await fetchSubjectForScoring(id, prisma);

  const { score: validationScore } = validateAnalysis(subject);
  const { score: qualityScore }    = assessQuality(subject);

  await prisma.alarmAnalysis.update({
    where: { id },
    data: {
      validationScore,
      qualityScore,
      scoredAt: new Date(),
    },
  });
}
