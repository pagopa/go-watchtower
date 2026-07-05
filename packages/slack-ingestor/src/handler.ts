import crypto from "node:crypto";
import { prisma, Prisma, createSlackAlarmEventDecision, getActiveCapabilityCatalog } from "@go-watchtower/database";
import {
  resolveAlarmPriority,
  validateSlackIngestorControl,
  evaluateCatalogReferenceHealth,
  SlackAutomationDecisions,
  AutomationModes,
  AutomationTriggerKinds,
  AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION,
  AUTOMATION_DEFAULT_MODE_SETTING_KEY,
  SLACK_INGESTOR_CONTROL_SETTING_KEY,
  type AlertPriorityLevel,
  type AlarmPriorityRule,
  type SlackIngestorControl,
  type AutomaticRunbookCatalog,
  type AutomaticRunbookDescriptor,
  type AutomationMode,
  type SlackAutomationDecisionMetadata,
} from "@go-watchtower/shared";
import { fetchMessagePages, getHttpWarningStats } from "./slack-client.js";
import { getCursor, saveCursor } from "./cursor-store.js";
import { getParser } from "./parsers/registry.js";
import { resolveAlarmId } from "./alarm-resolver.js";
import type { Message, ParsedAlarmEvent } from "./parsers/types.js";
import { decideSlackAutomation } from "./automation-decision.js";

const VERBOSE = process.env["VERBOSE"] === "1" || process.env["DEBUG"] === "1";

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function resolvePersistedPriority(params: {
  productId: string;
  environmentId: string;
  alarmId: string | null;
  name: string;
  firedAt: Date;
}): Promise<{
  priorityCode: string;
  priorityRuleId: string | null;
  priorityResolvedAt: Date;
}> {
  const [levelsRaw, rulesRaw] = await Promise.all([
    prisma.priorityLevel.findMany({
      orderBy: [{ rank: "desc" }, { code: "asc" }],
    }),
    prisma.alarmPriorityRule.findMany({
      where: { productId: params.productId, isActive: true },
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);

  const levels: AlertPriorityLevel[] = levelsRaw.map((level) => ({
    code:           level.code,
    label:          level.label,
    description:    level.description ?? null,
    rank:           level.rank,
    color:          level.color ?? null,
    icon:           level.icon ?? null,
    isActive:       level.isActive,
    isDefault:      level.isDefault,
    countsAsOnCall: level.countsAsOnCall,
    defaultNotify:  level.defaultNotify,
    isSystem:       level.isSystem,
    createdAt:      level.createdAt.toISOString(),
    updatedAt:      level.updatedAt.toISOString(),
  }));

  const rules: AlarmPriorityRule[] = rulesRaw.map((rule) => ({
    id:            rule.id,
    productId:     rule.productId,
    environmentId: rule.environmentId ?? null,
    priorityCode:  rule.priorityCode,
    name:          rule.name,
    matcherType:   rule.matcherType,
    alarmId:       rule.alarmId ?? null,
    namePrefix:    rule.namePrefix ?? null,
    namePattern:   rule.namePattern ?? null,
    precedence:    rule.precedence,
    note:          rule.note ?? null,
    isActive:      rule.isActive,
    validity:      parseJsonArray(rule.validity),
    exclusions:    parseJsonArray(rule.exclusions),
    createdAt:     rule.createdAt.toISOString(),
    updatedAt:     rule.updatedAt.toISOString(),
  }));

  const resolved = resolveAlarmPriority({
    productId:     params.productId,
    environmentId: params.environmentId,
    alarmId:       params.alarmId,
    alarmName:     params.name,
    firedAt:       params.firedAt,
    levels,
    rules,
  });

  return {
    priorityCode:       resolved.level.code,
    priorityRuleId:     resolved.rule?.id ?? null,
    priorityResolvedAt: new Date(),
  };
}

/** Per-channel stats collected during processing. */
interface ChannelStats {
  label: string;
  channelId: string;
  processed: number;
  created: number;
  skipped: number;
  duplicates: number;
  parseErrors: number;
  dbErrors: number;
  createdAlarms: string[];
}

interface IngestorSnapshot {
  control: SlackIngestorControl;
  defaultMode: AutomationMode;
  catalog: AutomaticRunbookCatalog | null;
  catalogUsable: boolean;
  scopeUnsafe: boolean;
  capabilityByAlarmName: Map<string, AutomaticRunbookDescriptor>;
}

async function loadSnapshot(): Promise<IngestorSnapshot | null> {
  const [controlSetting, modeSetting, activeCatalog] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: SLACK_INGESTOR_CONTROL_SETTING_KEY }, select: { value: true } }),
    prisma.systemSetting.findUnique({ where: { key: AUTOMATION_DEFAULT_MODE_SETTING_KEY }, select: { value: true } }),
    getActiveCapabilityCatalog(),
  ]);
  const controlValidation = validateSlackIngestorControl(controlSetting?.value, { allowGlobalMatchers: true });
  if (!controlValidation.valid) {
    console.error("[slack-ingestor] invalid or missing slackIngestor.control", controlValidation.errors);
    return null;
  }
  const control = controlValidation.value;
  if (control.ingestionMode === "PAUSED") {
    await prisma.slackChannelCursor.updateMany({ data: { lastStatus: "PAUSED", lastControlRevision: control.revision } });
    console.info(`[slack-ingestor] paused at control revision ${control.revision}`);
    return null;
  }
  const rawMode = typeof modeSetting?.value === "string" ? modeSetting.value : null;
  const defaultMode: AutomationMode = rawMode === AutomationModes.APPLY_ALL || rawMode === AutomationModes.APPLY_KNOWN
    ? rawMode
    : AutomationModes.SHADOW;
  const catalog = activeCatalog.catalog;
  const referenceHealth = catalog ? evaluateCatalogReferenceHealth(control, catalog.runbooks) : null;
  const capabilityByAlarmName = new Map<string, AutomaticRunbookDescriptor>();
  for (const runbook of catalog?.runbooks ?? []) {
    for (const alarmName of runbook.alarmNames) capabilityByAlarmName.set(alarmName, runbook);
  }
  return { control, defaultMode, catalog, catalogUsable: activeCatalog.usable && catalog !== null, scopeUnsafe: referenceHealth?.unsafe ?? false, capabilityByAlarmName };
}

