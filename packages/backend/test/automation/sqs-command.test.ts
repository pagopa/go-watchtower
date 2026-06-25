import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSqsSendParams,
  messageGroupIdForAlarmEvent,
  InvalidCommandError,
  type AutomaticAlarmAnalysisCommandV1,
} from "../../src/services/automation/sqs-command.js";

function validCommand(
  overrides: Partial<AutomaticAlarmAnalysisCommandV1> = {},
): AutomaticAlarmAnalysisCommandV1 {
  return {
    schemaVersion: "1.0.0",
    executionId: "0192c000-0000-7000-8000-000000000001",
    alarmEvent: {
      id: "0192c000-0000-7000-8000-0000000000aa",
      productId: "0192c000-0000-7000-8000-0000000000bb",
      environmentId: "0192c000-0000-7000-8000-0000000000cc",
      alarmId: "0192c000-0000-7000-8000-0000000000dd",
      alarmName: "pn-core-5xx",
      firedAt: "2026-06-22T10:00:00.000Z",
      awsAccountId: "170533023216",
      awsRegion: "eu-south-1",
    },
    trigger: { kind: "SLACK_INGESTOR" },
    ...overrides,
  };
}

test("builds FIFO send params: group = alarm-event:<id>, dedup = executionId", () => {
  const cmd = validCommand();
  const params = buildSqsSendParams(cmd);
  assert.equal(params.messageGroupId, `alarm-event:${cmd.alarmEvent.id}`);
  assert.equal(params.messageDeduplicationId, cmd.executionId);
  assert.deepEqual(JSON.parse(params.messageBody), cmd);
});

test("initial/retry/re-launch of the same alarmEvent share the group; distinct events differ", () => {
  const eventId = "0192c000-0000-7000-8000-0000000000aa";
  const initial = buildSqsSendParams(validCommand({ executionId: "0192c000-0000-7000-8000-000000000001", alarmEvent: { ...validCommand().alarmEvent, id: eventId } }));
  const retry = buildSqsSendParams(validCommand({ executionId: "0192c000-0000-7000-8000-000000000002", trigger: { kind: "RETRY", parentExecutionId: "0192c000-0000-7000-8000-000000000001" }, alarmEvent: { ...validCommand().alarmEvent, id: eventId } }));
  assert.equal(initial.messageGroupId, retry.messageGroupId);
  assert.notEqual(initial.messageDeduplicationId, retry.messageDeduplicationId);

  const otherEvent = buildSqsSendParams(validCommand({ alarmEvent: { ...validCommand().alarmEvent, id: "0192c000-0000-7000-8000-0000000000ff" } }));
  assert.notEqual(initial.messageGroupId, otherEvent.messageGroupId);
});

test("rejects missing/invalid event id before send", () => {
  assert.throws(
    () => buildSqsSendParams(validCommand({ alarmEvent: { ...validCommand().alarmEvent, id: "not-a-uuid" } })),
    InvalidCommandError,
  );
});

test("rejects unsupported schema version before send", () => {
  const bad = { ...validCommand(), schemaVersion: "2.0.0" } as unknown as AutomaticAlarmAnalysisCommandV1;
  assert.throws(() => buildSqsSendParams(bad), InvalidCommandError);
});

test("rejects unknown extra properties (additionalProperties: false)", () => {
  const bad = { ...validCommand(), rogue: true } as unknown as AutomaticAlarmAnalysisCommandV1;
  assert.throws(() => buildSqsSendParams(bad), InvalidCommandError);
});

test("messageGroupIdForAlarmEvent format is exact", () => {
  assert.equal(messageGroupIdForAlarmEvent("abc"), "alarm-event:abc");
});
