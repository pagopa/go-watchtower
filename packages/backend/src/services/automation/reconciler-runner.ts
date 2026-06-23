/**
 * Guardia anti-sovrapposizione pura per lo scheduler del reconciler: salta un
 * giro se il precedente è ancora in corso. Isolata in un modulo senza dipendenze
 * pesanti (niente DB/AWS) così è testabile come unit.
 */
export function createReconcilerRunner(tick: () => Promise<void>): {
  runOnce: () => Promise<{ skipped: boolean }>;
} {
  let running = false;
  async function runOnce(): Promise<{ skipped: boolean }> {
    if (running) return { skipped: true };
    running = true;
    try {
      await tick();
      return { skipped: false };
    } finally {
      running = false;
    }
  }
  return { runOnce };
}
