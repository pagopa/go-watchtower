import type { ParsedAlarmEvent, ParserFn, Message } from "./types.js";

/**
 * Parser for Amazon Q CloudWatch alarm notifications.
 *
 * Amazon Q delivers messages in two structures:
 * 1. Top-level Block Kit  — `msg.blocks` is populated (canonical format)
 * 2. Attachment-wrapped   — `msg.blocks` is empty, `msg.attachments[0].blocks` holds
 *                           the same Block Kit content (observed in production)
 *
 * In both cases the title block format is:
 *   `*<https://...|STATE_EMOJI CloudWatch Alarm | alarm-name | region | Account: 123>*`
 * where STATE_EMOJI may be the Unicode character (🚨 ✅ ⚠️) or Slack shortcode
 * (:rotating_light: :white_check_mark: :warning:).
 *
 * State logic:
 * - OK / INSUFFICIENT_DATA -> skip
 * - ALARM                  -> ingest
 */
export const parseAmazonQ: ParserFn = (message: Message): ParsedAlarmEvent | null => {
  // 1. Prefer top-level blocks
  const topBlocks = message.blocks as unknown[] | undefined;
  if (topBlocks && topBlocks.length > 0) {
    return parseBlocks(topBlocks, message);
  }

  // 2. Fall back to blocks nested inside attachments[0]
  type AttachmentLike = { blocks?: unknown[] };
  const attachmentBlocks = (message.attachments as AttachmentLike[] | undefined)?.[0]?.blocks;
  if (attachmentBlocks && attachmentBlocks.length > 0) {
    return parseBlocks(attachmentBlocks, message);
  }

  // 3. Last resort: parse from plain text / attachment fallback text
  return parseTextOnly(message);
};

// ── Block-based parser ────────────────────────────────────────────────────

function parseBlocks(blocks: unknown[], message: Message): ParsedAlarmEvent | null {
  // ── Extract title from blocks[0] ─────────────────────────────────────
  const titleText = extractSectionText(blocks[0]);
  if (!titleText) {
    console.warn("[amazon-q] No title text found in first block");
    return null;
  }

  // Silently skip non-CloudWatch messages (pipeline failures, etc.)
  if (!titleText.includes("CloudWatch Alarm")) {
    return null;
  }

  // Extract the display text from the Slack mrkdwn link: *<url|DISPLAY_TEXT>*
  const linkMatch = titleText.match(/\*<[^|]*\|([^>]+)>\*/);
  const displayText = linkMatch?.[1]?.trim();
  if (!displayText) {
    console.warn("[amazon-q] Could not extract display text from title:", titleText);
    return null;
  }

  // ── State filter ─────────────────────────────────────────────────────
  // Amazon Q uses either Unicode emoji or Slack shortcodes depending on format
  const isOk = (
    displayText.includes("\u2705") ||                  // ✅
    displayText.includes(":white_check_mark:")
  );
  const isInsufficient = (
    displayText.includes("\u26a0\ufe0f") ||            // ⚠️
    displayText.includes(":warning:")
  );
  if (isOk || isInsufficient) return null;

  const isAlarm = (
    displayText.includes("\ud83d\udea8") ||            // 🚨
    displayText.includes(":rotating_light:") ||
    displayText.includes("\u274c") ||                  // ❌
    displayText.includes(":x:")
  );
  if (!isAlarm) {
    console.warn("[amazon-q] Unrecognized state in title:", displayText.slice(0, 120));
    return null;
  }

  // ── Parse pipe-separated title parts ─────────────────────────────────
  // Format: "EMOJI CloudWatch Alarm | alarm-name | region | Account: 123456789012"
  const parts = displayText.split("|").map((p) => p.trim());
  if (parts.length < 4) {
    console.warn("[amazon-q] Unexpected title format:", displayText.slice(0, 120));
    return null;
  }

  const alarmName    = parts[1];
  const region       = parts[2];
  const accountMatch = parts[3]?.match(/Account:\s*(\d+)/);

  if (!alarmName || !region || !accountMatch?.[1]) {
    console.warn("[amazon-q] Could not extract fields from title:", displayText.slice(0, 120));
    return null;
  }

  // ── Extract reason: first section after title that is not a "Latest Update" notice ──
  let reason: string | null = null;
  for (let i = 1; i < blocks.length; i++) {
    const text = extractSectionText(blocks[i]);
    if (text && !text.startsWith("*Latest Update*") && !text.includes("*<")) {
      reason = text;
      break;
    }
  }

  // ── Extract timestamp and description from fields blocks ─────────────
  let firedAt: Date | null = null;
  let description: string | null = null;

  for (const block of blocks) {
    const fields = extractSectionFields(block);
    if (!fields || fields.length === 0) continue;

    for (const field of fields) {
      const text = field.text ?? "";

      if (text.includes("*Timestamp*\n")) {
        const tsValue = text.replace(/\*Timestamp\*\n/, "").trim();
        if (tsValue) {
          const parsed = new Date(tsValue);
          if (!isNaN(parsed.getTime())) firedAt = parsed;
        }
      }

      if (text.includes("*Alarm Description*\n")) {
        description = text.replace(/\*Alarm Description\*\n/, "").trim() || null;
      }
    }
  }

  if (!firedAt) {
    const tsSeconds = Number(message.ts);
    firedAt = !isNaN(tsSeconds) ? new Date(tsSeconds * 1000) : new Date();
    console.warn("[amazon-q] No timestamp field found, using message ts");
  }

  return {
    name:         alarmName,
    firedAt,
    awsRegion:    region,
    awsAccountId: accountMatch[1],
    description,
    reason,
  };
}

