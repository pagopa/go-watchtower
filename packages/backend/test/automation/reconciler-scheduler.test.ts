import assert from "node:assert/strict";
import test from "node:test";
import { createReconcilerRunner } from "../../src/services/automation/reconciler-runner.js";

test("overlap guard: a second runOnce is skipped while the first is still running", async () => {
  let resolveFirst: (() => void) | undefined;
  let calls = 0;
  const runner = createReconcilerRunner(async () => {
    calls += 1;
    // Only the first invocation blocks (on resolveFirst); later ones complete at once.
    if (calls === 1) {
      await new Promise<void>((resolve) => { resolveFirst = resolve; });
    }
  });

  const first = runner.runOnce(); // starts, stays pending
  const second = await runner.runOnce(); // overlaps → skipped
  assert.equal(second.skipped, true);
  assert.equal(calls, 1, "the tick fn must not run twice concurrently");

  resolveFirst?.();
  const firstResult = await first;
  assert.equal(firstResult.skipped, false);

  // After the first finished, a new run executes again.
  const third = await runner.runOnce();
  assert.equal(third.skipped, false);
  assert.equal(calls, 2);
});

test("overlap guard: resets even if the tick throws", async () => {
  let attempt = 0;
  const runner = createReconcilerRunner(async () => {
    attempt += 1;
    await Promise.resolve();
    if (attempt === 1) throw new Error("boom");
  });

  await assert.rejects(runner.runOnce());
  // Guard released despite the throw → next run proceeds.
  const next = await runner.runOnce();
  assert.equal(next.skipped, false);
  assert.equal(attempt, 2);
});
