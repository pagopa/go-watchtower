import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import { logEvent } from "../../services/system-event.service.js";
import {
  ErrorResponseSchema,
  ExportRequestSchema,
  type ExportRequest,
} from "./schemas.js";
import {
  analysisInclude,
  buildAnalysisWhereClause,
  formatAnalysisResponse,
  type AnalysisWithRelations,
} from "./shared.js";

const EXPORT_MAX_ROWS = 5000;
const EXPORT_CHUNK_SIZE = 200;

// ── CSV helpers ─────────────────────────────────────────────────────────────

const CSV_COLUMNS: Array<[string, (a: ReturnType<typeof formatAnalysisResponse>) => unknown]> = [
  ["id", (a) => a.id],
  ["analysisDate", (a) => a.analysisDate],
  ["firstAlarmAt", (a) => a.firstAlarmAt],
  ["lastAlarmAt", (a) => a.lastAlarmAt],
  ["analysisType", (a) => a.analysisType],
  ["status", (a) => a.status],
  ["isOnCall", (a) => (a.isOnCall ? "true" : "false")],
  ["occurrences", (a) => a.occurrences],
  ["productName", (a) => a.product?.name ?? ""],
  ["alarmName", (a) => a.alarm?.name ?? ""],
  ["operatorName", (a) => a.operator?.name ?? ""],
  ["operatorEmail", (a) => a.operator?.email ?? ""],
  ["environmentName", (a) => a.environment?.name ?? ""],
  ["runbookName", (a) => a.runbook?.name ?? ""],
  ["errorDetails", (a) => a.errorDetails ?? ""],
  ["conclusionNotes", (a) => a.conclusionNotes ?? ""],
  ["ignoreReasonCode", (a) => a.ignoreReasonCode ?? ""],
  ["ignoreReason", (a) => a.ignoreReason?.label ?? ""],
  ["validationScore", (a) => a.validationScore ?? ""],
  ["qualityScore", (a) => a.qualityScore ?? ""],
  ["scoredAt", (a) => a.scoredAt ?? ""],
  ["linkedEventsCount", (a) => a.linkedEventsCount],
  ["avgMttaMs", (a) => a.avgMttaMs ?? ""],
  ["avgMttrMs", (a) => a.avgMttrMs ?? ""],
  ["avgMttfMs", (a) => a.avgMttfMs ?? ""],
  ["resources", (a) => a.resources.map((r) => r.name).join("; ")],
  ["downstreams", (a) => a.downstreams.map((d) => d.name).join("; ")],
  ["finalActions", (a) => a.finalActions.map((f) => f.name).join("; ")],
  ["links", (a) => a.links.map((l) => l.url).join("; ")],
  ["trackingIds", (a) => a.trackingIds.map((t) => t.traceId).join("; ")],
  ["createdAt", (a) => a.createdAt],
  ["updatedAt", (a) => a.updatedAt],
  ["createdByName", (a) => a.createdBy?.name ?? ""],
  ["updatedByName", (a) => a.updatedBy?.name ?? ""],
];

function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}

// ── Route ───────────────────────────────────────────────────────────────────

export async function registerAnalysisExportRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.post<{ Body: ExportRequest }>(
    "/analyses/export",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["analyses"],
        summary: "Export analyses as CSV or JSON (streaming, max 5000 rows)",
        security: [{ bearerAuth: [] }],
        body: ExportRequestSchema,
        response: {
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          413: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { format, ids, filters } = request.body;

      // ── Build WHERE: ids takes precedence over filters ──────────────────
      const where = ids && ids.length > 0
        ? { id: { in: ids } }
        : buildAnalysisWhereClause(filters ?? {});

      try {
        const count = await prisma.alarmAnalysis.count({ where });

        if (count === 0) {
          return HttpError.badRequest(reply, "No analyses match the export criteria");
        }
        if (count > EXPORT_MAX_ROWS) {
          reply.status(413).send({
            error: `Too many rows to export (${count}). Maximum is ${EXPORT_MAX_ROWS}. Please narrow your filters.`,
          });
          return;
        }

        // ── Prepare streamed response ──────────────────────────────────────
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 16);
        const filename = `analyses-export-${timestamp}.${format}`;
        reply
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .header(
            "Content-Type",
            format === "csv" ? "text/csv; charset=utf-8" : "application/json",
          );

        const raw = reply.raw;

        if (format === "csv") {
          // CSV header
          raw.write(csvRow(CSV_COLUMNS.map(([h]) => h)) + "\n");
        } else {
          // JSON wrapper opening
          const meta = {
            exportedAt: new Date().toISOString(),
            count,
            ...(ids ? { ids } : { filters: filters ?? {} }),
          };
          raw.write(`{"exportedAt":${JSON.stringify(meta.exportedAt)},"count":${count},`);
          if (ids) {
            raw.write(`"ids":${JSON.stringify(ids)},`);
          } else {
            raw.write(`"filters":${JSON.stringify(filters ?? {})},`);
          }
          raw.write(`"items":[`);
        }

        // ── Cursor-based iteration ─────────────────────────────────────────
        let lastId: string | undefined;
        let written = 0;
        let firstJsonItem = true;

        while (written < count) {
          const batch: AnalysisWithRelations[] = await prisma.alarmAnalysis.findMany({
            where,
            include: analysisInclude,
            orderBy: { id: "asc" },
            take: EXPORT_CHUNK_SIZE,
            ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
          });

          if (batch.length === 0) break;

          for (const row of batch) {
            const formatted = formatAnalysisResponse(row);
            if (format === "csv") {
              raw.write(
                csvRow(CSV_COLUMNS.map(([, fn]) => fn(formatted))) + "\n",
              );
            } else {
              raw.write(
                (firstJsonItem ? "" : ",") + JSON.stringify(formatted),
              );
              firstJsonItem = false;
            }
            written++;
          }

          lastId = batch[batch.length - 1]!.id;
          if (batch.length < EXPORT_CHUNK_SIZE) break;
        }

        if (format === "json") {
          raw.write("]}");
        }
        raw.end();

        // ── Audit log (non-blocking) ───────────────────────────────────────
        logEvent({
          action: SystemEventActions.ANALYSIS_EXPORTED,
          resource: SystemEventResources.ALARM_ANALYSES,
          userId: request.user.userId,
          userLabel: request.user.email,
          metadata: {
            format,
            count: written,
            mode: ids && ids.length > 0 ? "selected" : "filtered",
            ...(ids ? { idCount: ids.length } : {}),
            ...(filters ? { filters } : {}),
          },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to export analyses";
        if (!reply.sent) {
          HttpError.internal(reply, message);
        } else {
          reply.raw.destroy();
        }
      }
    },
  );
}
