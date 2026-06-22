import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import {
  canonicalizeCompletePayload,
  computeCompletionHash,
  CanonicalizationError,
} from "../../src/services/automation/completion-hash.js";

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(Buffer.from(s, "utf-8")).digest("hex");
}

test("canonicalization sorts object keys recursively (UTF-16 lexicographic)", () => {
  const a = { b: 1, a: 2, nested: { z: 1, a: 2 } };
  const b = { nested: { a: 2, z: 1 }, a: 2, b: 1 };
  assert.equal(canonicalizeCompletePayload(a), canonicalizeCompletePayload(b));
  assert.equal(
    canonicalizeCompletePayload(a),
    '{"a":2,"b":1,"nested":{"a":2,"z":1}}',
  );
});

test("array order is significant (not sorted)", () => {
  assert.notEqual(
    canonicalizeCompletePayload({ items: [1, 2, 3] }),
    canonicalizeCompletePayload({ items: [3, 2, 1] }),
  );
  assert.equal(
    canonicalizeCompletePayload({ items: [1, 2, 3] }),
    '{"items":[1,2,3]}',
  );
});

test("null is distinct from an absent field", () => {
  const withNull = canonicalizeCompletePayload({ a: 1, b: null });
  const withoutB = canonicalizeCompletePayload({ a: 1 });
  assert.notEqual(withNull, withoutB);
  assert.equal(withNull, '{"a":1,"b":null}');
  assert.equal(withoutB, '{"a":1}');
});

test("metrics as decimal strings are preserved verbatim (BigInt-as-string contract)", () => {
  const canonical = canonicalizeCompletePayload({
    bytesScanned: "18446744073709551615",
    recordsScanned: "0",
    recordsMatched: "42",
  });
  assert.equal(
    canonical,
    '{"bytesScanned":"18446744073709551615","recordsMatched":"42","recordsScanned":"0"}',
  );
});

test("Unicode strings are preserved without normalization (NFC vs NFD differ)", () => {
  const nfc = "é"; // é precomposed
  const nfd = "é"; // e + combining acute
  assert.notEqual(
    canonicalizeCompletePayload({ s: nfc }),
    canonicalizeCompletePayload({ s: nfd }),
  );
});

test("same DTO with different JSON property order produces the same hash", () => {
  const h1 = computeCompletionHash({
    outcome: "KNOWN_CASE",
    phase: "apply",
    queryCount: 3,
    bytesScanned: "1024",
  });
  const h2 = computeCompletionHash({
    bytesScanned: "1024",
    queryCount: 3,
    phase: "apply",
    outcome: "KNOWN_CASE",
  });
  assert.equal(h1.hash, h2.hash);
  assert.equal(h1.version, "WT-COMPLETE-SHA256-V1");
});

test("any semantic difference produces a different hash", () => {
  const base = computeCompletionHash({ outcome: "KNOWN_CASE", queryCount: 3 });
  assert.notEqual(
    base.hash,
    computeCompletionHash({ outcome: "UNKNOWN_CASE", queryCount: 3 }).hash,
  );
  assert.notEqual(
    base.hash,
    computeCompletionHash({ outcome: "KNOWN_CASE", queryCount: 4 }).hash,
  );
  // adding a field changes the hash
  assert.notEqual(
    base.hash,
    computeCompletionHash({ outcome: "KNOWN_CASE", queryCount: 3, extra: null })
      .hash,
  );
});

test("golden vector: stable hash for a representative complete payload", () => {
  const payload = {
    outcome: "KNOWN_CASE",
    runbookKey: "alarm-x",
    runbookVersion: "1.2.0",
    engineExecutionId: "eng-123",
    queryCount: 2,
    bytesScanned: "204800",
    recordsScanned: "1500",
    recordsMatched: "3",
    tracking: [
      { identifierType: "TRACE_ID", identifierValue: "t-1" },
      { identifierType: "REQUEST_ID", identifierValue: "r-1" },
    ],
  };
  const expectedCanonical =
    '{"bytesScanned":"204800","engineExecutionId":"eng-123","outcome":"KNOWN_CASE","queryCount":2,"recordsMatched":"3","recordsScanned":"1500","runbookKey":"alarm-x","runbookVersion":"1.2.0","tracking":[{"identifierType":"TRACE_ID","identifierValue":"t-1"},{"identifierType":"REQUEST_ID","identifierValue":"r-1"}]}';
  assert.equal(canonicalizeCompletePayload(payload), expectedCanonical);
  assert.equal(computeCompletionHash(payload).hash, sha256Hex(expectedCanonical));
});

test("runtime non-JSON values are rejected", () => {
  assert.throws(() => canonicalizeCompletePayload({ d: new Date() }), CanonicalizationError);
  assert.throws(() => canonicalizeCompletePayload({ b: 10n }), CanonicalizationError);
  assert.throws(() => canonicalizeCompletePayload({ n: Number.NaN }), CanonicalizationError);
  assert.throws(() => canonicalizeCompletePayload({ n: Infinity }), CanonicalizationError);
  assert.throws(() => canonicalizeCompletePayload({ u: undefined }), CanonicalizationError);
});
