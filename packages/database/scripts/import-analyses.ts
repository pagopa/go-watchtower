import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AnalysisType, AnalysisStatus } from "../generated/prisma/client.js";
import pg from "pg";
import { createReadStream, readFileSync } from "fs";
import { parse } from "csv-parse";
import { resolve } from "path";

// ============================================================================
// Setup
// ============================================================================

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Parse CLI arguments: <csv-file> <product-name> [link-map.json]
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Uso: tsx scripts/import-analyses.ts <csv-file> <product-name> [link-map.json]");
  console.error("Esempio: tsx scripts/import-analyses.ts import/send.csv SEND import/link-map.private.json");
  process.exit(1);
}

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const CSV_PATH = resolve(REPO_ROOT, args[0]!);
const PRODUCT_NAME = args[1]!;
const LINK_MAP_PATH = args[2] ? resolve(REPO_ROOT, args[2]) : null;
const BATCH_SIZE = 50;

// ============================================================================
// Date parsing
// ============================================================================

/**
 * Parse Italian date format "DD/MM/YYYY HH.MM.SS" to Date.
 * For analysis date: treat as Europe/Rome local time.
 * For alarm times: treat as UTC.
 */
function parseDate(raw: string, isUtc: boolean): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Format: DD/MM/YYYY HH.MM.SS or DD/MM/YYYY H.MM.SS
  const match = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})\.(\d{2})\.(\d{2})$/
  );
  if (!match) {
    console.warn(`  ⚠ Cannot parse date: "${trimmed}"`);
    return null;
  }

  const [, day, month, year, hours, minutes, seconds] = match;
  const pad = (s: string) => s.padStart(2, "0");

  if (isUtc) {
    return new Date(
      `${year}-${pad(month!)}-${pad(day!)}T${pad(hours!)}:${pad(minutes!)}:${pad(seconds!)}Z`
    );
  }

  // Rome local time → build ISO string with offset
  // We build the date in Europe/Rome and convert to UTC
  const localStr = `${year}-${pad(month!)}-${pad(day!)}T${pad(hours!)}:${pad(minutes!)}:${pad(seconds!)}`;
  const rome = new Date(
    new Date(localStr + "Z").getTime() -
      getRomeOffsetMs(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours)
      )
  );
  return rome;
}

/**
 * Get Rome UTC offset in ms for a given date.
 * CET = UTC+1, CEST = UTC+2 (last Sunday March → last Sunday October)
 */
function getRomeOffsetMs(
  year: number,
  monthIdx: number,
  day: number,
  hour: number
): number {
  // Simple DST check: create a date and use Intl to get the offset
  const d = new Date(Date.UTC(year, monthIdx, day, hour));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "+01";
  const offsetMatch = tz.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!offsetMatch) return 3600000; // default CET
  const sign = offsetMatch[1] === "+" ? 1 : -1;
  const h = Number(offsetMatch[2]);
  const m = Number(offsetMatch[3] || 0);
  return sign * (h * 3600000 + m * 60000);
}

// ============================================================================
// Link type inference (same as API)
// ============================================================================

function inferLinkType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("slack.com/archives")) return "Slack Thread";
  if (lower.includes("github.com") && lower.includes("/issues/"))
    return "GitHub Issue";
  if (lower.includes("github.com") && lower.includes("/pull/"))
    return "GitHub PR";
  if (lower.includes(".atlassian.net") && lower.includes("/browse/"))
    return "Jira Ticket";
  if (lower.includes("confluence") || lower.includes("/wiki/"))
    return "Confluence Page";
  if (lower.includes("opsgenie.com")) return "Opsgenie Alert";
  return "Link";
}

// ============================================================================
// Tracking ID parsing
// ============================================================================

interface TrackingEntry {
  traceId: string;
  errorCode?: string;
  errorDetail?: string;
}

/**
 * Parse tracking IDs, error codes, and error details from CSV columns.
 *
 * Returns { trackingIds, errorDetails } where errorDetails is a fallback
 * for error text that couldn't be associated with any tracking ID.
 *
 * Patterns:
 *  - Simple: "1-698625bc-..." → single entry
 *  - Indexed: "[1] trace1\n[2] trace2" → multiple entries
 *  - With annotation: "[1] (+8) trace" or "[1] (requestId) uuid"
 *  - Error codes reference indices: "[1] 504\n[2,3] 503"
 *  - Error text split by index: "[1] some error [2] another error"
 */
