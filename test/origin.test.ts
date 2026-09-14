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

test("a missing origin is trusted and non-loopback origins are not", () => {
  const req = "http://127.0.0.1:4320/eve/v1/session";
  // The load-bearing contract every requireDesktop relies on: a same-origin
  // fetch may omit Origin, so absent must be allowed.
  assert.equal(originHeaderAllowed(null, req), true);
  assert.equal(originHeaderAllowed("http://10.0.0.5:4320", req), false);
  assert.equal(originHeaderAllowed("http://evil.example:4320", req), false);
  assert.equal(originHeaderAllowed("http://127.0.0.1:4320", "http://evil.example:4320/x"), false);
});

test("loopback port defaults are compared per scheme", () => {
  assert.equal(originHeaderAllowed("http://[::1]:4320", "http://127.0.0.1:4320/x"), true);
  assert.equal(originHeaderAllowed("http://127.0.0.1", "http://127.0.0.1:80/x"), true);
  assert.equal(originHeaderAllowed("https://127.0.0.1", "http://127.0.0.1:80/x"), false);
});
