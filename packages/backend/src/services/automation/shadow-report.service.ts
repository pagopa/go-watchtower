import { prisma } from "@go-watchtower/database";
import { AutomationAnalysisApplyStatuses } from "@go-watchtower/shared";

import type { AnalysisApplyDiagnosticsV1 } from "@go-watchtower/shared";
import type { ShadowReportResponse } from "../../routes/automatic-runbook-executions/schemas.js";

/** Tetto ai riferimenti elencati per capability: è una lista di lavoro, non un dump. */
const MAX_UNRESOLVED_LISTED = 50;

interface ShadowRow {
  /** Capability fissata al dispatch: è quella che governa l'esito, non l'eseguita. */
  readonly requestedRunbookKey: string | null;
  readonly productId: string;
  readonly analysisApplyDiagnostics: unknown;
}

interface Bucket {
  runbookKey: string | null;
  productId: string;
  evaluated: number;
  wouldApply: number;
  wouldBlock: number;
  blockedByCode: Record<string, number>;
  unresolved: Set<string>;
  contextValid: number;
  contextInvalid: number;
}

/**
 * Aggrega gli esiti evaluate-only per capability e prodotto (Fase 5).
 *
 * È il read path che manca a uno shadow: senza, l'unico modo di sapere se
 * l'automazione è pronta sarebbe aprire le esecuzioni una per una. Qui la
 * domanda diventa una sola — *quali capability applicherebbero tutto ciò che
 * incontrano, e per le altre cosa manca al censimento*.
 *
 * `ready` è deliberatamente severo: basta un blocco nella finestra perché la
 * capability non lo sia. Attivare `APPLY_KNOWN` con blocchi noti significherebbe
 * spostare quel problema nella coda di remediation invece di risolverlo prima.
 *
 * @param windowDays - Ampiezza della finestra di osservazione
 * @param productId - Filtro opzionale per prodotto
 * @param now - Istante di riferimento
 */
export async function buildShadowReport(
  windowDays: number,
  productId: string | undefined,
  now: Date = new Date(),
): Promise<ShadowReportResponse> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const rows = (await prisma.automaticRunbookExecution.findMany({
    where: {
      createdAt: { gte: since },
      analysisApplyStatus: {
        in: [AutomationAnalysisApplyStatuses.NOT_REQUESTED, AutomationAnalysisApplyStatuses.PRESERVED_HUMAN],
      },
      ...(productId === undefined ? {} : { productId }),
    },
    select: { requestedRunbookKey: true, productId: true, analysisApplyDiagnostics: true },
  })) as ShadowRow[];

  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const diagnostics = row.analysisApplyDiagnostics as AnalysisApplyDiagnosticsV1 | null;
    // Solo le righe realmente valutate: una diagnostica assente non è un esito.
    if (diagnostics?.evaluatedOnly !== true) continue;
    const bucket = bucketFor(buckets, row);
    bucket.evaluated += 1;

    if (diagnostics.wouldApplyStatus === "APPLIED") bucket.wouldApply += 1;
    if (diagnostics.wouldApplyStatus === "BLOCKED") {
      bucket.wouldBlock += 1;
      const code = diagnostics.blockCode ?? "UNKNOWN";
      bucket.blockedByCode[code] = (bucket.blockedByCode[code] ?? 0) + 1;
      collectUnresolved(bucket, diagnostics);
    }
    if (diagnostics.contextValidationStatus === "VALID") bucket.contextValid += 1;
    if (diagnostics.contextValidationStatus === "INVALID") bucket.contextInvalid += 1;
  }

  const productNames = await readProductNames([...new Set(rows.map((row) => row.productId))]);
  const capabilities = [...buckets.values()]
    .map((bucket) => ({
      runbookKey: bucket.runbookKey,
      productId: bucket.productId,
      productName: productNames.get(bucket.productId) ?? bucket.productId,
      evaluated: bucket.evaluated,
      wouldApply: bucket.wouldApply,
      wouldBlock: bucket.wouldBlock,
      blockedByCode: bucket.blockedByCode,
      unresolvedReferences: [...bucket.unresolved].sort().slice(0, MAX_UNRESOLVED_LISTED),
      contextValid: bucket.contextValid,
      contextInvalid: bucket.contextInvalid,
      // Una capability senza known case valutati non è "pronta": è non misurata.
      ready: bucket.wouldBlock === 0 && bucket.wouldApply > 0,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName) || (a.runbookKey ?? "").localeCompare(b.runbookKey ?? ""));

  return {
    windowDays,
    since: since.toISOString(),
    capabilities,
    readyCapabilities: capabilities.filter((capability) => capability.ready).length,
    totalCapabilities: capabilities.length,
  };
}

function bucketFor(buckets: Map<string, Bucket>, row: ShadowRow): Bucket {
  const key = `${row.productId}::${row.requestedRunbookKey ?? ""}`;
  const existing = buckets.get(key);
  if (existing !== undefined) return existing;
  const created: Bucket = {
    runbookKey: row.requestedRunbookKey,
    productId: row.productId,
    evaluated: 0,
    wouldApply: 0,
    wouldBlock: 0,
    blockedByCode: {},
    unresolved: new Set<string>(),
    contextValid: 0,
    contextInvalid: 0,
  };
  buckets.set(key, created);
  return created;
}

/** I riferimenti si accumulano con la categoria davanti: «downstream:SPID» è azionabile, «SPID» no. */
function collectUnresolved(bucket: Bucket, diagnostics: AnalysisApplyDiagnosticsV1): void {
  const unresolved = diagnostics.unresolvedReferences;
  if (unresolved === undefined) return;
  for (const name of unresolved.resources ?? []) bucket.unresolved.add(`resource:${name}`);
  for (const name of unresolved.downstreams ?? []) bucket.unresolved.add(`downstream:${name}`);
  for (const name of unresolved.finalActions ?? []) bucket.unresolved.add(`finalAction:${name}`);
  if (unresolved.ignoreReasonCode !== undefined) {
    bucket.unresolved.add(`ignoreReason:${unresolved.ignoreReasonCode}`);
  }
}

async function readProductNames(productIds: readonly string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const products = await prisma.product.findMany({
    where: { id: { in: [...productIds] } },
    select: { id: true, name: true },
  });
  return new Map(products.map((product) => [product.id, product.name]));
}