function parseTrackingData(
  rawIds: string,
  rawCodes: string,
  rawErrors: string
): { trackingIds: TrackingEntry[]; errorDetails: string | null } {
  const hasIds = rawIds && rawIds !== "N/A" && rawIds !== "NA";
  const hasErrors =
    rawErrors && rawErrors !== "N/A" && rawErrors !== "NA";
  const hasCodes =
    rawCodes && rawCodes !== "N/A" && rawCodes !== "NA";

  // No tracking IDs
  if (!hasIds) {
    // If there are errors but no tracking IDs, put everything in errorDetails
    return {
      trackingIds: [],
      errorDetails: hasErrors ? rawErrors.trim() : null,
    };
  }

  const idLines = rawIds.split("\n").filter((l) => l.trim());
  const isIndexed = idLines.some((l) => /^\[\d+\]/.test(l.trim()));

  if (!isIndexed) {
    // Simple single or multi-line trace IDs (no index prefix)
    const entries = idLines.map((line) => {
      const traceId = line.trim();
      return {
        traceId,
        errorCode: hasCodes ? rawCodes.trim() : undefined,
        errorDetail: hasErrors ? rawErrors.trim() : undefined,
      };
    });
    return { trackingIds: entries, errorDetails: null };
  }

  // === Indexed format ===

  // Parse tracking IDs by index
  const idMap = parseIndexedField(rawIds);

  // Parse error codes by index
  const codeMap = hasCodes ? parseIndexedField(rawCodes) : new Map<number, string>();

  // Parse error details by index — use block splitting for multi-line text
  const errorMap = hasErrors
    ? splitByIndexBlocks(rawErrors)
    : new Map<number, string>();

  const entries: TrackingEntry[] = [];
  for (const [idx, rawId] of idMap.entries()) {
    // Clean trace ID: remove annotations like "(+8)" or "(requestId)"
    const traceId = rawId
      .replace(/^\(\+?\d+\)\s*/, "")
      .replace(/^\([^)]+\)\s*/, "")
      .trim();
    if (!traceId) continue;

    const code = codeMap.get(idx);
    const error = errorMap.get(idx);

    entries.push({
      traceId,
      errorCode:
        code && code !== "N/A" && code !== "NA" ? code : undefined,
      errorDetail:
        error && error !== "N/A" && error !== "NA" ? error : undefined,
    });
  }

  // Fallback: if we have a single tracking ID and errors weren't assigned, assign all
  if (
    entries.length === 1 &&
    !entries[0]!.errorDetail &&
    hasErrors
  ) {
    entries[0]!.errorDetail = rawErrors.trim();
  }

  return { trackingIds: entries, errorDetails: null };
}

/**
 * Parse an indexed field (IDs or codes) into a Map<index, value>.
 * Handles "[1] value", "[2,3] value" patterns, split by newlines.
 */
function parseIndexedField(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = raw.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      const indices = match[1]!
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
      const value = match[2]!.trim();
      for (const idx of indices) {
        map.set(idx, value);
      }
    }
  }
  return map;
}

/**
 * Split error text by index blocks.
 * The text may contain "[1] error text here [2] another error" as a continuous
 * string or across multiple lines. Everything between [N] and the next [M] (or end)
 * belongs to index N.
 */
function splitByIndexBlocks(raw: string): Map<number, string> {
  const map = new Map<number, string>();

  // First try line-by-line indexed parsing (most common)
  const lines = raw.split("\n").filter((l) => l.trim());
  const hasIndexedLines = lines.some((l) => /^\[\d+\]/.test(l.trim()));

  if (hasIndexedLines) {
    // Concatenate everything into one string and split by [N] markers
    const fullText = raw;
    const regex = /\[(\d+(?:,\d+)*)\]\s*/g;
    const markers: { indices: number[]; start: number }[] = [];
    let m;

    while ((m = regex.exec(fullText)) !== null) {
      const indices = m[1]!
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
      markers.push({ indices, start: m.index + m[0].length });
    }

    // Find start position of each [N] marker (including the bracket)
    const markerPositions: number[] = [];
    const posRegex = /\[\d+(?:,\d+)*\]/g;
    let pm;
    while ((pm = posRegex.exec(fullText)) !== null) {
      markerPositions.push(pm.index);
    }

    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i]!;
      // End is where the next marker bracket starts, or end of string
      const end =
        i + 1 < markerPositions.length
          ? markerPositions[i + 1]!
          : fullText.length;
      const blockText = fullText.slice(marker.start, end).trim();

      for (const idx of marker.indices) {
        const existing = map.get(idx);
        map.set(idx, existing ? existing + "\n" + blockText : blockText);
      }
    }
  }

  return map;
}

// Legacy wrapper used by csvRowToRecords
function parseTrackingIds(
  rawIds: string,
  rawCodes: string,
  rawErrors: string
): { trackingIds: TrackingEntry[]; errorDetails: string | null } {
  return parseTrackingData(rawIds, rawCodes, rawErrors);
}

// ============================================================================
// CSV reading
// ============================================================================

interface CsvRow {
  analysisDate: string;
  firstAlarmAt: string;
  lastAlarmAt: string;
  occurrences: string;
  environment: string;
  responder: string;
  onCall: string;
  alarmName: string;
  linkUltimoAllarme: string;
  idTracciamento: string;
  codiceErrore: string;
  errore: string;
  serviziImpattati: string;
  downstreamImpattati1: string;
  downstreamImpattati2: string;
  conclusioni: string;
  issueAssociate: string;
  runbook: string;
  azioneFinale: string;
}

/**
 * Column name mapping: maps normalized header names to CsvRow fields.
 * Supports both send.csv and interop CSV formats.
 * For columns that can appear twice (downstream), we use an array of fields
 * assigned in order of appearance.
 */
const HEADER_ALIASES: Record<string, keyof CsvRow | (keyof CsvRow)[]> = {
  "orario svolgimento analisi (localtime)": "analysisDate",
  "orario primo allarme (utc)": "firstAlarmAt",
  "orario ultimo allarme (utc)": "lastAlarmAt",
  "occorrenze allarme": "occurrences",
  "ambiente": "environment",
  "responder": "responder",
  "on-call": "onCall",
  "nome allarme": "alarmName",
  "link ultimo allarme": "linkUltimoAllarme",
  // send uses "ID TRACCIAMENTO", interop uses "CID"
  "id tracciamento": "idTracciamento",
  "cid": "idTracciamento",
  "codice errore": "codiceErrore",
  "errore": "errore",
  // send uses "SERVIZI IMPATTATI", interop uses "DEPLOYMENT/STS K8S IMPATTATI (pod_app)"
  "servizi impattati": "serviziImpattati",
  "deployment/sts k8s impattati (pod_app)": "serviziImpattati",
  // send has "[DOWNSTREAM] IMPATTATI" + "DOWNSTREAM IMPATTATI" (two columns)
  // interop has "CRONJOB IMPATTATI (pod_app)" + "DOWNSTREAM IMPATTATI" (two columns)
  "[downstream] impattati": "downstreamImpattati1",
  "cronjob impattati (pod_app)": "downstreamImpattati1",
  "downstream impattati": "downstreamImpattati2",
  "conclusioni": "conclusioni",
  "conclusione": "conclusioni",
  "issue associate": "issueAssociate",
  "runbook": "runbook",
  "azione finale": "azioneFinale",
};

