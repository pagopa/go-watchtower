import assert from "node:assert/strict";
import test from "node:test";
import type { AutomaticRunbookCatalog } from "@go-watchtower/shared";

process.env["DATABASE_URL"] ??= "postgresql://unit:unit@localhost:5432/unit";
const {
  capabilityMatches,
  computeCatalogRevision,
  deriveCatalogHealth,
  validateCatalog,
} = await import("../../src/services/automation/capability-catalog.js");
type AutomaticRunbookCatalogV1 = AutomaticRunbookCatalog;

function catalog(): AutomaticRunbookCatalogV1 {
  const base = {
    schemaVersion: 1 as const,
    publishedAt: "2026-07-02T10:00:00.000Z",
    environment: "production",
    worker: { artifactRevision: "build-1", commandSchemaVersion: "1.0.0" },
    release: { actorArn: "arn:aws:sts::123:assumed-role/deployer/user", changeNote: "add SEND" },
    runbooks: [{
      key: "send-apigw",
      version: "1.0.0",
      name: "SEND APIGW",
      description: "Analizza gli allarmi API Gateway di SEND",
      team: "GO",
      kind: "APIGW" as const,
      categories: ["DELIVERY"],
      tags: [],
      alarmNames: ["send-api-errors"],
      definitionDigest: `sha256-${"a".repeat(64)}`,
    }],
  };
  return { ...base, revision: computeCatalogRevision(base as AutomaticRunbookCatalogV1) };
}

test("catalog validates environment and canonical revision", () => {
  const c = catalog();
  assert.equal(validateCatalog(c, "production").ok, true);
  assert.equal(validateCatalog({ ...c, environment: "uat" }, "production").ok, false);
  assert.equal(validateCatalog({ ...c, revision: "sha256-bad" }, "production").ok, false);
});

test("catalog health uses persisted validUntil and preserves degraded LKG", () => {
  const base = {
    revision: "r",
    sourcePublishedAt: null,
    sourceVersionId: "v",
    sourceETag: "e",
    payload: catalog(),
    lastAttemptAt: new Date("2026-07-02T10:01:00Z"),
    lastVerifiedAt: new Date("2026-07-02T10:00:00Z"),
    validUntil: new Date("2026-07-02T10:05:00Z"),
    lastErrorCode: "S3_TIMEOUT",
    lastError: "timeout",
  };
  assert.equal(deriveCatalogHealth(base, new Date("2026-07-02T10:02:00Z")), "DEGRADED");
  assert.equal(deriveCatalogHealth(base, new Date("2026-07-02T10:06:00Z")), "STALE");
});

test("capability matching pins key, version and digest, not global revision", () => {
  const c = catalog();
  const command = { runbook: { key: "send-apigw", version: "1.0.0", definitionDigest: `sha256-${"a".repeat(64)}` } };
  assert.equal(capabilityMatches(command, c), true);
  assert.equal(capabilityMatches({ runbook: { ...command.runbook, version: "2.0.0" } }, c), false);
});
