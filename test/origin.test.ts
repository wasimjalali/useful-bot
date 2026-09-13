import assert from "node:assert/strict";
import test from "node:test";
import { originHeaderAllowed } from "../shared/origin.ts";

test("loopback origins must match the request port", () => {
  const req = "http://127.0.0.1:4320/eve/v1/session";
  assert.equal(originHeaderAllowed(null, req), true);
  assert.equal(originHeaderAllowed("http://127.0.0.1:4320", req), true);
  assert.equal(originHeaderAllowed("http://localhost:4320", req), true);
  assert.equal(originHeaderAllowed("http://127.0.0.1:9999", req), false);
  assert.equal(originHeaderAllowed("http://localhost:9999", req), false);
  assert.equal(originHeaderAllowed("https://evil.example", req), false);
  assert.equal(originHeaderAllowed("not a url", req), false);
});