/**
 * Detect header row and build column index → CsvRow field mapping.
 * Skips leading empty rows (interop has one).
 */
function detectColumns(
  rows: string[][]
): { headerRowCount: number; columnMap: Map<number, keyof CsvRow> } {
  let headerRowIndex = -1;
  let headerRow: string[] = [];

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i]!;
    const matches = row.filter((cell) => {
      const normalized = cell.trim().toLowerCase();
      return HEADER_ALIASES[normalized] !== undefined;
    });
    if (matches.length >= 3) {
      headerRowIndex = i;
      headerRow = row;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      "Impossibile trovare la riga di header nel CSV. " +
        "Verifica che le colonne abbiano nomi riconosciuti (NOME ALLARME, RESPONDER, ecc.)"
    );
  }

  const columnMap = new Map<number, keyof CsvRow>();
  const usedFields = new Set<keyof CsvRow>();

  for (let i = 0; i < headerRow.length; i++) {
    const normalized = headerRow[i]!.trim().toLowerCase();
    const mapping = HEADER_ALIASES[normalized];
    if (!mapping) continue;

    const field = typeof mapping === "string" ? mapping : mapping.find((f) => !usedFields.has(f));
    if (field) {
      columnMap.set(i, field);
      usedFields.add(field);
    }
  }

  console.log(`   Header trovato alla riga ${headerRowIndex + 1}`);
  console.log(
    `   Colonne mappate: ${columnMap.size} su ${headerRow.filter((c) => c.trim()).length}`
  );

  return { headerRowCount: headerRowIndex + 1, columnMap };
}

async function readCsv(filePath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const allRows: string[][] = [];
    createReadStream(filePath)
      .pipe(parse({ columns: false, skip_empty_lines: false, relax_column_count: true }))
      .on("data", (row: string[]) => {
        allRows.push(row);
      })
      .on("end", () => {
        const { headerRowCount, columnMap } = detectColumns(allRows);

        const dataRows = allRows.slice(headerRowCount);
        const csvRows: CsvRow[] = [];

        for (const row of dataRows) {
          const entry: CsvRow = {
            analysisDate: "",
            firstAlarmAt: "",
            lastAlarmAt: "",
            occurrences: "",
            environment: "",
            responder: "",
            onCall: "",
            alarmName: "",
            linkUltimoAllarme: "",
            idTracciamento: "",
            codiceErrore: "",
            errore: "",
            serviziImpattati: "",
            downstreamImpattati1: "",
            downstreamImpattati2: "",
            conclusioni: "",
            issueAssociate: "",
            runbook: "",
            azioneFinale: "",
          };

          for (const [colIdx, field] of columnMap) {
            const val = row[colIdx]?.trim() || "";
            entry[field] = val;
          }

          csvRows.push(entry);
        }

        resolve(csvRows);
      })
      .on("error", reject);
  });
}

// ============================================================================
// Lookup caches
// ============================================================================

type EntityCache = Map<string, string>; // name → id

// link → entity id cache for runbook deduplication
const runbookLinkCache = new Map<string, string>();

// Short link → expanded link lookup (loaded from optional JSON file passed as third CLI arg)
let SHORT_LINK_EXPAND: Record<string, string> = {};
if (LINK_MAP_PATH) {
  try {
    SHORT_LINK_EXPAND = JSON.parse(readFileSync(LINK_MAP_PATH, "utf-8"));
    console.log(`Loaded ${Object.keys(SHORT_LINK_EXPAND).length} link mappings from ${LINK_MAP_PATH}`);
  } catch (e) {
    console.error(`Failed to load link map from "${LINK_MAP_PATH}":`, e);
    process.exit(1);
  }
}

/** Expand a short Confluence link to its full form, or return as-is */
function expandLink(url: string): string {
  return SHORT_LINK_EXPAND[url] || url;
}

async function loadUsers(
  prisma: PrismaClient
): Promise<Map<string, { id: string; name: string }>> {
  const users = await prisma.user.findMany({ where: { isActive: true } });
  const map = new Map<string, { id: string; name: string }>();
  for (const u of users) {
    // Map by surname (last word of name, case-insensitive)
    const parts = u.name.split(/\s+/);
    const surname = parts[parts.length - 1]!.toLowerCase();
    map.set(surname, { id: u.id, name: u.name });
    // Also map by full name
    map.set(u.name.toLowerCase(), { id: u.id, name: u.name });
  }
  return map;
}

