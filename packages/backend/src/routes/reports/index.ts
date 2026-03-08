import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, Resource } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ReportQuerySchema,
  OperatorWorkloadResponseSchema,
  AlarmRankingResponseSchema,
  ErrorResponseSchema,
  type ReportQuery,
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
      onRequest: [app.authenticate, requirePermission(Resource.ALARM_ANALYSIS, "read")],
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
      onRequest: [app.authenticate, requirePermission(Resource.ALARM_ANALYSIS, "read")],
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
}
