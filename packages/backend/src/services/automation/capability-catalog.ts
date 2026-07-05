import {
  getActiveCapabilityCatalog,
  upsertVerifiedCapabilityCatalog,
  renewCapabilityCatalogVerification,
  recordCapabilityCatalogFailure,
  withCapabilityCatalogSyncLock,
} from "@go-watchtower/database";
import {
  deriveAutomationCapabilityCatalogHealth,
  validateSlackIngestorControl,
  evaluateCatalogReferenceHealth,
  SLACK_INGESTOR_CONTROL_SETTING_KEY,
} from "@go-watchtower/shared";
import {
  MAX_CATALOG_BYTES,
  validateCatalog,
  type AutomaticRunbookCatalogV1,
} from "./catalog-contract.js";

export {
  computeCatalogRevision,
  MAX_CATALOG_BYTES,
  validateCatalog,
  type AutomaticRunbookCatalogV1,
} from "./catalog-contract.js";

export const AUTOMATIC_RUNBOOK_CATALOG_KEY = "automatic-runbooks/v1/current.json";
export const ACTIVE_CAPABILITY_CATALOG_KEY = "ACTIVE";

export interface CatalogRowSnapshot {
  revision: string | null;
  sourcePublishedAt: Date | null;
  sourceVersionId: string | null;
  sourceETag: string | null;
  payload: unknown;
  lastAttemptAt: Date | null;
  lastVerifiedAt: Date | null;
  validUntil: Date | null;
  lastErrorCode: string | null;
  lastError: string | null;
}

export type CatalogHealth = "UNINITIALIZED" | "INVALID" | "HEALTHY" | "DEGRADED" | "STALE";

export function deriveCatalogHealth(row: CatalogRowSnapshot | null, now = new Date()): CatalogHealth {
  if (!row) return "UNINITIALIZED";
  return deriveAutomationCapabilityCatalogHealth(row, now).health;
}

export interface CatalogObjectHead { versionId: string | null; etag: string | null }
export interface CatalogObject { body: Uint8Array; versionId: string | null; etag: string | null }
export interface CatalogObjectReader {
  head(bucket: string, key: string): Promise<CatalogObjectHead>;
  get(bucket: string, key: string, versionId: string | null): Promise<CatalogObject>;
}

export interface CatalogSyncConfig {
  bucket: string;
  environment: string;
  validitySeconds?: number;
}

export interface CatalogSyncResult { kind: "VERIFIED" | "UPDATED" | "SKIPPED_LOCKED" | "SKIPPED_STALE" | "FAILED"; revision?: string; error?: string }

/**
 * Sync S3→DB in due fasi. Fase 1, fuori da transazioni e lock: HEAD/GET su S3,
 * parse e validazione (I/O e CPU non devono occupare connessioni del pool).
 * Fase 2, transazione breve sotto advisory lock: ricontrollo dello stato
 * persistito e sole scritture. Il ricontrollo sotto lock chiude la finestra
 * "old-over-new" tra istanze concorrenti; la riga last-known-good viene
 * sostituita solo dopo validazione completa e un errore non estende validUntil.
 */
