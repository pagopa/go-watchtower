import type { Message } from "./types.js";

/**
 * Slack message timestamps are epoch seconds in UTC.
 *
 * Do not parse display times from message text: those can be localised by the
 * upstream integration and are not the canonical Slack event time.
 */
export function firedAtFromSlackTimestamp(
  message: Message,
  parserName: string,
): Date {
  const tsSeconds = Number(message.ts);
  if (!isNaN(tsSeconds)) {
    return new Date(tsSeconds * 1000);
  }

  console.warn(`[${parserName}] Invalid Slack timestamp, using current time`);
  return new Date();
}
