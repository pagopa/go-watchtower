import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  AlarmRankingQuerySchema,
  AlarmRankingResponseSchema,
  ErrorResponseSchema,
  type AlarmRankingQuery,
} from "./schemas.js";

type AlarmRankingItem = {
  alarmId: string;
  alarmName: string;
  productId: string;
  productName: string;
  environmentId: string;
  environmentName: string;
  totalAnalyses: number;
  totalOccurrences: number;
};

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function buildAlarmRankingWhereClause(
  query: AlarmRankingQuery,
): Prisma.AlarmAnalysisWhereInput {
  const where: Prisma.AlarmAnalysisWhereInput = {};
  if (query.productId) where.productId = query.productId;

  const environmentIds = toArray(query.environmentId);
  if (environmentIds.length > 0) {
    where.environmentId = { in: environmentIds };
  }

  const alarmIds = toArray(query.alarmId);
  if (alarmIds.length > 0) {
    where.alarmId = { in: alarmIds };
  }

  if (query.dateFrom || query.dateTo) {
    where.analysisDate = {};
    if (query.dateFrom) where.analysisDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.analysisDate.lte = new Date(query.dateTo);
  }

  return where;
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "it", { sensitivity: "base" });
}

function sortAlarmRanking(
  rows: AlarmRankingItem[],
  sortBy: NonNullable<AlarmRankingQuery["sortBy"]> = "totalOccurrences",
  sortOrder: NonNullable<AlarmRankingQuery["sortOrder"]> = "desc",
): AlarmRankingItem[] {
  const direction = sortOrder === "asc" ? 1 : -1;

  return rows.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "alarmName":
        comparison = compareStrings(a.alarmName, b.alarmName);
        break;
      case "productName":
        comparison = compareStrings(a.productName, b.productName);
        break;
      case "environmentName":
        comparison = compareStrings(a.environmentName, b.environmentName);
        break;
      case "totalAnalyses":
        comparison = a.totalAnalyses - b.totalAnalyses;
        break;
      case "totalOccurrences":
        comparison = a.totalOccurrences - b.totalOccurrences;
        break;
    }

    if (comparison !== 0) return comparison * direction;

    return (
      compareStrings(a.productName, b.productName) ||
      compareStrings(a.environmentName, b.environmentName) ||
      compareStrings(a.alarmName, b.alarmName)
    );
  });
}

export async function registerAlarmRankingReportRoute(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Querystring: AlarmRankingQuery }>(
    "/reports/alarm-ranking",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["reports"],
        summary: "Alarm ranking by product, environment and total occurrences",
        security: [{ bearerAuth: [] }],
        querystring: AlarmRankingQuerySchema,
        response: {
          200: AlarmRankingResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const where = buildAlarmRankingWhereClause(request.query);
        const byAlarmEnvironment = await prisma.alarmAnalysis.groupBy({
          by: ["productId", "environmentId", "alarmId"],
          where,
          _count: { id: true },
          _sum: { occurrences: true },
        });

        if (byAlarmEnvironment.length === 0) {
          return reply.send([]);
        }

        const alarmIds = [...new Set(byAlarmEnvironment.map((row) => row.alarmId))];
        const productIds = [...new Set(byAlarmEnvironment.map((row) => row.productId))];
        const environmentIds = [...new Set(byAlarmEnvironment.map((row) => row.environmentId))];

        const [alarms, products, environments] = await Promise.all([
          prisma.alarm.findMany({
            where: { id: { in: alarmIds } },
            select: { id: true, name: true },
          }),
          prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          }),
          prisma.environment.findMany({
            where: { id: { in: environmentIds } },
            select: { id: true, name: true },
          }),
        ]);

        const alarmMap = new Map(alarms.map((row) => [row.id, row]));
        const productMap = new Map(products.map((row) => [row.id, row]));
        const environmentMap = new Map(environments.map((row) => [row.id, row]));

        const result = sortAlarmRanking(
          byAlarmEnvironment.map((row) => {
            const alarm = alarmMap.get(row.alarmId);
            const product = productMap.get(row.productId);
            const environment = environmentMap.get(row.environmentId);

            return {
              alarmId: row.alarmId,
              alarmName: alarm?.name || "Unknown",
              productId: row.productId,
              productName: product?.name || "Unknown",
              environmentId: row.environmentId,
              environmentName: environment?.name || "Unknown",
              totalAnalyses: row._count.id,
              totalOccurrences: row._sum.occurrences || 0,
            };
          }),
          request.query.sortBy,
          request.query.sortOrder,
        );

        reply.send(result);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate alarm ranking report";
        HttpError.internal(reply, message);
      }
    },
  );
}
