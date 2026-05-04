import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ErrorResponseSchema,
  MonthlyKpiQuerySchema,
  MonthlyKpiResponseSchema,
  type MonthlyKpiQuery,
} from "./schemas.js";
import { KPI_CUTOVER } from "./shared.js";

export async function registerMonthlyKpiReportRoute(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Querystring: MonthlyKpiQuery }>(
    "/reports/monthly-kpi",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["reports"],
        summary:
          "Monthly KPI report — daily alarm events, completed and ignored analyses per environment",
        security: [{ bearerAuth: [] }],
        querystring: MonthlyKpiQuerySchema,
        response: {
          200: MonthlyKpiResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId, year, month } = request.query;

        const dateFrom = new Date(Date.UTC(year, month - 1, 1));
        const dateTo = new Date(Date.UTC(year, month, 1));
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const expandedFrom = new Date(dateFrom.getTime() - 4 * 86_400_000);
        const expandedTo = new Date(dateTo.getTime() + 86_400_000);
        const useAlarmDateAttribution =
          year > KPI_CUTOVER.year ||
          (year === KPI_CUTOVER.year && month >= KPI_CUTOVER.month);

        const [alarmEventCountsRaw, environments, analysisRaw] =
          await Promise.all([
            prisma.$queryRaw<
              Array<{
                environment_id: string;
                day: number;
                alarm_events: bigint;
                completed: bigint;
                ignored: bigint;
              }>
            >`
              WITH rome_events AS (
                SELECT
                  ae.environment_id,
                  ae.name,
                  (ae.fired_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome' AS rome_ts,
                  CASE
                    WHEN e.on_call_alarm_pattern IS NOT NULL
                      AND ae.name ~ e.on_call_alarm_pattern THEN true
                    ELSE false
                  END AS is_on_call,
                  aa.status AS analysis_status,
                  aa.analysis_type
                FROM alarm_events ae
                JOIN environments e ON e.id = ae.environment_id
                LEFT JOIN alarm_analyses aa ON aa.id = ae.analysis_id
                WHERE ae.product_id = ${productId}
                  AND ae.fired_at >= ${expandedFrom} AND ae.fired_at < ${expandedTo}
              ),
              business_days AS (
                SELECT
                  environment_id,
                  analysis_status,
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
                environment_id,
                EXTRACT(DAY FROM business_day)::int AS day,
                COUNT(*)::bigint AS alarm_events,
                COUNT(*) FILTER (
                  WHERE analysis_status = 'COMPLETED' AND analysis_type = 'ANALYZABLE'
                )::bigint AS completed,
                COUNT(*) FILTER (
                  WHERE analysis_status = 'COMPLETED' AND analysis_type = 'IGNORABLE'
                )::bigint AS ignored
              FROM business_days
              WHERE EXTRACT(YEAR FROM business_day)::int = ${year}
                AND EXTRACT(MONTH FROM business_day)::int = ${month}
              GROUP BY environment_id, day
            `,

            prisma.environment.findMany({
              where: { productId },
              select: { id: true, name: true },
              orderBy: [{ order: "asc" }, { name: "asc" }],
            }),

            useAlarmDateAttribution
              ? Promise.resolve(
                  [] as Array<{
                    environment_id: string;
                    day: number;
                    completed: bigint;
                    ignored: bigint;
                  }>,
                )
              : prisma.$queryRaw<
                  Array<{
                    environment_id: string;
                    day: number;
                    completed: bigint;
                    ignored: bigint;
                  }>
                >`
                  SELECT
                    environment_id,
                    EXTRACT(DAY FROM ((analysis_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome'))::int AS day,
                    COALESCE(SUM(occurrences) FILTER (
                      WHERE status = 'COMPLETED' AND analysis_type = 'ANALYZABLE'
                    ), 0)::bigint AS completed,
                    COALESCE(SUM(occurrences) FILTER (
                      WHERE status = 'COMPLETED' AND analysis_type = 'IGNORABLE'
                    ), 0)::bigint AS ignored
                  FROM alarm_analyses
                  WHERE product_id = ${productId}
                    AND analysis_date >= ${dateFrom} AND analysis_date < ${dateTo}
                    AND status = 'COMPLETED'
                  GROUP BY environment_id, day
                `,
          ]);

        type DayCounts = Record<string, number>;
        const envData = new Map<
          string,
          {
            alarmEvents: DayCounts;
            completedAnalyses: DayCounts;
            ignoredAnalyses: DayCounts;
          }
        >();

        const ensure = (envId: string) => {
          if (!envData.has(envId)) {
            envData.set(envId, {
              alarmEvents: {},
              completedAnalyses: {},
              ignoredAnalyses: {},
            });
          }
          return envData.get(envId)!;
        };

        for (const row of alarmEventCountsRaw) {
          const bucket = ensure(row.environment_id);
          const dayKey = String(row.day);
          const alarmEvents = Number(row.alarm_events);
          if (alarmEvents > 0) {
            bucket.alarmEvents[dayKey] = alarmEvents;
          }

          if (useAlarmDateAttribution) {
            const completed = Number(row.completed);
            const ignored = Number(row.ignored);
            if (completed > 0) bucket.completedAnalyses[dayKey] = completed;
            if (ignored > 0) bucket.ignoredAnalyses[dayKey] = ignored;
          }
        }

        if (!useAlarmDateAttribution) {
          for (const row of analysisRaw) {
            const bucket = ensure(row.environment_id);
            const completed = Number(row.completed);
            const ignored = Number(row.ignored);
            if (completed > 0) bucket.completedAnalyses[String(row.day)] = completed;
            if (ignored > 0) bucket.ignoredAnalyses[String(row.day)] = ignored;
          }
        }

        reply.send({
          year,
          month,
          daysInMonth,
          environments: environments.map((env) => {
            const data = envData.get(env.id) ?? {
              alarmEvents: {},
              completedAnalyses: {},
              ignoredAnalyses: {},
            };
            return {
              environmentId: env.id,
              environmentName: env.name,
              alarmEvents: data.alarmEvents,
              completedAnalyses: data.completedAnalyses,
              ignoredAnalyses: data.ignoredAnalyses,
            };
          }),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate monthly KPI report";
        HttpError.internal(reply, message);
      }
    },
  );
}
