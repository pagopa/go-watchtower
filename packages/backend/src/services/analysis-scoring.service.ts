import type { PrismaClient } from "@go-watchtower/database";
import { validateAnalysis, assessQuality } from "@go-watchtower/shared";

import { buildScoringSubject } from "./automation/analysis-scoring-subject.js";

type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type ScoringClient = PrismaClient | TransactionClient;

/**
 * Ricalcola e persiste gli score di un'analisi.
 *
 * Il subject arriva da `buildScoringSubject`, la stessa funzione usata dall'apply
 * e dalla review: include `origin`, quindi le esenzioni delle analisi automatiche
 * (§4.7) valgono identiche qui, e un rescore non può divergere dal punteggio
 * calcolato al momento dell'apply.
 *
 * @param id - Analisi da valutare
 * @param prisma - Client Prisma o di transazione
 */
export async function scoreAnalysis(id: string, prisma: ScoringClient): Promise<void> {
  const subject = await buildScoringSubject(prisma as never, id);

  const { score: validationScore } = validateAnalysis(subject);
  const { score: qualityScore } = assessQuality(subject);

  await prisma.alarmAnalysis.update({
    where: { id },
    data: {
      validationScore,
      qualityScore,
      scoredAt: new Date(),
    },
  });
}
