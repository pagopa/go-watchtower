import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { createReconcilerRunner } from "./reconciler-runner.js";
import { createAwsS3CatalogReader } from "./aws-adapters.js";
import { syncCapabilityCatalog } from "./capability-catalog.js";

export function buildCatalogSync() {
  const reader = createAwsS3CatalogReader(env.AUTOMATIC_RUNBOOK_CATALOG_REGION);
  return () => syncCapabilityCatalog(reader, {
    bucket: env.AUTOMATIC_RUNBOOK_CATALOG_BUCKET,
    environment: env.AUTOMATIC_RUNBOOK_CATALOG_ENVIRONMENT,
    validitySeconds: env.CATALOG_VALIDITY_SECONDS,
  });
}

export function startCapabilityCatalogScheduler(logger: FastifyBaseLogger): () => void {
  if (!env.AUTOMATIC_RUNBOOK_CATALOG_BUCKET) {
    logger.warn("capability catalog sync disabled: AUTOMATIC_RUNBOOK_CATALOG_BUCKET is empty");
    return () => {};
  }
  const sync = buildCatalogSync();
  const runner = createReconcilerRunner(async () => {
    const result = await sync();
    if (result.kind === "FAILED") logger.error({ error: result.error }, "capability catalog sync failed");
    else if (result.kind === "UPDATED") logger.info({ revision: result.revision }, "capability catalog updated");
  });
  const tick = () => { runner.runOnce().catch((error: unknown) => logger.error(error, "capability catalog sync failed")); };
  const timer = setInterval(tick, env.CATALOG_SYNC_INTERVAL_SECONDS * 1000);
  tick();
  return () => clearInterval(timer);
}
