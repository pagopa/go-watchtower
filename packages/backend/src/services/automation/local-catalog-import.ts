import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AutomaticRunbookCatalog } from "@go-watchtower/shared";
import {
  MAX_CATALOG_BYTES,
  validateCatalog,
} from "./catalog-contract.js";

export const DEFAULT_LOCAL_CATALOG_VALIDITY_SECONDS = 86_400;

export interface LocalCatalogImportOptions {
  file: string;
  environment: string;
  validitySeconds: number;
}

export interface PreparedLocalCatalogImport {
  catalog: AutomaticRunbookCatalog;
  sourceVersionId: string;
  sourceETag: string;
}

export function parseLocalCatalogImportOptions(
  args: readonly string[],
  runtime: { nodeEnv?: string; defaultEnvironment?: string } = {},
): LocalCatalogImportOptions {
  if (runtime.nodeEnv === "production") {
    throw new Error("Local catalog import is disabled when NODE_ENV=production");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${name ?? ""}`);
    }
    if (!["--file", "--environment", "--validity-seconds"].includes(name)) {
      throw new Error(`Unknown option: ${name}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}`);
    }
    if (values.has(name)) throw new Error(`Duplicate option: ${name}`);
    values.set(name, value.trim());
    index += 1;
  }

  const environment =
    values.get("--environment") || runtime.defaultEnvironment || "development";
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(environment)) {
    throw new Error("--environment is invalid");
  }
  const validitySeconds = Number.parseInt(
    values.get("--validity-seconds") ||
      String(DEFAULT_LOCAL_CATALOG_VALIDITY_SECONDS),
    10,
  );
  if (!Number.isSafeInteger(validitySeconds) || validitySeconds <= 0) {
    throw new Error("--validity-seconds must be a positive integer");
  }
  return {
    file: resolve(
      values.get("--file") ||
        join(tmpdir(), "go-automatic-runbook-catalog.json"),
    ),
    environment,
    validitySeconds,
  };
}

export function prepareLocalCatalogImport(
  bytes: Uint8Array,
  expectedEnvironment: string,
): PreparedLocalCatalogImport {
  if (bytes.byteLength > MAX_CATALOG_BYTES) {
    throw new Error(`Catalog exceeds the ${MAX_CATALOG_BYTES} byte limit`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Catalog file is not valid JSON");
  }
  const validation = validateCatalog(parsed, expectedEnvironment);
  if (!validation.ok) {
    throw new Error(`Catalog validation failed: ${validation.reason}`);
  }
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  return {
    catalog: validation.catalog,
    sourceVersionId: `local:${validation.catalog.revision}`,
    sourceETag: `local-sha256:${digest}`,
  };
}