export const handler = async (): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!snapshot) return; // invalid control or PAUSED: no Slack call and no cursor movement
  const channels = await prisma.environment.findMany({
    where: {
      slackIngestorEnabled: true,
      slackChannelId: { not: null },
      slackParserId: { not: null },
      defaultAwsAccountId: { not: null },
    },
    include: { product: { select: { name: true } } },
    orderBy: [{ productId: "asc" }, { order: "asc" }],
  });
  if (channels.length === 0) {
    console.warn("[slack-ingestor] no enabled environment has a complete Slack configuration");
    return;
  }

  const startTime = Date.now();
  const allStats: ChannelStats[] = [];

  for (const environment of channels) {
    const channelId = environment.slackChannelId!;
    const label = `${environment.product.name} / ${environment.name}`;

    const stats: ChannelStats = {
      label,
      channelId,
      processed:     0,
      created:       0,
      skipped:       0,
      duplicates:    0,
      parseErrors:   0,
      dbErrors:      0,
      createdAlarms: [],
    };

    try {
      await processChannel(channelId, environment.productId, environment.id, {
        parserId: environment.slackParserId!,
        defaultAwsAccountId: environment.defaultAwsAccountId!,
        defaultAwsRegion: environment.defaultAwsRegion ?? undefined,
      }, stats, snapshot);
    } catch (err) {
      console.error(`[${label}] Channel processing failed:`, err);
      await recordCursorFailure(channelId, snapshot, err);
    }

    // Per-channel summary (always logged)
    logChannelSummary(stats);
    allStats.push(stats);
  }

  // Global summary across all channels
  const httpWarnings = getHttpWarningStats();
  logGlobalSummary(allStats, Date.now() - startTime, httpWarnings);
};

