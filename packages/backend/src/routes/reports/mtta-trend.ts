import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ErrorResponseSchema,
  MttaTrendQuerySchema,
  MttaTrendResponseSchema,
  type MttaTrendQuery,
} from "./schemas.js";

export async function registerMttaTrendReportRoute(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Querystring: MttaTrendQuery }>(
    "/reports/mtta-trend",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
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
        const {
          productId,
          dateFrom,
          dateTo,
          granularity = "weekly",
        } = request.query;

        const truncFn =
          granularity === "monthly"
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
           WHERE ${conditions.join(" AND ")}
           GROUP BY ${truncFn}
           ORDER BY period`,
          ...params,
        );

        reply.send(
          rows.map((row) => ({
            period: row.period.toISOString().split("T")[0],
            avgMttaMs: row.avg_mtta_ms != null ? Number(row.avg_mtta_ms) : null,
            medianMttaMs:
              row.median_mtta_ms != null ? Number(row.median_mtta_ms) : null,
            avgMttrMs: row.avg_mttr_ms != null ? Number(row.avg_mttr_ms) : null,
            medianMttrMs:
              row.median_mttr_ms != null ? Number(row.median_mttr_ms) : null,
            eventCount: Number(row.event_count),
            resolvedCount: Number(row.resolved_count),
          })),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate MTTA/MTTR trend report";
        HttpError.internal(reply, message);
      }
    },
  );
}
