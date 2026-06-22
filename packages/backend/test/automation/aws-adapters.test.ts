import assert from "node:assert/strict";
import test from "node:test";
import {
  AwsSqsSender,
  AwsSsmParameterReader,
  mapSsmError,
} from "../../src/services/automation/aws-adapters.js";
import {
  TransientSsmError,
  ParameterNotFoundError,
} from "../../src/services/automation/queue-registry.js";

// Fake AWS client: capture the last command and return a canned response/throw.
function fakeClient(handler: (command: unknown) => unknown) {
  const calls: unknown[] = [];
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/require-await
    send: async (command: unknown) => {
      calls.push(command);
      return handler(command);
    },
  };
}

test("AwsSqsSender builds a FIFO SendMessage and returns the MessageId", async () => {
  const client = fakeClient(() => ({ MessageId: "sqs-msg-1" }));
  const sender = new AwsSqsSender(() => client as never);
  const res = await sender.send({
    region: "eu-south-1",
    queueUrl: "https://sqs.eu-south-1.amazonaws.com/170533023216/go-execute-runbook-production-eu-south-1.fifo",
    messageBody: '{"x":1}',
    messageGroupId: "alarm-event:abc",
    messageDeduplicationId: "exec-1",
  });
  assert.equal(res.messageId, "sqs-msg-1");
  const input = (client.calls[0] as { input: Record<string, unknown> }).input;
  assert.equal(input.MessageGroupId, "alarm-event:abc");
  assert.equal(input.MessageDeduplicationId, "exec-1");
});

test("AwsSqsSender throws when the SDK returns no MessageId", async () => {
  const sender = new AwsSqsSender(() => fakeClient(() => ({})) as never);
  await assert.rejects(
    sender.send({ region: "eu-south-1", queueUrl: "u", messageBody: "b", messageGroupId: "g", messageDeduplicationId: "d" }),
    /no MessageId/,
  );
});

test("AwsSqsSender caches a client per region", async () => {
  let factoryCalls = 0;
  const sender = new AwsSqsSender(() => {
    factoryCalls += 1;
    return fakeClient(() => ({ MessageId: "m" })) as never;
  });
  const input = { region: "eu-south-1", queueUrl: "u", messageBody: "b", messageGroupId: "g", messageDeduplicationId: "d" };
  await sender.send(input);
  await sender.send(input);
  assert.equal(factoryCalls, 1);
});

test("AwsSsmParameterReader returns the parameter value", async () => {
  const reader = new AwsSsmParameterReader(() => fakeClient(() => ({ Parameter: { Value: "the-json" } })) as never);
  assert.equal(await reader.read("/p", "eu-south-1"), "the-json");
});

test("AwsSsmParameterReader maps ParameterNotFound → ParameterNotFoundError", async () => {
  const reader = new AwsSsmParameterReader(() =>
    fakeClient(() => {
      const e = new Error("not found");
      e.name = "ParameterNotFound";
      throw e;
    }) as never,
  );
  await assert.rejects(reader.read("/p", "eu-south-1"), ParameterNotFoundError);
});

test("AwsSsmParameterReader maps throttling/5xx/network → TransientSsmError", async () => {
  const throttle = new AwsSsmParameterReader(() =>
    fakeClient(() => {
      const e = new Error("throttled");
      e.name = "ThrottlingException";
      throw e;
    }) as never,
  );
  await assert.rejects(throttle.read("/p", "eu-south-1"), TransientSsmError);
});

test("mapSsmError classifies error shapes", () => {
  assert.throws(() => mapSsmError(Object.assign(new Error("x"), { name: "ParameterNotFound" })), ParameterNotFoundError);
  assert.throws(() => mapSsmError(Object.assign(new Error("x"), { name: "ThrottlingException" })), TransientSsmError);
  assert.throws(() => mapSsmError(Object.assign(new Error("x"), { $metadata: { httpStatusCode: 503 } })), TransientSsmError);
  assert.throws(() => mapSsmError(Object.assign(new Error("x"), { code: "ECONNRESET" })), TransientSsmError);
  // non-transient (e.g. access denied) is re-thrown as-is, not wrapped
  assert.throws(
    () => mapSsmError(Object.assign(new Error("denied"), { name: "AccessDeniedException", $metadata: { httpStatusCode: 400 } })),
    (err: unknown) => err instanceof Error && !(err instanceof TransientSsmError) && !(err instanceof ParameterNotFoundError),
  );
});
