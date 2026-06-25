import crypto from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import "./typebox-formats.js";

/**
 * Consumer del registry regionale GA → WT (CONTRACT-03 §6, OPUS-03 §9.8/§11.3).
 *
 * WT valida e legge, **non pubblica** e **non introduce una env map alternativa**.
 * Il payload `ExecuteRunbookQueueRegistryV1` è definito da GA; WT valida schema e
 * revision prima di usare una queue.
 *
 * ✅ Revision canonicalization RICONCILIATA con GA (handoff vendorizzato in
 * `contracts/runbook-automation/v1/upstream/go-automation/`). Algoritmo (dallo
 * schema GA): SHA-256 hex lowercase del JSON compatto UTF-8 di
 * `{schemaVersion,publishedAt,queues}`, chiavi ordinate ricorsivamente, ordine
 * array preservato, escludendo `revision`. `computeRegistryRevision` riproduce
 * byte-per-byte la revision delle fixture GA (`valid`/`missing-region`) e rifiuta
 * `invalid-revision` (vedi test `queue-registry-contract`). La verifica revision
 * è quindi abilitata di default.
 */

export const QueueEntrySchema = Type.Object(
  {
    queueUrl: Type.String({ minLength: 1 }),
    queueArn: Type.String({ minLength: 1 }),
    stackName: Type.String({ minLength: 1 }),
    messageRetentionSeconds: Type.Integer({ minimum: 60, maximum: 1_209_600 }),
  },
  { additionalProperties: false },
);

export const ExecuteRunbookQueueRegistryV1Schema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    revision: Type.String({ minLength: 1 }),
    publishedAt: Type.String({ format: "date-time" }),
    queues: Type.Record(Type.String(), QueueEntrySchema),
  },
  { $id: "ExecuteRunbookQueueRegistryV1", additionalProperties: false },
);

export type ExecuteRunbookQueueRegistryV1 = Static<
  typeof ExecuteRunbookQueueRegistryV1Schema
>;
export type QueueEntry = Static<typeof QueueEntrySchema>;

/** Errore SSM transitorio: l'execution resta PENDING_DISPATCH e il reconciler ritenta. */
export class TransientSsmError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransientSsmError";
  }
}

/** Parametro SSM assente: NON transitorio → QUEUE_REGISTRY_INVALID (§9.8). */
export class ParameterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParameterNotFoundError";
  }
}

export type RegistryLoadResult =
  | { readonly ok: true; readonly registry: ExecuteRunbookQueueRegistryV1 }
  | { readonly ok: false; readonly reason: string };

/** Port: lettura parametro SSM. L'adapter AWS (`@aws-sdk/client-ssm`) è infra (Wave 2/3). */
export interface SsmParameterReader {
  /** Throws {@link TransientSsmError} su timeout/throttling/5xx; altrimenti ritorna il valore. */
  read(parameterName: string, region: string): Promise<string>;
}

export type QueueResolution =
  | { readonly kind: "OK"; readonly region: string; readonly queue: QueueEntry; readonly revision: string }
  | { readonly kind: "REGION_NOT_ONBOARDED"; readonly region: string }
  | { readonly kind: "QUEUE_REGISTRY_INVALID"; readonly reason: string }
  | { readonly kind: "TRANSIENT"; readonly reason: string };

export interface RegionalQueueRegistryConfig {
  readonly parameterName: string;
  readonly parameterRegion: string;
  readonly cacheTtlMs?: number; // default 60s (massimo per contratto)
  readonly verifyRevision?: boolean; // default true (riconciliata con GA)
}

interface CacheEntry {
  readonly registry: ExecuteRunbookQueueRegistryV1;
  readonly loadedAt: number;
}

const DEFAULT_CACHE_TTL_MS = 60_000;

/**
 * Calcola la forma canonica del payload del registry (senza `revision`) per la
 * verifica della revision. DEVE coincidere con l'algoritmo canonico pubblicato da
 * GA (CONTRACT_BLOCKER, vedi nota in testa al file).
 */