async function processChannel(
  channelId: string,
  productId: string,
  environmentId: string,
  opts: {
    parserId: string;
    defaultAwsAccountId: string;
    defaultAwsRegion?: string | undefined;
  },
  stats: ChannelStats,
  snapshot: IngestorSnapshot,
): Promise<void> {
  await recordCursorAttempt(channelId, snapshot);
  const cursor = await getCursor(channelId);
  const parse  = getParser(opts.parserId as Parameters<typeof getParser>[0]);
  const defaults = {
    defaultAwsAccountId: opts.defaultAwsAccountId,
    defaultAwsRegion:    opts.defaultAwsRegion,
  };

  // Il cursore avanza in memoria messaggio per messaggio e viene persistito una
  // volta per pagina: il dedup sull'unique slackMessageId rende sicuro rileggere
  // un'intera pagina dopo un crash, mentre un write per messaggio moltiplicava
  // i roundtrip DB sui backlog grandi.
  let lastTs: string | null = null;

  for await (const page of fetchMessagePages(channelId, cursor)) {
    for (const msg of page) {
      const ts = msg.ts;
      if (!ts) continue;

      stats.processed++;

      let parsed;
      try {
        parsed = parse(msg, defaults);
      } catch (err) {
        stats.parseErrors++;
        console.error(`[${stats.label}] Parser error for ts=${ts}:`, err);
        logVerboseResult(stats.label, msg, null, "parse_error", err);
        lastTs = ts;
        continue;
      }

      if (!parsed) {
        stats.skipped++;
        logVerboseResult(stats.label, msg, null, "skipped");
        lastTs = ts;
        continue;
      }

      try {
        const alarmId = await resolveAlarmId(productId, parsed.name);
        const priority = await resolvePersistedPriority({
          productId,
          environmentId,
          alarmId,
          name: parsed.name,
          firedAt: parsed.firedAt,
        });

        const capability = snapshot.capabilityByAlarmName.get(parsed.name) ?? null;
        const decided = decideSlackAutomation({
          control: snapshot.control,
          alarmId,
          catalogUsable: snapshot.catalogUsable && snapshot.catalog !== null,
          scopeUnsafe: snapshot.scopeUnsafe,
          capability,
          context: {
            channelId, productId, environmentId, alarmName: parsed.name,
            awsRegion: parsed.awsRegion, awsAccountId: parsed.awsAccountId,
            priorityCode: priority.priorityCode,
          },
        });
        const { decision, matchedRuleId, ruleEffect } = decided;

        const eventId = crypto.randomUUID();
        const executionId = decision === SlackAutomationDecisions.EXECUTION_CREATED ? crypto.randomUUID() : null;
        const metadata: SlackAutomationDecisionMetadata = {
          schemaVersion: 1,
          controlRevision: snapshot.control.revision,
          executionPolicy: snapshot.control.executionPolicy,
          ...(matchedRuleId ? { matchedRuleId } : {}),
          ...(ruleEffect ? { ruleEffect } : {}),
          ...(snapshot.catalog ? { catalogRevision: snapshot.catalog.revision } : {}),
          ...(capability && snapshot.catalog ? {
            runbook: {
              key: capability.key, version: capability.version, definitionDigest: capability.definitionDigest,
              kind: capability.kind, categories: capability.categories,
              workerRevision: snapshot.catalog.worker.artifactRevision,
            },
          } : {}),
          ...(executionId ? { executionId, appliedMode: snapshot.defaultMode } : {}),
        };

        const command = executionId && capability && snapshot.catalog && alarmId ? {
          schemaVersion: AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION,
          executionId,
          alarmEvent: {
            id: eventId, productId, environmentId, alarmId, alarmName: parsed.name,
            firedAt: parsed.firedAt.toISOString(), awsAccountId: parsed.awsAccountId, awsRegion: parsed.awsRegion,
          },
          runbook: {
            key: capability.key, version: capability.version, definitionDigest: capability.definitionDigest,
            catalogRevision: snapshot.catalog.revision, workerRevision: snapshot.catalog.worker.artifactRevision,
          },
          trigger: { kind: AutomationTriggerKinds.SLACK_INGESTOR },
        } : null;
        await createSlackAlarmEventDecision({
          eventData: {
            id: eventId,
            name:           parsed.name,
            firedAt:        parsed.firedAt,
            awsRegion:      parsed.awsRegion,
            awsAccountId:   parsed.awsAccountId,
            description:    parsed.description,
            reason:         parsed.reason,
            productId,
            environmentId,
            alarmId,
            priorityCode:       priority.priorityCode,
            priorityRuleId:     priority.priorityRuleId,
            priorityResolvedAt: priority.priorityResolvedAt,
            slackMessageId: `${channelId}/${ts}`,
          },
          decision,
          decisionMetadata: metadata,
          ...(command && capability && snapshot.catalog ? {
            execution: {
              id: executionId!,
              appliedMode: snapshot.defaultMode,
              capability: {
                key: capability.key, version: capability.version, definitionDigest: capability.definitionDigest,
                catalogRevision: snapshot.catalog.revision, workerRevision: snapshot.catalog.worker.artifactRevision,
              },
              command: command as Prisma.InputJsonValue,
            },
          } : {}),
        });
        stats.created++;
        stats.createdAlarms.push(parsed.name);
        logVerboseResult(stats.label, msg, parsed, "created");
      } catch (err: unknown) {
        if (isPrismaUniqueError(err)) {
          stats.duplicates++;
          console.warn(`[${stats.label}] Duplicate ts=${ts}, skipping`);
          logVerboseResult(stats.label, msg, parsed, "duplicate");
          // Forward-only: una decisione esistente non viene mai rivalutata.
          await prisma.alarmEvent.updateMany({
            where: { slackMessageId: `${channelId}/${ts}`, automationDecision: null },
            data: {
              automationDecision: SlackAutomationDecisions.LEGACY_EVENT_NOT_EVALUATED,
              automationDecisionMetadata: {
                schemaVersion: 1,
                controlRevision: snapshot.control.revision,
                executionPolicy: snapshot.control.executionPolicy,
                reasonDetail: "Evento importato prima dell'introduzione delle decisioni forward-only",
              },
              automationDecidedAt: new Date(),
            },
          });
        } else {
          stats.dbErrors++;
          console.error(`[${stats.label}] DB error for ts=${ts}:`, err);
          logVerboseResult(stats.label, msg, parsed, "db_error", err);
          // Non perdere il progresso dei messaggi già riusciti in questa pagina.
          // Best-effort: se anche questo write fallisce, l'errore originale vince
          // e il dedup assorbe la rilettura al prossimo run.
          if (lastTs) await saveCursor(channelId, lastTs).catch(() => undefined);
          throw err;
        }
      }

      lastTs = ts;
    }

    if (lastTs) await saveCursor(channelId, lastTs);
  }
  await recordCursorSuccess(channelId, snapshot, stats);
}

