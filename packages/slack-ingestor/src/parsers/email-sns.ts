import type { ParsedAlarmEvent, ParserFn, Message } from "./types.js";

/**
 * Parser for SNS email notifications forwarded to Slack via Email app.
 *
 * The email body appears in `message.attachments[0]?.text` (or sometimes `message.text`).
 *
 * Body format (SNS aligns values with multiple spaces):
 * ```
 * Alarm Details:
 * - Name:                       alarm-name
 * - Description:                CloudWatch alarm for when...
 * - State Change:               OK -> ALARM
 * - Reason for State Change:    Threshold Crossed...
 * - Timestamp:                  Wednesday 04 March, 2026 10:48:25 UTC
 * - AWS Account:                730335668132
 * - Alarm Arn:                  arn:aws:cloudwatch:eu-south-1:730335668132:alarm:alarm-name
 * ```
 */
export const parseEmailSns: ParserFn = (message: Message): ParsedAlarmEvent | null => {
  // Slack Email App forwards emails as files with filetype "email".
  // The email body is in files[0].plain_text and subject in files[0].subject.
  // Older/other integrations may put content in attachments[0].text instead.
  const emailFile = (message.files as Array<Record<string, unknown>> | undefined)
    ?.find((f) => f["filetype"] === "email");

  const body =
    message.attachments?.[0]?.text ??
    (emailFile?.["plain_text"] as string | undefined) ??
    message.text ??
    "";

  const subject =
    message.attachments?.[0]?.title ??
    (emailFile?.["subject"] as string | undefined) ??
    "";

  if (!body) {
    return null;
  }

  // ── State filter ─────────────────────────────────────────────────────
  // SNS aligns values with multiple spaces, so use regex instead of includes()
  const hasAlarmState   = /State Change:\s+OK\s+->\s+ALARM/.test(body);
  const hasAlarmSubject = subject.startsWith("ALARM:");

  // Skip resolution notifications
  const isResolution = /State Change:\s+ALARM\s+->\s+OK/.test(body);
  const isOkSubject  = subject.startsWith("OK:");

  if (isResolution || isOkSubject) {
    return null;
  }

  if (!hasAlarmState && !hasAlarmSubject) {
    // Neither state change nor subject indicates ALARM -- skip
    return null;
  }

  // ── Extract fields via regex ─────────────────────────────────────────
  // Use \s+ after the colon to handle SNS's padded alignment
  const name = extractField(body, /^- Name:\s+(.+)$/m);
  if (!name) {
    console.warn("[email-sns] Could not extract alarm name from body");
    return null;
  }

  // Region from ARN (most reliable source)
  const arnMatch = body.match(/arn:aws:cloudwatch:([\w-]+):/);
  const awsRegion = arnMatch?.[1];
  if (!awsRegion) {
    console.warn("[email-sns] Could not extract region from ARN in body");
    return null;
  }

  // AWS Account ID
  const awsAccountId = extractField(body, /^- AWS Account:\s+(\d+)$/m);
  if (!awsAccountId) {
    console.warn("[email-sns] Could not extract AWS account ID from body");
    return null;
  }

  // Timestamp
  const timestampStr = extractField(body, /^- Timestamp:\s+(.+)$/m);
  let firedAt: Date;
  if (timestampStr) {
    const parsed = new Date(timestampStr.trim());
    firedAt = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    const tsSeconds = Number(message.ts);
    firedAt = !isNaN(tsSeconds) ? new Date(tsSeconds * 1000) : new Date();
    console.warn("[email-sns] No timestamp found in body, using message ts");
  }

  // Description
  const description = extractField(body, /^- Description:\s+(.+)$/m) ?? null;

  // Reason -- may span multiple lines before the next "- " field
  const reason = extractReason(body);

  return {
    name,
    firedAt,
    awsRegion,
    awsAccountId,
    description,
    reason,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────

function extractField(body: string, regex: RegExp): string | undefined {
  const match = body.match(regex);
  return match?.[1]?.trim();
}

/**
 * Extracts "Reason for State Change" value, which may span multiple lines
 * until the next "- " field marker.
 */
function extractReason(body: string): string | null {
  const reasonMatch = body.match(
    /^- Reason for State Change:\s+([\s\S]*?)(?=\n- |\n\n|$)/m,
  );
  const reason = reasonMatch?.[1]?.trim();
  return reason || null;
}
