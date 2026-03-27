import { WebClient, LogLevel } from "@slack/web-api";
import type { Logger } from "@slack/web-api";
import type { Message } from "./parsers/types.js";

/** Counter for transient network warnings per invocation — logged in summary. */
let httpWarningCount = 0;
let lastHttpWarningDetail = "";

export function getHttpWarningStats() {
  const stats = { count: httpWarningCount, lastDetail: lastHttpWarningDetail };
  httpWarningCount = 0;
  lastHttpWarningDetail = "";
  return stats;
}

/**
 * Custom logger that enriches the default @slack/web-api logging.
 *
 * The library's internal retry loop logs `this.logger.warn('http request failed', e.message)`
 * on every failed attempt before retrying. The default logger swallows context.
 *
 * We avoid logging each occurrence individually (noisy in CloudWatch) and instead
 * count them. The handler logs the total in the run summary.
 */
const slackLogger: Logger = {
  debug() { /* suppress debug noise */ },
  info(...msgs: unknown[]) {
    console.log("[slack-web-api] INFO:", ...msgs);
  },
  warn(...msgs: unknown[]) {
    if (msgs[0] === "http request failed") {
      httpWarningCount++;
      // Capture whatever info the library passes (usually e.message, often empty for network errors)
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- intentional: stringify whatever the Slack SDK passes
      const detail = String(msgs[1] ?? "").trim() || "(empty — likely transient network error in VPC/NAT)";
      lastHttpWarningDetail = detail;
      // Log only the first occurrence per invocation to reduce noise
      if (httpWarningCount === 1) {
        console.warn("[slack-web-api] http request failed (first occurrence, subsequent will be counted):", detail);
      }
      return;
    }
    console.warn("[slack-web-api] WARN:", ...msgs);
  },
  error(...msgs: unknown[]) {
    console.error("[slack-web-api] ERROR:", ...msgs);
  },
  setLevel() { /* noop */ },
  getLevel() { return LogLevel.WARN; },
  setName() { /* noop */ },
};

const client = new WebClient(process.env["SLACK_BOT_TOKEN"], {
  logger: slackLogger,
  logLevel: LogLevel.WARN,
  // Limit retries to avoid consuming the entire Lambda timeout on network errors.
  // Default is 10 retries with exponential backoff (~minutes).
  // With 2 retries + 8s timeout: worst case ~27s per failing channel.
  timeout: 8_000,
  retryConfig: {
    retries: 2,
    factor: 1.96,
    minTimeout: 1_000,
    maxTimeout: 8_000,
  },
});

/** Maximum messages fetched per channel per Lambda invocation. */
const MAX_MESSAGES_PER_RUN = 500;

/** Messages per Slack API page (max 1000, keep low to stay responsive). */
const PAGE_SIZE = 200;

/**
 * Fetches new messages from a Slack channel since `oldestTs`, one page at a time.
 *
 * Yields each page as an array of messages sorted oldest-first, so the caller
 * can process and advance the cursor incrementally without holding all messages
 * in memory at once.
 *
 * Stops after MAX_MESSAGES_PER_RUN total messages to protect Lambda timeout.
 * The next invocation will resume from the updated cursor.
 *
 * Thread replies (thread_ts !== ts) are filtered out before yielding.
 */
export async function* fetchMessagePages(
  channelId: string,
  oldestTs: string,
): AsyncGenerator<Message[]> {
  let cursor: string | undefined;
  let totalFetched = 0;
  const allPages: Message[][] = [];

  do {
    const response = await client.conversations.history({
      channel:   channelId,
      oldest:    oldestTs,
      limit:     PAGE_SIZE,
      cursor,
      inclusive: false,
    });

    const batch = (response.messages ?? []).filter(
      (m) => !m.thread_ts || m.thread_ts === m.ts || m.subtype === "thread_broadcast",
    );

    if (batch.length > 0) {
      allPages.push(batch);
      totalFetched += batch.length;
    }

    cursor = response.response_metadata?.next_cursor || undefined;

    if (totalFetched >= MAX_MESSAGES_PER_RUN) {
      console.log(
        `[slack-client] Reached per-run limit of ${String(MAX_MESSAGES_PER_RUN)} messages for channel ${channelId} — will resume next invocation`,
      );
      break;
    }
  } while (cursor);

  if (allPages.length === 0) return;

  // conversations.history pages arrive newest-first.
  // Reverse page order so we yield oldest page first, then reverse each page
  // so messages within a page are also oldest-first.
  allPages.reverse();
  for (const page of allPages) {
    page.reverse();
    yield page;
  }
}
