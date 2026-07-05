import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SLACK_INGESTOR_CONTROL,
  evaluateScope,
  onlyPreset,
  quickAlarmRuleId,
  quickRunbookRuleId,
  validateControl,
  withQuickExclusion,
  withoutQuickExclusion,
  type RunbookDescriptor,
  type ScopeContext,
} from "../src/services/slack-ingestor-control.js";

const runbook: RunbookDescriptor = {
  key: "send-apigw",
  version: "1.0.0",
  name: "SEND API Gateway",
  definitionDigest: "sha256:abc",
  alarmNames: ["send-api-errors"],
  kind: "APIGW",
  categories: ["EDGE"],
  tags: [],
};

const context: ScopeContext = {
  channelId: "C01",
  productId: "0192c000-0000-7000-8000-000000000001",
  environmentId: "0192c000-0000-7000-8000-000000000002",
  alarmId: "0192c000-0000-7000-8000-000000000003",
  alarmName: "send-api-errors",
  awsRegion: "eu-south-1",
  awsAccountId: "123456789012",
  priorityCode: "HIGH",
  runbook,
};

test("first matching rule wins and dimensions compose with AND", () => {
  const control = {
    ...DEFAULT_SLACK_INGESTOR_CONTROL,
    executionPolicy: "AVAILABLE_ONLY" as const,
    defaultRuleEffect: "DENY" as const,
    rules: [
      { id: "wrong-env", name: "wrong", enabled: true, effect: "ALLOW" as const, matcher: { environmentIds: ["0192c000-0000-7000-8000-000000000099"] } },
      { id: "send", name: "send", enabled: true, effect: "ALLOW" as const, matcher: { productIds: [context.productId], runbookKinds: ["APIGW"] } },
      { id: "later-deny", name: "later", enabled: true, effect: "DENY" as const, matcher: {} },
    ],
  };
  assert.deepEqual(evaluateScope(control, context), { effect: "ALLOW", ruleId: "send" });
});

test("quick exclusions are deterministic, first and idempotent", () => {
  let control = onlyPreset(DEFAULT_SLACK_INGESTOR_CONTROL, { kind: "runbook", key: runbook.key });
  control = withQuickExclusion(control, { kind: "runbook", key: runbook.key });
  control = withQuickExclusion(control, { kind: "runbook", key: runbook.key });
  assert.equal(control.rules.length, 2);
  assert.equal(control.rules[0]?.id, quickRunbookRuleId(runbook.key));
  assert.deepEqual(evaluateScope(control, context), { effect: "DENY", ruleId: quickRunbookRuleId(runbook.key) });
  control = withoutQuickExclusion(control, quickRunbookRuleId(runbook.key));
  assert.equal(evaluateScope(control, context).effect, "ALLOW");
});

test("alarm quick exclusion id embeds the alarm UUID", () => {
  assert.equal(quickAlarmRuleId(context.alarmId!), `quick-deny:alarm:${context.alarmId}`);
});

test("unresolved taxonomy in deny-list/default allow is unsafe and cannot be activated", () => {
  const validation = validateControl({
    ...DEFAULT_SLACK_INGESTOR_CONTROL,
    executionPolicy: "AVAILABLE_ONLY",
    defaultRuleEffect: "ALLOW",
    rules: [{ id: "deny-retired", name: "deny", enabled: true, effect: "DENY", matcher: { runbookCategories: ["RETIRED"] } }],
  }, [runbook]);
  assert.equal(validation.valid, false);
  assert.equal(validation.catalogReferenceHealth, "UNSAFE");
  assert(validation.errors.some((error) => error.code === "UNSAFE_CONTROL_REQUIRES_EXECUTION_POLICY_OFF"));
});

test("future allow-list reference is accepted with a warning while fail-closed", () => {
  const validation = validateControl({
    ...DEFAULT_SLACK_INGESTOR_CONTROL,
    executionPolicy: "OFF",
    defaultRuleEffect: "DENY",
    rules: [{ id: "future", name: "future", enabled: true, effect: "ALLOW", matcher: { runbookKeys: ["future-key"] } }],
  }, [runbook]);
  assert.equal(validation.valid, true);
  assert.equal(validation.catalogReferenceHealth, "UNRESOLVED");
  assert.equal(validation.warnings[0]?.code, "UNRESOLVED_CATALOG_REFERENCE");
});