async function loadEntities(
  prisma: PrismaClient,
  productId: string
): Promise<{
  environments: EntityCache;
  alarms: EntityCache;
  microservices: EntityCache;
  downstreams: EntityCache;
  finalActions: EntityCache;
  runbooks: EntityCache;
}> {
  const [environments, alarms, microservices, downstreams, finalActions, runbooks] =
    await Promise.all([
      prisma.environment.findMany({ where: { productId } }),
      prisma.alarm.findMany({ where: { productId } }),
      prisma.microservice.findMany({ where: { productId } }),
      prisma.downstream.findMany({ where: { productId } }),
      prisma.finalAction.findMany({ where: { productId } }),
      prisma.runbook.findMany({ where: { productId } }),
    ]);

  // Seed runbook link cache from existing DB entries (expand short links)
  for (const r of runbooks) {
    if (r.link) {
      const expanded = expandLink(r.link);
      runbookLinkCache.set(expanded, r.id);
    }
  }

  return {
    environments: new Map(environments.map((e) => [e.name.toLowerCase(), e.id])),
    alarms: new Map(alarms.map((a) => [a.name.toLowerCase(), a.id])),
    microservices: new Map(microservices.map((m) => [m.name.toLowerCase(), m.id])),
    downstreams: new Map(downstreams.map((d) => [d.name.toLowerCase(), d.id])),
    finalActions: new Map(finalActions.map((f) => [f.name.toLowerCase(), f.id])),
    runbooks: new Map(runbooks.map((r) => [r.name.toLowerCase(), r.id])),
  };
}

/**
 * Validate alarm name line: must start with an alphanumeric char (or "[" for
 * indexed "[N] alarm-name" format) and contain at least one letter.
 * Filters out junk lines like "...", punctuation-only entries, or stray text.
 */
function isValidAlarmName(name: string): boolean {
  return /^[a-zA-Z0-9\[]/.test(name) && /[a-zA-Z]/.test(name);
}

// ============================================================================
// Entity creation helpers (auto-create if missing)
// ============================================================================

async function getOrCreateEnvironment(
  name: string,
  productId: string,
  cache: EntityCache
): Promise<string> {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const env = await prisma.environment.upsert({
    where: { productId_name: { productId, name } },
    update: {},
    create: { name, productId },
  });
  cache.set(key, env.id);
  return env.id;
}

async function getOrCreateAlarm(
  rawName: string,
  productId: string,
  cache: EntityCache
): Promise<string> {
  // Strip stray quotes from malformed CSV cells (e.g. """alarm-name" → alarm-name)
  const name = rawName.replace(/^"+|"+$/g, "").trim();
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  // Try prefix match: CSV names can be truncated versions of existing alarms
  const prefixMatch = [...cache.entries()].find(
    ([cachedName]) => cachedName.startsWith(key) && cachedName !== key
  );
  if (prefixMatch) {
    cache.set(key, prefixMatch[1]);
    return prefixMatch[1];
  }

  const alarm = await prisma.alarm.upsert({
    where: { productId_name: { productId, name } },
    update: {},
    create: { name, productId },
  });
  cache.set(key, alarm.id);
  return alarm.id;
}

async function getOrCreateMicroservice(
  name: string,
  productId: string,
  cache: EntityCache
): Promise<string> {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const ms = await prisma.microservice.upsert({
    where: { productId_name: { productId, name } },
    update: {},
    create: { name, productId },
  });
  cache.set(key, ms.id);
  return ms.id;
}

async function getOrCreateDownstream(
  name: string,
  productId: string,
  cache: EntityCache
): Promise<string> {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const ds = await prisma.downstream.upsert({
    where: { productId_name: { productId, name } },
    update: {},
    create: { name, productId },
  });
  cache.set(key, ds.id);
  return ds.id;
}

async function getOrCreateFinalAction(
  name: string,
  productId: string,
  cache: EntityCache
): Promise<string> {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const fa = await prisma.finalAction.upsert({
    where: { productId_name: { productId, name } },
    update: {},
    create: { name, productId },
  });
  cache.set(key, fa.id);
  return fa.id;
}

async function getOrCreateRunbook(
  resolved: { name: string; link: string },
  productId: string,
  cache: EntityCache
): Promise<string> {
  const key = resolved.name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  // Deduplicate by link: if another runbook already has this link, reuse it
  if (resolved.link) {
    const existingId = runbookLinkCache.get(resolved.link);
    if (existingId) {
      cache.set(key, existingId);
      return existingId;
    }
  }

  const rb = await prisma.runbook.upsert({
    where: { productId_name: { productId, name: resolved.name } },
    update: {},
    create: { name: resolved.name, link: resolved.link, productId },
  });
  cache.set(key, rb.id);
  if (resolved.link) {
    runbookLinkCache.set(resolved.link, rb.id);
  }
  return rb.id;
}

/**
 * Derive a readable runbook name from a Confluence URL.
 * e.g., ".../pages/123/pn-alarm-name-Runbook" → "pn-alarm-name-Runbook"
 */
function deriveRunbookName(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) {
      return decodeURIComponent(last).replace(/\+/g, " ");
    }
  } catch {
    // ignore
  }
  return url;
}

// ============================================================================
// Runbook text → URL lookup table
// ============================================================================

/** Runbook texts to ignore (placeholder values in CSV) */
const RUNBOOK_IGNORE_TEXTS = new Set([
  "da allegare runbook",
  "da inerire",
  "da inserire",
  "inserire",
  "Allarme da ignorare secondo indicazione del team prodotto",
  "N/A",
  "NA"
]);

