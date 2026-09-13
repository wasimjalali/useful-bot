import assert from "node:assert/strict";
import test from "node:test";
import { eveGetAllowed, evePostAllowed } from "../shared/eve-proxy.ts";

test("eve proxy allowlists stream get and session posts", () => {
  assert.equal(eveGetAllowed("health"), true);
  assert.equal(eveGetAllowed("info"), true);
  assert.equal(eveGetAllowed("session/abc/stream"), true);
  assert.equal(eveGetAllowed("session/abc"), false);
  assert.equal(eveGetAllowed("session/abc/reset"), false);
  assert.equal(evePostAllowed("session"), true);
  assert.equal(evePostAllowed("session/abc"), true);
  assert.equal(evePostAllowed("session/abc/cancel"), true);
  assert.equal(evePostAllowed("session/abc/clear"), false);
  assert.equal(evePostAllowed("session/abc/compact"), false);
  assert.equal(evePostAllowed("health"), false);
});
