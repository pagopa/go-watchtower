import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma, Prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { requireHumanPrincipal } from "../../lib/require-principal.js";
import { toJsonInput } from "../../utils/json-cast.js";
import {
  SLACK_INGESTOR_CONTROL_KEY,
  parseControl,
  validateControl,
  withQuickExclusion,
  withoutQuickExclusion,
  onlyPreset,
  quickRunbookRuleId,
  quickAlarmRuleId,
  evaluateScope,
  findCapabilityForAlarm,
  type SlackIngestorControl,
} from "../../services/slack-ingestor-control.js";
import { getCatalogState } from "../../services/automation/capability-catalog.js";
import { env } from "../../config/env.js";
import { buildDispatchDeps } from "../../services/automation/reconciler-scheduler.js";

const RESOURCE = SystemComponent.SYSTEM_SETTING;
const guardRead = (app: FastifyInstance) => [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "read")];
const guardWrite = (app: FastifyInstance) => [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "write")];

interface MutationBody { control?: unknown; expectedRevision: number; changeNote: string; confirm?: boolean; confirmGlobalMatchers?: boolean }

async function validateDatabaseReferences(control: SlackIngestorControl) {
  const productIds = [...new Set(control.rules.flatMap((rule) => rule.matcher.productIds ?? []))];
  const environmentIds = [...new Set(control.rules.flatMap((rule) => rule.matcher.environmentIds ?? []))];
  const alarmIds = [...new Set(control.rules.flatMap((rule) => rule.matcher.alarmIds ?? []))];
  const [products, environments, alarms] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } }),
    prisma.environment.findMany({ where: { id: { in: environmentIds } }, select: { id: true, productId: true } }),
    prisma.alarm.findMany({ where: { id: { in: alarmIds } }, select: { id: true, productId: true } }),
  ]);
  const productSet = new Set(products.map((item) => item.id));
  const environmentMap = new Map(environments.map((item) => [item.id, item.productId]));
  const alarmMap = new Map(alarms.map((item) => [item.id, item.productId]));
  const errors: Array<{ code: string; path: string; message: string }> = [];
  for (const id of productIds) if (!productSet.has(id)) errors.push({ code: "PRODUCT_NOT_FOUND", path: "rules.matcher.productIds", message: `Product ${id} inesistente.` });
  for (const id of environmentIds) if (!environmentMap.has(id)) errors.push({ code: "ENVIRONMENT_NOT_FOUND", path: "rules.matcher.environmentIds", message: `Environment ${id} inesistente.` });
  for (const id of alarmIds) if (!alarmMap.has(id)) errors.push({ code: "ALARM_NOT_FOUND", path: "rules.matcher.alarmIds", message: `Alarm ${id} inesistente.` });
  for (const rule of control.rules) {
    if (!rule.matcher.productIds) continue;
    const allowed = new Set(rule.matcher.productIds);
    for (const id of rule.matcher.environmentIds ?? []) {
      const owner = environmentMap.get(id);
      if (owner && !allowed.has(owner)) errors.push({ code: "ENVIRONMENT_PRODUCT_MISMATCH", path: `rules.${rule.id}.matcher.environmentIds`, message: `Environment ${id} non appartiene ai product della regola.` });
    }
    for (const id of rule.matcher.alarmIds ?? []) {
      const owner = alarmMap.get(id);
      if (owner && !allowed.has(owner)) errors.push({ code: "ALARM_PRODUCT_MISMATCH", path: `rules.${rule.id}.matcher.alarmIds`, message: `Alarm ${id} non appartiene ai product della regola.` });
    }
  }
  return errors;
}

async function readState() {
  const [setting, catalogState] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: SLACK_INGESTOR_CONTROL_KEY } }),
    getCatalogState(),
  ]);
  const control = parseControl(setting?.value);
  const catalog = catalogState.catalog;
  const validation = control ? validateControl(control, catalog?.runbooks ?? [], true) : validateControl(setting?.value, [], true);
  return { setting, control, catalog, validation };
}

function badRequest(reply: FastifyReply, error: string, details?: unknown) {
  return reply.status(400).send({ error, details });
}

