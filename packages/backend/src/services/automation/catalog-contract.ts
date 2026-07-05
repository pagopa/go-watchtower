import crypto from "node:crypto";
import {
  validateAutomaticRunbookCatalog,
  type AutomaticRunbookCatalog,
} from "@go-watchtower/shared";

export const MAX_CATALOG_BYTES = 1024 * 1024;
export type AutomaticRunbookCatalogV1 = AutomaticRunbookCatalog;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareUnicodeCodePoints)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const delta = a[i]!.codePointAt(0)! - b[i]!.codePointAt(0)!;
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

export function computeCatalogRevision(
  catalog:
    | Omit<AutomaticRunbookCatalogV1, "revision">
    | AutomaticRunbookCatalogV1,
): string {
  const value = catalog as AutomaticRunbookCatalogV1;
  const payload = {
    schemaVersion: value.schemaVersion,
    environment: value.environment,
    worker: value.worker,
    runbooks: value.runbooks,
  };
  return `sha256-${crypto.createHash("sha256").update(canonicalize(payload)).digest("hex")}`;
}

/**
 * Validazione al confine di fiducia (S3/file). La struttura è interamente
 * delegata al validatore condiviso; qui restano solo i vincoli di contratto
 * che shared non conosce: environment atteso, ordinamento canonico per key e
 * corrispondenza della revision ricalcolata.
 */
export function validateCatalog(
  value: unknown,
  expectedEnvironment?: string,
):
  | { ok: true; catalog: AutomaticRunbookCatalogV1 }
  | { ok: false; reason: string } {
  const validation = validateAutomaticRunbookCatalog(value);
  if (!validation.valid) {
    return {
      ok: false,
      reason: validation.errors
        .map((issue) => `${issue.path}:${issue.code}`)
        .join(","),
    };
  }
  const catalog = validation.value;
  if (expectedEnvironment && catalog.environment !== expectedEnvironment) {
    return {
      ok: false,
      reason: `environment mismatch: ${catalog.environment}`,
    };
  }
  let previousKey: string | undefined;
  for (const descriptor of catalog.runbooks) {
    if (previousKey !== undefined && previousKey >= descriptor.key) {
      return { ok: false, reason: "runbooks must be sorted by key" };
    }
    previousKey = descriptor.key;
  }
  if (computeCatalogRevision(catalog) !== catalog.revision) {
    return { ok: false, reason: "catalog revision mismatch" };
  }
  return { ok: true, catalog };
}
