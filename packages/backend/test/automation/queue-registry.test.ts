import assert from "node:assert/strict";
import test from "node:test";
import {
  RegionalQueueRegistry,
  TransientSsmError,
  validateRegistry,
  computeRegistryRevision,
  type ExecuteRunbookQueueRegistryV1,
  type SsmParameterReader,
} from "../../src/services/automation/queue-registry.js";

function registry(overrides: Partial<ExecuteRunbookQueueRegistryV1> = {}): ExecuteRunbookQueueRegistryV1 {
  const base: ExecuteRunbookQueueRegistryV1 = {
    schemaVersion: 1,
    revision: "placeholder",
    publishedAt: "2026-06-22T09:00:00.000Z",
    queues: {
      "eu-south-1": {
        queueUrl: "https://sqs.eu-south-1.amazonaws.com/170533023216/go-execute-runbook-production-eu-south-1.fifo",
        queueArn: "arn:aws:sqs:eu-south-1:170533023216:go-execute-runbook-production-eu-south-1.fifo",
        stackName: "production-eu-south-1",
        messageRetentionSeconds: 345_600,
      },
    },
    ...overrides,
  };
  return { ...base, revision: computeRegistryRevision(base) };
}

class FakeReader implements SsmParameterReader {
  calls = 0;
  constructor(private readonly behavior: () => string) {}
  read(): Promise<string> {
    this.calls += 1;
    return Promise.resolve(this.behavior());
  }
}

test("validateRegistry: accepts a valid payload and verifies revision", () => {
  const r = registry();
  const res = validateRegistry(JSON.stringify(r), { verifyRevision: true });
  assert.equal(res.ok, true);
});

test("validateRegistry: rejects schema mismatch", () => {
  const res = validateRegistry(JSON.stringify({ schemaVersion: 2, queues: {} }), { verifyRevision: false });
  assert.equal(res.ok, false);
});

test("validateRegistry: rejects revision mismatch when verification enabled", () => {
  const r = { ...registry(), revision: "deadbeef" };
  const res = validateRegistry(JSON.stringify(r), { verifyRevision: true });
  assert.equal(res.ok, false);
});

test("validateRegistry: rejects non-JSON", () => {
  const res = validateRegistry("{not json", { verifyRevision: false });
  assert.equal(res.ok, false);
});

test("resolveQueue: OK for an onboarded region (single read, cached)", async () => {
  const reader = new FakeReader(() => JSON.stringify(registry()));
  const reg = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
  const r1 = await reg.resolveQueue("eu-south-1", 1000);
  assert.equal(r1.kind, "OK");
  const r2 = await reg.resolveQueue("eu-south-1", 2000); // within 60s cache
  assert.equal(r2.kind, "OK");
  assert.equal(reader.calls, 1);
});

test("resolveQueue: REGION_NOT_ONBOARDED only after a force-refresh (two reads)", async () => {
  const reader = new FakeReader(() => JSON.stringify(registry()));
  const reg = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
  const r = await reg.resolveQueue("eu-west-1", 1000);
  assert.equal(r.kind, "REGION_NOT_ONBOARDED");
  assert.equal(reader.calls, 2); // initial + force-refresh
});

test("resolveQueue: transient SSM error → TRANSIENT (stay PENDING_DISPATCH)", async () => {
  const reader: SsmParameterReader = {
    read: () => Promise.reject(new TransientSsmError("throttled")),
  };
  const reg = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
  const r = await reg.resolveQueue("eu-south-1", 1000);
  assert.equal(r.kind, "TRANSIENT");
});

test("resolveQueue: invalid registry → QUEUE_REGISTRY_INVALID", async () => {
  const reader = new FakeReader(() => JSON.stringify({ schemaVersion: 99 }));
  const reg = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
  const r = await reg.resolveQueue("eu-south-1", 1000);
  assert.equal(r.kind, "QUEUE_REGISTRY_INVALID");
});

test("cache expires after TTL and re-reads", async () => {
  const reader = new FakeReader(() => JSON.stringify(registry()));
  const reg = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1", cacheTtlMs: 60_000 });
  await reg.resolveQueue("eu-south-1", 1000);
  await reg.resolveQueue("eu-south-1", 70_000); // past TTL
  assert.equal(reader.calls, 2);
});
