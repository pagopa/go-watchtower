import type { ParsedAlarmEvent, ParserFn, Message, ChannelDefaults } from "./types.js";
import { resolveRegion } from "../region-map.js";

/**
 * Parser for Opsgenie legacy attachment messages.
 *
 * Format:
 * ```json
 * {
 *   "attachments": [{
 *     "title": "#91602: ALARM: \"alarm-name\" in EU (Milan)",
 *     "text": "Description text here.\nThreshold Crossed: ...",
 *     "fields": [{"title": "Priority", "value": "P3"}]
 *   }]
 * }
 * ```
 */
export const parseOpsgenie: ParserFn = (
  message: Message,
  defaults: ChannelDefaults,
): ParsedAlarmEvent | null => {
  const attachment = message.attachments?.[0];
  if (!attachment) {
    return null;
  }

  const title = attachment.title ?? "";
  const text = attachment.text ?? "";

  // ── State filter ─────────────────────────────────────────────────────
  // Title must contain ALARM: (case-sensitive). Skip OK: or anything else.
  if (!title.includes("ALARM:")) {
    return null;
  }

  // ── Extract alarm name ───────────────────────────────────────────────
  const nameMatch = title.match(/ALARM: "(.+?)" in/);
  const alarmName = nameMatch?.[1];
  if (!alarmName) {
    console.warn("[opsgenie] Could not extract alarm name from title:", title);
    return null;
  }

  // ── Extract region label ─────────────────────────────────────────────
  const regionLabelMatch = title.match(/" in (.+?)$/);
  const regionLabel = regionLabelMatch?.[1];

  const awsRegion: string | null = regionLabel
    ? resolveRegion(regionLabel, defaults.defaultAwsRegion)
    : defaults.defaultAwsRegion ?? null;

  if (!awsRegion) {
    console.warn("[opsgenie] Could not resolve AWS region from title:", title);
    return null;
  }

  // ── Extract firedAt ──────────────────────────────────────────────────
  // Use the Slack message timestamp (epoch seconds, always UTC).
  const tsSeconds = Number(message.ts);
  const firedAt = !isNaN(tsSeconds) ? new Date(tsSeconds * 1000) : new Date();

  // ── Extract description and reason ───────────────────────────────────
  let reason: string | null = null;

  const thresholdIdx = text.indexOf("\nThreshold Crossed:");
  let description: string | null;
  if (thresholdIdx !== -1) {
    const descPart = text.substring(0, thresholdIdx).trim();
    description = descPart || null;
    reason = text.substring(thresholdIdx + 1).trim() || null;
  } else {
    // No "Threshold Crossed:" marker -- use first line as description
    const firstNewline = text.indexOf("\n");
    if (firstNewline !== -1) {
      description = text.substring(0, firstNewline).trim() || null;
      reason = text.substring(firstNewline + 1).trim() || null;
    } else {
      description = text.trim() || null;
    }
  }

  return {
    name: alarmName,
    firedAt,
    awsRegion,
    awsAccountId: defaults.defaultAwsAccountId,
    description,
    reason,
  };
};

