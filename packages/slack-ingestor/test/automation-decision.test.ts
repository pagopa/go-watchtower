import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SLACK_INGESTOR_CONTROL, type AutomaticRunbookDescriptor } from "@go-watchtower/shared";
import { decideSlackAutomation } from "../src/automation-decision.js";

const runbook: AutomaticRunbookDescriptor = {
  key: "send-apigw", version: "1.0.0", name: "SEND", team: "GO", kind: "APIGW",
  categories: ["DELIVERY"], tags: [], alarmNames: ["send-errors"], definitionDigest: `sha256-${"a".repeat(64)}`,
};
const context = {
  channelId: "C123", productId: "p", environmentId: "e", alarmName: "send-errors",
  awsRegion: "eu-south-1", awsAccountId: "123456789012", priorityCode: "HIGH",
};

test("OFF and unlinked decisions take precedence", () => {
  assert.equal(decideSlackAutomation({ control: DEFAULT_SLACK_INGESTOR_CONTROL, alarmId: null, catalogUsable: false, scopeUnsafe: false, capability: null }).decision, "EXECUTION_POLICY_OFF");
  assert.equal(decideSlackAutomation({ control: { ...DEFAULT_SLACK_INGESTOR_CONTROL, executionPolicy: "AVAILABLE_ONLY" }, alarmId: null, catalogUsable: true, scopeUnsafe: false, capability: runbook }).decision, "UNLINKED_ALARM");
});

test("AVAILABLE_ONLY creates only after catalog and scope allow", () => {
  const control = {
    ...DEFAULT_SLACK_INGESTOR_CONTROL,
    executionPolicy: "AVAILABLE_ONLY" as const,
    rules: [{ id: "allow-send", name: "SEND", enabled: true, effect: "ALLOW" as const, matcher: { runbookKeys: [runbook.key] } }],
  };
  assert.deepEqual(decideSlackAutomation({ control, alarmId: "alarm", catalogUsable: true, scopeUnsafe: false, capability: runbook, context }), {
    decision: "EXECUTION_CREATED", matchedRuleId: "allow-send", ruleEffect: "ALLOW",
  });
  assert.equal(decideSlackAutomation({ control, alarmId: "alarm", catalogUsable: false, scopeUnsafe: false, capability: runbook, context }).decision, "CATALOG_UNAVAILABLE");
  assert.equal(decideSlackAutomation({ control, alarmId: "alarm", catalogUsable: true, scopeUnsafe: true, capability: runbook, context }).decision, "SCOPE_CONFIGURATION_UNSAFE");
});