export async function syncCapabilityCatalog(reader: CatalogObjectReader, config: CatalogSyncConfig): Promise<CatalogSyncResult> {
  if (!config.bucket) return { kind: "FAILED", error: "AUTOMATIC_RUNBOOK_CATALOG_BUCKET_NOT_CONFIGURED" };
  const validitySeconds = config.validitySeconds ?? 300;
  try {
    // ── Fase 1: I/O S3 e validazione, nessuna transazione aperta ─────────────
    const head = await reader.head(config.bucket, AUTOMATIC_RUNBOOK_CATALOG_KEY);
    const headVersionId = head.versionId;
    const headETag = head.etag;
    if (!headVersionId || !headETag) throw new Error("CATALOG_SOURCE_METADATA_MISSING");

    const current = await getActiveCapabilityCatalog();
    if (current.row?.payload && current.row.sourceVersionId === headVersionId && current.row.sourceETag === headETag) {
      // Sorgente invariata: basta rinnovare la freshness. renew verifica di suo
      // versionId/etag nella propria transazione, quindi non serve il lock di sync.
      const renewed = await renewCapabilityCatalogVerification(headVersionId, headETag, validitySeconds);
      if (!renewed) return { kind: "SKIPPED_STALE", revision: current.row.revision ?? undefined };
      return { kind: "VERIFIED", revision: current.row.revision ?? undefined };
    }

    const object = await reader.get(config.bucket, AUTOMATIC_RUNBOOK_CATALOG_KEY, headVersionId);
    if (object.body.byteLength > MAX_CATALOG_BYTES) throw new Error("CATALOG_TOO_LARGE");
    const parsed: unknown = JSON.parse(new TextDecoder().decode(object.body));
    const validation = validateCatalog(parsed, config.environment);
    if (!validation.ok) throw new Error(`CATALOG_INVALID:${validation.reason}`);
    const catalog = validation.catalog;
    const sourceVersionId = object.versionId ?? headVersionId;
    const sourceETag = object.etag ?? headETag;

    // ── Fase 2: transazione breve sotto advisory lock, sole scritture ────────
    const locked = await withCapabilityCatalogSyncLock(async (tx): Promise<CatalogSyncResult> => {
      const latest = await getActiveCapabilityCatalog(undefined, tx);
      if (latest.row?.payload && latest.row.sourceVersionId === sourceVersionId && latest.row.sourceETag === sourceETag) {
        // Un'altra istanza ha già scritto questa stessa versione: solo renew.
        await renewCapabilityCatalogVerification(sourceVersionId, sourceETag, validitySeconds, tx);
        return { kind: "VERIFIED", revision: latest.row.revision ?? undefined };
      }
      if (latest.row?.sourcePublishedAt && latest.row.sourcePublishedAt.getTime() > Date.parse(catalog.publishedAt)) {
        // Il DB contiene già un catalogo pubblicato più di recente: non
        // sovrascriverlo con quello (più vecchio) letto in fase 1.
        return { kind: "SKIPPED_STALE", revision: latest.row.revision ?? undefined };
      }
      await upsertVerifiedCapabilityCatalog({ catalog, sourceVersionId, sourceETag, validitySeconds }, tx);
      const controlSetting = await tx.systemSetting.findUnique({ where: { key: SLACK_INGESTOR_CONTROL_SETTING_KEY }, select: { value: true } });
      const control = validateSlackIngestorControl(controlSetting?.value, { allowGlobalMatchers: true });
      const referenceHealth = control.valid ? evaluateCatalogReferenceHealth(control.value, catalog.runbooks) : null;
      await tx.systemEvent.create({
        data: {
          action: "AUTOMATION_CAPABILITY_CATALOG_UPDATED",
          resource: "AUTOMATION_CAPABILITY_CATALOG",
          resourceId: ACTIVE_CAPABILITY_CATALOG_KEY,
          resourceLabel: catalog.revision,
          userId: null,
          metadata: {
            actorType: "SYSTEM",
            revision: catalog.revision,
            workerArtifactRevision: catalog.worker.artifactRevision,
            release: catalog.release,
            catalogReferenceHealth: referenceHealth?.health ?? "CONTROL_INVALID",
            unresolvedReferences: referenceHealth?.issues.length ?? 0,
          },
        },
      });
      return { kind: "UPDATED", revision: catalog.revision };
    });
    return locked.acquired ? locked.value : { kind: "SKIPPED_LOCKED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCapabilityCatalogFailure({ errorCode: message.split(":")[0]!, error: message });
    return { kind: "FAILED", error: message };
  }
}

/**
 * Stato completo del catalogo attivo: riga persistita, payload validato (una
 * volta per revision, memoizzato nel layer database), health e usabilita.
 */
export async function getCatalogState() {
  return getActiveCapabilityCatalog();
}

export function capabilityMatches(command: { runbook: { key: string; version: string; definitionDigest: string } }, catalog: AutomaticRunbookCatalogV1): boolean {
  return catalog.runbooks.some((runbook) => runbook.key === command.runbook.key && runbook.version === command.runbook.version && runbook.definitionDigest === command.runbook.definitionDigest);
}

export type CapabilityResolution =
  | { kind: "OK"; revision: string }
  | { kind: "CATALOG_UNAVAILABLE"; reason: string }
  | { kind: "CAPABILITY_WITHDRAWN"; key: string };

export interface CapabilityCatalogProvider {
  resolve(command: { runbook: { key: string; version: string; definitionDigest: string } }, now?: Date): Promise<CapabilityResolution>;
}

export class DatabaseCapabilityCatalog implements CapabilityCatalogProvider {
  async resolve(command: { runbook: { key: string; version: string; definitionDigest: string } }): Promise<CapabilityResolution> {
    const active = await getActiveCapabilityCatalog();
    if (!active.usable || !active.catalog) return { kind: "CATALOG_UNAVAILABLE", reason: `catalog is ${active.health.toLowerCase()}` };
    const catalog = active.catalog;
    if (!capabilityMatches(command, catalog)) return { kind: "CAPABILITY_WITHDRAWN", key: command.runbook.key };
    return { kind: "OK", revision: catalog.revision };
  }
}
