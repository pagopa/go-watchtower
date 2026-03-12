import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ReportQuerySchema,
  OperatorWorkloadResponseSchema,
  AlarmRankingResponseSchema,
  MonthlyKpiQuerySchema,
  MonthlyKpiResponseSchema,
  ErrorResponseSchema,
  type ReportQuery,
  type MonthlyKpiQuery,
} from "./schemas.js";

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

        // Month boundaries (UTC) — used for analysis queries and as date range for assigned_date
        const dateFrom = new Date(Date.UTC(year, month - 1, 1));
        const dateTo = new Date(Date.UTC(year, month, 1)); // exclusive upper bound
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

        // Expanded range for alarm events: business-day shift can move a normal
        // alarm up to 3 calendar days forward (Fri 18:00 Rome → Monday).
        // Pad 4 days before to capture Friday→Monday cross-month shifts.
        // Pad 1 day after for Rome/UTC timezone boundary (e.g. last day 23:59
        // Rome = next day ~23:00 UTC in winter).
        const expandedFrom = new Date(dateFrom.getTime() - 4 * 86_400_000);
        const expandedTo = new Date(dateTo.getTime() + 86_400_000);

        // ── Parallel queries ─────────────────────────────────────────────────
        //
        // 1. Alarm events → business-day assignment (Europe/Rome, see rules below)
        // 2. Analyses → single query with conditional aggregation (FILTER)
        // 3. Environments → for response structure
        //
        // Alarm event business-day rules (times in Europe/Rome):
        // ─ On-call alarms always count on their calendar day.
        // ─ Normal alarms:
        //   • Mon–Fri before 18:00 → same day
        //   • Mon–Thu 18:00+      → next day
        //   • Fri 18:00+          → next Monday
        //   • Saturday             → next Monday
        //   • Sunday               → next Monday

        const [alarmEventsRaw, analysisRaw, environments] = await Promise.all([
          // ── 1. Alarm events with business-day logic ────────────────────────
          // LATERAL computes the Rome TZ conversion once per row; date/time/dow
          // are derived from that single value to avoid repeated TZ lookups.
          prisma.$queryRaw<Array<{ environment_id: string; day: number; count: bigint }>>`
            WITH event_days AS (
              SELECT
                ae.environment_id,
                tz.rome_ts::date  AS fire_date,
                tz.rome_ts::time  AS fire_time,
                EXTRACT(ISODOW FROM tz.rome_ts::date)::int AS fire_dow,
                COALESCE(aa.is_on_call, false) AS is_on_call
              FROM alarm_events ae
              LEFT JOIN alarm_analyses aa ON ae.analysis_id = aa.id
              CROSS JOIN LATERAL (
                SELECT ae.fired_at AT TIME ZONE 'Europe/Rome' AS rome_ts
              ) tz
              WHERE ae.product_id = ${productId}
                AND ae.fired_at >= ${expandedFrom}
                AND ae.fired_at < ${expandedTo}
            ),
            assigned AS (
              SELECT
                environment_id,
                CASE
                  WHEN is_on_call                                  THEN fire_date
                  WHEN fire_dow = 6                                THEN fire_date + 2
                  WHEN fire_dow = 7                                THEN fire_date + 1
                  WHEN fire_time >= TIME '18:00' AND fire_dow = 5  THEN fire_date + 3
                  WHEN fire_time >= TIME '18:00'                   THEN fire_date + 1
                  ELSE fire_date
                END AS assigned_date
              FROM event_days
            )
            SELECT
              environment_id,
              EXTRACT(DAY FROM assigned_date)::int AS day,
              COUNT(*)::bigint AS count
            FROM assigned
            WHERE assigned_date >= ${dateFrom}::date
              AND assigned_date <  ${dateTo}::date
            GROUP BY environment_id, day
          `,

          // ── 2. Analyses — single scan with conditional FILTER aggregation ──
          // Replaces two separate queries (completed + ignored) with one pass.
          // Uses index alarm_analyses(product_id, analysis_date).
          prisma.$queryRaw<Array<{ environment_id: string; day: number; completed: bigint; ignored: bigint }>>`
            SELECT
              environment_id,
              EXTRACT(DAY FROM analysis_date AT TIME ZONE 'UTC')::int AS day,
              COALESCE(SUM(occurrences) FILTER (
                WHERE status = 'COMPLETED' AND analysis_type = 'ANALYZABLE'
              ), 0)::bigint AS completed,
              COALESCE(SUM(occurrences) FILTER (
                WHERE analysis_type = 'IGNORABLE'
              ), 0)::bigint AS ignored
            FROM alarm_analyses
            WHERE product_id = ${productId}
              AND analysis_date >= ${dateFrom} AND analysis_date < ${dateTo}
              AND ((status = 'COMPLETED' AND analysis_type = 'ANALYZABLE') OR analysis_type = 'IGNORABLE')
            GROUP BY environment_id, day
          `,

          // ── 3. Environments ────────────────────────────────────────────────
          prisma.environment.findMany({
            where: { productId },
            select: { id: true, name: true },
            orderBy: [{ order: "asc" }, { name: "asc" }],
          }),
        ]);

        // Build lookup: envId → { alarmEvents: {day: count}, completed: {}, ignored: {} }
        type DayCounts = Record<string, number>;
        const envData = new Map<string, { alarmEvents: DayCounts; completedAnalyses: DayCounts; ignoredAnalyses: DayCounts }>();

        const ensure = (envId: string) => {
          if (!envData.has(envId)) {
            envData.set(envId, { alarmEvents: {}, completedAnalyses: {}, ignoredAnalyses: {} });
          }
          return envData.get(envId)!;
        };

        for (const r of alarmEventsRaw) {
          ensure(r.environment_id).alarmEvents[String(r.day)] = Number(r.count);
        }
        for (const r of analysisRaw) {
          const env = ensure(r.environment_id);
          const completed = Number(r.completed);
          const ignored = Number(r.ignored);
          if (completed > 0) env.completedAnalyses[String(r.day)] = completed;
          if (ignored > 0) env.ignoredAnalyses[String(r.day)] = ignored;
        }

        const result = environments.map((env: { id: string; name: string }) => {
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
}
