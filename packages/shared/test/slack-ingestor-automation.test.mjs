import assert from "node:assert/strict";
import test from "node:test";
import {
  AutomationCatalogHealths,
  CatalogReferenceHealths,
  DEFAULT_SLACK_INGESTOR_CONTROL,
  SlackIngestorExecutionPolicies,
  SlackIngestorRuleEffects,
  addQuickExclusion,
  buildRunbookQuickExclusion,
  deriveAutomationCapabilityCatalogHealth,
  evaluateCatalogReferenceHealth,
  evaluateSlackIngestorScope,
  quickRunbookExclusionId,
  validateAutomaticRunbookCatalog,
  validateSlackIngestorControl,
} from "../dist/index.js";

const descriptor = {
  key: "send-apigw-analysis",
  version: "1.0.0",
  name: "SEND APIGW",
  description: "Analizza gli allarmi API Gateway di SEND",
  team: "GO",
  kind: "APIGW",
  categories: ["DELIVERY"],
  tags: [],
  alarmNames: ["send-api-errors"],
  definitionDigest: `sha256-${"a".repeat(64)}`,
};

const catalog = {
  schemaVersion: 1,
  revision: `sha256-${"c".repeat(64)}`,
  publishedAt: "2026-07-01T10:00:00.000Z",
  environment: "production",
  worker: { artifactRevision: "build-1", commandSchemaVersion: "1.0.0" },
  release: {
    actorArn: "arn:aws:iam::123456789012:role/deployer",
    changeNote: "test",
  },
  runbooks: [descriptor],
};

test("default control is valid and fail-closed", () => {
  const result = validateSlackIngestorControl(DEFAULT_SLACK_INGESTOR_CONTROL);
  assert.equal(result.valid, true);
  assert.equal(
    DEFAULT_SLACK_INGESTOR_CONTROL.executionPolicy,
    SlackIngestorExecutionPolicies.OFF,
  );
  assert.equal(
    DEFAULT_SLACK_INGESTOR_CONTROL.defaultRuleEffect,
    SlackIngestorRuleEffects.DENY,
  );
});

test("scope evaluator uses first-match and AND across dimensions", () => {
  const control = {
    ...DEFAULT_SLACK_INGESTOR_CONTROL,
    defaultRuleEffect: "DENY",
    rules: [
      {
        id: "allow-send-prod",
        name: "SEND PROD",
        enabled: true,
        effect: "ALLOW",
        matcher: {
          productIds: ["00000000-0000-7000-8000-000000000001"],
          runbookKinds: ["APIGW"],
        },
      },
      {
        id: "deny-all",
        name: "Deny",
        enabled: true,
        effect: "DENY",
        matcher: {},
      },
    ],
  };
  const result = evaluateSlackIngestorScope(control, {
    channelId: "C1",
    productId: "00000000-0000-7000-8000-000000000001",
    environmentId: "00000000-0000-7000-8000-000000000002",
    alarmName: "send-api-errors",
    awsRegion: "eu-south-1",
    awsAccountId: "123456789012",
    priorityCode: "HIGH",
    runbook: descriptor,
  });
  assert.deepEqual(result, {
    effect: "ALLOW",
    matchedRuleId: "allow-send-prod",
  });
});

test("quick runbook exclusion has a readable deterministic id and is idempotent", () => {
  const key = "send-apigw-analysis";
  assert.equal(quickRunbookExclusionId(key), `quick-deny:runbook:${key}`);
  const first = addQuickExclusion(
    DEFAULT_SLACK_INGESTOR_CONTROL,
    buildRunbookQuickExclusion(key),
  );
  const second = addQuickExclusion(
    first.control,
    buildRunbookQuickExclusion(key),
  );
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.control.rules.length, 1);
  // La revision appartiene al punto di persistenza: gli helper non la toccano.
  assert.equal(first.control.revision, DEFAULT_SLACK_INGESTOR_CONTROL.revision);
});

test("unresolved deny taxonomy under default allow is unsafe", () => {
  const control = {
    ...DEFAULT_SLACK_INGESTOR_CONTROL,
    executionPolicy: "AVAILABLE_ONLY",
    defaultRuleEffect: "ALLOW",
    rules: [
      {
        id: "deny-old-category",
        name: "Deny old",
        enabled: true,
        effect: "DENY",
        matcher: { runbookCategories: ["REMOVED"] },
      },
    ],
  };
  const result = evaluateCatalogReferenceHealth(control, catalog.runbooks);
  assert.equal(result.health, CatalogReferenceHealths.UNSAFE);
  assert.equal(result.unsafe, true);
});

test("catalog validation rejects ambiguous alarm names", () => {
  assert.equal(validateAutomaticRunbookCatalog(catalog).valid, true);
  const invalid = {
    ...catalog,
    runbooks: [
      descriptor,
      {
        ...descriptor,
        key: "other",
        definitionDigest: `sha256-${"b".repeat(64)}`,
      },
    ],
  };
  const result = validateAutomaticRunbookCatalog(invalid);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) => error.code === "AMBIGUOUS_ALARM_NAME"),
  );
});

test("catalog health is stale exclusively from persisted validUntil", () => {
  const base = {
    revision: "r1",
    payload: catalog,
    lastAttemptAt: "2026-07-01T10:00:00.000Z",
    lastVerifiedAt: "2026-07-01T10:00:00.000Z",
    validUntil: "2026-07-01T10:05:00.000Z",
    lastErrorCode: null,
  };
  assert.equal(
    deriveAutomationCapabilityCatalogHealth(
      base,
      new Date("2026-07-01T10:04:59.000Z"),
    ).health,
    AutomationCatalogHealths.HEALTHY,
  );
  assert.equal(
    deriveAutomationCapabilityCatalogHealth(
      base,
      new Date("2026-07-01T10:05:00.000Z"),
    ).health,
    AutomationCatalogHealths.STALE,
  );
});
