import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import { validateAutomaticRunbookCatalog } from "@go-watchtower/shared";

process.env["DATABASE_URL"] ??= "postgresql://unit:unit@localhost:5432/unit";
const { validateCatalog } = await import(
  "../../src/services/automation/capability-catalog.js"
);

/**
 * Contract test JSON Schema ↔ validatore condiviso (drift guard).
 *
 * Il formato del catalogo vive in due posti: lo schema vendorizzato da GA
 * (`automatic-runbook-catalog-v1.schema.json`) e il validatore hand-rolled in
 * shared. Questo test li applica entrambi alle stesse fixture e alle stesse
 * mutazioni strutturali: se uno dei due cambia senza l'altro, un caso qui sotto
 * smette di concordare. Lo schema viene valutato con lo stesso motore Ajv che
 * Fastify usa in produzione (nessuna dipendenza aggiuntiva), con opzioni severe
 * così `additionalProperties: false` rigetta invece di ripulire.
 */

const UPSTREAM = path.resolve(
  import.meta.dirname,
  "../../../../contracts/runbook-automation/v1/upstream/go-automation",
);

function readUpstreamJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(UPSTREAM, rel), "utf-8"));
}

const catalogSchema = readUpstreamJson("automatic-runbook-catalog-v1.schema.json") as Record<string, unknown>;
const validFixture = readUpstreamJson("fixtures/automatic-runbook-catalog.valid.json");
const invalidRevisionFixture = readUpstreamJson("fixtures/automatic-runbook-catalog.invalid-revision.json");

const app = Fastify({
  ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
});
app.post("/validate", { schema: { body: catalogSchema } }, async () => ({ ok: true }));
await app.ready();
test.after(async () => { await app.close(); });

async function schemaAccepts(payload: unknown): Promise<boolean> {
  const response = await app.inject({ method: "POST", url: "/validate", payload: payload as object });
  return response.statusCode === 200;
}

function sharedAccepts(payload: unknown): boolean {
  return validateAutomaticRunbookCatalog(payload).valid;
}

type Mutate = (catalog: Record<string, unknown>) => void;

/** Mutazioni strutturali che ENTRAMBI i validatori devono rigettare. */
const STRUCTURAL_MUTATIONS: Record<string, Mutate> = {
  "campo top-level sconosciuto": (c) => { c["extra"] = true; },
  "schemaVersion non supportata": (c) => { c["schemaVersion"] = 2; },
  "revision malformata": (c) => { c["revision"] = "sha256-not-a-hash"; },
  "environment fuori pattern": (c) => { c["environment"] = "Prod!"; },
  "publishedAt non ISO-8601": (c) => { c["publishedAt"] = "yesterday"; },
  "commandSchemaVersion diversa da 1.0.0": (c) => {
    (c["worker"] as Record<string, unknown>)["commandSchemaVersion"] = "2.0.0";
  },
  "changeNote vuota": (c) => {
    (c["release"] as Record<string, unknown>)["changeNote"] = "";
  },
  "campo runbook sconosciuto": (c) => { runbook(c)["extra"] = true; },
  "kind non previsto": (c) => { runbook(c)["kind"] = "EC2"; },
  "version non SemVer": (c) => { runbook(c)["version"] = "1.0"; },
  "team vuoto": (c) => { runbook(c)["team"] = ""; },
  "categories vuote": (c) => { runbook(c)["categories"] = []; },
  "category fuori pattern": (c) => { runbook(c)["categories"] = ["delivery"]; },
  "categories duplicate": (c) => { runbook(c)["categories"] = ["DELIVERY", "DELIVERY"]; },
  "alarmNames vuoti": (c) => { runbook(c)["alarmNames"] = []; },
  "alarmNames duplicati nello stesso runbook": (c) => {
    runbook(c)["alarmNames"] = ["send-api-errors", "send-api-errors"];
  },
  "definitionDigest malformato": (c) => { runbook(c)["definitionDigest"] = "sha256-short"; },
};

function runbook(catalog: Record<string, unknown>): Record<string, unknown> {
  return (catalog["runbooks"] as Record<string, unknown>[])[0]!;
}

function mutated(mutate: Mutate): unknown {
  const clone = structuredClone(validFixture) as Record<string, unknown>;
  mutate(clone);
  return clone;
}

test("fixture valida: accettata da JSON Schema, validatore shared e contratto backend", async () => {
  assert.equal(await schemaAccepts(validFixture), true, "JSON Schema deve accettare la fixture valida");
  assert.equal(sharedAccepts(validFixture), true, "il validatore shared deve accettare la fixture valida");
  assert.equal(validateCatalog(validFixture, "production").ok, true);
});

test("le mutazioni strutturali sono rigettate da ENTRAMBI i validatori", async () => {
  for (const [label, mutate] of Object.entries(STRUCTURAL_MUTATIONS)) {
    const payload = mutated(mutate);
    assert.equal(await schemaAccepts(payload), false, `JSON Schema deve rigettare: ${label}`);
    assert.equal(sharedAccepts(payload), false, `validatore shared deve rigettare: ${label}`);
  }
});

test("controlli solo-codice: lo schema non può esprimerli ed è atteso che li accetti", async () => {
  // Revision con formato corretto ma hash sbagliato: verificabile solo ricalcolando.
  assert.equal(await schemaAccepts(invalidRevisionFixture), true);
  assert.equal(sharedAccepts(invalidRevisionFixture), true);
  const result = validateCatalog(invalidRevisionFixture, "production");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /revision/i);

  // Alarm name assegnato a due runbook diversi: vincolo cross-descriptor,
  // fuori dalla portata di JSON Schema ma coperto dal validatore shared.
  const ambiguous = mutated((c) => {
    const runbooks = c["runbooks"] as Record<string, unknown>[];
    runbooks.push({ ...structuredClone(runbooks[0]!), key: "other-runbook" });
  });
  assert.equal(await schemaAccepts(ambiguous), true);
  assert.equal(sharedAccepts(ambiguous), false);
});