async function saveControl(params: {
  expectedRevision: number;
  control: SlackIngestorControl;
  changeNote: string;
  userId: string;
  userLabel: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM system_settings WHERE key = ${SLACK_INGESTOR_CONTROL_KEY} FOR UPDATE`);
    const setting = await tx.systemSetting.findUnique({ where: { key: SLACK_INGESTOR_CONTROL_KEY } });
    const before = parseControl(setting?.value);
    if (!setting || !before) throw new Error("CONTROL_INVALID_OR_MISSING");
    if (before.revision !== params.expectedRevision) throw new Error("CONTROL_REVISION_CHANGED");
    const after = { ...params.control, revision: before.revision + 1 };
    await tx.systemSetting.update({
      where: { key: SLACK_INGESTOR_CONTROL_KEY },
      data: { value: toJsonInput(after), updatedById: params.userId },
    });
    await tx.systemEvent.create({
      data: {
        userId: params.userId,
        userLabel: params.userLabel,
        action: "SLACK_INGESTOR_CONTROL_UPDATED",
        resource: "SLACK_INGESTOR_CONTROL",
        resourceId: SLACK_INGESTOR_CONTROL_KEY,
        resourceLabel: "Controllo Slack Ingestor",
        metadata: toJsonInput({ changeNote: params.changeNote, before, after }),
      },
    });
    return after;
  });
}

async function previewControl(control: SlackIngestorControl, limit = 500) {
  const activeCatalog = await getCatalogState();
  const catalog = activeCatalog.catalog;
  const counts: Record<string, number> = {};
  const byRunbook: Record<string, number> = {};
  const rows = await prisma.alarmEvent.findMany({
    take: Math.min(Math.max(limit, 1), 2000),
    orderBy: { firedAt: "desc" },
    include: { alarm: { select: { name: true } } },
  });
  for (const event of rows) {
    let decision = "EXECUTION_POLICY_OFF";
    if (control.executionPolicy === "AVAILABLE_ONLY") {
      if (!event.alarmId || !event.alarm) decision = "UNLINKED_ALARM";
      else if (!activeCatalog.usable || !catalog) decision = "CATALOG_UNAVAILABLE";
      else {
        const capability = findCapabilityForAlarm(catalog.runbooks, event.alarm.name);
        if (!capability) decision = "NO_CAPABILITY";
        else {
          const evaluated = evaluateScope(control, {
            channelId: event.slackMessageId?.split("/")[0] ?? "",
            productId: event.productId,
            environmentId: event.environmentId,
            alarmId: event.alarmId,
            alarmName: event.alarm.name,
            awsRegion: event.awsRegion,
            awsAccountId: event.awsAccountId,
            priorityCode: event.priorityCode,
            runbook: capability,
          });
          decision = evaluated.effect === "ALLOW" ? "EXECUTION_CREATED" : "SCOPE_DENIED";
          byRunbook[capability.key] = (byRunbook[capability.key] ?? 0) + 1;
        }
      }
    }
    counts[decision] = (counts[decision] ?? 0) + 1;
  }
  return { sampleSize: rows.length, counts, byRunbook };
}

export async function slackIngestorControlRoutes(app: FastifyInstance): Promise<void> {
  app.get("/slack-ingestor/control", { onRequest: guardRead(app) }, async (_request, reply) => {
    const state = await readState();
    if (!state.control) return reply.status(503).send({ error: "CONTROL_INVALID_OR_MISSING" });
    return { control: state.control, catalogReferenceHealth: state.validation.catalogReferenceHealth, warnings: state.validation.warnings };
  });

  app.post<{ Body: { control: unknown; confirmGlobalMatchers?: boolean } }>("/slack-ingestor/control/validate", { onRequest: guardWrite(app) }, async (request) => {
    const catalog = (await getCatalogState()).catalog;
    const validation = validateControl(request.body.control, catalog?.runbooks ?? [], request.body.confirmGlobalMatchers === true);
    const control = parseControl(request.body.control);
    const referenceErrors = control ? await validateDatabaseReferences(control) : [];
    return { ...validation, valid: validation.valid && referenceErrors.length === 0, errors: [...validation.errors, ...referenceErrors] };
  });

  app.post<{ Body: { control: unknown; limit?: number; confirmGlobalMatchers?: boolean } }>("/slack-ingestor/control/preview", { onRequest: guardRead(app) }, async (request, reply) => {
    const control = parseControl(request.body.control);
    if (!control) return badRequest(reply, "INVALID_CONTROL_SCHEMA");
    const catalog = (await getCatalogState()).catalog;
    const validation = validateControl(control, catalog?.runbooks ?? [], request.body.confirmGlobalMatchers === true);
    const referenceErrors = await validateDatabaseReferences(control);
    if (!validation.valid || referenceErrors.length > 0) return badRequest(reply, "CONTROL_VALIDATION_FAILED", { ...validation, errors: [...validation.errors, ...referenceErrors] });
    return { validation, preview: await previewControl(control, request.body.limit) };
  });

  app.put<{ Body: MutationBody }>("/slack-ingestor/control", { onRequest: guardWrite(app) }, async (request, reply) => {
    const control = parseControl(request.body.control);
    if (!control || !request.body.changeNote?.trim()) return badRequest(reply, "INVALID_CONTROL_MUTATION");
    if (control.revision !== request.body.expectedRevision) return badRequest(reply, "CONTROL_PAYLOAD_REVISION_MISMATCH");
    const catalog = (await getCatalogState()).catalog;
    const validation = validateControl(control, catalog?.runbooks ?? [], request.body.confirmGlobalMatchers === true);
    const referenceErrors = await validateDatabaseReferences(control);
    if (!validation.valid || referenceErrors.length > 0) return badRequest(reply, "CONTROL_VALIDATION_FAILED", { ...validation, errors: [...validation.errors, ...referenceErrors] });
    try {
      const saved = await saveControl({ expectedRevision: request.body.expectedRevision, control, changeNote: request.body.changeNote, userId: request.user.userId, userLabel: request.user.name ?? request.user.email });
      return { control: saved, catalogReferenceHealth: validation.catalogReferenceHealth, warnings: validation.warnings };
    } catch (error) {
      if (error instanceof Error && error.message === "CONTROL_REVISION_CHANGED") return reply.status(409).send({ error: error.message });
      throw error;
    }
  });

  // Le ultime 25 revisioni bastano per l'uso reale ("chi ha cambiato cosa e
  // perché"); il metadata contiene i documenti before/after completi, quindi
  // il payload va tenuto corto.
  app.get("/slack-ingestor/control/history", { onRequest: guardRead(app) }, async () => prisma.systemEvent.findMany({
    where: { resource: "SLACK_INGESTOR_CONTROL", resourceId: SLACK_INGESTOR_CONTROL_KEY },
    orderBy: { createdAt: "desc" }, take: 25,
  }));

  const quickMutation = async (request: { params: { key?: string; alarmId?: string }; body: MutationBody; user: { userId: string; name?: string; email?: string } }, reply: FastifyReply, remove: boolean) => {
    const state = await readState();
    if (!state.control) return reply.status(503).send({ error: "CONTROL_INVALID_OR_MISSING" });
    if (state.control.revision !== request.body.expectedRevision) return reply.status(409).send({ error: "CONTROL_REVISION_CHANGED" });
    if (!request.body.changeNote?.trim()) return badRequest(reply, "CHANGE_NOTE_REQUIRED");
    let proposed: SlackIngestorControl;
    if (request.params.key !== undefined) {
      if (!remove && !state.catalog?.runbooks.some((runbook) => runbook.key === request.params.key)) return reply.status(404).send({ error: "RUNBOOK_NOT_FOUND" });
      proposed = remove ? withoutQuickExclusion(state.control, quickRunbookRuleId(request.params.key)) : withQuickExclusion(state.control, { kind: "runbook", key: request.params.key });
    } else {
      const alarmId = request.params.alarmId!;
      const alarm = remove ? null : await prisma.alarm.findUnique({ where: { id: alarmId }, select: { id: true, name: true } });
      if (!remove && !alarm) return reply.status(404).send({ error: "ALARM_NOT_FOUND" });
      proposed = remove ? withoutQuickExclusion(state.control, quickAlarmRuleId(alarmId)) : withQuickExclusion(state.control, { kind: "alarm", alarmId: alarm!.id, alarmName: alarm!.name });
    }
    if (JSON.stringify(proposed.rules) === JSON.stringify(state.control.rules)) {
      return { control: state.control, validation: state.validation, changed: false };
    }
    try {
      const saved = await saveControl({ expectedRevision: request.body.expectedRevision, control: proposed, changeNote: request.body.changeNote, userId: request.user.userId, userLabel: request.user.name ?? request.user.email ?? request.user.userId });
      return { control: saved, validation: validateControl(saved, state.catalog?.runbooks ?? [], true), changed: true };
    } catch (error) {
      if (error instanceof Error && error.message === "CONTROL_REVISION_CHANGED") return reply.status(409).send({ error: error.message });
      throw error;
    }
  };

  for (const path of [
    "/slack-ingestor/control/exclusions/runbooks/:key",
    "/slack-ingestor/control/exclusions/alarms/:alarmId",
  ] as const) {
    app.put<{ Params: { key?: string; alarmId?: string }; Body: MutationBody }>(path, { onRequest: guardWrite(app) }, (request, reply) => quickMutation(request, reply, false));
    app.delete<{ Params: { key?: string; alarmId?: string }; Body: MutationBody }>(path, { onRequest: guardWrite(app) }, (request, reply) => quickMutation(request, reply, true));
  }

  const preset = async (request: { params: { key?: string; alarmId?: string }; body: MutationBody; user: { userId: string; name?: string; email?: string } }, reply: FastifyReply) => {
    const state = await readState();
    if (!state.control) return reply.status(503).send({ error: "CONTROL_INVALID_OR_MISSING" });
    if (state.control.revision !== request.body.expectedRevision) return reply.status(409).send({ error: "CONTROL_REVISION_CHANGED" });
    const target = request.params.key !== undefined ? { kind: "runbook" as const, key: request.params.key } : { kind: "alarm" as const, alarmId: request.params.alarmId! };
    if (target.kind === "runbook" && !state.catalog?.runbooks.some((r) => r.key === target.key)) return reply.status(404).send({ error: "RUNBOOK_NOT_FOUND" });
    if (target.kind === "alarm" && !(await prisma.alarm.findUnique({ where: { id: target.alarmId }, select: { id: true } }))) return reply.status(404).send({ error: "ALARM_NOT_FOUND" });
    const proposed = onlyPreset(state.control, target);
    const preview = await previewControl(proposed);
    if (!request.body.confirm) return { proposedControl: proposed, preview };
    if (!request.body.changeNote?.trim()) return badRequest(reply, "CHANGE_NOTE_REQUIRED");
    try {
      const saved = await saveControl({ expectedRevision: request.body.expectedRevision, control: proposed, changeNote: request.body.changeNote, userId: request.user.userId, userLabel: request.user.name ?? request.user.email ?? request.user.userId });
      return { control: saved, preview };
    } catch (error) {
      if (error instanceof Error && error.message === "CONTROL_REVISION_CHANGED") return reply.status(409).send({ error: error.message });
      throw error;
    }
  };
  app.post<{ Params: { key: string }; Body: MutationBody }>("/slack-ingestor/control/presets/only-runbook/:key", { onRequest: guardWrite(app) }, preset);
  app.post<{ Params: { alarmId: string }; Body: MutationBody }>("/slack-ingestor/control/presets/only-alarm/:alarmId", { onRequest: guardWrite(app) }, preset);

  app.get("/slack-ingestor/status", { onRequest: guardRead(app) }, async () => {
    const state = await readState();
    const [channels, decisionStats] = await Promise.all([
      prisma.environment.count({ where: { slackIngestorEnabled: true } }),
      prisma.alarmEvent.groupBy({ by: ["automationDecision"], _count: true, where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ]);
    return { ingestionMode: state.control?.ingestionMode ?? null, executionPolicy: state.control?.executionPolicy ?? null, controlRevision: state.control?.revision ?? null, controlHealth: state.control ? state.validation.catalogReferenceHealth : "INVALID", enabledChannels: channels, decisionStats };
  });

  app.get("/slack-ingestor/channels", { onRequest: guardRead(app) }, async () => {
    const environments = await prisma.environment.findMany({
      where: { slackChannelId: { not: null } }, include: { product: { select: { id: true, name: true } } }, orderBy: [{ productId: "asc" }, { name: "asc" }],
    });
    const cursors = await prisma.slackChannelCursor.findMany({ where: { channelId: { in: environments.flatMap((environment) => environment.slackChannelId ? [environment.slackChannelId] : []) } } });
    const byChannel = new Map(cursors.map((cursor) => [cursor.channelId, cursor]));
    const dispatch = buildDispatchDeps();
    const regions = [...new Set(environments.flatMap((environment) => environment.defaultAwsRegion ? [environment.defaultAwsRegion] : []))];
    const routing = new Map(await Promise.all(regions.map(async (region) => [region, dispatch ? await dispatch.registry.resolveQueue(region) : { kind: "QUEUE_REGISTRY_NOT_CONFIGURED" }] as const)));
    return environments.map((environment) => ({
      ...environment,
      cursor: environment.slackChannelId ? byChannel.get(environment.slackChannelId) ?? null : null,
      routingStatus: environment.defaultAwsRegion ? routing.get(environment.defaultAwsRegion)?.kind ?? "UNKNOWN" : "REGION_NOT_CONFIGURED",
    }));
  });

  app.post<{ Params: { environmentId: string } }>("/slack-ingestor/channels/:environmentId/check", { onRequest: guardWrite(app) }, async (request, reply) => {
    const environment = await prisma.environment.findUnique({ where: { id: request.params.environmentId }, select: { slackChannelId: true, slackParserId: true } });
    if (!environment?.slackChannelId) return reply.status(404).send({ error: "SLACK_CHANNEL_NOT_CONFIGURED" });
    if (!env.SLACK_BOT_TOKEN) return reply.status(503).send({ error: "SLACK_BOT_TOKEN_NOT_CONFIGURED" });
    const response = await fetch("https://slack.com/api/conversations.info", {
      method: "POST",
      headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ channel: environment.slackChannelId }),
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json() as { ok?: boolean; error?: string; channel?: { id?: string; name?: string; is_member?: boolean } };
    if (!response.ok || result.ok !== true) return reply.status(502).send({ ok: false, error: result.error ?? `HTTP_${response.status}` });
    return { ok: true, channel: result.channel, parserId: environment.slackParserId };
  });

  app.get("/slack-ingestor/decision-stats", { onRequest: guardRead(app) }, async () => prisma.alarmEvent.groupBy({ by: ["automationDecision"], _count: true }));
}
