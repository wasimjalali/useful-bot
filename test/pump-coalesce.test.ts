import assert from "node:assert/strict";
import test from "node:test";
import { CoalescedPump } from "../web/lib/pump-coalesce.ts";

test("a third pump joins the waiter instead of starting another chain", async () => {
  let runs = 0;
  let releaseFirst: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const pump = new CoalescedPump<number>(async (limit) => {
    runs += 1;
    if (runs === 1) await gate;
    return limit;
  });
  const first = pump.schedule(2);
  const second = pump.schedule(2);
  const third = pump.schedule(4);
  assert.equal(first.coalesced, false);
  assert.equal(second.coalesced, false);
  assert.equal(third.coalesced, true);
  assert.equal(runs, 1);
  releaseFirst();
  assert.equal(await first.promise, 2);
  assert.equal(await second.promise, 4);
  assert.equal(await third.promise, 4);
  assert.equal(runs, 2);
  const fourth = pump.schedule(1);
  assert.equal(fourth.coalesced, false);
  assert.equal(await fourth.promise, 1);
  assert.equal(runs, 3);
});
