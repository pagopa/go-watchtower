import type { FastifyInstance } from "fastify";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { RUNBOOK_AUTOMATION_SERVICE_ID } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { requireHumanPrincipal, requireService } from "../../lib/require-principal.js";
import { buildCatalogSync } from "../../services/automation/catalog-scheduler.js";
import { getCatalogState } from "../../services/automation/capability-catalog.js";
import { SLACK_INGESTOR_CONTROL_KEY, parseControl, quickRunbookRuleId } from "../../services/slack-ingestor-control.js";

const RESOURCE = SystemComponent.AUTOMATIC_RUNBOOK_EXECUTION;
const readGuard = (app: FastifyInstance) => [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "read")];
const writeGuard = (app: FastifyInstance) => [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "write")];

type CatalogState = Awaited<ReturnType<typeof getCatalogState>>;

function statusDto(state: CatalogState) {
  const { row } = state;
  return {
    health: state.health,
    revision: row?.revision ?? null,
    workerArtifactRevision: state.catalog?.worker.artifactRevision ?? null,
    sourceVersionId: row?.sourceVersionId ?? null,
    sourceETag: row?.sourceETag ?? null,
    sourcePublishedAt: row?.sourcePublishedAt?.toISOString() ?? null,
    lastAttemptAt: row?.lastAttemptAt?.toISOString() ?? null,
    lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
    validUntil: row?.validUntil?.toISOString() ?? null,
    lastErrorCode: row?.lastErrorCode ?? null,
    lastError: row?.lastError ?? null,
  };
}

export async function automaticRunbookRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { kind?: string; category?: string; search?: string; page?: string; limit?: string } }>(
    "/automatic-runbooks/catalog",
    { onRequest: readGuard(app) },
    async (request, reply) => {
      const state = await getCatalogState();
      const catalog = state.catalog;
      if (!catalog) return reply.status(503).send({ error: "CATALOG_UNAVAILABLE", status: statusDto(state) });
      const controlSetting = await prisma.systemSetting.findUnique({ where: { key: SLACK_INGESTOR_CONTROL_KEY }, select: { value: true } });
      const control = parseControl(controlSetting?.value);
      let entries = catalog.runbooks.map((entry) => {
        const exclusionRuleId = quickRunbookRuleId(entry.key);
        const globallyExcluded = control?.rules.some((rule) => rule.id === exclusionRuleId && rule.enabled) ?? false;
        return { ...entry, globallyExcluded, exclusionRuleId: globallyExcluded ? exclusionRuleId : null };
      });
      const q = request.query;
      if (q.kind) entries = entries.filter((entry) => entry.kind === q.kind);
      if (q.category) entries = entries.filter((entry) => entry.categories.includes(q.category!));
      if (q.search) {
        const search = q.search.toLowerCase();
        entries = entries.filter((entry) => [entry.key, entry.name, entry.description, ...entry.alarmNames].some((value) => value?.toLowerCase().includes(search)));
      }
      const page = Math.max(Number.parseInt(q.page ?? "1", 10) || 1, 1);
      const limit = Math.min(Math.max(Number.parseInt(q.limit ?? "100", 10) || 100, 1), 500);
      return { data: entries.slice((page - 1) * limit, page * limit), total: entries.length, page, limit, revision: catalog.revision, workerArtifactRevision: catalog.worker.artifactRevision };
    },
  );

  app.get<{ Params: { key: string } }>("/automatic-runbooks/catalog/:key", { onRequest: readGuard(app) }, async (request, reply) => {
    const catalog = (await getCatalogState()).catalog;
    const runbook = catalog?.runbooks.find((entry) => entry.key === request.params.key);
    if (!runbook) return reply.status(404).send({ error: "RUNBOOK_NOT_FOUND" });
    const [alarms, executions] = await Promise.all([
      prisma.alarm.findMany({ where: { name: { in: runbook.alarmNames } }, select: { id: true, name: true, productId: true } }),
      prisma.automaticRunbookExecution.count({ where: { requestedRunbookKey: runbook.key } }),
    ]);
    return { ...runbook, catalogRevision: catalog!.revision, workerArtifactRevision: catalog!.worker.artifactRevision, alarms, executionCount: executions };
  });

  app.get("/automatic-runbooks/catalog/status", { onRequest: readGuard(app) }, async () => statusDto(await getCatalogState()));

  app.get("/automatic-runbooks/catalog/coverage", { onRequest: readGuard(app) }, async () => {
    const catalog = (await getCatalogState()).catalog;
    if (!catalog) return { revision: null, total: 0, byKind: {}, byCategory: {}, runbooks: 0, matchedAlarmNames: 0, unmatchedAlarmNames: [] };
    const names = [...new Set(catalog.runbooks.flatMap((entry) => entry.alarmNames))];
    const alarms = await prisma.alarm.findMany({ where: { name: { in: names } }, select: { name: true } });
    const matched = new Set(alarms.map((alarm) => alarm.name));
    const byKind: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const runbook of catalog.runbooks) {
      byKind[runbook.kind] = (byKind[runbook.kind] ?? 0) + 1;
      for (const category of runbook.categories) byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
    return { revision: catalog.revision, total: catalog.runbooks.length, byKind, byCategory, runbooks: catalog.runbooks.length, alarmNames: names.length, matchedAlarmNames: matched.size, unmatchedAlarmNames: names.filter((name) => !matched.has(name)) };
  });

  app.post("/automatic-runbooks/catalog/refresh", { onRequest: writeGuard(app) }, async (_request, reply) => {
    const result = await buildCatalogSync()();
    const state = await getCatalogState();
    if (result.kind === "FAILED") return reply.status(502).send({ sync: result, status: statusDto(state) });
    return { sync: result, status: statusDto(state) };
  });

  app.get<{ Querystring: { catalogRevision?: string; runbookKeys?: string; keys?: string } }>(
    "/internal/automatic-runbooks/deployment-status",
    { onRequest: [app.authenticate, requireService(RUNBOOK_AUTOMATION_SERVICE_ID)] },
    async (request) => {
      const rawKeys = request.query.runbookKeys ?? request.query.keys;
      const keys = rawKeys?.split(",").map((key) => key.trim()).filter(Boolean) ?? [];
      const activeStatuses = ["PENDING_DISPATCH", "QUEUED", "RUNNING", "RETRY_PENDING", "CANCEL_REQUESTED"] as const;
      const [catalogState, activeExecutions] = await Promise.all([
        getCatalogState(),
        prisma.automaticRunbookExecution.groupBy({
          by: ["requestedRunbookKey", "status"],
          where: { ...(keys.length > 0 ? { requestedRunbookKey: { in: keys } } : {}), status: { in: [...activeStatuses] } },
          _count: true,
        }),
      ]);
      const byStatus = Object.fromEntries(activeStatuses.map((status) => [
        status,
        activeExecutions.filter((entry) => entry.status === status).reduce((sum, entry) => sum + entry._count, 0),
      ]));
      const inFlightExecutions = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
      return {
        catalogRevisionObserved: catalogState.row?.revision === request.query.catalogRevision,
        observedCatalogRevision: catalogState.row?.revision ?? null,
        requestedCatalogRevision: request.query.catalogRevision ?? null,
        inFlightExecutions,
        byStatus,
        // Campi diagnostici compatibili con il pannello WT.
        status: statusDto(catalogState),
        requestedKeys: keys,
        activeExecutions,
        drained: inFlightExecutions === 0,
      };
    },
  );
}
