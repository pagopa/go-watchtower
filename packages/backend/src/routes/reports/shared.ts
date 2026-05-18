import { Prisma } from "@go-watchtower/database";
import type { ReportQuery } from "./schemas.js";

// KPI cutover: from April 2026, analyses are attributed to the
// business day of first_alarm_at rather than analysis_date.
export const KPI_CUTOVER = { year: 2026, month: 4 } as const;

export function buildWhereClause(
  query: ReportQuery,
): Prisma.AlarmAnalysisWhereInput {
  const where: Prisma.AlarmAnalysisWhereInput = {};
  if (query.productId) where.productId = query.productId;
  if (query.dateFrom || query.dateTo) {
    where.analysisDate = {};
    if (query.dateFrom) where.analysisDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.analysisDate.lte = new Date(query.dateTo);
  }
  return where;
}