async function recordCursorAttempt(channelId: string, snapshot: IngestorSnapshot): Promise<void> {
  await prisma.slackChannelCursor.upsert({
    where: { channelId },
    create: { channelId, lastAttemptAt: new Date(), lastStatus: "RUNNING", lastControlRevision: snapshot.control.revision, lastCatalogRevision: snapshot.catalog?.revision },
    update: { lastAttemptAt: new Date(), lastStatus: "RUNNING", lastError: null, lastControlRevision: snapshot.control.revision, lastCatalogRevision: snapshot.catalog?.revision },
  });
}

async function recordCursorSuccess(channelId: string, snapshot: IngestorSnapshot, stats: ChannelStats): Promise<void> {
  await prisma.slackChannelCursor.update({
    where: { channelId },
    data: { lastSuccessAt: new Date(), lastStatus: stats.parseErrors > 0 ? "PARTIAL" : "SUCCESS", lastError: null, lastSummary: stats as unknown as Prisma.InputJsonValue, lastControlRevision: snapshot.control.revision, lastCatalogRevision: snapshot.catalog?.revision },
  });
}

async function recordCursorFailure(channelId: string, snapshot: IngestorSnapshot, error: unknown): Promise<void> {
  await prisma.slackChannelCursor.upsert({
    where: { channelId },
    create: { channelId, lastAttemptAt: new Date(), lastStatus: "FAILED", lastError: error instanceof Error ? error.message : String(error), lastControlRevision: snapshot.control.revision, lastCatalogRevision: snapshot.catalog?.revision },
    update: { lastStatus: "FAILED", lastError: error instanceof Error ? error.message : String(error), lastControlRevision: snapshot.control.revision, lastCatalogRevision: snapshot.catalog?.revision },
  });
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

function logChannelSummary(stats: ChannelStats): void {
  if (stats.processed === 0) {
    console.log(`[${stats.label}] No new messages`);
    return;
  }

  // Structured JSON for easy CloudWatch Insights queries
  console.log(JSON.stringify({
    _type:         "channel_summary",
    label:         stats.label,
    channelId:     stats.channelId,
    processed:     stats.processed,
    created:       stats.created,
    skipped:       stats.skipped,
    duplicates:    stats.duplicates,
    parseErrors:   stats.parseErrors,
    dbErrors:      stats.dbErrors,
    createdAlarms: stats.createdAlarms,
  }));
}

function logGlobalSummary(
  allStats: ChannelStats[],
  durationMs: number,
  httpWarnings: { count: number; lastDetail: string },
): void {
  const totals = allStats.reduce(
    (acc, s) => ({
      processed:   acc.processed   + s.processed,
      created:     acc.created     + s.created,
      skipped:     acc.skipped     + s.skipped,
      duplicates:  acc.duplicates  + s.duplicates,
      parseErrors: acc.parseErrors + s.parseErrors,
      dbErrors:    acc.dbErrors    + s.dbErrors,
    }),
    { processed: 0, created: 0, skipped: 0, duplicates: 0, parseErrors: 0, dbErrors: 0 },
  );

  console.log(JSON.stringify({
    _type:       "run_summary",
    channels:    allStats.length,
    durationMs,
    ...totals,
    httpRetries: httpWarnings.count,
    ...(httpWarnings.count > 0 && { lastHttpError: httpWarnings.lastDetail }),
    byChannel:   allStats
      .filter(s => s.processed > 0)
      .map(s => ({
        label:     s.label,
        processed: s.processed,
        created:   s.created,
        skipped:   s.skipped,
        alarms:    s.createdAlarms,
      })),
  }));
}

function logVerboseResult(
  label: string,
  msg: Message,
  result: ParsedAlarmEvent | null,
  outcome: "created" | "skipped" | "duplicate" | "parse_error" | "db_error",
  err?: unknown,
): void {
  if (!VERBOSE) return;

  const ts      = msg.ts ?? "?";
  const preview = msgPreview(msg);

  const ICONS: Record<typeof outcome, string> = {
    created:     "✅",
    skipped:     "⏭️ ",
    duplicate:   "🔁",
    parse_error: "⚠️ ",
    db_error:    "💥",
  };

  const icon = ICONS[outcome];
  console.log(`\n${icon} [${label}] ts=${ts} — ${outcome.toUpperCase()}`);
  console.log(`   preview : ${preview}`);

  if (outcome === "skipped" || outcome === "created") {
    console.log(`   raw msg : ${JSON.stringify(msg)}`);
  }

  if (result) {
    console.log(`   name    : ${result.name}`);
    console.log(`   firedAt : ${result.firedAt.toISOString()}`);
    console.log(`   region  : ${result.awsRegion}`);
    console.log(`   account : ${result.awsAccountId}`);
    if (result.description) console.log(`   desc    : ${result.description.slice(0, 120)}`);
    if (result.reason)      console.log(`   reason  : ${result.reason.slice(0, 120)}`);
  }

  if (err) {
    console.log(`   error   :`, err);
  }
}

function msgPreview(msg: Message): string {
  if (msg.text && msg.text.trim()) {
    return msg.text.trim().slice(0, 160).replace(/\n/g, " ↵ ");
  }
  const blocks = msg.blocks as Array<{ type?: string; text?: { text?: string } }> | undefined;
  if (blocks) {
    for (const b of blocks) {
      if (b?.text?.text) return b.text.text.trim().slice(0, 160).replace(/\n/g, " ↵ ");
    }
  }
  const attachments = msg.attachments;
  if (attachments?.[0]?.text)     return attachments[0].text.slice(0, 160).replace(/\n/g, " ↵ ");
  if (attachments?.[0]?.fallback) return attachments[0].fallback.slice(0, 160).replace(/\n/g, " ↵ ");
  const files = msg.files as Array<Record<string, unknown>> | undefined;
  const emailPlain = files?.find((f) => f["filetype"] === "email")?.[
    "preview_plain_text"
  ] as string | undefined;
  if (emailPlain) return emailPlain.slice(0, 160).replace(/\n/g, " ↵ ");
  return "(no preview)";
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err).code === "P2002"
  );
}
