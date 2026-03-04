import { WebClient } from "@slack/web-api";
import type { Message } from "./parsers/types.js";

const client = new WebClient(process.env["SLACK_BOT_TOKEN"]);

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
  // Slack returns newest-first; we collect pages then yield each reversed,
  // so within each page messages are oldest-first.
  // Across invocations, pages come out newest→oldest — so we accumulate all
  // pages for this run, then reverse the whole list at the end.
  // For the page-by-page streaming case we use a collect-then-emit approach
  // limited by MAX_MESSAGES_PER_RUN.
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
      (m) => !m.thread_ts || m.thread_ts === m.ts,
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
