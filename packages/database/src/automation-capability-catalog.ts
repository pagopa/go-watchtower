import {
  AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY,
  AutomationCatalogHealths,
  deriveAutomationCapabilityCatalogHealth,
  validateAutomaticRunbookCatalog,
  type AutomaticRunbookCatalog,
  type AutomationCatalogHealth,
} from "@go-watchtower/shared";
import {
  Prisma,
  type AutomationCapabilityCatalog,
} from "../generated/prisma/client.js";
import { prisma } from "./client.js";

interface DatabaseClockRow {
  now: Date;
}

interface AdvisoryLockRow {
  acquired: boolean;
}

const CAPABILITY_CATALOG_SYNC_LOCK_KEY =
  "watchtower:automatic-runbook-catalog-sync";

export type CapabilityCatalogSyncLockResult<T> =
  | { acquired: false }
  | { acquired: true; value: T };

export interface ActiveCapabilityCatalog {
  row: AutomationCapabilityCatalog | null;
  catalog: AutomaticRunbookCatalog | null;
  health: AutomationCatalogHealth;
  usable: boolean;
  databaseNow: Date;
}

export interface VerifiedCapabilityCatalogInput {
  catalog: AutomaticRunbookCatalog;
  sourceVersionId: string;
  sourceETag: string;
  validitySeconds: number;
}

export interface CapabilityCatalogFailureInput {
  errorCode: string;
  error: string;
}

async function readDatabaseNow(
  transaction?: Prisma.TransactionClient,
): Promise<Date> {
  const client = transaction ?? prisma;
  const rows = await client.$queryRaw<
    DatabaseClockRow[]
  >`SELECT CURRENT_TIMESTAMP AS "now"`;
  const value = rows[0]?.now;
  if (!value) throw new Error("Unable to read database clock");
  return value;
}

/**
 * Cache di processo del payload validato, con chiave la revision persistita.
 * Il catalogo viene validato al confine di fiducia (S3/file) prima di ogni
 * scrittura: in lettura la validazione serve solo a intercettare un payload DB
 * corrotto e viene eseguita al piu una volta per revision, non a ogni accesso.
 * revision e payload cambiano sempre insieme (upsertVerifiedCapabilityCatalog),
 * quindi la chiave identifica univocamente il contenuto.
 */
let validatedPayloadCache: {
  revision: string;
  catalog: AutomaticRunbookCatalog | null;
} | null = null;

function validatedCatalogFor(
  row: AutomationCapabilityCatalog,
): AutomaticRunbookCatalog | null {
  if (row.payload === null) return null;
  if (
    row.revision !== null &&
    validatedPayloadCache?.revision === row.revision
  ) {
    return validatedPayloadCache.catalog;
  }
  const validated = validateAutomaticRunbookCatalog(row.payload);
  const catalog = validated.valid ? validated.value : null;
  if (row.revision !== null) {
    validatedPayloadCache = { revision: row.revision, catalog };
  }
  return catalog;
}

/**
 * Legge la singleton ACTIVE e applica il solo predicato di freshness condiviso.
 * Se il payload DB non supera piu la validazione strutturale viene trattato come
 * INVALID anche quando validUntil e ancora futuro.
 */
export async function getActiveCapabilityCatalog(
  now?: Date,
  transaction?: Prisma.TransactionClient,
): Promise<ActiveCapabilityCatalog> {
  const client = transaction ?? prisma;
  const databaseNow = now ?? (await readDatabaseNow(transaction));
  const row = await client.automationCapabilityCatalog.findUnique({
    where: { key: AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY },
  });
  if (!row) {
    return {
      row: null,
      catalog: null,
      health: AutomationCatalogHealths.UNINITIALIZED,
      usable: false,
      databaseNow,
    };
  }
  const derived = deriveAutomationCapabilityCatalogHealth(row, databaseNow);
  if (row.payload === null)
    return { row, catalog: null, ...derived, databaseNow };
  const catalog = validatedCatalogFor(row);
  if (catalog === null) {
    return {
      row,
      catalog: null,
      health: AutomationCatalogHealths.INVALID,
      usable: false,
      databaseNow,
    };
  }
  return { row, catalog, ...derived, databaseNow };
}

/**
 * Registra atomicamente un catalogo e rinnova validUntil. Il chiamante deve
 * avere gia validato il catalogo al confine di fiducia (validateCatalog nel
 * sync S3 o nell'import locale): qui non viene rivalidato.
 */
