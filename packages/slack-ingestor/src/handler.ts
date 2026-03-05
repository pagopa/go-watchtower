import { prisma } from "@go-watchtower/database";
import { CHANNEL_REGISTRY } from "./config.js";
import { fetchMessagePages } from "./slack-client.js";
import { getCursor, saveCursor } from "./cursor-store.js";
import { getParser } from "./parsers/registry.js";
import type { Message, ParsedAlarmEvent } from "./parsers/types.js";

const VERBOSE = process.env["VERBOSE"] === "1" || process.env["DEBUG"] === "1";

export const handler = async (): Promise<void> => {
  if (CHANNEL_REGISTRY.length === 0) {
    console.warn(
      "[slack-ingestor] CHANNEL_REGISTRY is empty -- nothing to process",
    );
    return;
  }

  for (const channel of CHANNEL_REGISTRY) {
    try {
      await processChannel(channel.channelId, channel.productId, channel.environmentId, {
        parserId:            channel.parserId,
        defaultAwsAccountId: channel.defaultAwsAccountId,
        defaultAwsRegion:    channel.defaultAwsRegion,
      });
    } catch (err) {
      console.error(`[${channel.channelId}] Channel processing failed:`, err);
    }
  }
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
): Promise<void> {
  const cursor = await getCursor(channelId);
  const parse  = getParser(opts.parserId as Parameters<typeof getParser>[0]);
  const defaults = {
    defaultAwsAccountId: opts.defaultAwsAccountId,
    defaultAwsRegion:    opts.defaultAwsRegion,
  };

  let totalProcessed = 0;
  let totalSkipped   = 0;
  let totalCreated   = 0;

  for await (const page of fetchMessagePages(channelId, cursor)) {
    // Process each message in the page (already oldest-first)
    for (const msg of page) {
      const ts = msg.ts;
      if (!ts) continue;

      totalProcessed++;

      let parsed;
      try {
        parsed = parse(msg, defaults);
      } catch (err) {
        console.error(`[${channelId}] Parser error for ts=${ts}:`, err);
        logVerboseResult(channelId, msg, null, "parse_error", err);
        // Advance cursor past malformed message to avoid getting stuck
        await saveCursor(channelId, ts);
        continue;
      }

      if (!parsed) {
        totalSkipped++;
        logVerboseResult(channelId, msg, null, "skipped");
        await saveCursor(channelId, ts);
        continue;
      }

      try {
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
            slackMessageId: `${channelId}/${ts}`,
          },
        });
        totalCreated++;
        logVerboseResult(channelId, msg, parsed, "created");
      } catch (err: unknown) {
        if (isPrismaUniqueError(err)) {
          // Already ingested (e.g. overlapping Lambda runs) — safe to advance
          console.warn(`[${channelId}] Duplicate ts=${ts}, skipping`);
          logVerboseResult(channelId, msg, parsed, "duplicate");
        } else {
          // Unexpected DB error — stop this channel, retry next invocation
          console.error(`[${channelId}] DB error for ts=${ts}:`, err);
          logVerboseResult(channelId, msg, parsed, "db_error", err);
          return;
        }
      }

      await saveCursor(channelId, ts);
    }

    console.log(
      `[${channelId}] Page done — processed: ${String(totalProcessed)}, created: ${String(totalCreated)}, skipped: ${String(totalSkipped)}`,
    );
  }

  if (totalProcessed === 0) {
    console.log(`[${channelId}] No new messages`);
  } else {
    console.log(
      `[${channelId}] Done — total processed: ${String(totalProcessed)}, created: ${String(totalCreated)}, skipped: ${String(totalSkipped)}`,
    );
  }
}

function logVerboseResult(
  channelId: string,
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
  console.log(`\n${icon} [${channelId}] ts=${ts} — ${outcome.toUpperCase()}`);
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
  // Prefer plain text > first block text > attachment text
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