const RUNBOOK_TEXT_TO_URL: Record<string, string> = {
  "pn-kafka-bridge-ErrorFatalLogs-Alarm": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2123595784/pn-kafka-bridge-ErrorFatalLogs-Alarm",
  "pn-address-book-io-IO-ApiGwAlarm": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2072051894/pn-address-book-io-IO-ApiGwAlarm",
  "pn-delivery-B2B-ApiGwAlarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112749569/pn-delivery-B2B-ApiGwAlarm",
  "pn-bff-WEB-noextension-NotificationReceived-5xx-ApiGwAlarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112749584/pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm",
  "pn-delivery-push-B2B-ApiGwAlarm": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112520441/pn-delivery-push-B2B-ApiGwAlarm",
  "pn-bff-WEB-noextension-NotificationSent-comp-5xx-ApiGwAlarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2352645296/pn-bff-WEB-noextension-NotificationSent-comp-5xx-ApiGwAlarm",
  "pn-national-registries-PNPG-ApiGwAlarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2111700993/pn-national-registries-PNPG-ApiGwAlarm",
  "pn-ioAuthorizerLambda-LogInvocationErrors-Alarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2379809388/pn-ioAuthorizerLambda-LogInvocationErrors-Alarm",
  "pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2129035265/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm",
  "Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112749569/pn-delivery-B2B-ApiGwAlarm",
  "(Bozza) pn-zendesk-authorization-WEB-ApiGwAlarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2612953129/pn-zendesk-authorization-WEB-ApiGwAlarm",
  "pn-delayer-residual-capacity-ErrorFatalLogs-Alarm": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2137686420/pn-delayer-residual-capacity-ErrorFatalLogs-Alarm",
  "personal-data-vault-SelfcarePG-downstream-detection-Alarm": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2405990619/personal-data-vault-SelfcarePG-downstream-detection-Alarm",
  "pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2379776001/pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm",
  "pn-ECSOutOfMemory-Alarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2509176901/pn-ECSOutOfMemory-Alarm",
  "pn-address-book-io-IO-ApiGwAlarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2072051894/pn-address-book-io-IO-ApiGwAlarm",
  "pn-bff-WEB-noextension-NotificationSent-5xx-ApiGwAlarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2352645296/pn-bff-WEB-noextension-NotificationSent-comp-5xx-ApiGwAlarm",
  "pn-delivery-B2B-ApiGwAlarm": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112749569/pn-delivery-B2B-ApiGwAlarm",
  "pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2379808769/pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm",
  "pn-delivery-push-B2B-ApiGwAlarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112520441/pn-delivery-push-B2B-ApiGwAlarm",
  "pn-delivery-versioning-v1v21-sendnewnotification-lambda-LogInvocationErrors-Alarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112520193/pn-delivery-versioning-v1v21-sendnewnotification-lambda-LogInvocationErrors-Alarm",
  "pn-delivery-versioning-v1v21-sendnewnotification-lambda-LogInvocationErrors-Alarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112520193/pn-delivery-versioning-v1v21-sendnewnotification-lambda-LogInvocationErrors-Alarm",
  "pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2137686265/pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm",
  "pn-national-registries-INAD-downstream-detection-Alarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2363785411/pn-national-registries-INAD-downstream-detection-Alarm",
  "pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2129035265/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm",
  "pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2129035265/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm",
  "pn-token-exchange-api-ErrorAlarm-Runbook": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2151743493/pn-token-exchange-api-ErrorAlarm",
  "pn-tokenExchangeLambda-LogInvocationErrors-Alarm - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2119729153/pn-tokenExchangeLambda-LogInvocationErrors-Alarm",
  "stessa analisi dell'allarme https://pagopa.atlassian.net/wiki/x/iIVofw": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2137556360/pn-logsaver-be-ErrorFatalLogs-Alarm",
  "[Bozza] https://pagopa.atlassian.net/wiki/spaces/GO/pages/2585526322/interop-api-v2-prod-apigw-5xx": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2585526322/interop-api-v2-prod-apigw-5xx",
  "[Bozza] k8s-interop-be-m2m-event-dispatcher-errors-prod - Gestione Operativa (ts600) - Confluence": "https://pagopa.atlassian.net/wiki/spaces/GO/pages/2590736537/k8s-interop-be-m2m-event-dispatcher-errors-prod"
};

/**
 * Resolve a runbook text value to { name, link }.
 * - If it's a URL, derive name from URL.
 * - If it's text, look up the URL in the mapping table.
 * - Returns null link if text can't be resolved.
 */
function resolveRunbook(raw: string): { name: string; link: string } | null {
  if (!raw || raw === "N/A") return null;
  const trimmed = raw.trim();

  // Ignore placeholder texts
  if (RUNBOOK_IGNORE_TEXTS.has(trimmed.toLowerCase())) return null;

  if (trimmed.startsWith("http")) {
    const expanded = expandLink(trimmed);
    return { name: deriveRunbookName(expanded), link: expanded };
  }

  // Text lookup
  const url = RUNBOOK_TEXT_TO_URL[trimmed];
  if (url) {
    const expanded = expandLink(url);
    return { name: deriveRunbookName(expanded), link: expanded };
  }

  // Unresolved text — will be tracked
  return { name: trimmed, link: "" };
}

// Track unresolved runbook texts
const unresolvedRunbooks = new Set<string>();

// ============================================================================
// Environment mapping
// ============================================================================

/**
 * Normalize environment name from CSV to the canonical name stored in DB.
 * CSV abbreviations are mapped to the full names used in the seed.
 */
const ENVIRONMENT_ALIASES: Record<string, string> = {
  "prod": "Produzione",
  "att": "Attestazione",
  "coll": "Collaudo",
};

function mapEnvironment(raw: string): string {
  const trimmed = raw.trim();
  return ENVIRONMENT_ALIASES[trimmed.toLowerCase()] || trimmed;
}

// ============================================================================
// Quote-aware comma splitting (for "AZIONE FINALE" column)
// ============================================================================

/**
 * Split a string by commas, but only commas that are outside double quotes.
 * e.g. 'Foo bar., "Baz, qux"' → ['Foo bar.', '"Baz, qux"']
 */
