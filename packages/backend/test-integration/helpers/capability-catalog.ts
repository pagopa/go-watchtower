import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { upsertVerifiedCapabilityCatalog } from "@go-watchtower/database";
import type { AutomaticRunbookCatalog } from "@go-watchtower/shared";

const CATALOG_FIXTURE = path.resolve(
  import.meta.dirname,
  "../../../../contracts/runbook-automation/v1/upstream/go-automation/fixtures/automatic-runbook-catalog.valid.json",
);

const VALIDITY_SECONDS = 3_600;

/**
 * Registra il catalogo ACTIVE dichiarando gli allarmi della suite.
 *
 * Ogni suite crea allarmi con nome randomico per non collidere con le altre,
 * mentre il match della capability è per nome esatto (`alarmNames.includes`):
 * senza questa registrazione né `ensureInitialExecution` né
 * `createManualExecution` riescono a costruire il comando, e la suite muore nel
 * setup invece che sulle asserzioni. Il payload parte dalla fixture di
 * contratto, così ogni altro campo resta valido per costruzione.
 *
 * @param alarmNames - Nomi degli allarmi che la capability deve coprire
 */
export async function registerCapabilityCatalogFor(alarmNames: readonly string[]): Promise<void> {
  const base = JSON.parse(readFileSync(CATALOG_FIXTURE, "utf-8")) as AutomaticRunbookCatalog;
  const descriptor = base.runbooks[0];
  if (!descriptor) throw new Error("catalog fixture has no runbooks");
  const runbooks = [{ ...descriptor, alarmNames: [...alarmNames] }];
  // revision e payload devono cambiare insieme: la cache di lettura è per revision.
  const revision = `sha256-${crypto.createHash("sha256").update(JSON.stringify(runbooks)).digest("hex")}`;

  await upsertVerifiedCapabilityCatalog({
    catalog: { ...base, revision, runbooks },
    sourceVersionId: `itest-${crypto.randomUUID().slice(0, 8)}`,
    sourceETag: "itest",
    validitySeconds: VALIDITY_SECONDS,
  });
}
