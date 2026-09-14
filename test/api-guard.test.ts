import assert from "node:assert/strict";
import test from "node:test";
import { errorCode, rateLimited, readBody, readJson } from "../web/lib/api-guard.ts";

const URL = "http://127.0.0.1:4320/api/x";

test("readBody rejects a body over the declared cap", async () => {
  const req = new Request(URL, { method: "POST", body: "abcdefghij" });
  await assert.rejects(() => readBody(req, 4), /payload_too_large/);
  const ok = new Request(URL, { method: "POST", body: "abcd" });
  assert.equal((await readBody(ok, 4)).byteLength, 4);
});

test("readBody caps a streamed body with no content-length", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("abcdefghij"));
      controller.close();
    },
  });
  const req = new Request(URL, { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(() => readBody(req, 4), /payload_too_large/);
});

test("readJson enforces content type, size, and parsing", async () => {
  const ok = new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ a: 1 }),
  });
  assert.deepEqual(await readJson(ok), { a: 1 });

  const wrong = new Request(URL, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  await assert.rejects(() => readJson(wrong), /unsupported_media_type/);

  const bad = new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{oops",
  });
  await assert.rejects(() => readJson(bad), /invalid_json/);

  const big = new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ s: "x".repeat(1000) }),
  });
  await assert.rejects(() => readJson(big, 10), /payload_too_large/);
});

test("rateLimited throttles only after the burst", () => {
  const key = `test-${process.pid}-${Date.now()}`;
  assert.equal(rateLimited(key, 60, 2), false);
  assert.equal(rateLimited(key, 60, 2), false);
  assert.equal(rateLimited(key, 60, 2), true);
});

test("errorCode keeps short codes and strips free-form errors", () => {
  assert.equal(errorCode(new Error("shell_bot_session")), "shell_bot_session");
  assert.equal(errorCode(new Error("approval_not_found:apr_1")), "approval_not_found:apr_1");
  assert.equal(
    errorCode(new Error("ENOENT: no such file or directory, open '/Users/x/.useful-bot/shell.json'")),
    "invalid",
  );
  assert.equal(errorCode(new Error("Unexpected token 'o'"), "shell_unavailable"), "shell_unavailable");
  assert.equal(errorCode(undefined, "fallback"), "fallback");
});
