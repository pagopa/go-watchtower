import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveRotatedRefreshToken,
  hashRefreshToken,
  isRecentRotationReuse,
} from "../src/services/token-rotation.js";

test("deriveRotatedRefreshToken returns the same replacement for duplicate old-token refreshes", () => {
  const oldToken = "old-refresh-token";
  const secret = "test-secret";

  const first = deriveRotatedRefreshToken(oldToken, secret);
  const second = deriveRotatedRefreshToken(oldToken, secret);

  assert.equal(first, second);
  assert.notEqual(first, oldToken);
});

test("deriveRotatedRefreshToken changes when the old token or secret changes", () => {
  const oldToken = "old-refresh-token";

  assert.notEqual(
    deriveRotatedRefreshToken(oldToken, "secret-a"),
    deriveRotatedRefreshToken(oldToken, "secret-b"),
  );
  assert.notEqual(
    deriveRotatedRefreshToken(oldToken, "secret-a"),
    deriveRotatedRefreshToken("other-refresh-token", "secret-a"),
  );
});

test("isRecentRotationReuse accepts only the expected replacement hash inside the grace window", () => {
  const now = new Date("2026-04-29T12:00:00.000Z");
  const replacement = deriveRotatedRefreshToken("old-refresh-token", "secret");
  const replacementHash = hashRefreshToken(replacement);

  assert.equal(
    isRecentRotationReuse(
      {
        revokedAt: new Date("2026-04-29T11:59:30.000Z"),
        replacedBy: replacementHash,
      },
      replacementHash,
      60,
      now,
    ),
    true,
  );

  assert.equal(
    isRecentRotationReuse(
      {
        revokedAt: new Date("2026-04-29T11:58:59.000Z"),
        replacedBy: replacementHash,
      },
      replacementHash,
      60,
      now,
    ),
    false,
  );

  assert.equal(
    isRecentRotationReuse(
      {
        revokedAt: new Date("2026-04-29T11:59:30.000Z"),
        replacedBy: hashRefreshToken("different-token"),
      },
      replacementHash,
      60,
      now,
    ),
    false,
  );
});