function splitQuoteAware(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// ============================================================================
// Parse comma-separated names, ignoring "Nessuno", "N/A", empty
// ============================================================================

function parseNames(raw: string): string[] {
  if (!raw || raw === "N/A" || raw === "NA" || raw === "Nessuno") return [];
  return [
    ...new Set(
      raw
        .split(/,|\r?\n|\r/)
        .map((s) => s.trim())
        .filter((s) => s && s !== "Nessuno" && s !== "N/A" && s !== "NA")
    ),
  ];
}

/**
 * Normalize microservice name: extract base name before parenthetical alias.
 * e.g. "pn-ec (pn-external-channel)" → "pn-ec"
 *      "pn-ss (safestorage)" → "pn-ss"
 *      "pn-delivery" → "pn-delivery" (unchanged)
 */
function normalizeMicroserviceName(raw: string): string {
  const match = raw.match(/^([^\s(]+)\s*\(/);
  return match ? match[1]!.trim() : raw.trim();
}

// ============================================================================
// Parse links from various columns
// ============================================================================

interface LinkEntry {
  url: string;
  name?: string;
  type: string;
}

function parseAlarmLink(raw: string): LinkEntry | null {
  if (!raw || raw === "N/A") return null;
  const url = raw.trim();
  if (!url.startsWith("http")) return null;
  return { url, name: "Link ultimo allarme", type: inferLinkType(url) };
}

function parseIssueLinks(raw: string): LinkEntry[] {
  if (!raw || raw === "N/A" || raw === "NA") return [];

  const links: LinkEntry[] = [];
  // Can contain URLs or ticket codes like "PN-16697"
  // Split by whitespace/comma/newline
  const parts = raw.split(/[\s,;\n]+/).filter((s) => s.trim());

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("http")) {
      links.push({
        url: trimmed,
        name: extractTicketName(trimmed),
        type: inferLinkType(trimmed),
      });
    } else if (/^[A-Z]+-\d+$/i.test(trimmed)) {
      // Ticket code like PN-16697
      const url = `https://pagopa.atlassian.net/browse/${trimmed}`;
      links.push({ url, name: trimmed, type: "Jira Ticket" });
    }
  }
  return links;
}

function extractTicketName(url: string): string {
  // Extract ticket ID from Jira URL
  const match = url.match(/\/browse\/([A-Z]+-\d+)/i);
  return match ? match[1]! : url;
}

// ============================================================================
// Main import logic
// ============================================================================

interface AnalysisRecord {
  analysisDate: Date;
  firstAlarmAt: Date;
  lastAlarmAt: Date;
  occurrences: number;
  isOnCall: boolean;
  analysisType: AnalysisType;
  ignoreReasonCode: string | null;
  status: AnalysisStatus;
  alarmName: string;
  environmentName: string;
  operatorSurname: string;
  links: LinkEntry[];
  trackingIds: TrackingEntry[];
  microserviceNames: string[];
  downstreamNames: string[];
  conclusionNotes: string | null;
  finalActionNames: string[];
  runbook: { name: string; link: string } | null;
  errorDetails: string | null;
}

function csvRowToRecords(row: CsvRow, rowIndex: number): AnalysisRecord[] {
  // Skip rows with no alarm name
  if (!row.alarmName) {
    console.warn(`  ⚠ Row ${rowIndex}: Skipping — missing alarm name`);
    return [];
  }

  // Parse dates with fallback chain:
  // - analysisDate (local time) is the primary reference
  // - firstAlarmAt/lastAlarmAt (UTC) may be missing in some CSVs
  // - If alarm times are missing, use analysisDate as fallback
  const analysisDateParsed = row.analysisDate
    ? parseDate(row.analysisDate, false)
    : null;
  const firstAlarmAt = row.firstAlarmAt
    ? parseDate(row.firstAlarmAt, true)
    : analysisDateParsed;
  const lastAlarmAt = row.lastAlarmAt
    ? parseDate(row.lastAlarmAt, true)
    : firstAlarmAt;
  const analysisDate = analysisDateParsed || firstAlarmAt;

  if (!analysisDate || !firstAlarmAt || !lastAlarmAt) {
    console.warn(`  ⚠ Row ${rowIndex}: Skipping — no usable date found`);
    return [];
  }

  const occurrences = Number(row.occurrences) || 1;
  const isOnCall = row.onCall.toUpperCase() === "TRUE";
  const envName = mapEnvironment(row.environment || "PROD");

  // Parse links
  const links: LinkEntry[] = [];
  const alarmLink = parseAlarmLink(row.linkUltimoAllarme);
  if (alarmLink) links.push(alarmLink);
  links.push(...parseIssueLinks(row.issueAssociate));

  // Parse tracking IDs and error details
  const { trackingIds, errorDetails: trackingErrorDetails } = parseTrackingIds(
    row.idTracciamento,
    row.codiceErrore,
    row.errore
  );

  // errorDetails at analysis level: only if errors couldn't be assigned to tracking IDs
  const errorDetails = trackingErrorDetails;

  // Microservices — normalize names like "pn-ec (pn-external-channel)" → "pn-ec"
  const microserviceNames = parseNames(row.serviziImpattati).map(
    normalizeMicroserviceName
  );

  // Downstreams — merge both columns
  const ds1 = parseNames(row.downstreamImpattati1);
  const ds2 = parseNames(row.downstreamImpattati2);
  const downstreamNames = [...new Set([...ds1, ...ds2])];

  // Conclusion notes
  const conclusionNotes =
    row.conclusioni && row.conclusioni !== "N/A"
      ? row.conclusioni
      : null;

  // Final actions — split by comma but only outside double quotes
  const finalActionNames = row.azioneFinale
    ? splitQuoteAware(row.azioneFinale)
        .map((s) => s.replace(/"/g, "").replace(/\.+$/, "").trim())
        .filter((s) => s && s !== "N/A" && s !== "NA" && s !== "Nessuno")
    : [];

  // Runbook — resolve text to URL via lookup, or use URL directly
  const runbook = row.runbook && row.runbook !== "N/A"
    ? resolveRunbook(row.runbook)
    : null;
  if (runbook && !runbook.link) {
    unresolvedRunbooks.add(row.runbook.trim());
  }

  // Parse alarm lines: each line may have "[N] alarm-name" format
  // where N = occurrences for that alarm
  const alarmLines = row.alarmName
    .split(/\r?\n|\r/)
    .map((s) => s.replace(/^"+|"+$/g, "").trim())
    .filter((s) => s && isValidAlarmName(s));

  if (alarmLines.length === 0) {
    console.warn(`  ⚠ Row ${rowIndex}: Skipping — no valid alarm names found`);
    return [];
  }

  // Check if any line has [N] prefix → indexed multi-alarm format
  const indexedPattern = /^\[(\d+)\]\s*(.+)/;
  const hasIndexedAlarms = alarmLines.some((l) => indexedPattern.test(l));

  if (hasIndexedAlarms) {
    // Each line is "[N] alarm-name" where N = occurrences
    // Type = IGNORABLE (release) for all generated analyses
    return alarmLines
      .map((line) => {
        const match = line.match(indexedPattern);
        const alarmOccurrences = match ? Number(match[1]) : 1;
        const alarmName = match ? match[2]!.trim() : line;
        return {
          analysisDate,
          firstAlarmAt,
          lastAlarmAt,
          occurrences: alarmOccurrences,
          isOnCall,
          analysisType: AnalysisType.IGNORABLE,
          ignoreReasonCode: "RELEASE",
          status: AnalysisStatus.COMPLETED,
          alarmName,
          environmentName: envName,
          operatorSurname: row.responder.toLowerCase(),
          links,
          trackingIds,
          microserviceNames,
          downstreamNames,
          conclusionNotes,
          finalActionNames,
          runbook,
          errorDetails,
        };
      });
  }

  // Deduplicate plain alarm names
  const alarmNames = [...new Set(alarmLines)];

  if (alarmNames.length === 1) {
    return [
      {
        analysisDate,
        firstAlarmAt,
        lastAlarmAt,
        occurrences,
        isOnCall,
        analysisType: AnalysisType.ANALYZABLE,
        ignoreReasonCode: null,
        status: AnalysisStatus.COMPLETED,
        alarmName: alarmNames[0]!,
        environmentName: envName,
        operatorSurname: row.responder.toLowerCase(),
        links,
        trackingIds,
        microserviceNames,
        downstreamNames,
        conclusionNotes,
        finalActionNames,
        runbook,
        errorDetails,
      },
    ];
  }

  // Multiple alarms without [N] prefix → split: each gets equal share of occurrences,
  // remainder assigned to the first alarm. Type = IGNORABLE (maintenance) per requirement #4
  const perAlarm = Math.max(1, Math.floor(occurrences / alarmNames.length));
  const remainder = occurrences - perAlarm * alarmNames.length;
  return alarmNames.map((alarmName, idx) => ({
    analysisDate,
    firstAlarmAt,
    lastAlarmAt,
    occurrences: idx === 0 ? perAlarm + remainder : perAlarm,
    isOnCall,
    analysisType: AnalysisType.IGNORABLE,
    ignoreReasonCode: "MAINTENANCE",
    status: AnalysisStatus.COMPLETED,
    alarmName,
    environmentName: envName,
    operatorSurname: row.responder.toLowerCase(),
    links,
    trackingIds,
    microserviceNames,
    downstreamNames,
    conclusionNotes,
    finalActionNames,
    runbook,
    errorDetails,
  }));
}

async function importAnalyses() {
  console.log("📥 Import analisi da CSV");
  console.log(`   File: ${CSV_PATH}`);
  console.log(`   Prodotto: ${PRODUCT_NAME}\n`);

  // Load product
  const product = await prisma.product.findUnique({
    where: { name: PRODUCT_NAME },
  });
  if (!product) {
    throw new Error(`Product "${PRODUCT_NAME}" not found. Run seed first.`);
  }
  const productId = product.id;
  console.log(`✅ Product found: ${product.name} (${productId})`);

  // Load lookups
  const users = await loadUsers(prisma);
  const entities = await loadEntities(prisma, productId);

  console.log(`   Users: ${users.size / 2} found`); // /2 because both surname and full name
  console.log(`   Environments: ${entities.environments.size}`);
  console.log(`   Alarms: ${entities.alarms.size}`);
  console.log(`   Microservices: ${entities.microservices.size}`);
  console.log(`   Downstreams: ${entities.downstreams.size}`);
  console.log(`   Final Actions: ${entities.finalActions.size}`);
  console.log(`   Runbooks: ${entities.runbooks.size}\n`);

  // createdBy will be set per-analysis to the operator/responder

  // Read CSV
  const csvRows = await readCsv(CSV_PATH);
  console.log(`📄 CSV rows read: ${csvRows.length}\n`);

  // Convert to records
  const records: AnalysisRecord[] = [];
  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i]!;
    records.push(...csvRowToRecords(row, i + 2)); // +2 for 1-based + header
  }
  console.log(`📊 Analysis records to import: ${records.length}\n`);

  // Track stats
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const missingUsers = new Set<string>();
  const createdEntities = {
    environments: 0,
    alarms: 0,
    microservices: 0,
    downstreams: 0,
    finalActions: 0,
    runbooks: 0,
  };

  // Count new entities before/after (unique IDs, not cache keys which may include aliases)
  const countUniqueIds = (cache: EntityCache) => new Set(cache.values()).size;
  const initialCounts = {
    environments: countUniqueIds(entities.environments),
    alarms: countUniqueIds(entities.alarms),
    microservices: countUniqueIds(entities.microservices),
    downstreams: countUniqueIds(entities.downstreams),
    finalActions: countUniqueIds(entities.finalActions),
    runbooks: countUniqueIds(entities.runbooks),
  };

  // Process in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    process.stdout.write(
      `\r  Batch ${batchNum}/${totalBatches} (${created} created, ${skipped} skipped, ${errors} errors)`
    );

    for (const record of batch) {
      try {
        // Resolve operator
        const operator = users.get(record.operatorSurname);
        if (!operator) {
          missingUsers.add(record.operatorSurname);
          skipped++;
          continue;
        }

        // Resolve environment (auto-create)
        const envId = await getOrCreateEnvironment(
          record.environmentName,
          productId,
          entities.environments
        );

        // Resolve alarm (auto-create)
        const alarmId = await getOrCreateAlarm(
          record.alarmName,
          productId,
          entities.alarms
        );

        // Resolve microservices (auto-create)
        const microserviceIds: string[] = [];
        for (const msName of record.microserviceNames) {
          const msId = await getOrCreateMicroservice(
            msName,
            productId,
            entities.microservices
          );
          microserviceIds.push(msId);
        }

        // Resolve downstreams (auto-create)
        const downstreamIds: string[] = [];
        for (const dsName of record.downstreamNames) {
          const dsId = await getOrCreateDownstream(
            dsName,
            productId,
            entities.downstreams
          );
          downstreamIds.push(dsId);
        }

        // Resolve final actions (auto-create)
        const finalActionIds: string[] = [];
        for (const faName of record.finalActionNames) {
          const faId = await getOrCreateFinalAction(
            faName,
            productId,
            entities.finalActions
          );
          finalActionIds.push(faId);
        }

        // Resolve runbook (auto-create)
        let runbookId: string | null = null;
        if (record.runbook) {
          runbookId = await getOrCreateRunbook(
            record.runbook,
            productId,
            entities.runbooks
          );
        }

        // Create analysis
        await prisma.alarmAnalysis.create({
          data: {
            analysisDate: record.analysisDate,
            firstAlarmAt: record.firstAlarmAt,
            lastAlarmAt: record.lastAlarmAt,
            occurrences: record.occurrences,
            isOnCall: record.isOnCall,
            analysisType: record.analysisType,
            ignoreReasonCode: record.ignoreReasonCode,
            status: record.status,
            alarmId,
            errorDetails: record.errorDetails,
            conclusionNotes: record.conclusionNotes,
            operatorId: operator.id,
            productId,
            environmentId: envId,
            runbookId,
            links: record.links,
            trackingIds: record.trackingIds,
            createdById: operator.id,
            finalActions: {
              create: finalActionIds.map((id) => ({
                finalActionId: id,
              })),
            },
            microservices: {
              create: microserviceIds.map((id) => ({
                microserviceId: id,
              })),
            },
            downstreams: {
              create: downstreamIds.map((id) => ({
                downstreamId: id,
              })),
            },
          },
        });

        created++;
      } catch (err) {
        errors++;
        if (errors <= 10) {
          console.error(
            `\n  ❌ Error importing row: ${record.alarmName}`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  }

  // Count new entities (use unique IDs to avoid counting aliases)
  createdEntities.environments =
    countUniqueIds(entities.environments) - initialCounts.environments;
  createdEntities.alarms = countUniqueIds(entities.alarms) - initialCounts.alarms;
  createdEntities.microservices =
    countUniqueIds(entities.microservices) - initialCounts.microservices;
  createdEntities.downstreams =
    countUniqueIds(entities.downstreams) - initialCounts.downstreams;
  createdEntities.finalActions =
    countUniqueIds(entities.finalActions) - initialCounts.finalActions;
  createdEntities.runbooks = countUniqueIds(entities.runbooks) - initialCounts.runbooks;

  console.log("\n\n" + "=".repeat(60));
  console.log("📊 Risultati importazione:");
  console.log(`   ✅ Analisi create:    ${created}`);
  console.log(`   ⏭  Analisi saltate:   ${skipped}`);
  console.log(`   ❌ Errori:            ${errors}`);
  console.log("");
  console.log("🆕 Entità create automaticamente:");
  console.log(`   Ambienti:      ${createdEntities.environments}`);
  console.log(`   Allarmi:       ${createdEntities.alarms}`);
  console.log(`   Microservizi:  ${createdEntities.microservices}`);
  console.log(`   Downstream:    ${createdEntities.downstreams}`);
  console.log(`   Azioni Finali: ${createdEntities.finalActions}`);
  console.log(`   Runbook:       ${createdEntities.runbooks}`);

  if (missingUsers.size > 0) {
    console.log("");
    console.log("⚠  Utenti non trovati (per cognome):");
    for (const u of missingUsers) {
      console.log(`   - "${u}"`);
    }
    console.log(
      "\n   Aggiungi questi utenti nel sistema e rilancia lo script."
    );
  }

  if (unresolvedRunbooks.size > 0) {
    console.log("");
    console.log(`⚠  Runbook senza URL (${unresolvedRunbooks.size}):`);
    console.log("   Aggiungi le entry in RUNBOOK_TEXT_TO_URL nello script.");
    for (const rb of [...unresolvedRunbooks].sort()) {
      console.log(`   - "${rb}"`);
    }
  }

  console.log("=".repeat(60));
}

// ============================================================================
// Entry point
// ============================================================================

importAnalyses()
  .then(() => {
    console.log("\n✨ Importazione completata!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Importazione fallita:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
