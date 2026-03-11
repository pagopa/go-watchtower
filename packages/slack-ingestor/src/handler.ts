import { prisma } from "@go-watchtower/database";
import { CHANNEL_REGISTRY } from "./config.js";
import { fetchMessagePages, getHttpWarningStats } from "./slack-client.js";
import { getCursor, saveCursor } from "./cursor-store.js";
import { getParser } from "./parsers/registry.js";
import { resolveAlarmId } from "./alarm-resolver.js";
import type { Message, ParsedAlarmEvent } from "./parsers/types.js";

const VERBOSE = process.env["VERBOSE"] === "1" || process.env["DEBUG"] === "1";

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

export const handler = async (): Promise<void> => {
  if (CHANNEL_REGISTRY.length === 0) {
    console.warn(
      "[slack-ingestor] CHANNEL_REGISTRY is empty -- nothing to process",
    );
    return;
  }

  const startTime = Date.now();
  const allStats: ChannelStats[] = [];

  for (let i = 0; i < CHANNEL_REGISTRY.length; i++) {
    const channel = CHANNEL_REGISTRY[i]!;

    const stats: ChannelStats = {
      label:         channel.label,
      channelId:     channel.channelId,
      processed:     0,
      created:       0,
      skipped:       0,
      duplicates:    0,
      parseErrors:   0,
      dbErrors:      0,
      createdAlarms: [],
    };

    try {
      await processChannel(channel.channelId, channel.productId, channel.environmentId, {
        parserId:            channel.parserId,
        defaultAwsAccountId: channel.defaultAwsAccountId,
        defaultAwsRegion:    channel.defaultAwsRegion,
      }, stats);
    } catch (err) {
      console.error(`[${channel.label}] Channel processing failed:`, err);
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
): Promise<void> {
  const cursor = await getCursor(channelId);
  const parse  = getParser(opts.parserId as Parameters<typeof getParser>[0]);
  const defaults = {
    defaultAwsAccountId: opts.defaultAwsAccountId,
    defaultAwsRegion:    opts.defaultAwsRegion,
  };

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
        await saveCursor(channelId, ts);
        continue;
      }

      if (!parsed) {
        stats.skipped++;
        logVerboseResult(stats.label, msg, null, "skipped");
        await saveCursor(channelId, ts);
        continue;
      }

      try {
        const alarmId = await resolveAlarmId(productId, parsed.name);

        await prisma.alarmEvent.create({
          data: {
            name:           parsed.name,
            firedAt:        parsed.firedAt,
            awsRegion:      parsed.awsRegion,
            awsAccountId:   parsed.awsAccountId,
            description:    parsed.description,
            reason:         parsed.reason,
            productId,
            environmentId,
            alarmId,
            slackMessageId: `${channelId}/${ts}`,
          },
        });
        stats.created++;
        stats.createdAlarms.push(parsed.name);
        logVerboseResult(stats.label, msg, parsed, "created");
      } catch (err: unknown) {
        if (isPrismaUniqueError(err)) {
          stats.duplicates++;
          console.warn(`[${stats.label}] Duplicate ts=${ts}, skipping`);
          logVerboseResult(stats.label, msg, parsed, "duplicate");
        } else {
          stats.dbErrors++;
          console.error(`[${stats.label}] DB error for ts=${ts}:`, err);
          logVerboseResult(stats.label, msg, parsed, "db_error", err);
          return;
        }
      }

      await saveCursor(channelId, ts);
    }
  }
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
  const attachments = msg.attachments as Array<{ text?: string; fallback?: string }> | undefined;
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
    (err as { code: unknown }).code === "P2002"
  );
}
