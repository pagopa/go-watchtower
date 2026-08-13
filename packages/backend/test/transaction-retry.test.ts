import assert from "node:assert/strict";
import test from "node:test";

// Il classificatore riconosce gli errori con `instanceof`, quindi il test deve
// caricare il modulo Prisma vero; importarlo istanzia il client, che pretende
// una `DATABASE_URL`. Nessuna connessione viene aperta — il client si costruisce
// e basta — perciò un valore fittizio è sufficiente, come nell'export dei
// contratti. Import dinamici perché quelli statici verrebbero issati sopra
// questa riga.
process.env["DATABASE_URL"] ??= "postgresql://unit:test@127.0.0.1:5432/unit";

const { Prisma } = await import("@go-watchtower/database");
const { isRetryableTransactionError, withTransactionRetry } = await import(
  "../src/utils/transaction-retry.js"
);

/** Errore come lo consegna un `$queryRaw`: SQLSTATE grezzo nel meta del driver. */
function rawError(sqlstate: string): InstanceType<typeof Prisma.PrismaClientKnownRequestError> {
  return new Prisma.PrismaClientKnownRequestError("raw query failed", {
    code: "P2010",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { originalCode: sqlstate } } },
  });
}

test("il deadlock sul percorso raw è ritentabile", () => {
  // 40P01 arriva solo da qui: è sui `SELECT ... FOR UPDATE` che le transazioni
  // si aspettano, ed è il caso che il classificatore precedente non vedeva.
  assert.equal(isRetryableTransactionError(rawError("40P01")), true);
});

test("la serialization failure è ritentabile su entrambi i percorsi", () => {
  assert.equal(isRetryableTransactionError(rawError("40001")), true);
  assert.equal(
    isRetryableTransactionError(
      new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "test" }),
    ),
    true,
  );
});

test("gli errori applicativi non sono ritentabili", () => {
  // Ritentare una violazione di unicità la ripeterebbe identica tre volte.
  assert.equal(isRetryableTransactionError(rawError("23505")), false);
  assert.equal(
    isRetryableTransactionError(
      new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "test" }),
    ),
    false,
  );
  assert.equal(isRetryableTransactionError(new Error("boom")), false);
  assert.equal(isRetryableTransactionError(null), false);
});

test("withTransactionRetry riesegue finché la contesa si risolve", async () => {
  let attempts = 0;
  const result = await withTransactionRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw rawError("40P01");
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withTransactionRetry rilancia dopo i tentativi concessi", async () => {
  let attempts = 0;
  await assert.rejects(
    withTransactionRetry(async () => {
      attempts += 1;
      throw rawError("40001");
    }, 2),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError,
  );

  // Primo tentativo più i due concessi: oltre, la contesa non è transitoria.
  assert.equal(attempts, 3);
});

test("withTransactionRetry non riesegue un errore applicativo", async () => {
  let attempts = 0;
  await assert.rejects(
    withTransactionRetry(async () => {
      attempts += 1;
      throw new Error("vincolo violato");
    }),
  );

  assert.equal(attempts, 1);
});
