import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  DailyActivityQuerySchema,
  DailyActivityResponseSchema,
  ErrorResponseSchema,
  type DailyActivityQuery,
} from "./schemas.js";

export async function registerDailyActivityReportRoute(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Querystring: DailyActivityQuery }>(
    "/reports/daily-activity",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["reports"],
        summary:
          "Daily activity report — per-operator analysis counts by day, type, and product",
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
        const dateTo = new Date(Date.UTC(year, month, 1));
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const conditions: string[] = [
          "status = 'COMPLETED'",
          "analysis_date >= $1",
          "analysis_date < $2",
        ];
        const params: unknown[] = [dateFrom, dateTo];
        let paramIdx = 3;

        if (productId) {
          conditions.push(`product_id = $${paramIdx++}`);
          params.push(productId);
        }

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
             EXTRACT(DAY FROM ((analysis_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome'))::int AS day,
             analysis_type,
             product_id,
             COUNT(*)::bigint AS count
           FROM alarm_analyses
           WHERE ${conditions.join(" AND ")}
           GROUP BY operator_id, day, analysis_type, product_id`,
          ...params,
        );

        if (rows.length === 0) {
          return reply.send({ year, month, daysInMonth, operators: [] });
        }

        const operatorIds = [...new Set(rows.map((row) => row.operator_id))];
        const productIds = [...new Set(rows.map((row) => row.product_id))];

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

        const operatorMap = new Map(operators.map((row) => [row.id, row.name]));
        const productMap = new Map(products.map((row) => [row.id, row.name]));

        type DayBucket = {
          total: number;
          analyzable: number;
          ignorable: number;
          productCounts: Map<string, number>;
        };

        const operatorDays = new Map<string, Map<string, DayBucket>>();

        for (const row of rows) {
          const count = Number(row.count);
          const dayKey = String(row.day);

          if (!operatorDays.has(row.operator_id)) {
            operatorDays.set(row.operator_id, new Map());
          }
          const days = operatorDays.get(row.operator_id)!;

          if (!days.has(dayKey)) {
            days.set(dayKey, {
              total: 0,
              analyzable: 0,
              ignorable: 0,
              productCounts: new Map(),
            });
          }

          const bucket = days.get(dayKey)!;
          bucket.total += count;
          if (row.analysis_type === "ANALYZABLE") bucket.analyzable += count;
          else if (row.analysis_type === "IGNORABLE") bucket.ignorable += count;

          bucket.productCounts.set(
            row.product_id,
            (bucket.productCounts.get(row.product_id) ?? 0) + count,
          );
        }

        const result = operatorIds
          .map((operatorId) => {
            const days = operatorDays.get(operatorId) ?? new Map<string, DayBucket>();
            let monthTotal = 0;
            const byDay: Record<
              string,
              {
                total: number;
                analyzable: number;
                ignorable: number;
                products: Array<{
                  productId: string;
                  productName: string;
                  count: number;
                }>;
              }
            > = {};

            for (const [dayKey, bucket] of days) {
              monthTotal += bucket.total;
              byDay[dayKey] = {
                total: bucket.total,
                analyzable: bucket.analyzable,
                ignorable: bucket.ignorable,
                products: Array.from(bucket.productCounts.entries()).map(
                  ([productEntryId, count]) => ({
                    productId: productEntryId,
                    productName: productMap.get(productEntryId) ?? "Unknown",
                    count,
                  }),
                ),
              };
            }

            return {
              operatorId,
              operatorName: operatorMap.get(operatorId) ?? "Unknown",
              byDay,
              monthTotal,
            };
          })
          .sort((a, b) => b.monthTotal - a.monthTotal);

        reply.send({ year, month, daysInMonth, operators: result });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate daily activity report";
        HttpError.internal(reply, message);
      }
    },
  );
}
