import assert from "node:assert/strict";
import test from "node:test";
import { computeCatalogRevision } from "../../src/services/automation/catalog-contract.js";
import {
  DEFAULT_LOCAL_CATALOG_VALIDITY_SECONDS,
  parseLocalCatalogImportOptions,
  prepareLocalCatalogImport,
} from "../../src/services/automation/local-catalog-import.js";

function validCatalog(environment = "development") {
  const payload = {
    schemaVersion: 1 as const,
    environment,
    worker: {
      artifactRevision: "local-abcdef123456",
      commandSchemaVersion: "1.0.0" as const,
    },
    runbooks: [
      {
        key: "sample-runbook",
        version: "1.0.0",
        name: "Sample",
        description: "Sample runbook",
        team: "GO",
        kind: "SERVICE" as const,
        categories: ["SERVICE_ERROR"],
        tags: ["local"],
        alarmNames: ["sample-alarm"],
        definitionDigest: `sha256-${"a".repeat(64)}`,
      },
    ],
  };
  return {
    ...payload,
    revision: computeCatalogRevision(payload),
    publishedAt: "2026-07-02T10:00:00.000Z",
    release: {
      actorArn: "local-development",
      changeNote: "Local development catalog",
    },
  };
}

test("local import defaults to the shared temporary file and 24h freshness", () => {
  const options = parseLocalCatalogImportOptions([], {
    nodeEnv: "development",
    defaultEnvironment: "development",
  });
  assert.match(options.file, /go-automatic-runbook-catalog\.json$/u);
  assert.equal(options.environment, "development");
  assert.equal(options.validitySeconds, DEFAULT_LOCAL_CATALOG_VALIDITY_SECONDS);
});

test("local import is impossible in production", () => {
  assert.throws(
    () => parseLocalCatalogImportOptions([], { nodeEnv: "production" }),
    /disabled/u,
  );
});

test("local import validates environment, revision and source fingerprint", () => {
  const bytes = new TextEncoder().encode(JSON.stringify(validCatalog()));
  const prepared = prepareLocalCatalogImport(bytes, "development");
  assert.equal(prepared.catalog.runbooks.length, 1);
  assert.match(prepared.sourceVersionId, /^local:sha256-/u);
  assert.match(prepared.sourceETag, /^local-sha256:[a-f0-9]{64}$/u);
  assert.throws(
    () => prepareLocalCatalogImport(bytes, "another-environment"),
    /environment mismatch/u,
  );
});

test("local import rejects malformed JSON and oversized files", () => {
  assert.throws(
    () =>
      prepareLocalCatalogImport(
        new TextEncoder().encode("not-json"),
        "development",
      ),
    /not valid JSON/u,
  );
  assert.throws(
    () =>
      prepareLocalCatalogImport(
        new Uint8Array(1024 * 1024 + 1),
        "development",
      ),
    /byte limit/u,
  );
});
