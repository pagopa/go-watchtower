import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Prisma, prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  AnalysisAuthorsResponseSchema,
  AnalysisStatsQuerySchema,
  AnalysisStatsResponseSchema,
  ErrorResponseSchema,
  type AnalysisStatsQuery,
} from "./schemas.js";

export async function registerAnalysisStatsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/analyses/authors",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["analyses"],
        summary: "Get distinct users who created at least one analysis",
        security: [{ bearerAuth: [] }],
        response: {
          200: AnalysisAuthorsResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const authors = await prisma.user.findMany({
          where: { analyses: { some: {} } },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        });

        reply.send(authors);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch authors";
        HttpError.internal(reply, message);
      }
    },
  );

  app.get<{ Querystring: AnalysisStatsQuery }>(
    "/analyses/stats",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["analyses"],
        summary: "Get aggregated analysis statistics for dashboard",
        security: [{ bearerAuth: [] }],
        querystring: AnalysisStatsQuerySchema,
        response: {
          200: AnalysisStatsResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId, dateFrom, dateTo } = request.query;
        const where: Prisma.AlarmAnalysisWhereInput = {};
        if (productId) where.productId = productId;
        if (dateFrom || dateTo) {
          where.analysisDate = {};
          if (dateFrom) where.analysisDate.gte = new Date(dateFrom);
          if (dateTo) where.analysisDate.lte = new Date(dateTo);
        }

        const [totalAnalyses, occurrencesAgg] = await Promise.all([
          prisma.alarmAnalysis.count({ where }),
          prisma.alarmAnalysis.aggregate({ where, _sum: { occurrences: true } }),
        ]);
        const totalOccurrences = occurrencesAgg._sum.occurrences || 0;

        let totalAnalysesPrevious = 0;
        let totalOccurrencesPrevious = 0;
        if (dateFrom && dateTo) {
          const from = new Date(dateFrom);
          const to = new Date(dateTo);
          const duration = to.getTime() - from.getTime();
          const prevFrom = new Date(from.getTime() - duration);
          const prevTo = new Date(from.getTime());
          const prevWhere: Prisma.AlarmAnalysisWhereInput = {
            ...where,
            analysisDate: { gte: prevFrom, lte: prevTo },
          };
          const [prevCount, prevAgg] = await Promise.all([
            prisma.alarmAnalysis.count({ where: prevWhere }),
            prisma.alarmAnalysis.aggregate({
              where: prevWhere,
              _sum: { occurrences: true },
            }),
          ]);
          totalAnalysesPrevious = prevCount;
          totalOccurrencesPrevious = prevAgg._sum.occurrences || 0;
        }

        const now = new Date();
        const dailyFrom = dateFrom
          ? new Date(dateFrom)
          : new Date(now.getFullYear(), now.getMonth(), 1);
        const dailyTo = dateTo ? new Date(dateTo) : now;

        const [
          topFinalActionRaw,
          byProdEnvRaw,
          byOpRaw,
          byTypeRaw,
          topAlarmsRaw,
          dailyRaw,
          onCallRaw,
        ] = await Promise.all([
          prisma.analysisFinalAction.groupBy({
            by: ["finalActionId"],
            where: { analysis: where },
            _count: { finalActionId: true },
            orderBy: { _count: { finalActionId: "desc" } },
            take: 1,
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["productId", "environmentId"],
            where,
            _count: { id: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["operatorId"],
            where,
            _count: { id: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["analysisType"],
            where,
            _count: { id: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["alarmId"],
            where,
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 10,
          }),
          prisma.$queryRawUnsafe<
            Array<{
              date: string;
              environment_id: string;
              count: bigint;
              total_occurrences: bigint;
            }>
          >(
            `SELECT DATE(analysis_date) as date, environment_id, COUNT(*)::bigint as count, COALESCE(SUM(occurrences), 0)::bigint as total_occurrences
             FROM alarm_analyses
             WHERE analysis_date >= $1 AND analysis_date <= $2
             ${productId ? "AND product_id = $3" : ""}
             GROUP BY DATE(analysis_date), environment_id
             ORDER BY date ASC`,
            ...(productId
              ? [dailyFrom, dailyTo, productId]
              : [dailyFrom, dailyTo]),
          ),
          prisma.$queryRawUnsafe<
            Array<{ month: string; is_on_call: boolean; count: bigint }>
          >(
            `SELECT TO_CHAR(analysis_date, 'YYYY-MM') as month, is_on_call, COUNT(*)::bigint as count
             FROM alarm_analyses
             WHERE 1=1
             ${productId ? "AND product_id = $1" : ""}
             ${dateFrom ? `AND analysis_date >= $${productId ? 2 : 1}` : ""}
             ${dateTo ? `AND analysis_date <= $${(productId ? 1 : 0) + (dateFrom ? 1 : 0) + 1}` : ""}
             GROUP BY month, is_on_call
             ORDER BY month ASC`,
            ...[
              productId,
              dateFrom ? new Date(dateFrom) : undefined,
              dateTo ? new Date(dateTo) : undefined,
            ].filter((value) => value !== undefined),
          ),
        ]);

        const productIds = [...new Set(byProdEnvRaw.map((row) => row.productId))];
        const environmentIds = [
          ...new Set(byProdEnvRaw.map((row) => row.environmentId)),
        ];
        const operatorIds = byOpRaw.map((row) => row.operatorId);
        const alarmIds = topAlarmsRaw.map((row) => row.alarmId);
        const dailyEnvIds = [
          ...new Set(dailyRaw.map((row) => row.environment_id)),
        ];
        const topFinalActionEntry = topFinalActionRaw[0];

        const [
          products,
          environments,
          operators,
          alarms,
          dailyEnvs,
          topFinalActionEntity,
        ] = await Promise.all([
          prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          }),
          prisma.environment.findMany({
            where: { id: { in: environmentIds } },
            select: { id: true, name: true },
          }),
          prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: { id: true, name: true },
          }),
          alarmIds.length > 0
            ? prisma.alarm.findMany({
                where: { id: { in: alarmIds } },
                select: { id: true, name: true, productId: true },
              })
            : Promise.resolve([]),
          dailyEnvIds.length > 0
            ? prisma.environment.findMany({
                where: { id: { in: dailyEnvIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          topFinalActionEntry
            ? prisma.finalAction.findUnique({
                where: { id: topFinalActionEntry.finalActionId },
                select: { id: true, name: true },
              })
            : Promise.resolve(null),
        ]);

        const productMap = new Map(products.map((row) => [row.id, row.name]));
        const envMap = new Map(environments.map((row) => [row.id, row.name]));
        const opMap = new Map(operators.map((row) => [row.id, row.name]));
        const alarmMap = new Map(alarms.map((row) => [row.id, row]));
        const dailyEnvMap = new Map(dailyEnvs.map((row) => [row.id, row.name]));

        const topFinalAction =
          topFinalActionEntry && topFinalActionEntity
            ? {
                id: topFinalActionEntity.id,
                name: topFinalActionEntity.name,
                count: topFinalActionEntry._count.finalActionId,
              }
            : null;

        const byProductEnvironment = byProdEnvRaw.map((row) => ({
          productId: row.productId,
          productName: productMap.get(row.productId) || "Unknown",
          environmentId: row.environmentId,
          environmentName: envMap.get(row.environmentId) || "Unknown",
          count: row._count.id,
        }));

        const byOperator = byOpRaw
          .map((row) => ({
            operatorId: row.operatorId,
            operatorName: opMap.get(row.operatorId) || "Unknown",
            count: row._count.id,
          }))
          .sort((a, b) => b.count - a.count);

        const dailyByEnvironment = dailyRaw.map((row) => ({
          date:
            typeof row.date === "string"
              ? row.date.split("T")[0]
              : new Date(row.date).toISOString().split("T")[0],
          environmentId: row.environment_id,
          environmentName:
            dailyEnvMap.get(row.environment_id) ||
            envMap.get(row.environment_id) ||
            "Unknown",
          count: Number(row.count),
          totalOccurrences: Number(row.total_occurrences),
        }));

        const byAnalysisType = byTypeRaw.map((row) => ({
          analysisType: row.analysisType,
          count: row._count.id,
        }));

        const topAlarms = topAlarmsRaw.map((row) => {
          const alarm = alarmMap.get(row.alarmId);
          return {
            alarmId: row.alarmId,
            alarmName: alarm?.name || "Unknown",
            productId: alarm?.productId || "",
            count: row._count.id,
          };
        });

        const onCallTrendMap = new Map<string, { onCall: number; normal: number }>();
        for (const row of onCallRaw) {
          const entry = onCallTrendMap.get(row.month) || { onCall: 0, normal: 0 };
          if (row.is_on_call) entry.onCall = Number(row.count);
          else entry.normal = Number(row.count);
          onCallTrendMap.set(row.month, entry);
        }

        const onCallTrend = Array.from(onCallTrendMap.entries())
          .map(([month, data]) => ({
            month,
            onCall: data.onCall,
            normal: data.normal,
          }))
          .sort((a, b) => a.month.localeCompare(b.month));

        const topOperatorEntry = byOperator[0];
        const topOperator = topOperatorEntry
          ? {
              id: topOperatorEntry.operatorId,
              name: topOperatorEntry.operatorName,
              count: topOperatorEntry.count,
            }
          : null;

        reply.send({
          kpi: {
            totalAnalyses,
            totalAnalysesPrevious,
            totalOccurrences,
            totalOccurrencesPrevious,
            topFinalAction,
            topOperator,
          },
          byProductEnvironment,
          byOperator,
          dailyByEnvironment,
          byAnalysisType,
          topAlarms,
          onCallTrend,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch analysis stats";
        HttpError.internal(reply, message);
      }
    },
  );
}
