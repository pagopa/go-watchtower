import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, SystemComponent } from "@go-watchtower/database";
import { assignAlarmBusinessDay, romeDateToISO } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ReportQuerySchema,
  OperatorWorkloadResponseSchema,
  AlarmRankingResponseSchema,
  MonthlyKpiQuerySchema,
  MonthlyKpiResponseSchema,
  YearlySummaryQuerySchema,
  YearlySummaryResponseSchema,
  MttaTrendQuerySchema,
  MttaTrendResponseSchema,
  DailyActivityQuerySchema,
  DailyActivityResponseSchema,
  ErrorResponseSchema,
  type ReportQuery,
  type MonthlyKpiQuery,
  type YearlySummaryQuery,
  type MttaTrendQuery,
  type DailyActivityQuery,
} from "./schemas.js";

// ── KPI cutover: from April 2026, analyses are attributed to the
// business day of first_alarm_at rather than analysis_date.
const KPI_CUTOVER = { year: 2026, month: 4 } as const;

function buildWhereClause(query: ReportQuery): Prisma.AlarmAnalysisWhereInput {
  const where: Prisma.AlarmAnalysisWhereInput = {};
  if (query.productId) where.productId = query.productId;
  if (query.dateFrom || query.dateTo) {
    where.analysisDate = {};
    if (query.dateFrom) where.analysisDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.analysisDate.lte = new Date(query.dateTo);
  }
  return where;
}

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // ============================================================================
  // OPERATOR WORKLOAD REPORT
  // ============================================================================

  app.get<{ Querystring: ReportQuery }>(
    "/reports/operator-workload",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS, "read")],
      schema: {
        tags: ["reports"],
        summary: "Operator workload report with MTTA and environment breakdown",
        security: [{ bearerAuth: [] }],
        querystring: ReportQuerySchema,
        response: {
          200: OperatorWorkloadResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const where = buildWhereClause(request.query);

        // Build SQL params for MTTA queries
        const { productId, dateFrom, dateTo } = request.query;
        const sqlParams: unknown[] = [];
        const conditions: string[] = ["first_alarm_at IS NOT NULL"];
        let paramIdx = 1;

        if (productId) {
          conditions.push(`product_id = $${paramIdx++}`);
          sqlParams.push(productId);
        }
        if (dateFrom) {
          conditions.push(`analysis_date >= $${paramIdx++}`);
          sqlParams.push(new Date(dateFrom));
        }
        if (dateTo) {
          conditions.push(`analysis_date <= $${paramIdx++}`);
          sqlParams.push(new Date(dateTo));
        }

        const whereSQL = conditions.join(" AND ");

        // All 6 aggregation queries are independent — run in parallel
        const [
          byOperator,
          byOperatorOnCall,
          byOperatorEnv,
          byOperatorEnvOnCall,
          mttaByOperator,
          mttaByOperatorEnv,
        ] = await Promise.all([
          prisma.alarmAnalysis.groupBy({
            by: ["operatorId"],
            where,
            _count: { id: true },
            _sum: { occurrences: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["operatorId", "isOnCall"],
            where,
            _count: { id: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["operatorId", "environmentId"],
            where,
            _count: { id: true },
            _sum: { occurrences: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["operatorId", "environmentId", "isOnCall"],
            where,
            _count: { id: true },
          }),
          prisma.$queryRawUnsafe<
            Array<{ operator_id: string; mtta_ms: number | null }>
          >(
            `SELECT operator_id, AVG(EXTRACT(EPOCH FROM (analysis_date - first_alarm_at)) * 1000) as mtta_ms
             FROM alarm_analyses
             WHERE ${whereSQL}
             GROUP BY operator_id`,
            ...sqlParams
          ),
          prisma.$queryRawUnsafe<
            Array<{ operator_id: string; environment_id: string; mtta_ms: number | null }>
          >(
            `SELECT operator_id, environment_id, AVG(EXTRACT(EPOCH FROM (analysis_date - first_alarm_at)) * 1000) as mtta_ms
             FROM alarm_analyses
             WHERE ${whereSQL}
             GROUP BY operator_id, environment_id`,
            ...sqlParams
          ),
        ]);

        if (byOperator.length === 0) {
          return reply.send([]);
        }

        // Name resolution — depends on aggregation results, parallelized between them
        const operatorIds = byOperator.map((r: { operatorId: string }) => r.operatorId);
        const envIds = [...new Set(byOperatorEnv.map((r: { environmentId: string }) => r.environmentId))];

        const [operators, environments] = await Promise.all([
          prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: { id: true, name: true, email: true },
          }),
          envIds.length > 0
            ? prisma.environment.findMany({
                where: { id: { in: envIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
        ]);

        const opMap = new Map<string, { id: string; name: string; email: string }>(operators.map((o: { id: string; name: string; email: string }) => [o.id, o]));
        const envMap = new Map(environments.map((e: { id: string; name: string }) => [e.id, e.name]));

        // Build lookup maps
        const onCallMap = new Map<string, number>();
        for (const r of byOperatorOnCall) {
          if (r.isOnCall) {
            onCallMap.set(r.operatorId, r._count.id);
          }
        }

        const mttaMap = new Map<string, number | null>();
        for (const r of mttaByOperator) {
          mttaMap.set(r.operator_id, r.mtta_ms != null ? Number(r.mtta_ms) : null);
        }

        const envOnCallMap = new Map<string, number>();
        for (const r of byOperatorEnvOnCall) {
          if (r.isOnCall) {
            envOnCallMap.set(`${r.operatorId}:${r.environmentId}`, r._count.id);
          }
        }

        const envMttaMap = new Map<string, number | null>();
        for (const r of mttaByOperatorEnv) {
          envMttaMap.set(
            `${r.operator_id}:${r.environment_id}`,
            r.mtta_ms != null ? Number(r.mtta_ms) : null
          );
        }

        // Assemble response
        const result = byOperator
          .map((r: { operatorId: string; _count: { id: number }; _sum: { occurrences: number | null } }) => {
            const op = opMap.get(r.operatorId);
            const envEntries = byOperatorEnv.filter((e: { operatorId: string }) => e.operatorId === r.operatorId);

            return {
              operatorId: r.operatorId,
              operatorName: op?.name || "Unknown",
              operatorEmail: op?.email || "",
              totalAnalyses: r._count.id,
              onCallAnalyses: onCallMap.get(r.operatorId) || 0,
              totalOccurrences: r._sum.occurrences || 0,
              mttaMs: mttaMap.get(r.operatorId) ?? null,
              byEnvironment: envEntries.map((e: { environmentId: string; _count: { id: number }; _sum: { occurrences: number | null } }) => ({
                environmentId: e.environmentId,
                environmentName: envMap.get(e.environmentId) || "Unknown",
                count: e._count.id,
                onCallCount: envOnCallMap.get(`${r.operatorId}:${e.environmentId}`) || 0,
                occurrences: e._sum.occurrences || 0,
                mttaMs: envMttaMap.get(`${r.operatorId}:${e.environmentId}`) ?? null,
              })),
            };
          })
          .sort((a: { totalAnalyses: number }, b: { totalAnalyses: number }) => b.totalAnalyses - a.totalAnalyses);

        reply.send(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate operator workload report";
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // ALARM RANKING REPORT
  // ============================================================================

  app.get<{ Querystring: ReportQuery }>(
    "/reports/alarm-ranking",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS, "read")],
      schema: {
        tags: ["reports"],
        summary: "Alarm ranking by total occurrences",
        security: [{ bearerAuth: [] }],
        querystring: ReportQuerySchema,
        response: {
          200: AlarmRankingResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const where = buildWhereClause(request.query);

        // 1. Group by alarmId: count + sum occurrences
        const byAlarm = await prisma.alarmAnalysis.groupBy({
          by: ["alarmId"],
          where,
          _count: { id: true },
          _sum: { occurrences: true },
        });

        if (byAlarm.length === 0) {
          return reply.send([]);
        }

        // 2. Resolve alarm names with product info
        const alarmIds = byAlarm.map((r: { alarmId: string }) => r.alarmId);
        const alarms = await prisma.alarm.findMany({
          where: { id: { in: alarmIds } },
          select: {
            id: true,
            name: true,
            product: { select: { id: true, name: true } },
          },
        });
        const alarmMap = new Map<string, { id: string; name: string; product: { id: string; name: string } }>(alarms.map((a: { id: string; name: string; product: { id: string; name: string } }) => [a.id, a]));

        // 3. Assemble and sort by totalOccurrences DESC
        const result = byAlarm
          .map((r: { alarmId: string; _count: { id: number }; _sum: { occurrences: number | null } }) => {
            const alarm = alarmMap.get(r.alarmId);
            return {
              alarmId: r.alarmId,
              alarmName: alarm?.name || "Unknown",
              productId: alarm?.product.id || "",
              productName: alarm?.product.name || "Unknown",
              totalAnalyses: r._count.id,
              totalOccurrences: r._sum.occurrences || 0,
            };
          })
          .sort((a: { totalOccurrences: number }, b: { totalOccurrences: number }) => b.totalOccurrences - a.totalOccurrences);

        reply.send(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate alarm ranking report";
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // MONTHLY KPI REPORT
  // ============================================================================

  app.get<{ Querystring: MonthlyKpiQuery }>(
    "/reports/monthly-kpi",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS, "read")],
      schema: {
        tags: ["reports"],
        summary: "Monthly KPI report — daily alarm events, completed and ignored analyses per environment",
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
        const dateTo = new Date(Date.UTC(year, month, 1)); // exclusive upper bound
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

        // Expanded range for alarm events: business-day shift can move a
        // normal Fri ≥18:00 alarm to Monday (+3 days), and Rome/UTC offset
        // can add up to 1 day. Pad 4 days before, 1 day after.
        const expandedFrom = new Date(dateFrom.getTime() - 4 * 86_400_000);
        const expandedTo = new Date(dateTo.getTime() + 86_400_000);

        // After cutover: attribute analyses to the business day of first_alarm_at
        // rather than analysis_date, so events and analyses align on the same day.
        const useAlarmDateAttribution = year > KPI_CUTOVER.year ||
          (year === KPI_CUTOVER.year && month >= KPI_CUTOVER.month);

        // ── Parallel queries ─────────────────────────────────────────────────
        //
        // 1. Raw alarm events (+ linked analysis info for post-cutover counting)
        // 2. Environments
        // 3. Analyses by analysis_date (only before cutover)

        const [alarmEventsRaw, environments, analysisRaw] = await Promise.all([
          // ── 1. Raw alarm events in expanded range ─────────────────────────
          prisma.alarmEvent.findMany({
            where: {
              productId,
              firedAt: { gte: expandedFrom, lt: expandedTo },
            },
            select: {
              name: true, environmentId: true, firedAt: true,
              priority: { select: { countsAsOnCall: true } },
              analysis: { select: { status: true, analysisType: true } },
            },
          }),

          // ── 2. Environments ────────────────────────────────────────────────
          prisma.environment.findMany({
            where: { productId },
            select: { id: true, name: true },
            orderBy: [{ order: "asc" }, { name: "asc" }],
          }),

          // ── 3. Analyses by analysis_date (before cutover only) ────────────
          useAlarmDateAttribution
            ? Promise.resolve([])
            : prisma.$queryRaw<Array<{ environment_id: string; day: number; completed: bigint; ignored: bigint }>>`
                SELECT
                  environment_id,
                  EXTRACT(DAY FROM analysis_date AT TIME ZONE 'Europe/Rome')::int AS day,
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

        // ── Assign each alarm event to its business day ─────────────────────
        // Uses assignAlarmBusinessDay from @go-watchtower/shared (Intl-based,
        // gestisce DST correttamente).
        type DayCounts = Record<string, number>;
        const envData = new Map<string, { alarmEvents: DayCounts; completedAnalyses: DayCounts; ignoredAnalyses: DayCounts }>();

        const ensure = (envId: string) => {
          if (!envData.has(envId)) {
            envData.set(envId, { alarmEvents: {}, completedAnalyses: {}, ignoredAnalyses: {} });
          }
          return envData.get(envId)!;
        };

        for (const ev of alarmEventsRaw) {
          const assigned = assignAlarmBusinessDay(ev.firedAt, ev.priority.countsAsOnCall, 'Europe/Rome');

          // Skip events whose business day falls outside the target month
          if (assigned.year !== year || assigned.month !== month) continue;

          const dayKey = String(assigned.day);
          const bucket = ensure(ev.environmentId);
          bucket.alarmEvents[dayKey] = (bucket.alarmEvents[dayKey] ?? 0) + 1;

          // After cutover: if this alarm event is linked to a completed analysis,
          // count it as resolved on the same business day as the event itself.
          if (useAlarmDateAttribution && ev.analysis?.status === 'COMPLETED') {
            if (ev.analysis.analysisType === 'ANALYZABLE') {
              bucket.completedAnalyses[dayKey] = (bucket.completedAnalyses[dayKey] ?? 0) + 1;
            } else if (ev.analysis.analysisType === 'IGNORABLE') {
              bucket.ignoredAnalyses[dayKey] = (bucket.ignoredAnalyses[dayKey] ?? 0) + 1;
            }
          }
        }

        // ── Populate analysis counts (before cutover: from analysis_date query)
        if (!useAlarmDateAttribution) {
          for (const r of analysisRaw) {
            const env = ensure(r.environment_id);
            const completed = Number(r.completed);
            const ignored = Number(r.ignored);
            if (completed > 0) env.completedAnalyses[String(r.day)] = completed;
            if (ignored > 0) env.ignoredAnalyses[String(r.day)] = ignored;
          }
        }

        const result = environments.map((env) => {
          const data = envData.get(env.id) ?? { alarmEvents: {}, completedAnalyses: {}, ignoredAnalyses: {} };
          return {
            environmentId: env.id,
            environmentName: env.name,
            alarmEvents: data.alarmEvents,
            completedAnalyses: data.completedAnalyses,
            ignoredAnalyses: data.ignoredAnalyses,
          };
        });

        reply.send({ year, month, daysInMonth, environments: result });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate monthly KPI report";
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // YEARLY SUMMARY REPORT
  // ============================================================================

  app.get<{ Querystring: YearlySummaryQuery }>(
    "/reports/yearly-summary",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS, "read")],
      schema: {
        tags: ["reports"],
        summary: "Yearly summary — monthly production/total metrics across all products",
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

        // Rome midnight → UTC (handles CET/CEST correctly)
        const yearStart = new Date(romeDateToISO(`${year}-01-01`));
        const yearEnd = new Date(romeDateToISO(`${year + 1}-01-01`));

        // Expanded range for alarm events: business-day shift can move events across month boundaries
        const expandedFrom = new Date(yearStart.getTime() - 4 * 86_400_000);
        const expandedTo = new Date(yearEnd.getTime() + 86_400_000);

        // Analysis attribution cutover: analysis_date before April 2026,
        // first_alarm_at business day from April 2026 onwards.
        const cutoverUTC = new Date(romeDateToISO('2026-04-01'));
        const needsOldAnalysisLogic = year <= KPI_CUTOVER.year;
        const needsNewAnalysisLogic = year >= KPI_CUTOVER.year;
        const oldAnalysisEnd = year === KPI_CUTOVER.year ? cutoverUTC : yearEnd;
        const newAnalysisExpandedFrom = year === KPI_CUTOVER.year
          ? new Date(cutoverUTC.getTime() - 4 * 86_400_000)
          : expandedFrom;
        // For cutover year, new logic only covers months >= 4; for later years, all months.
        const cutoverMonthFilter = year === KPI_CUTOVER.year ? KPI_CUTOVER.month : 1;

        // ── 1. Production environments (order = 0), optionally scoped by product ──
        const prodEnvironments = await prisma.environment.findMany({
          where: { order: 0, ...(productId ? { productId } : {}) },
          select: { id: true },
        });

        const prodEnvIds = prodEnvironments.map((e) => e.id);
        const hasProdEnvs = prodEnvIds.length > 0;

        // ── 2. Parallel queries ──────────────────────────────────────────────
        const [prodAlarmsByMonth, totalAlarmsByMonth, prodAnalysisOldRaw, totalAnalysisOldRaw, prodAnalysisNewRaw, totalAnalysisNewRaw] = await Promise.all([
          // Alarm events: business-day assignment + aggregation fully in SQL
          // Replicates assignAlarmBusinessDay logic: on-call → calendar day,
          // normal Mon–Fri <18:00 → same day, Mon–Thu ≥18 → +1, Fri ≥18 → +3,
          // Sat → +2, Sun → +1. On-call detection via environment regex pattern.
          hasProdEnvs
            ? prisma.$queryRaw<Array<{ month: number; total_events: number; on_call_events: number }>>`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    pl.counts_as_on_call AS is_on_call
                  FROM alarm_events ae
                  JOIN priority_levels pl ON pl.code = ae.priority_code
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

          // Total alarm events (all environments): same business-day logic, with on-call breakdown
          productId
            ? prisma.$queryRaw<Array<{ month: number; total_events: number; on_call_events: number }>>`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    pl.counts_as_on_call AS is_on_call
                  FROM alarm_events ae
                  JOIN priority_levels pl ON pl.code = ae.priority_code
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
            : prisma.$queryRaw<Array<{ month: number; total_events: number; on_call_events: number }>>`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    pl.counts_as_on_call AS is_on_call
                  FROM alarm_events ae
                  JOIN priority_levels pl ON pl.code = ae.priority_code
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

          // ── Old logic: analysis_date based (before cutover) ─────────────────
          (needsOldAnalysisLogic && hasProdEnvs)
            ? prisma.$queryRaw<Array<{ month: number; total_occurrences: bigint; ignorable_occurrences: bigint }>>`
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
            ? (productId
                ? prisma.$queryRaw<Array<{ month: number; total_occurrences: bigint; ignorable_occurrences: bigint }>>`
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
                : prisma.$queryRaw<Array<{ month: number; total_occurrences: bigint; ignorable_occurrences: bigint }>>`
                    SELECT
                      EXTRACT(MONTH FROM analysis_date AT TIME ZONE 'Europe/Rome')::int AS month,
                      COALESCE(SUM(occurrences), 0)::bigint AS total_occurrences,
                      COALESCE(SUM(occurrences) FILTER (WHERE analysis_type = 'IGNORABLE'), 0)::bigint AS ignorable_occurrences
                    FROM alarm_analyses
                    WHERE analysis_date >= ${yearStart} AND analysis_date < ${oldAnalysisEnd}
                      AND status = 'COMPLETED'
                    GROUP BY month
                  `)
            : Promise.resolve([]),

          // ── New logic: alarm events linked to completed analyses (from cutover)
          // Counts alarm events (by business day) that have a linked completed
          // analysis, split by analysis_type. Uses INNER JOIN so only resolved
          // events are counted.
          (needsNewAnalysisLogic && hasProdEnvs)
            ? prisma.$queryRaw<Array<{ month: number; total_occurrences: bigint; ignorable_occurrences: bigint }>>`
                WITH rome_events AS (
                  SELECT
                    ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                    aa.analysis_type,
                    pl.counts_as_on_call AS is_on_call
                  FROM alarm_events ae
                  JOIN priority_levels pl ON pl.code = ae.priority_code
                  JOIN alarm_analyses aa ON aa.id = ae.analysis_id AND aa.status = 'COMPLETED'
                  WHERE ae.environment_id IN (${Prisma.join(prodEnvIds)})
                    AND ae.fired_at >= ${newAnalysisExpandedFrom} AND ae.fired_at < ${expandedTo}
                    AND ae.analysis_id IS NOT NULL
                ),
                business_days AS (
                  SELECT analysis_type,
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
            ? (productId
                ? prisma.$queryRaw<Array<{ month: number; total_occurrences: bigint; ignorable_occurrences: bigint }>>`
                    WITH rome_events AS (
                      SELECT
                        ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                        aa.analysis_type,
                        pl.counts_as_on_call AS is_on_call
                      FROM alarm_events ae
                      JOIN priority_levels pl ON pl.code = ae.priority_code
                      JOIN alarm_analyses aa ON aa.id = ae.analysis_id AND aa.status = 'COMPLETED'
                      WHERE ae.product_id = ${productId}
                        AND ae.fired_at >= ${newAnalysisExpandedFrom} AND ae.fired_at < ${expandedTo}
                        AND ae.analysis_id IS NOT NULL
                    ),
                    business_days AS (
                      SELECT analysis_type,
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
                : prisma.$queryRaw<Array<{ month: number; total_occurrences: bigint; ignorable_occurrences: bigint }>>`
                    WITH rome_events AS (
                      SELECT
                        ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts,
                        aa.analysis_type,
                        pl.counts_as_on_call AS is_on_call
                      FROM alarm_events ae
                      JOIN priority_levels pl ON pl.code = ae.priority_code
                      JOIN alarm_analyses aa ON aa.id = ae.analysis_id AND aa.status = 'COMPLETED'
                      WHERE ae.fired_at >= ${newAnalysisExpandedFrom} AND ae.fired_at < ${expandedTo}
                        AND ae.analysis_id IS NOT NULL
                    ),
                    business_days AS (
                      SELECT analysis_type,
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
                  `)
            : Promise.resolve([]),
        ]);

        // Merge old + new analysis results
        const prodAnalysisRaw = [...prodAnalysisOldRaw, ...prodAnalysisNewRaw];
        const totalAnalysisRaw = [...totalAnalysisOldRaw, ...totalAnalysisNewRaw];

        // ── 3. Lookup maps ──────────────────────────────────────────────────
        const prodAlarmByMonth = new Map<number, number>();
        const prodOnCallByMonth = new Map<number, number>();
        for (const r of prodAlarmsByMonth) {
          prodAlarmByMonth.set(r.month, r.total_events);
          prodOnCallByMonth.set(r.month, r.on_call_events);
        }

        const totalAlarmByMonth = new Map<number, number>();
        const totalOnCallByMonth = new Map<number, number>();
        for (const r of totalAlarmsByMonth) {
          totalAlarmByMonth.set(r.month, r.total_events);
          totalOnCallByMonth.set(r.month, r.on_call_events);
        }

        const prodAnalysisMap = new Map<number, number>();
        const prodIgnorableMap = new Map<number, number>();
        for (const r of prodAnalysisRaw) {
          prodAnalysisMap.set(r.month, Number(r.total_occurrences));
          prodIgnorableMap.set(r.month, Number(r.ignorable_occurrences));
        }

        const totalAnalysisMap = new Map<number, number>();
        const totalIgnorableMap = new Map<number, number>();
        for (const r of totalAnalysisRaw) {
          totalAnalysisMap.set(r.month, Number(r.total_occurrences));
          totalIgnorableMap.set(r.month, Number(r.ignorable_occurrences));
        }

        // ── 5. Build response ────────────────────────────────────────────────
        const months = Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const prodAlarms = prodAlarmByMonth.get(m) ?? 0;
          const prodAnalyses = prodAnalysisMap.get(m) ?? 0;
          const prodIgnorable = prodIgnorableMap.get(m) ?? 0;
          const totalAnalyses = totalAnalysisMap.get(m) ?? 0;
          const totalIgnorable = totalIgnorableMap.get(m) ?? 0;
          const totalAlarms = totalAlarmByMonth.get(m) ?? 0;
          const totalOnCall = totalOnCallByMonth.get(m) ?? 0;
          const prodOnCall = prodOnCallByMonth.get(m) ?? 0;

          return {
            month: m,
            prodAlarmEvents: prodAlarms,
            prodAnalysisOccurrences: prodAnalyses,
            prodIgnorableOccurrences: prodIgnorable,
            prodOnCallAlarmEvents: prodOnCall,
            prodIgnorablePercent:
              prodAnalyses > 0 ? Math.round((prodIgnorable / prodAnalyses) * 10000) / 100 : 0,
            prodCoveragePercent:
              prodAlarms > 0 ? Math.round((prodAnalyses / prodAlarms) * 10000) / 100 : 0,
            totalAlarmEvents: totalAlarms,
            totalAnalysisOccurrences: totalAnalyses,
            totalIgnorableOccurrences: totalIgnorable,
            totalOnCallAlarmEvents: totalOnCall,
            totalIgnorablePercent:
              totalAnalyses > 0 ? Math.round((totalIgnorable / totalAnalyses) * 10000) / 100 : 0,
            totalCoveragePercent:
              totalAlarms > 0 ? Math.round((totalAnalyses / totalAlarms) * 10000) / 100 : 0,
          };
        });

        reply.send({ year, months });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate yearly summary report";
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // MTTA TREND REPORT
  // ============================================================================

  app.get<{ Querystring: MttaTrendQuery }>(
    "/reports/mtta-trend",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS, "read")],
      schema: {
        tags: ["reports"],
        summary: "MTTA trend over time — average and median per period",
        security: [{ bearerAuth: [] }],
        querystring: MttaTrendQuerySchema,
        response: {
          200: MttaTrendResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId, dateFrom, dateTo, granularity = "weekly" } = request.query;

        const truncFn = granularity === "monthly"
          ? "DATE_TRUNC('month', linked_at)"
          : "DATE_TRUNC('week', linked_at)";

        const conditions: string[] = ["linked_at IS NOT NULL"];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (productId) {
          conditions.push(`product_id = $${paramIdx++}`);
          params.push(productId);
        }
        if (dateFrom) {
          conditions.push(`linked_at >= $${paramIdx++}`);
          params.push(new Date(dateFrom));
        }
        if (dateTo) {
          conditions.push(`linked_at <= $${paramIdx++}`);
          params.push(new Date(dateTo));
        }

        const whereSQL = conditions.join(" AND ");

        const rows = await prisma.$queryRawUnsafe<
          Array<{
            period: Date;
            avg_mtta_ms: number | null;
            median_mtta_ms: number | null;
            avg_mttr_ms: number | null;
            median_mttr_ms: number | null;
            event_count: bigint;
            resolved_count: bigint;
          }>
        >(
          `SELECT
             ${truncFn} AS period,
             AVG(EXTRACT(EPOCH FROM (linked_at - fired_at)) * 1000) AS avg_mtta_ms,
             PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (linked_at - fired_at)) * 1000
             ) AS median_mtta_ms,
             AVG(EXTRACT(EPOCH FROM (resolved_at - fired_at)) * 1000)
               FILTER (WHERE resolved_at IS NOT NULL) AS avg_mttr_ms,
             PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (resolved_at - fired_at)) * 1000
             ) FILTER (WHERE resolved_at IS NOT NULL) AS median_mttr_ms,
             COUNT(*)::bigint AS event_count,
             COUNT(resolved_at)::bigint AS resolved_count
           FROM alarm_events
           WHERE ${whereSQL}
           GROUP BY ${truncFn}
           ORDER BY period`,
          ...params
        );

        const result = rows.map((r) => ({
          period: r.period.toISOString().split("T")[0],
          avgMttaMs: r.avg_mtta_ms != null ? Number(r.avg_mtta_ms) : null,
          medianMttaMs: r.median_mtta_ms != null ? Number(r.median_mtta_ms) : null,
          avgMttrMs: r.avg_mttr_ms != null ? Number(r.avg_mttr_ms) : null,
          medianMttrMs: r.median_mttr_ms != null ? Number(r.median_mttr_ms) : null,
          eventCount: Number(r.event_count),
          resolvedCount: Number(r.resolved_count),
        }));

        reply.send(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate MTTA/MTTR trend report";
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // DAILY ACTIVITY REPORT (Diario Operatori)
  // ============================================================================

  app.get<{ Querystring: DailyActivityQuery }>(
    "/reports/daily-activity",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS, "read")],
      schema: {
        tags: ["reports"],
        summary: "Daily activity report — per-operator analysis counts by day, type, and product",
        security: [{ bearerAuth: [] }],
        querystring: DailyActivityQuerySchema,
        response: {
          200: DailyActivityResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId, year, month } = request.query;

        const dateFrom = new Date(Date.UTC(year, month - 1, 1));
        const dateTo = new Date(Date.UTC(year, month, 1)); // exclusive upper bound
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

        // ── Raw SQL: group by operator, day, analysis_type, product ──────────
        const conditions: string[] = [
          "status = 'COMPLETED'",
          `analysis_date >= $1`,
          `analysis_date < $2`,
        ];
        const params: unknown[] = [dateFrom, dateTo];
        let paramIdx = 3;

        if (productId) {
          conditions.push(`product_id = $${paramIdx++}`);
          params.push(productId);
        }

        const whereSQL = conditions.join(" AND ");

        const rows = await prisma.$queryRawUnsafe<
          Array<{
            operator_id: string;
            day: number;
            analysis_type: string;
            product_id: string;
            count: bigint;
          }>
        >(
          `SELECT
             operator_id,
             EXTRACT(DAY FROM analysis_date AT TIME ZONE 'Europe/Rome')::int AS day,
             analysis_type,
             product_id,
             COUNT(*)::bigint AS count
           FROM alarm_analyses
           WHERE ${whereSQL}
           GROUP BY operator_id, day, analysis_type, product_id`,
          ...params
        );

        if (rows.length === 0) {
          return reply.send({ year, month, daysInMonth, operators: [] });
        }

        // ── Name resolution ──────────────────────────────────────────────────
        const operatorIds = [...new Set(rows.map((r) => r.operator_id))];
        const productIds = [...new Set(rows.map((r) => r.product_id))];

        const [operators, products] = await Promise.all([
          prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: { id: true, name: true },
          }),
          prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          }),
        ]);

        const opMap = new Map(operators.map((o) => [o.id, o.name]));
        const prodMap = new Map(products.map((p) => [p.id, p.name]));

        // ── Assemble nested structure ────────────────────────────────────────
        // operator → day → { total, analyzable, ignorable, products: { productId → count } }
        type DayBucket = {
          total: number;
          analyzable: number;
          ignorable: number;
          productCounts: Map<string, number>;
        };
        const opDays = new Map<string, Map<string, DayBucket>>();

        for (const r of rows) {
          const cnt = Number(r.count);
          const dayKey = String(r.day);

          if (!opDays.has(r.operator_id)) opDays.set(r.operator_id, new Map());
          const days = opDays.get(r.operator_id)!;

          if (!days.has(dayKey)) days.set(dayKey, { total: 0, analyzable: 0, ignorable: 0, productCounts: new Map() });
          const bucket = days.get(dayKey)!;

          bucket.total += cnt;
          if (r.analysis_type === "ANALYZABLE") bucket.analyzable += cnt;
          else if (r.analysis_type === "IGNORABLE") bucket.ignorable += cnt;

          bucket.productCounts.set(
            r.product_id,
            (bucket.productCounts.get(r.product_id) ?? 0) + cnt
          );
        }

        const result = operatorIds.map((opId) => {
          const days = opDays.get(opId) ?? new Map<string, DayBucket>();
          let monthTotal = 0;

          const byDay: Record<string, { total: number; analyzable: number; ignorable: number; products: Array<{ productId: string; productName: string; count: number }> }> = {};

          for (const [dayKey, bucket] of days) {
            monthTotal += bucket.total;
            byDay[dayKey] = {
              total: bucket.total,
              analyzable: bucket.analyzable,
              ignorable: bucket.ignorable,
              products: Array.from(bucket.productCounts.entries()).map(([pid, count]) => ({
                productId: pid,
                productName: prodMap.get(pid) ?? "Unknown",
                count,
              })),
            };
          }

          return {
            operatorId: opId,
            operatorName: opMap.get(opId) ?? "Unknown",
            byDay,
            monthTotal,
          };
        }).sort((a, b) => b.monthTotal - a.monthTotal);

        reply.send({ year, month, daysInMonth, operators: result });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate daily activity report";
        HttpError.internal(reply, message);
      }
    }
  );
}
