import type { FastifyInstance } from "fastify";
import { registerAlarmRankingReportRoute } from "./alarm-ranking.js";
import { registerDailyActivityReportRoute } from "./daily-activity.js";
import { registerMonthlyKpiReportRoute } from "./monthly-kpi.js";
import { registerMttaTrendReportRoute } from "./mtta-trend.js";
import { registerOperatorWorkloadReportRoute } from "./operator-workload.js";
import { registerYearlySummaryReportRoute } from "./yearly-summary.js";

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  await registerOperatorWorkloadReportRoute(fastify);
  await registerAlarmRankingReportRoute(fastify);
  await registerMonthlyKpiReportRoute(fastify);
  await registerYearlySummaryReportRoute(fastify);
  await registerMttaTrendReportRoute(fastify);
  await registerDailyActivityReportRoute(fastify);
}
