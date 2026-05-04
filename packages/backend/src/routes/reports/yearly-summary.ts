import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, SystemComponent } from "@go-watchtower/database";
import { romeDateToISO } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ErrorResponseSchema,
  YearlySummaryQuerySchema,
  YearlySummaryResponseSchema,
  type YearlySummaryQuery,
} from "./schemas.js";
import { KPI_CUTOVER } from "./shared.js";

export async function registerYearlySummaryReportRoute(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Querystring: YearlySummaryQuery }>(
    "/reports/yearly-summary",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["reports"],
        summary:
          "Yearly summary — monthly production/total metrics across all products",
        security: [{ bearerAuth: [] }],
        querystring: YearlySummaryQuerySchema,
        response: {
          200: YearlySummaryResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { year, productId } = request.query;
        const yearStart = new Date(romeDateToISO(`${year}-01-01`));
        const yearEnd = new Date(romeDateToISO(`${year + 1}-01-01`));
        const expandedFrom = new Date(yearStart.getTime() - 4 * 86_400_000);
        const expandedTo = new Date(yearEnd.getTime() + 86_400_000);
        const cutoverUTC = new Date(romeDateToISO("2026-04-01"));
        const needsOldAnalysisLogic = year <= KPI_CUTOVER.year;
        const needsNewAnalysisLogic = year >= KPI_CUTOVER.year;
        const oldAnalysisEnd = year === KPI_CUTOVER.year ? cutoverUTC : yearEnd;
        const newAnalysisExpandedFrom =
          year === KPI_CUTOVER.year
            ? new Date(cutoverUTC.getTime() - 4 * 86_400_000)
            : expandedFrom;
        const cutoverMonthFilter =
          year === KPI_CUTOVER.year ? KPI_CUTOVER.month : 1;

        const prodEnvironments = await prisma.environment.findMany({
          where: { order: 0, ...(productId ? { productId } : {}) },
          select: { id: true },
        });
        const prodEnvIds = prodEnvironments.map((row) => row.id);
        const hasProdEnvs = prodEnvIds.length > 0;

        const [
          prodAlarmsByMonth,
          totalAlarmsByMonth,
          prodAnalysisOldRaw,
          totalAnalysisOldRaw,
          prodAnalysisNewRaw,
          totalAnalysisNewRaw,
        ] = await Promise.all([
          hasProdEnvs
            ? prisma.$queryRaw<
                Array<{
                  month: number;
                  total_events: number;
                  on_call_events: number;
                }>
              >`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    CASE
                      WHEN e.on_call_alarm_pattern IS NOT NULL
                        AND ae.name ~ e.on_call_alarm_pattern THEN true
                      ELSE false
                    END AS is_on_call
                  FROM alarm_events ae
                  JOIN environments e ON e.id = ae.environment_id
                  WHERE ae.environment_id IN (${Prisma.join(prodEnvIds)})
                    AND ae.fired_at >= ${expandedFrom} AND ae.fired_at < ${expandedTo}
                ),
                business_days AS (
                  SELECT
                    is_on_call,
                    CASE
                      WHEN is_on_call THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 5
                        AND EXTRACT(HOUR FROM rome_ts) < 18 THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 4
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '1 day'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 5
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '3 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 6 THEN rome_ts + INTERVAL '2 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 7 THEN rome_ts + INTERVAL '1 day'
                    END AS business_day
                  FROM rome_events
                )
                SELECT
                  EXTRACT(MONTH FROM business_day)::int AS month,
                  COUNT(*)::int AS total_events,
                  COUNT(*) FILTER (WHERE is_on_call)::int AS on_call_events
                FROM business_days
                WHERE EXTRACT(YEAR FROM business_day)::int = ${year}
                GROUP BY month
              `
            : Promise.resolve([]),

          productId
            ? prisma.$queryRaw<
                Array<{
                  month: number;
                  total_events: number;
                  on_call_events: number;
                }>
              >`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    CASE
                      WHEN e.on_call_alarm_pattern IS NOT NULL
                        AND ae.name ~ e.on_call_alarm_pattern THEN true
                      ELSE false
                    END AS is_on_call
                  FROM alarm_events ae
                  JOIN environments e ON e.id = ae.environment_id
                  WHERE ae.product_id = ${productId}
                    AND ae.fired_at >= ${expandedFrom} AND ae.fired_at < ${expandedTo}
                ),
                business_days AS (
                  SELECT
                    is_on_call,
                    CASE
                      WHEN is_on_call THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 5
                        AND EXTRACT(HOUR FROM rome_ts) < 18 THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 4
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '1 day'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 5
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '3 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 6 THEN rome_ts + INTERVAL '2 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 7 THEN rome_ts + INTERVAL '1 day'
                    END AS business_day
                  FROM rome_events
                )
                SELECT
                  EXTRACT(MONTH FROM business_day)::int AS month,
                  COUNT(*)::int AS total_events,
                  COUNT(*) FILTER (WHERE is_on_call)::int AS on_call_events
                FROM business_days
                WHERE EXTRACT(YEAR FROM business_day)::int = ${year}
                GROUP BY month
              `
            : prisma.$queryRaw<
                Array<{
                  month: number;
                  total_events: number;
                  on_call_events: number;
                }>
              >`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    CASE
                      WHEN e.on_call_alarm_pattern IS NOT NULL
                        AND ae.name ~ e.on_call_alarm_pattern THEN true
                      ELSE false
                    END AS is_on_call
                  FROM alarm_events ae
                  JOIN environments e ON e.id = ae.environment_id
                  WHERE ae.fired_at >= ${expandedFrom} AND ae.fired_at < ${expandedTo}
                ),
                business_days AS (
                  SELECT
                    is_on_call,
                    CASE
                      WHEN is_on_call THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 5
                        AND EXTRACT(HOUR FROM rome_ts) < 18 THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 4
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '1 day'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 5
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '3 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 6 THEN rome_ts + INTERVAL '2 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 7 THEN rome_ts + INTERVAL '1 day'
                    END AS business_day
                  FROM rome_events
                )
                SELECT
                  EXTRACT(MONTH FROM business_day)::int AS month,
                  COUNT(*)::int AS total_events,
                  COUNT(*) FILTER (WHERE is_on_call)::int AS on_call_events
                FROM business_days
                WHERE EXTRACT(YEAR FROM business_day)::int = ${year}
                GROUP BY month
              `,

          needsOldAnalysisLogic && hasProdEnvs
            ? prisma.$queryRaw<
                Array<{
                  month: number;
                  total_occurrences: bigint;
                  ignorable_occurrences: bigint;
                }>
              >`
                SELECT
                  EXTRACT(MONTH FROM analysis_date AT TIME ZONE 'Europe/Rome')::int AS month,
                  COALESCE(SUM(occurrences), 0)::bigint AS total_occurrences,
                  COALESCE(SUM(occurrences) FILTER (WHERE analysis_type = 'IGNORABLE'), 0)::bigint AS ignorable_occurrences
                FROM alarm_analyses
                WHERE environment_id IN (${Prisma.join(prodEnvIds)})
                  AND analysis_date >= ${yearStart} AND analysis_date < ${oldAnalysisEnd}
                  AND status = 'COMPLETED'
                GROUP BY month
              `
            : Promise.resolve([]),

          needsOldAnalysisLogic
            ? productId
              ? prisma.$queryRaw<
                  Array<{
                    month: number;
                    total_occurrences: bigint;
                    ignorable_occurrences: bigint;
                  }>
                >`
                  SELECT
                    EXTRACT(MONTH FROM analysis_date AT TIME ZONE 'Europe/Rome')::int AS month,
                    COALESCE(SUM(occurrences), 0)::bigint AS total_occurrences,
                    COALESCE(SUM(occurrences) FILTER (WHERE analysis_type = 'IGNORABLE'), 0)::bigint AS ignorable_occurrences
                  FROM alarm_analyses
                  WHERE product_id = ${productId}
                    AND analysis_date >= ${yearStart} AND analysis_date < ${oldAnalysisEnd}
                    AND status = 'COMPLETED'
                  GROUP BY month
                `
              : prisma.$queryRaw<
                  Array<{
                    month: number;
                    total_occurrences: bigint;
                    ignorable_occurrences: bigint;
                  }>
                >`
                  SELECT
                    EXTRACT(MONTH FROM analysis_date AT TIME ZONE 'Europe/Rome')::int AS month,
                    COALESCE(SUM(occurrences), 0)::bigint AS total_occurrences,
                    COALESCE(SUM(occurrences) FILTER (WHERE analysis_type = 'IGNORABLE'), 0)::bigint AS ignorable_occurrences
                  FROM alarm_analyses
                  WHERE analysis_date >= ${yearStart} AND analysis_date < ${oldAnalysisEnd}
                    AND status = 'COMPLETED'
                  GROUP BY month
                `
            : Promise.resolve([]),

          needsNewAnalysisLogic && hasProdEnvs
            ? prisma.$queryRaw<
                Array<{
                  month: number;
                  total_occurrences: bigint;
                  ignorable_occurrences: bigint;
                }>
              >`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    aa.analysis_type,
                    CASE
                      WHEN e.on_call_alarm_pattern IS NOT NULL
                        AND ae.name ~ e.on_call_alarm_pattern THEN true
                      ELSE false
                    END AS is_on_call
                  FROM alarm_events ae
                  JOIN environments e ON e.id = ae.environment_id
                  JOIN alarm_analyses aa ON aa.id = ae.analysis_id AND aa.status = 'COMPLETED'
                  WHERE ae.environment_id IN (${Prisma.join(prodEnvIds)})
                    AND ae.fired_at >= ${newAnalysisExpandedFrom} AND ae.fired_at < ${expandedTo}
                    AND ae.analysis_id IS NOT NULL
                ),
                business_days AS (
                  SELECT
                    analysis_type,
                    CASE
                      WHEN is_on_call THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 5
                        AND EXTRACT(HOUR FROM rome_ts) < 18 THEN rome_ts
                      WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 4
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '1 day'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 5
                        AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '3 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 6 THEN rome_ts + INTERVAL '2 days'
                      WHEN EXTRACT(ISODOW FROM rome_ts) = 7 THEN rome_ts + INTERVAL '1 day'
                    END AS business_day
                  FROM rome_events
                )
                SELECT
                  EXTRACT(MONTH FROM business_day)::int AS month,
                  COUNT(*)::bigint AS total_occurrences,
                  COUNT(*) FILTER (WHERE analysis_type = 'IGNORABLE')::bigint AS ignorable_occurrences
                FROM business_days
                WHERE EXTRACT(YEAR FROM business_day)::int = ${year}
                  AND EXTRACT(MONTH FROM business_day)::int >= ${cutoverMonthFilter}
                GROUP BY month
              `
            : Promise.resolve([]),

          needsNewAnalysisLogic
            ? productId
              ? prisma.$queryRaw<
                  Array<{
                    month: number;
                    total_occurrences: bigint;
                    ignorable_occurrences: bigint;
                  }>
                >`
                  WITH rome_events AS (
                    SELECT
                      ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                      aa.analysis_type,
                      CASE
                        WHEN e.on_call_alarm_pattern IS NOT NULL
                          AND ae.name ~ e.on_call_alarm_pattern THEN true
                        ELSE false
                      END AS is_on_call
                    FROM alarm_events ae
                    JOIN environments e ON e.id = ae.environment_id
                    JOIN alarm_analyses aa ON aa.id = ae.analysis_id AND aa.status = 'COMPLETED'
                    WHERE ae.product_id = ${productId}
                      AND ae.fired_at >= ${newAnalysisExpandedFrom} AND ae.fired_at < ${expandedTo}
                      AND ae.analysis_id IS NOT NULL
                  ),
                  business_days AS (
                    SELECT
                      analysis_type,
                      CASE
                        WHEN is_on_call THEN rome_ts
                        WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 5
                          AND EXTRACT(HOUR FROM rome_ts) < 18 THEN rome_ts
                        WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 4
                          AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '1 day'
                        WHEN EXTRACT(ISODOW FROM rome_ts) = 5
                          AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '3 days'
                        WHEN EXTRACT(ISODOW FROM rome_ts) = 6 THEN rome_ts + INTERVAL '2 days'
                        WHEN EXTRACT(ISODOW FROM rome_ts) = 7 THEN rome_ts + INTERVAL '1 day'
                      END AS business_day
                    FROM rome_events
                  )
                  SELECT
                    EXTRACT(MONTH FROM business_day)::int AS month,
                    COUNT(*)::bigint AS total_occurrences,
                    COUNT(*) FILTER (WHERE analysis_type = 'IGNORABLE')::bigint AS ignorable_occurrences
                  FROM business_days
                  WHERE EXTRACT(YEAR FROM business_day)::int = ${year}
                    AND EXTRACT(MONTH FROM business_day)::int >= ${cutoverMonthFilter}
                  GROUP BY month
                `
              : prisma.$queryRaw<
                  Array<{
                    month: number;
                    total_occurrences: bigint;
                    ignorable_occurrences: bigint;
                  }>
                >`
                  WITH rome_events AS (
                    SELECT
                      ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                      aa.analysis_type,
                      CASE
                        WHEN e.on_call_alarm_pattern IS NOT NULL
                          AND ae.name ~ e.on_call_alarm_pattern THEN true
                        ELSE false
                      END AS is_on_call
                    FROM alarm_events ae
                    JOIN environments e ON e.id = ae.environment_id
                    JOIN alarm_analyses aa ON aa.id = ae.analysis_id AND aa.status = 'COMPLETED'
                    WHERE ae.fired_at >= ${newAnalysisExpandedFrom} AND ae.fired_at < ${expandedTo}
                      AND ae.analysis_id IS NOT NULL
                  ),
                  business_days AS (
                    SELECT
                      analysis_type,
                      CASE
                        WHEN is_on_call THEN rome_ts
                        WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 5
                          AND EXTRACT(HOUR FROM rome_ts) < 18 THEN rome_ts
                        WHEN EXTRACT(ISODOW FROM rome_ts) BETWEEN 1 AND 4
                          AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '1 day'
                        WHEN EXTRACT(ISODOW FROM rome_ts) = 5
                          AND EXTRACT(HOUR FROM rome_ts) >= 18 THEN rome_ts + INTERVAL '3 days'
                        WHEN EXTRACT(ISODOW FROM rome_ts) = 6 THEN rome_ts + INTERVAL '2 days'
                        WHEN EXTRACT(ISODOW FROM rome_ts) = 7 THEN rome_ts + INTERVAL '1 day'
                      END AS business_day
                    FROM rome_events
                  )
                  SELECT
                    EXTRACT(MONTH FROM business_day)::int AS month,
                    COUNT(*)::bigint AS total_occurrences,
                    COUNT(*) FILTER (WHERE analysis_type = 'IGNORABLE')::bigint AS ignorable_occurrences
                  FROM business_days
                  WHERE EXTRACT(YEAR FROM business_day)::int = ${year}
                    AND EXTRACT(MONTH FROM business_day)::int >= ${cutoverMonthFilter}
                  GROUP BY month
                `
            : Promise.resolve([]),
        ]);

        const prodAnalysisRaw = [...prodAnalysisOldRaw, ...prodAnalysisNewRaw];
        const totalAnalysisRaw = [
          ...totalAnalysisOldRaw,
          ...totalAnalysisNewRaw,
        ];

        const prodAlarmByMonth = new Map<number, number>();
        const prodOnCallByMonth = new Map<number, number>();
        for (const row of prodAlarmsByMonth) {
          prodAlarmByMonth.set(row.month, row.total_events);
          prodOnCallByMonth.set(row.month, row.on_call_events);
        }

        const totalAlarmByMonth = new Map<number, number>();
        const totalOnCallByMonth = new Map<number, number>();
        for (const row of totalAlarmsByMonth) {
          totalAlarmByMonth.set(row.month, row.total_events);
          totalOnCallByMonth.set(row.month, row.on_call_events);
        }

        const prodAnalysisMap = new Map<number, number>();
        const prodIgnorableMap = new Map<number, number>();
        for (const row of prodAnalysisRaw) {
          prodAnalysisMap.set(row.month, Number(row.total_occurrences));
          prodIgnorableMap.set(row.month, Number(row.ignorable_occurrences));
        }

        const totalAnalysisMap = new Map<number, number>();
        const totalIgnorableMap = new Map<number, number>();
        for (const row of totalAnalysisRaw) {
          totalAnalysisMap.set(row.month, Number(row.total_occurrences));
          totalIgnorableMap.set(row.month, Number(row.ignorable_occurrences));
        }

        const months = Array.from({ length: 12 }, (_, index) => {
          const month = index + 1;
          const prodAlarmEvents = prodAlarmByMonth.get(month) ?? 0;
          const prodAnalysisOccurrences = prodAnalysisMap.get(month) ?? 0;
          const prodIgnorableOccurrences = prodIgnorableMap.get(month) ?? 0;
          const totalAnalysisOccurrences = totalAnalysisMap.get(month) ?? 0;
          const totalIgnorableOccurrences = totalIgnorableMap.get(month) ?? 0;
          const totalAlarmEvents = totalAlarmByMonth.get(month) ?? 0;
          const totalOnCallAlarmEvents = totalOnCallByMonth.get(month) ?? 0;
          const prodOnCallAlarmEvents = prodOnCallByMonth.get(month) ?? 0;

          return {
            month,
            prodAlarmEvents,
            prodAnalysisOccurrences,
            prodIgnorableOccurrences,
            prodOnCallAlarmEvents,
            prodIgnorablePercent:
              prodAnalysisOccurrences > 0
                ? Math.round(
                    (prodIgnorableOccurrences / prodAnalysisOccurrences) * 10000,
                  ) / 100
                : 0,
            prodCoveragePercent:
              prodAlarmEvents > 0
                ? Math.round(
                    (prodAnalysisOccurrences / prodAlarmEvents) * 10000,
                  ) / 100
                : 0,
            totalAlarmEvents,
            totalAnalysisOccurrences,
            totalIgnorableOccurrences,
            totalOnCallAlarmEvents,
            totalIgnorablePercent:
              totalAnalysisOccurrences > 0
                ? Math.round(
                    (totalIgnorableOccurrences / totalAnalysisOccurrences) *
                      10000,
                  ) / 100
                : 0,
            totalCoveragePercent:
              totalAlarmEvents > 0
                ? Math.round(
                    (totalAnalysisOccurrences / totalAlarmEvents) * 10000,
                  ) / 100
                : 0,
          };
        });

        reply.send({ year, months });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate yearly summary report";
        HttpError.internal(reply, message);
      }
    },
  );
}
