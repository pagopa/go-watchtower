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
  let awsRegion: string | null = null;

  if (regionLabel) {
    awsRegion = resolveRegion(regionLabel, defaults.defaultAwsRegion);
  } else {
    awsRegion = defaults.defaultAwsRegion ?? null;
  }

  if (!awsRegion) {
    console.warn("[opsgenie] Could not resolve AWS region from title:", title);
    return null;
  }

  // ── Extract firedAt ──────────────────────────────────────────────────
  // Pattern: [value (DD/MM/YY HH:MM:SS)] in the text body
  const tsMatch = text.match(
    /\[[\d.eE+-]+ \((\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})\)\]/,
  );
  let firedAt: Date;

  if (tsMatch?.[1]) {
    firedAt = parseOpsgenieDate(tsMatch[1]);
  } else {
    // Fall back to message ts
    const tsSeconds = Number(message.ts);
    firedAt = !isNaN(tsSeconds) ? new Date(tsSeconds * 1000) : new Date();
    console.warn("[opsgenie] No timestamp found in text, using message ts");
  }

  // ── Extract description and reason ───────────────────────────────────
  let description: string | null = null;
  let reason: string | null = null;

  const thresholdIdx = text.indexOf("\nThreshold Crossed:");
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

/**
 * Parses Opsgenie date format: `DD/MM/YY HH:MM:SS` (all UTC).
 * Example: "04/03/26 13:05:00" -> day=4, month=March, year=2026
 */
function parseOpsgenieDate(s: string): Date {
  const [datePart, timePart] = s.split(" ");
  const [dd, mm, yy] = (datePart ?? "").split("/");
  const [hh, min, sec] = (timePart ?? "").split(":");
  return new Date(
    Date.UTC(
      2000 + Number(yy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(sec),
    ),
  );
}