export async function upsertVerifiedCapabilityCatalog(
  input: VerifiedCapabilityCatalogInput,
  transaction?: Prisma.TransactionClient,
): Promise<AutomationCapabilityCatalog> {
  if (
    !Number.isSafeInteger(input.validitySeconds) ||
    input.validitySeconds <= 0
  ) {
    throw new Error("validitySeconds must be a positive integer");
  }
  // Il contenuto e noto e validato: popola la cache di lettura per revision.
  validatedPayloadCache = {
    revision: input.catalog.revision,
    catalog: input.catalog,
  };
  const execute = async (
    tx: Prisma.TransactionClient,
  ): Promise<AutomationCapabilityCatalog> => {
    const rows = await tx.$queryRaw<
      DatabaseClockRow[]
    >`SELECT CURRENT_TIMESTAMP AS "now"`;
    const databaseNow = rows[0]?.now;
    if (!databaseNow) throw new Error("Unable to read database clock");
    const validUntil = new Date(
      databaseNow.getTime() + input.validitySeconds * 1_000,
    );
    return tx.automationCapabilityCatalog.upsert({
      where: { key: AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY },
      create: {
        key: AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY,
        revision: input.catalog.revision,
        sourcePublishedAt: new Date(input.catalog.publishedAt),
        sourceVersionId: input.sourceVersionId,
        sourceETag: input.sourceETag,
        payload: input.catalog as unknown as Prisma.InputJsonValue,
        lastAttemptAt: databaseNow,
        lastVerifiedAt: databaseNow,
        validUntil,
      },
      update: {
        revision: input.catalog.revision,
        sourcePublishedAt: new Date(input.catalog.publishedAt),
        sourceVersionId: input.sourceVersionId,
        sourceETag: input.sourceETag,
        payload: input.catalog as unknown as Prisma.InputJsonValue,
        lastAttemptAt: databaseNow,
        lastVerifiedAt: databaseNow,
        validUntil,
        lastErrorCode: null,
        lastError: null,
      },
    });
  };
  return transaction ? execute(transaction) : prisma.$transaction(execute);
}

/** Rinnova la freshness dopo HeadObject invariato e verificato. */
export async function renewCapabilityCatalogVerification(
  sourceVersionId: string,
  sourceETag: string,
  validitySeconds: number,
  transaction?: Prisma.TransactionClient,
): Promise<AutomationCapabilityCatalog | null> {
  if (!Number.isSafeInteger(validitySeconds) || validitySeconds <= 0) {
    throw new Error("validitySeconds must be a positive integer");
  }
  const execute = async (
    tx: Prisma.TransactionClient,
  ): Promise<AutomationCapabilityCatalog | null> => {
    const rows = await tx.$queryRaw<
      DatabaseClockRow[]
    >`SELECT CURRENT_TIMESTAMP AS "now"`;
    const databaseNow = rows[0]?.now;
    if (!databaseNow) throw new Error("Unable to read database clock");
    const row = await tx.automationCapabilityCatalog.findUnique({
      where: { key: AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY },
    });
    if (
      !row ||
      row.sourceVersionId !== sourceVersionId ||
      row.sourceETag !== sourceETag ||
      row.payload === null
    )
      return null;
    return tx.automationCapabilityCatalog.update({
      where: { key: AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY },
      data: {
        lastAttemptAt: databaseNow,
        lastVerifiedAt: databaseNow,
        validUntil: new Date(databaseNow.getTime() + validitySeconds * 1_000),
        lastErrorCode: null,
        lastError: null,
      },
    });
  };
  return transaction ? execute(transaction) : prisma.$transaction(execute);
}

/** Conserva il last-known-good e non rinnova lastVerifiedAt/validUntil. */
export async function recordCapabilityCatalogFailure(
  input: CapabilityCatalogFailureInput,
  transaction?: Prisma.TransactionClient,
): Promise<AutomationCapabilityCatalog> {
  const client = transaction ?? prisma;
  const databaseNow = await readDatabaseNow(transaction);
  const sanitizedError = input.error.slice(0, 2_000);
  return client.automationCapabilityCatalog.upsert({
    where: { key: AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY },
    create: {
      key: AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY,
      lastAttemptAt: databaseNow,
      lastErrorCode: input.errorCode,
      lastError: sanitizedError,
    },
    update: {
      lastAttemptAt: databaseNow,
      lastErrorCode: input.errorCode,
      lastError: sanitizedError,
    },
  });
}

/**
 * Serializza il compare&write del sync dentro una interactive transaction breve
 * e acquisisce un transaction-level advisory lock sulla stessa connessione. Il
 * lock viene rilasciato automaticamente al commit/rollback: non esiste una
 * unlock manuale che possa finire su una sessione diversa del pool.
 *
 * Il callback deve contenere solo letture/scritture DB: l'I/O verso S3 e la
 * validazione avvengono prima, fuori dalla transazione (il timeout breve qui
 * sotto lo presuppone).
 *
 * Gli helper catalog accettano il TransactionClient ricevuto dal callback come
 * ultimo argomento, evitando transazioni annidate e garantendo la stessa sessione.
 */
export async function withCapabilityCatalogSyncLock<T>(
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<CapabilityCatalogSyncLockResult<T>> {
  return prisma.$transaction(
    async (transaction) => {
      const rows = await transaction.$queryRaw<
        AdvisoryLockRow[]
      >`SELECT pg_try_advisory_xact_lock(hashtext(${CAPABILITY_CATALOG_SYNC_LOCK_KEY})) AS "acquired"`;
      if (!rows[0]?.acquired) return { acquired: false };
      const value = await callback(transaction);
      return { acquired: true, value };
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}
