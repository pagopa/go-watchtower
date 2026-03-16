/**
 * rescore-analyses.ts
 *
 * Ricalcola validationScore e qualityScore per tutte le analisi (--force)
 * o solo per quelle non ancora valutate (default: scoredAt IS NULL).
 *
 * Uso:
 *   pnpm rescore              # solo quelle senza score
 *   pnpm rescore -- --force   # tutte
 */

// Silence Prisma query logs — must run before the database client is created.
// dotenv does NOT override existing env vars, so this sticks even if .env has NODE_ENV=development.
process.env["NODE_ENV"] = "production";

const { default: dotenv } = await import("dotenv");
dotenv.config();

const { prisma } = await import("@go-watchtower/database");
const { scoreAnalysis } = await import("../services/analysis-scoring.service.js");

const BATCH_SIZE = 100;
const force = process.argv.includes("--force");

function dbInfo(): string {
  const raw = process.env["DATABASE_URL"] ?? "";
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || "5432"} db=${url.pathname.replace("/", "")}`;
  } catch {
    return "(unable to parse DATABASE_URL)";
  }
}

async function main(): Promise<void> {
  console.log(`[rescore] DB: ${dbInfo()}`);
  console.log(`[rescore] Mode: ${force ? "FORCE (all)" : "unscored only"}`);

  if (force) {
    const { count } = await prisma.alarmAnalysis.updateMany({
      where: { scoredAt: { not: null } },
      data: { scoredAt: null },
    });
    console.log(`[rescore] Reset ${count} analyses`);
  }

  const total = await prisma.alarmAnalysis.count({ where: { scoredAt: null } });
  if (total === 0) {
    console.log("[rescore] Nothing to score");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`[rescore] Scoring ${total} analyses…`);

  let cursor: string | undefined = undefined;
  let processed = 0;
  let failed = 0;
  const failedIds: string[] = [];

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
        failedIds.push(id);
        console.error(`\n[rescore] ERR ${id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    cursor = batch[batch.length - 1]!.id;
    const pct = Math.round(((processed + failed) / total) * 100);
    process.stdout.write(`\r[rescore] ${processed + failed}/${total} (${pct}%)`);
  }

  console.log();
  console.log(`[rescore] Done — ${processed} scored, ${failed} failed`);
  if (failedIds.length > 0) {
    console.log(`[rescore] Failed IDs:\n  ${failedIds.join("\n  ")}`);
  }

  await prisma.$disconnect();
  process.exit(failedIds.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[rescore] Fatal:", err);
  process.exit(1);
});
