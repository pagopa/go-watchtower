import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { runReconcilerTick, type DispatchDeps, type ReconcilerTickResult } from "./reconciler.service.js";
import { RegionalQueueRegistry } from "./queue-registry.js";
import { AwsSqsSender, AwsSsmParameterReader } from "./aws-adapters.js";
import { createReconcilerRunner } from "./reconciler-runner.js";

/**
 * Scheduler in-process del reconciler (OPUS-03 §9.9): un timer interno al backend
 * (come quello già presente per la pulizia token) richiama periodicamente
 * `runReconcilerTick`. Modalità completa: se il registry regionale è configurato,
 * il tick fa anche il re-dispatch dei PENDING_DISPATCH su SQS; altrimenti gira in
 * sola modalità DB (timeout/recupero/finalizzazione) senza toccare AWS.
 */

export { createReconcilerRunner };

/**
 * Costruisce le dipendenze di dispatch (registry SSM + sender SQS) se il registry
 * è configurato via env; altrimenti undefined → reconciler in sola modalità DB.
 */
export function buildDispatchDeps(): DispatchDeps | undefined {
  const parameterName = env.EXECUTE_RUNBOOK_QUEUE_REGISTRY_PARAMETER;
  const parameterRegion = env.EXECUTE_RUNBOOK_QUEUE_REGISTRY_REGION;
  if (!parameterName || !parameterRegion) return undefined;
  const registry = new RegionalQueueRegistry(new AwsSsmParameterReader(), {
    parameterName,
    parameterRegion,
  });
  return { registry, sender: new AwsSqsSender() };
}

function isMeaningful(r: ReconcilerTickResult): boolean {
  return (
    r.dispatched > 0 ||
    r.leaseReleased > 0 ||
    r.terminalized > 0 ||
    r.finalizedCancellations > 0 ||
    r.heartbeatStaleAlerts > 0
  );
}

/**
 * Avvia lo scheduler. Ritorna una funzione di stop (da chiamare allo shutdown).
 * No-op se `RECONCILER_ENABLED` è false.
 */
export function startReconcilerScheduler(logger: FastifyBaseLogger): () => void {
  if (!env.RECONCILER_ENABLED) {
    logger.info("reconciler scheduler disabled (RECONCILER_ENABLED=false)");
    return () => {};
  }

  const deps = buildDispatchDeps();
  const mode = deps ? "full (dispatch + db)" : "db-only (no SQS dispatch: registry not configured)";
  logger.info(
    { mode, intervalMs: env.RECONCILER_INTERVAL_MS },
    "reconciler scheduler started",
  );

  const runner = createReconcilerRunner(async () => {
    const result = await runReconcilerTick({}, deps);
    if (isMeaningful(result)) {
      logger.info({ reconciler: result }, "reconciler tick applied changes");
    }
  });

  const tick = (): void => {
    runner.runOnce().catch((err: unknown) => logger.error(err, "reconciler tick failed"));
  };

  // Primo giro poco dopo l'avvio, poi a intervalli regolari.
  const timer = setInterval(tick, env.RECONCILER_INTERVAL_MS);
  tick();

  return () => clearInterval(timer);
}
