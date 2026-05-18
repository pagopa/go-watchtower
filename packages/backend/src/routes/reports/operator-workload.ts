import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ErrorResponseSchema,
  OperatorWorkloadResponseSchema,
  ReportQuerySchema,
  type ReportQuery,
} from "./schemas.js";
import { buildWhereClause } from "./shared.js";

export async function registerOperatorWorkloadReportRoute(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Querystring: ReportQuery }>(
    "/reports/operator-workload",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
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
            ...sqlParams,
          ),
          prisma.$queryRawUnsafe<
            Array<{
              operator_id: string;
              environment_id: string;
              mtta_ms: number | null;
            }>
          >(
            `SELECT operator_id, environment_id, AVG(EXTRACT(EPOCH FROM (analysis_date - first_alarm_at)) * 1000) as mtta_ms
             FROM alarm_analyses
             WHERE ${whereSQL}
             GROUP BY operator_id, environment_id`,
            ...sqlParams,
          ),
        ]);

        if (byOperator.length === 0) {
          return reply.send([]);
        }

        const operatorIds = byOperator.map((row) => row.operatorId);
        const envIds = [
          ...new Set(byOperatorEnv.map((row) => row.environmentId)),
        ];

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

        const operatorMap = new Map(operators.map((row) => [row.id, row]));
        const environmentMap = new Map(
          environments.map((row) => [row.id, row.name]),
        );

        const onCallMap = new Map<string, number>();
        for (const row of byOperatorOnCall) {
          if (row.isOnCall) {
            onCallMap.set(row.operatorId, row._count.id);
          }
        }

        const mttaMap = new Map<string, number | null>();
        for (const row of mttaByOperator) {
          mttaMap.set(
            row.operator_id,
            row.mtta_ms != null ? Number(row.mtta_ms) : null,
          );
        }

        const envOnCallMap = new Map<string, number>();
        for (const row of byOperatorEnvOnCall) {
          if (row.isOnCall) {
            envOnCallMap.set(
              `${row.operatorId}:${row.environmentId}`,
              row._count.id,
            );
          }
        }

        const envMttaMap = new Map<string, number | null>();
        for (const row of mttaByOperatorEnv) {
          envMttaMap.set(
            `${row.operator_id}:${row.environment_id}`,
            row.mtta_ms != null ? Number(row.mtta_ms) : null,
          );
        }

        const envEntriesByOperator = new Map<string, typeof byOperatorEnv>();
        for (const entry of byOperatorEnv) {
          const bucket = envEntriesByOperator.get(entry.operatorId);
          if (bucket) {
            bucket.push(entry);
          } else {
            envEntriesByOperator.set(entry.operatorId, [entry]);
          }
        }

        const result = byOperator
          .map((row) => {
            const operator = operatorMap.get(row.operatorId);
            const envEntries = envEntriesByOperator.get(row.operatorId) ?? [];

            return {
              operatorId: row.operatorId,
              operatorName: operator?.name || "Unknown",
              operatorEmail: operator?.email || "",
              totalAnalyses: row._count.id,
              onCallAnalyses: onCallMap.get(row.operatorId) || 0,
              totalOccurrences: row._sum.occurrences || 0,
              mttaMs: mttaMap.get(row.operatorId) ?? null,
              byEnvironment: envEntries.map((envEntry) => ({
                environmentId: envEntry.environmentId,
                environmentName:
                  environmentMap.get(envEntry.environmentId) || "Unknown",
                count: envEntry._count.id,
                onCallCount:
                  envOnCallMap.get(
                    `${row.operatorId}:${envEntry.environmentId}`,
                  ) || 0,
                occurrences: envEntry._sum.occurrences || 0,
                mttaMs:
                  envMttaMap.get(
                    `${row.operatorId}:${envEntry.environmentId}`,
                  ) ?? null,
              })),
            };
          })
          .sort((a, b) => b.totalAnalyses - a.totalAnalyses);

        reply.send(result);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate operator workload report";
        HttpError.internal(reply, message);
      }
    },
  );
}
