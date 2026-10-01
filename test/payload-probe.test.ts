import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { REDACTED, dumpUpstreamBody } from "../router/src/payload-probe.ts";

const body = {
  model: "glm-test",
  messages: [
    { role: "system", content: "You are a bot. key sk-test-ABCDEFGH12345678 and Bearer abcdefghij123456" },
    { role: "user", content: "hello" },
  ],
  tools: [{ type: "function", function: { name: "t", parameters: { type: "object" } } }],
  authorization: "Bearer should-not-survive-123456",
  api_key: "plain",
};

test("the probe is refused on the daily stack and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-probe-"));
  for (const env of [{ UB_PAYLOAD_PROBE_DIR: join(dir, "d") }, { UB_STACK: "daily", UB_PAYLOAD_PROBE_DIR: join(dir, "d") }]) {
    assert.equal(dumpUpstreamBody("openai-chat", "m", body, env), null);
  }
  assert.equal(existsSync(join(dir, "d")), false);
});

test("without the variable nothing is written, even on dev", () => {
  assert.equal(dumpUpstreamBody("openai-chat", "m", body, { UB_STACK: "dev" }), null);
});

test("on dev the body is written with keys, auth fields and bearer tokens scrubbed", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-probe-"));
  const file = dumpUpstreamBody("openai-chat", "glm/test:1", body, { UB_STACK: "dev", UB_PAYLOAD_PROBE_DIR: dir });
  assert.ok(file);
  const files = readdirSync(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d{4}-.*-openai-chat-glm_test_1\.json$/);
  const raw = readFileSync(file, "utf8");
  assert.ok(!raw.includes("sk-test-"), "fake key survived");
  assert.ok(!/Bearer\s+abcdefghij/.test(raw), "bearer survived");
  assert.ok(!raw.includes("should-not-survive"), "authorization survived");
  const written = JSON.parse(raw);
  assert.equal(written.authorization, REDACTED);
  assert.equal(written.api_key, REDACTED);
  assert.match(written.messages[0].content, /You are a bot\. key \[redacted\] and \[redacted\]/);
  assert.equal(written.tools.length, 1);
  assert.equal(written.messages[1].content, "hello");
});

test("the summary script reads a dump", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-probe-"));
  dumpUpstreamBody("openai-chat", "glm-test", body, { UB_STACK: "dev", UB_PAYLOAD_PROBE_DIR: dir });
  const out = execFileSync("/usr/local/bin/node", ["scripts/payload-probe-summary.mjs", dir], { encoding: "utf8" });
  assert.match(out, /model: glm-test/);
  assert.match(out, /system messages: 1 \[\d+ chars\]/);
  assert.match(out, /tools: 1, schema chars: \d+/);
  assert.match(out, /first user: hello/);
});