export function computeRegistryRevision(
  registry: ExecuteRunbookQueueRegistryV1,
): string {
  const { revision: _omit, ...rest } = registry;
  return crypto
    .createHash("sha256")
    .update(Buffer.from(canonicalJson(rest), "utf-8"))
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
    .join(",")}}`;
}

/**
 * Valida un payload grezzo come `ExecuteRunbookQueueRegistryV1`.
 * Opzionalmente verifica la `revision`.
 */
export function validateRegistry(
  raw: unknown,
  options: { verifyRevision: boolean },
): RegistryLoadResult {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { ok: false, reason: `not valid JSON: ${(err as Error).message}` };
    }
  }
  if (!Value.Check(ExecuteRunbookQueueRegistryV1Schema, parsed)) {
    const first = [...Value.Errors(ExecuteRunbookQueueRegistryV1Schema, parsed)][0];
    return {
      ok: false,
      reason: `schema mismatch: ${first?.message ?? "invalid"} at ${first?.path ?? "<root>"}`,
    };
  }
  const registry = parsed;
  if (options.verifyRevision) {
    const expected = computeRegistryRevision(registry);
    if (expected !== registry.revision) {
      return { ok: false, reason: "revision mismatch (canonical hash)" };
    }
  }
  return { ok: true, registry };
}

/**
 * Lettore condiviso del registry per backend EC2, Slack Ingestor Lambda e
 * reconciler: cache in-memory ≤ 60s + force-refresh prima di dichiarare una
 * regione non onboardata (OPUS-03 §9.8).
 */
export class RegionalQueueRegistry {
  private cache: CacheEntry | null = null;
  private readonly cacheTtlMs: number;
  private readonly verifyRevision: boolean;

  constructor(
    private readonly reader: SsmParameterReader,
    private readonly config: RegionalQueueRegistryConfig,
  ) {
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    // Default abilitato: l'algoritmo è riconciliato con GA (vedi header del file).
    this.verifyRevision = config.verifyRevision ?? true;
  }

  /**
   * Risolve la queue per la regione dell'allarme. Un errore SSM transitorio
   * produce `TRANSIENT` (→ PENDING_DISPATCH + retry reconciler); schema/revision
   * invalidi producono `QUEUE_REGISTRY_INVALID`; solo un registry valido privo
   * della regione produce `REGION_NOT_ONBOARDED` (dopo force-refresh).
   */
  async resolveQueue(region: string, now: number = Date.now()): Promise<QueueResolution> {
    let loaded: RegistryLoadResult;
    try {
      loaded = await this.load(now, false);
    } catch (err) {
      if (err instanceof TransientSsmError) {
        return { kind: "TRANSIENT", reason: err.message };
      }
      if (err instanceof ParameterNotFoundError) {
        return { kind: "QUEUE_REGISTRY_INVALID", reason: err.message };
      }
      throw err;
    }
    if (!loaded.ok) {
      return { kind: "QUEUE_REGISTRY_INVALID", reason: loaded.reason };
    }

    const entry = loaded.registry.queues[region];
    if (entry !== undefined) {
      return { kind: "OK", region, queue: entry, revision: loaded.registry.revision };
    }

    // Force-refresh prima di dichiarare la regione assente.
    let refreshed: RegistryLoadResult;
    try {
      refreshed = await this.load(now, true);
    } catch (err) {
      if (err instanceof TransientSsmError) {
        return { kind: "TRANSIENT", reason: err.message };
      }
      if (err instanceof ParameterNotFoundError) {
        return { kind: "QUEUE_REGISTRY_INVALID", reason: err.message };
      }
      throw err;
    }
    if (!refreshed.ok) {
      return { kind: "QUEUE_REGISTRY_INVALID", reason: refreshed.reason };
    }
    const refreshedEntry = refreshed.registry.queues[region];
    if (refreshedEntry !== undefined) {
      return { kind: "OK", region, queue: refreshedEntry, revision: refreshed.registry.revision };
    }
    return { kind: "REGION_NOT_ONBOARDED", region };
  }

  private async load(now: number, force: boolean): Promise<RegistryLoadResult> {
    if (!force && this.cache !== null && now - this.cache.loadedAt < this.cacheTtlMs) {
      return { ok: true, registry: this.cache.registry };
    }
    const raw = await this.reader.read(this.config.parameterName, this.config.parameterRegion);
    const validated = validateRegistry(raw, { verifyRevision: this.verifyRevision });
    if (validated.ok) {
      this.cache = { registry: validated.registry, loadedAt: now };
    }
    return validated;
  }
}