// ── Text-only fallback ────────────────────────────────────────────────────

/**
 * Last-resort parser when there are no blocks anywhere.
 * Reads from msg.text → attachments[0].pretext → .text → .fallback (in order).
 * NOTE: attachment.fallback is often truncated by Slack — use only as last resort.
 */
type AttachmentText = { text?: string; fallback?: string; pretext?: string };

function parseTextOnly(message: Message): ParsedAlarmEvent | null {
  const attachments = message.attachments as AttachmentText[] | undefined;
  const text = (
    message.text?.trim() ||
    attachments?.[0]?.pretext?.trim() ||
    attachments?.[0]?.text?.trim() ||
    attachments?.[0]?.fallback?.trim()
  );
  if (!text) return null;
  if (!text.includes("CloudWatch Alarm")) return null;

  // Check emoji only in the first pipe segment (title prefix)
  const titlePrefix = text.split("|")[0] ?? text;
  const isOk = (
    titlePrefix.includes("\u2705") ||
    titlePrefix.includes(":white_check_mark:")
  );
  const isInsufficient = (
    titlePrefix.includes("\u26a0\ufe0f") ||
    titlePrefix.includes(":warning:")
  );
  if (isOk || isInsufficient) return null;

  const isAlarm = (
    titlePrefix.includes("\ud83d\udea8") ||
    titlePrefix.includes(":rotating_light:") ||
    titlePrefix.includes("\u274c") ||
    titlePrefix.includes(":x:")
  );
  if (!isAlarm) {
    console.warn("[amazon-q] Unrecognized state emoji in plain-text message:", text.slice(0, 120));
    return null;
  }

  const parts = text.split("|").map((p) => p.trim());
  if (parts.length < 4) {
    console.warn("[amazon-q] Unexpected plain-text format:", text.slice(0, 120));
    return null;
  }

  const alarmName    = parts[1];
  const region       = parts[2];
  const accountMatch = parts[3]?.match(/Account:\s*(\d+)/);

  if (!alarmName || !region || !accountMatch?.[1]) {
    console.warn("[amazon-q] Could not extract fields from plain-text:", text.slice(0, 120));
    return null;
  }

  const tsSeconds = Number(message.ts);
  const firedAt   = !isNaN(tsSeconds) ? new Date(tsSeconds * 1000) : new Date();

  return {
    name:         alarmName,
    firedAt,
    awsRegion:    region,
    awsAccountId: accountMatch[1],
    description:  null,
    reason:       null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface SectionLike {
  type?: string;
  text?: { type?: string; text?: string } | undefined;
  fields?: Array<{ type?: string; text?: string }> | undefined;
}

function extractSectionText(block: unknown): string | undefined {
  const section = block as SectionLike | undefined;
  if (section?.type === "section" && section.text?.text) {
    return section.text.text;
  }
  return undefined;
}

function extractSectionFields(
  block: unknown,
): Array<{ type?: string; text?: string }> | undefined {
  const section = block as SectionLike | undefined;
  if (section?.type === "section" && section.fields && section.fields.length > 0) {
    return section.fields;
  }
  return undefined;
}
