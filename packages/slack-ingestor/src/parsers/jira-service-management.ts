import type { ChannelDefaults, Message, ParsedAlarmEvent, ParserFn } from "./types.js";
import { resolveRegion } from "../region-map.js";

/**
 * Parser for Jira Service Management ChatOps alert cards.
 *
 * JSM messages are rendered as Slack Block Kit cards, usually inside
 * `attachments[0].blocks`, but we also support top-level blocks and legacy
 * attachment title/text fallbacks. The alarm title mirrors Opsgenie:
 *   `Alert #112717: ALARM: "alarm-name" in EU (Milan)`
 */
export const parseJiraServiceManagement: ParserFn = (
  message: Message,
  defaults: ChannelDefaults,
): ParsedAlarmEvent | null => {
  const texts = collectMessageTexts(message);
  const title = findAlarmTitle(texts);
  if (!title) {
    return null;
  }

  // JSM can update the original Slack card to Closed; the CloudWatch transition
  // we ingest is still identified by the ALARM title, like the Opsgenie parser.
  const titleParts = title.match(
    /\bALARM:\s*"([^"]+)"\s+in\s+(.+?)(?:\s+(?:Status|Responders|Priority|Description)\b|$)/,
  );
  const alarmName = titleParts?.[1]?.trim();
  const regionLabel = titleParts?.[2]?.trim();

  if (!alarmName) {
    console.warn("[jsm] Could not extract alarm name from title:", title);
    return null;
  }

  const awsRegion: string | null = regionLabel
    ? resolveRegion(regionLabel, defaults.defaultAwsRegion)
    : defaults.defaultAwsRegion ?? null;

  if (!awsRegion) {
    console.warn("[jsm] Could not resolve AWS region from title:", title);
    return null;
  }

  const rawDescription = extractDescription(texts);
  const { description, reason } = splitDescriptionAndReason(rawDescription);
  const tsSeconds = Number(message.ts);
  const firedAt = !isNaN(tsSeconds) ? new Date(tsSeconds * 1000) : new Date();

  return {
    name: alarmName,
    firedAt,
    awsRegion,
    awsAccountId: defaults.defaultAwsAccountId,
    description,
    reason,
  };
};

type SlackText = {
  text?: unknown;
};

type SlackBlock = {
  type?: unknown;
  text?: SlackText;
  fields?: SlackText[];
  elements?: unknown[];
};

type SlackAttachment = {
  title?: string;
  text?: string;
  fallback?: string;
  pretext?: string;
  blocks?: unknown[];
};

function collectMessageTexts(message: Message): string[] {
  const texts: string[] = [];

  pushText(texts, message.text);

  const attachments = message.attachments as SlackAttachment[] | undefined;
  for (const attachment of attachments ?? []) {
    pushText(texts, attachment.title);
    pushText(texts, attachment.pretext);
    pushText(texts, attachment.text);
    pushText(texts, attachment.fallback);
    collectBlocksText(attachment.blocks, texts);
  }

  collectBlocksText(message.blocks as unknown[] | undefined, texts);

  return texts;
}

function collectBlocksText(blocks: unknown[] | undefined, texts: string[]): void {
  if (!blocks) return;

  for (const block of blocks) {
    if (!isRecord(block)) continue;

    const slackBlock = block as SlackBlock;
    pushText(texts, slackBlock.text?.text);

    for (const field of slackBlock.fields ?? []) {
      pushText(texts, field.text);
    }

    collectElementsText(slackBlock.elements, texts);
  }
}

function collectElementsText(elements: unknown[] | undefined, texts: string[]): void {
  if (!elements) return;

  for (const element of elements) {
    if (!isRecord(element)) continue;

    const text = element["text"];
    if (typeof text === "string") {
      pushText(texts, text);
    } else if (isRecord(text)) {
      pushText(texts, text["text"]);
    }

    const nestedElements = element["elements"];
    if (Array.isArray(nestedElements)) {
      collectElementsText(nestedElements, texts);
    }
  }
}

function findAlarmTitle(texts: string[]): string | null {
  for (const text of texts) {
    const normalized = normalizeSlackText(text);
    for (const line of normalized.split(/\n+/)) {
      const candidate = line.trim();
      if (/\bALARM:\s*"/.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function extractDescription(texts: string[]): string | null {
  for (const text of texts) {
    const normalized = normalizeSlackText(text);
    const labeled = extractLabeledDescription(normalized);
    if (labeled) return labeled;
  }

  for (const text of texts) {
    const normalized = normalizeSlackText(text);
    if (normalized.includes("Threshold Crossed:") && !/\bALARM:\s*"/.test(normalized)) {
      return stripFooter(normalized);
    }
  }

  for (const text of texts) {
    const normalized = normalizeSlackText(text);
    if (/^CloudWatch alarm\b/i.test(normalized)) {
      return stripFooter(normalized);
    }
  }

  return null;
}

function extractLabeledDescription(text: string): string | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const descriptionIndex = lines.findIndex((line) => normalizeLabel(line) === "description");
  if (descriptionIndex === -1) {
    return null;
  }

  const valueLines: string[] = [];
  for (let i = descriptionIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const label = normalizeLabel(line);
    if (label === "status" || label === "responders" || label === "priority") {
      break;
    }
    if (line.startsWith("Added by ")) {
      break;
    }
    valueLines.push(line);
  }

  const value = stripFooter(valueLines.join("\n")).trim();
  return value || null;
}

function splitDescriptionAndReason(rawDescription: string | null): {
  description: string | null;
  reason: string | null;
} {
  if (!rawDescription) {
    return { description: null, reason: null };
  }

  const text = rawDescription.replace(/\s+/g, " ").trim();
  const thresholdIndex = text.indexOf("Threshold Crossed:");

  if (thresholdIndex === -1) {
    return { description: text || null, reason: null };
  }

  const description = text.substring(0, thresholdIndex).trim() || null;
  const reason = text.substring(thresholdIndex).trim() || null;

  return { description, reason };
}

function normalizeLabel(line: string): string {
  return line
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();
}

function stripFooter(text: string): string {
  return text.replace(/\nAdded by Jira Service Management ChatOps[\s\S]*$/i, "").trim();
}

function normalizeSlackText(text: string): string {
  return text
    .replace(/<[^|>\s]+\|([^>]+)>/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function pushText(texts: string[], value: unknown): void {
  if (typeof value !== "string") return;

  const trimmed = value.trim();
  if (trimmed) texts.push(trimmed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
