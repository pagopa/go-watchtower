import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  computeRegistryRevision,
  validateRegistry,
  RegionalQueueRegistry,
  type ExecuteRunbookQueueRegistryV1,
  type SsmParameterReader,
} from "../../src/services/automation/queue-registry.js";

// Handoff GA → WT vendorizzato (CONTRACT-03 §3.4). Questi test falliscono se gli
// artefatti upstream cambiano senza aggiornare il lock, o se l'algoritmo della
// revision diverge da quello di GA.
const UPSTREAM = path.resolve(
  import.meta.dirname,
  "../../../../contracts/runbook-automation/v1/upstream/go-automation",
);

function readUpstream(rel: string): string {
  return readFileSync(path.join(UPSTREAM, rel), "utf-8");
}

function sha256(rel: string): string {
  return crypto.createHash("sha256").update(readFileSync(path.join(UPSTREAM, rel))).digest("hex");
}

test("vendored GA artifacts match the lock file (drift guard)", () => {
  const lock = JSON.parse(readUpstream("go-automation.lock.json")) as {
    artifacts: Array<{ path: string; sha256: string | null }>;
  };
  for (const a of lock.artifacts) {
    if (a.sha256 === null) continue;
    assert.equal(sha256(a.path), a.sha256, `hash drift on ${a.path}`);
  }
});

test("WT reproduces GA's revision byte-for-byte (valid fixture)", () => {
  const valid = JSON.parse(readUpstream("fixtures/queue-registry.valid.json")) as ExecuteRunbookQueueRegistryV1;
  assert.equal(computeRegistryRevision(valid), valid.revision);
  assert.equal(validateRegistry(JSON.stringify(valid), { verifyRevision: true }).ok, true);
});

test("WT reproduces GA's revision for the missing-region fixture", () => {
  const miss = JSON.parse(readUpstream("fixtures/queue-registry.missing-region.json")) as ExecuteRunbookQueueRegistryV1;
  assert.equal(computeRegistryRevision(miss), miss.revision);
});

test("WT rejects GA's invalid-revision fixture", () => {
  const inv = readUpstream("fixtures/queue-registry.invalid-revision.json");
  const res = validateRegistry(inv, { verifyRevision: true });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /revision/);
});

test("resolveQueue against the GA valid fixture: OK for eu-south-1, REGION_NOT_ONBOARDED otherwise", async () => {
  const validJson = readUpstream("fixtures/queue-registry.valid.json");
  const reader: SsmParameterReader = { read: () => Promise.resolve(validJson) };
  const reg = new RegionalQueueRegistry(reader, { parameterName: "/p", parameterRegion: "eu-south-1" });
  const ok = await reg.resolveQueue("eu-south-1", 1000);
  assert.equal(ok.kind, "OK");
  if (ok.kind === "OK") assert.equal(ok.queue.messageRetentionSeconds, 345_600);
  const miss = await reg.resolveQueue("eu-west-1", 1000);
  assert.equal(miss.kind, "REGION_NOT_ONBOARDED");
});
