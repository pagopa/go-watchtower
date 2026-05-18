import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  AlarmRankingResponseSchema,
  ErrorResponseSchema,
  ReportQuerySchema,
  type ReportQuery,
} from "./schemas.js";
import { buildWhereClause } from "./shared.js";

export async function registerAlarmRankingReportRoute(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Querystring: ReportQuery }>(
    "/reports/alarm-ranking",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
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
        const byAlarm = await prisma.alarmAnalysis.groupBy({
          by: ["alarmId"],
          where,
          _count: { id: true },
          _sum: { occurrences: true },
        });

        if (byAlarm.length === 0) {
          return reply.send([]);
        }

        const alarmIds = byAlarm.map((row) => row.alarmId);
        const alarms = await prisma.alarm.findMany({
          where: { id: { in: alarmIds } },
          select: {
            id: true,
            name: true,
            product: { select: { id: true, name: true } },
          },
        });
        const alarmMap = new Map(alarms.map((row) => [row.id, row]));

        const result = byAlarm
          .map((row) => {
            const alarm = alarmMap.get(row.alarmId);
            return {
              alarmId: row.alarmId,
              alarmName: alarm?.name || "Unknown",
              productId: alarm?.product.id || "",
              productName: alarm?.product.name || "Unknown",
              totalAnalyses: row._count.id,
              totalOccurrences: row._sum.occurrences || 0,
            };
          })
          .sort((a, b) => b.totalOccurrences - a.totalOccurrences);

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
