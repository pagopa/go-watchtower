import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { AnalysisDraftV1Schema, ANALYSIS_DRAFT_MAX_BYTES } from "../../src/services/automation/analysis-draft-schema.js";

/**
 * Contract test cross-repo sulle fixture del draft.
 *
 * Le fixture sono prodotte da go-automation (è il worker a emettere il draft) e
 * vendorizzate qui. Questo test chiude il cerchio: di là si verifica che siano
 * esattamente ciò che l'adattatore del worker produce, qui che Watchtower le
 * accetti. Senza entrambi i lati una fixture può restare valida per uno solo, ed
 * è precisamente il disallineamento che il contratto condiviso deve impedire.
 */
const FIXTURES = path.resolve(
  import.meta.dirname,
  "../../../../contracts/runbook-automation/v1/upstream/go-automation/fixtures",
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf-8"));
}

test("il draft known-case del worker è accettato dallo schema semantico", () => {
  const draft = readFixture("analysis-draft.known-case.json");
  const errors = [...Value.Errors(AnalysisDraftV1Schema, draft)];
  assert.deepEqual(errors.map((e) => `${e.path}: ${e.message}`), []);
  assert.ok(Value.Check(AnalysisDraftV1Schema, draft));
});

test("il contesto unknown del worker è accettato dallo schema semantico", () => {
  const draft = readFixture("analysis-draft.unknown-context.json");
  const errors = [...Value.Errors(AnalysisDraftV1Schema, draft)];
  assert.deepEqual(errors.map((e) => `${e.path}: ${e.message}`), []);
});

test("le fixture stanno nel budget raw dei 64 KiB", () => {
  for (const name of ["analysis-draft.known-case.json", "analysis-draft.unknown-context.json"]) {
    const bytes = Buffer.byteLength(JSON.stringify(readFixture(name)), "utf8");
    assert.ok(bytes <= ANALYSIS_DRAFT_MAX_BYTES, `${name}: ${bytes} byte`);
  }
});
