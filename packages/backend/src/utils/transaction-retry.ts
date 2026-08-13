import { Prisma } from "@go-watchtower/database";

/**
 * SQLSTATE che PostgreSQL restituisce quando la transazione non ha fallito per
 * un errore applicativo ma per contesa, ed è quindi rieseguibile così com'è.
 *
 * `40001` = serialization failure (SSI, o un lock che non può più essere
 * concesso senza violare l'isolamento). `40P01` = deadlock detected: due
 * transazioni si aspettano a vicenda e PostgreSQL ne uccide una.
 */
const RETRYABLE_SQLSTATES: ReadonlySet<string> = new Set(["40001", "40P01"]);

interface DriverAdapterErrorMeta {
  readonly driverAdapterError?: {
    readonly cause?: { readonly originalCode?: unknown; readonly kind?: unknown };
  };
}

/**
 * Riconosce i fallimenti da contesa su **entrambi** i percorsi con cui possono
 * arrivare.
 *
 * Sulle query ORM Prisma normalizza sia `40001` sia `40P01` in `P2034`. I lock
 * di riga passano però da `$queryRaw ... FOR UPDATE`, e lì l'errore arriva come
 * `P2010` con il SQLSTATE grezzo annidato nel meta del driver adapter: proprio
 * il percorso su cui un deadlock si manifesta, visto che è dove le transazioni
 * si mettono in attesa.
 *
 * @param error - Errore catturato attorno a una transazione
 * @returns `true` se rieseguire la transazione è l'azione corretta
 *
 * @example
 * ```typescript
 * try { await runTx(); } catch (e) { if (isRetryableTransactionError(e)) retry(); }
 * ```
 */
export function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  const cause = (error.meta as DriverAdapterErrorMeta | undefined)?.driverAdapterError?.cause;
  if (cause?.kind === "TransactionWriteConflict") return true;
  return typeof cause?.originalCode === "string" && RETRYABLE_SQLSTATES.has(cause.originalCode);
}

/** Tentativi aggiuntivi dopo il primo. Oltre, la contesa non è più transitoria. */
const DEFAULT_RETRIES = 3;

/**
 * Riesegue `run` finché fallisce per contesa, poi rilancia.
 *
 * Il corpo deve essere ripetibile: ogni effetto collaterale sta dentro la
 * transazione (che il rollback annulla) e nulla viene emesso all'esterno prima
 * del commit. Un `push` su `request.auditEvents` dentro il callback, per dire,
 * sopravviverebbe al rollback e verrebbe duplicato dal tentativo successivo.
 *
 * @param run - Corpo che apre ed esegue la transazione
 * @param retries - Tentativi aggiuntivi concessi
 * @returns Il valore prodotto dal primo tentativo andato a buon fine
 */
export async function withTransactionRetry<T>(
  run: () => Promise<T>,
  retries: number = DEFAULT_RETRIES,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt < retries && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }
}
