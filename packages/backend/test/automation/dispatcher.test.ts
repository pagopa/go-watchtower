import assert from "node:assert/strict";
import test from "node:test";
import { dispatchExecution, type SqsSender } from "../../src/services/automation/dispatcher.js";
import {
  RegionalQueueRegistry,
  TransientSsmError,
  computeRegistryRevision,
  type ExecuteRunbookQueueRegistryV1,
  type SsmParameterReader,
} from "../../src/services/automation/queue-registry.js";
import type { AutomaticAlarmAnalysisCommandV1 } from "../../src/services/automation/sqs-command.js";
import type { CapabilityCatalogProvider } from "../../src/services/automation/capability-catalog.js";

function reg(region = "eu-south-1"): ExecuteRunbookQueueRegistryV1 {
  const base: ExecuteRunbookQueueRegistryV1 = {
    schemaVersion: 1,
    revision: "x",
    publishedAt: "2026-06-22T09:00:00.000Z",
    queues: {
      [region]: {
        queueUrl: `https://sqs.${region}.amazonaws.com/170533023216/go-execute-runbook-production-${region}.fifo`,
        queueArn: `arn:aws:sqs:${region}:170533023216:go-execute-runbook-production-${region}.fifo`,
        stackName: `production-${region}`,
        messageRetentionSeconds: 345_600,
      },
    },
  };
  return { ...base, revision: computeRegistryRevision(base) };
}

function command(region = "eu-south-1"): AutomaticAlarmAnalysisCommandV1 {
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
      awsRegion: region,
    },
    runbook: {
      key: "pn-core-runbook",
      version: "1.0.0",
      definitionDigest: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      catalogRevision: "sha256-catalog",
      workerRevision: "build-1",
    },
    trigger: { kind: "SLACK_INGESTOR" },
  };
}

function registryFrom(json: string): RegionalQueueRegistry {
  const reader: SsmParameterReader = { read: () => Promise.resolve(json) };
  return new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
}

const okSender: SqsSender = { send: () => Promise.resolve({ messageId: "msg-1" }) };

test("dispatch: QUEUED with retention + revision, sends to region's queue", async () => {
  const res = await dispatchExecution(command(), registryFrom(JSON.stringify(reg())), okSender);
  assert.equal(res.kind, "QUEUED");
  if (res.kind === "QUEUED") {
    assert.equal(res.sqsMessageId, "msg-1");
    assert.equal(res.messageRetentionSeconds, 345_600);
  }
});

test("dispatch: region not in valid registry → REGION_NOT_ONBOARDED", async () => {
  const res = await dispatchExecution(command("eu-west-1"), registryFrom(JSON.stringify(reg("eu-south-1"))), okSender);
  assert.equal(res.kind, "REGION_NOT_ONBOARDED");
});

test("dispatch: invalid registry → QUEUE_REGISTRY_INVALID", async () => {
  const res = await dispatchExecution(command(), registryFrom(JSON.stringify({ schemaVersion: 5 })), okSender);
  assert.equal(res.kind, "QUEUE_REGISTRY_INVALID");
});

test("dispatch: transient SSM → TRANSIENT (stays PENDING_DISPATCH)", async () => {
  const reader: SsmParameterReader = { read: () => Promise.reject(new TransientSsmError("throttled")) };
  const registry = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
  const res = await dispatchExecution(command(), registry, okSender);
  assert.equal(res.kind, "TRANSIENT");
});

test("dispatch: send failure does not block create → TRANSIENT", async () => {
  const failing: SqsSender = { send: () => Promise.reject(new Error("network")) };
  const res = await dispatchExecution(command(), registryFrom(JSON.stringify(reg())), failing);
  assert.equal(res.kind, "TRANSIENT");
});

test("dispatch: stale catalog blocks queue resolution and send transiently", async () => {
  let sent = false;
  const catalog: CapabilityCatalogProvider = { resolve: () => Promise.resolve({ kind: "CATALOG_UNAVAILABLE", reason: "stale" }) };
  const sender: SqsSender = { send: () => { sent = true; return Promise.resolve({ messageId: "unexpected" }); } };
  const res = await dispatchExecution(command(), registryFrom(JSON.stringify(reg())), sender, catalog);
  assert.equal(res.kind, "CATALOG_UNAVAILABLE");
  assert.equal(sent, false);
});

test("dispatch: withdrawn pinned capability is terminal and never sent", async () => {
  const catalog: CapabilityCatalogProvider = { resolve: () => Promise.resolve({ kind: "CAPABILITY_WITHDRAWN", key: "pn-core-runbook" }) };
  const res = await dispatchExecution(command(), registryFrom(JSON.stringify(reg())), okSender, catalog);
  assert.deepEqual(res, { kind: "CAPABILITY_WITHDRAWN", key: "pn-core-runbook" });
});
