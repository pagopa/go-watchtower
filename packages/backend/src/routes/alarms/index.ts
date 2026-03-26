import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  AlarmDetailParamsSchema,
  AlarmDetailQuerySchema,
  AlarmDetailResponseSchema,
  ErrorResponseSchema,
  type AlarmDetailParams,
  type AlarmDetailQuery,
} from "./schemas.js";

export async function alarmRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // ============================================================================
  // ALARM DETAIL — aggregated view for a single alarm
  // ============================================================================

  app.get<{ Params: AlarmDetailParams; Querystring: AlarmDetailQuery }>(
    "/alarms/:productId/:alarmId/detail",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM, "read")],
      schema: {
        tags: ["alarms"],
        summary: "Alarm detail with KPIs, trends, breakdowns and recent analyses",
        security: [{ bearerAuth: [] }],
        params: AlarmDetailParamsSchema,
        querystring: AlarmDetailQuerySchema,
        response: {
          200: AlarmDetailResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId, alarmId } = request.params;
        const { dateFrom, dateTo } = request.query;

        // ── Validate alarm exists ───────────────────────────────────────
        const alarm = await prisma.alarm.findFirst({
          where: { id: alarmId, productId },
          select: {
            id: true,
            name: true,
            description: true,
            productId: true,
            createdAt: true,
            updatedAt: true,
            product: { select: { name: true } },
            runbook: { select: { id: true, name: true, link: true, status: true } },
          },
        });

        if (!alarm) {
          return HttpError.notFound(reply, "Allarme non trovato");
        }

        // ── Build where clause ──────────────────────────────────────────
        const where: Prisma.AlarmAnalysisWhereInput = { alarmId };
        if (dateFrom || dateTo) {
          where.analysisDate = {};
          if (dateFrom) where.analysisDate.gte = new Date(dateFrom);
          if (dateTo) where.analysisDate.lte = new Date(dateTo);
        }

        // SQL params for raw queries (plain alarm_analyses)
        const sqlParams: unknown[] = [alarmId];
        const conditions: string[] = ["alarm_id = $1"];
        let paramIdx = 2;

        if (dateFrom) {
          conditions.push(`analysis_date >= $${paramIdx++}`);
          sqlParams.push(new Date(dateFrom));
        }
        if (dateTo) {
          conditions.push(`analysis_date <= $${paramIdx++}`);
          sqlParams.push(new Date(dateTo));
        }

        const whereSQL = conditions.join(" AND ");

        // Same conditions prefixed with table alias for join queries
        const joinConditions: string[] = ["aa.alarm_id = $1"];
        let joinIdx = 2;
        if (dateFrom) {
          joinConditions.push(`aa.analysis_date >= $${joinIdx++}`);
        }
        if (dateTo) {
          joinConditions.push(`aa.analysis_date <= $${joinIdx++}`);
        }
        const joinWhereSQL = joinConditions.join(" AND ");

        // ── Phase 1: Parallel aggregation queries ───────────────────────
        const [
          totalCount,
          occurrencesAgg,
          byType,
          byEnvironment,
          byOperator,
          occurrenceTrendRaw,
          mttaMttrDailyRaw,
          recentAnalyses,
          topResourcesRaw,
          topDownstreamsRaw,
          ignoredAlarms,
        ] = await Promise.all([
          // Total analyses
          prisma.alarmAnalysis.count({ where }),

          // Total occurrences
          prisma.alarmAnalysis.aggregate({
            where,
            _sum: { occurrences: true },
          }),

          // By analysis type (for ignorable ratio)
          prisma.alarmAnalysis.groupBy({
            by: ["analysisType"],
            where,
            _count: { id: true },
          }),

          // By environment
          prisma.alarmAnalysis.groupBy({
            by: ["environmentId"],
            where,
            _count: { id: true },
            _sum: { occurrences: true },
          }),

          // By operator
          prisma.alarmAnalysis.groupBy({
            by: ["operatorId"],
            where,
            _count: { id: true },
            _sum: { occurrences: true },
          }),

          // Daily occurrence trend
          prisma.$queryRawUnsafe<
            Array<{ date: string; count: bigint; occurrences: bigint }>
          >(
            `SELECT DATE(analysis_date)::text AS date,
                    COUNT(*)::bigint AS count,
                    COALESCE(SUM(occurrences), 0)::bigint AS occurrences
             FROM alarm_analyses
             WHERE ${whereSQL}
             GROUP BY DATE(analysis_date)
             ORDER BY date`,
            ...sqlParams
          ),

          // Daily MTTA/MTTR trend — single scan on alarm_events
          // KPI averages are computed in JS from the daily rows (avoids 2 extra queries)
          (() => {
            const evtConditions: string[] = ["alarm_id = $1", "linked_at IS NOT NULL"];
            let evtIdx = 2;
            if (dateFrom) evtConditions.push(`linked_at >= $${evtIdx++}`);
            if (dateTo)   evtConditions.push(`linked_at <= $${evtIdx++}`);
            return prisma.$queryRawUnsafe<
              Array<{
                date: string;
                avg_mtta_ms: number | null;
                avg_mttr_ms: number | null;
                event_count: bigint;
                resolved_count: bigint;
                sum_mtta_ms: number | null;
                sum_mttr_ms: number | null;
              }>
            >(
              `SELECT DATE(linked_at)::text AS date,
                      AVG(EXTRACT(EPOCH FROM (linked_at - fired_at)) * 1000) AS avg_mtta_ms,
                      AVG(EXTRACT(EPOCH FROM (resolved_at - fired_at)) * 1000)
                        FILTER (WHERE resolved_at IS NOT NULL) AS avg_mttr_ms,
                      COUNT(*)::bigint AS event_count,
                      COUNT(resolved_at)::bigint AS resolved_count,
                      SUM(EXTRACT(EPOCH FROM (linked_at - fired_at)) * 1000) AS sum_mtta_ms,
                      SUM(EXTRACT(EPOCH FROM (resolved_at - fired_at)) * 1000)
                        FILTER (WHERE resolved_at IS NOT NULL) AS sum_mttr_ms
               FROM alarm_events
               WHERE ${evtConditions.join(" AND ")}
               GROUP BY DATE(linked_at)
               ORDER BY date`,
              ...sqlParams
            );
          })(),

          // Recent analyses (last 20)
          prisma.alarmAnalysis.findMany({
            where,
            take: 20,
            orderBy: { analysisDate: "desc" },
            select: {
              id: true,
              analysisDate: true,
              status: true,
              analysisType: true,
              occurrences: true,
              conclusionNotes: true,
              operator: { select: { id: true, name: true } },
              environment: { select: { id: true, name: true } },
            },
          }),

          // Top resources
          prisma.$queryRawUnsafe<
            Array<{ resource_id: string; count: bigint }>
          >(
            `SELECT ar.resource_id, COUNT(*)::bigint AS count
             FROM analysis_resources ar
             JOIN alarm_analyses aa ON ar.analysis_id = aa.id
             WHERE ${joinWhereSQL}
             GROUP BY ar.resource_id
             ORDER BY count DESC
             LIMIT 10`,
            ...sqlParams
          ),

          // Top downstreams
          prisma.$queryRawUnsafe<
            Array<{ downstream_id: string; count: bigint }>
          >(
            `SELECT ad.downstream_id, COUNT(*)::bigint AS count
             FROM analysis_downstreams ad
             JOIN alarm_analyses aa ON ad.analysis_id = aa.id
             WHERE ${joinWhereSQL}
             GROUP BY ad.downstream_id
             ORDER BY count DESC
             LIMIT 10`,
            ...sqlParams
          ),

          // Ignored alarm rules
          prisma.ignoredAlarm.findMany({
            where: { alarmId },
            select: {
              id: true,
              environmentId: true,
              isActive: true,
              reason: true,
              environment: { select: { name: true } },
            },
          }),
        ]);

        // ── Phase 2: Name resolution ────────────────────────────────────
        const envIds = byEnvironment.map((r) => r.environmentId);
        const operatorIds = byOperator.map((r) => r.operatorId);
        const resourceIds = topResourcesRaw.map((r) => r.resource_id);
        const downstreamIds = topDownstreamsRaw.map((r) => r.downstream_id);

        const [environments, operators, resources, downstreams] = await Promise.all([
          envIds.length > 0
            ? prisma.environment.findMany({
                where: { id: { in: envIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          operatorIds.length > 0
            ? prisma.user.findMany({
                where: { id: { in: operatorIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          resourceIds.length > 0
            ? prisma.resource.findMany({
                where: { id: { in: resourceIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          downstreamIds.length > 0
            ? prisma.downstream.findMany({
                where: { id: { in: downstreamIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
        ]);

        const envMap = new Map(environments.map((e) => [e.id, e.name]));
        const opMap = new Map(operators.map((o) => [o.id, o.name]));
        const resMap = new Map(resources.map((r) => [r.id, r.name]));
        const dsMap = new Map(downstreams.map((d) => [d.id, d.name]));

        // ── Compute KPIs ────────────────────────────────────────────────
        const totalOccurrences = occurrencesAgg._sum.occurrences || 0;
        const ignorableCount =
          byType.find((t) => t.analysisType === "IGNORABLE")?._count.id ?? 0;
        const ignorableRatio =
          totalCount > 0
            ? Math.round((ignorableCount / totalCount) * 10000) / 100
            : 0;

        // Derive MTTA/MTTR averages from daily rows (avoids extra DB queries)
        let totalEvents = 0;
        let totalResolved = 0;
        let sumMtta = 0;
        let sumMttr = 0;
        for (const r of mttaMttrDailyRaw) {
          const evtCount = Number(r.event_count);
          const resCount = Number(r.resolved_count);
          totalEvents += evtCount;
          totalResolved += resCount;
          if (r.sum_mtta_ms != null) sumMtta += Number(r.sum_mtta_ms);
          if (r.sum_mttr_ms != null) sumMttr += Number(r.sum_mttr_ms);
        }
        const avgMttaMs = totalEvents > 0 ? sumMtta / totalEvents : null;
        const avgMttrMs = totalResolved > 0 ? sumMttr / totalResolved : null;

        // ── Assemble response ───────────────────────────────────────────
        reply.send({
          alarm: {
            id: alarm.id,
            name: alarm.name,
            description: alarm.description,
            productId: alarm.productId,
            productName: alarm.product.name,
            runbook: alarm.runbook
              ? {
                  id: alarm.runbook.id,
                  name: alarm.runbook.name,
                  link: alarm.runbook.link,
                  status: alarm.runbook.status,
                }
              : null,
            createdAt: alarm.createdAt.toISOString(),
            updatedAt: alarm.updatedAt.toISOString(),
          },
          kpi: {
            totalAnalyses: totalCount,
            totalOccurrences,
            avgMttaMs,
            avgMttrMs,
            ignorableRatio,
          },
          occurrenceTrend: occurrenceTrendRaw.map((r) => ({
            date: r.date,
            count: Number(r.count),
            occurrences: Number(r.occurrences),
          })),
          mttaTrend: mttaMttrDailyRaw.map((r) => ({
            date: r.date,
            avgMttaMs: r.avg_mtta_ms != null ? Number(r.avg_mtta_ms) : null,
            avgMttrMs: r.avg_mttr_ms != null ? Number(r.avg_mttr_ms) : null,
            eventCount: Number(r.event_count),
          })),
          byEnvironment: byEnvironment
            .map((r) => ({
              environmentId: r.environmentId,
              environmentName: envMap.get(r.environmentId) || "Unknown",
              analysisCount: r._count.id,
              occurrences: r._sum.occurrences || 0,
            }))
            .sort((a, b) => b.occurrences - a.occurrences),
          byOperator: byOperator
            .map((r) => ({
              operatorId: r.operatorId,
              operatorName: opMap.get(r.operatorId) || "Unknown",
              analysisCount: r._count.id,
              occurrences: r._sum.occurrences || 0,
            }))
            .sort((a, b) => b.analysisCount - a.analysisCount),
          recentAnalyses: recentAnalyses.map((a) => ({
            id: a.id,
            analysisDate: a.analysisDate.toISOString(),
            status: a.status,
            analysisType: a.analysisType,
            operatorName: a.operator.name,
            environmentName: a.environment.name,
            occurrences: a.occurrences,
            conclusionNotes: a.conclusionNotes,
          })),
          topResources: topResourcesRaw.map((r) => ({
            resourceId: r.resource_id,
            resourceName: resMap.get(r.resource_id) || "Unknown",
            count: Number(r.count),
          })),
          topDownstreams: topDownstreamsRaw.map((r) => ({
            downstreamId: r.downstream_id,
            downstreamName: dsMap.get(r.downstream_id) || "Unknown",
            count: Number(r.count),
          })),
          ignoredAlarms: ignoredAlarms.map((ia) => ({
            id: ia.id,
            environmentId: ia.environmentId,
            environmentName: ia.environment.name,
            isActive: ia.isActive,
            reason: ia.reason,
          })),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load alarm detail";
        HttpError.internal(reply, message);
      }
    }
  );
}
