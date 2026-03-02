/**
 * rescore-analyses.ts
 *
 * Ricalcola validationScore e qualityScore per le analisi non ancora valutate
 * (scoredAt IS NULL) oppure, con --force, per tutte le analisi.
 *
 * Uso:
 *   pnpm rescore              # solo quelle senza score
 *   pnpm rescore -- --force   # tutte
 */

import "dotenv/config";
import { prisma } from "@go-watchtower/database";
import { scoreAnalysis } from "../services/analysis-scoring.service.js";

const BATCH_SIZE = 100;
const force = process.argv.includes("--force");

async function main(): Promise<void> {
  console.log(`[rescore] Starting — mode: ${force ? "FORCE (all)" : "unscored only"}`);

  if (force) {
    // Reset scoredAt to force reprocessing of everything
    const { count } = await prisma.alarmAnalysis.updateMany({
      where: { scoredAt: { not: null } },
      data: { scoredAt: null },
    });
    console.log(`[rescore] Reset scoredAt on ${count} analyses`);
  }

  let cursor: string | undefined = undefined;
  let processed = 0;
  let failed = 0;

  while (true) {
    const batch: { id: string }[] = await prisma.alarmAnalysis.findMany({
      where: { scoredAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    for (const { id } of batch) {
      try {
        await scoreAnalysis(id, prisma);
        processed++;
      } catch (err) {
        failed++;
        console.error(`[rescore] Failed to score analysis ${id}:`, err);
      }
    }

    cursor = batch[batch.length - 1]!.id;
    console.log(`[rescore] Processed ${processed} analyses so far (${failed} failed)…`);
  }

  console.log(`[rescore] Done — ${processed} scored, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[rescore] Fatal error:", err);
  process.exit(1);
});
