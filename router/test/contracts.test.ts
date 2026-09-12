import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRouter } from "../src/index.ts";

function sha256hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

async function withRouter(fn: (base: string, tokens: Record<string, string>) => Promise<void>) {
  const desktop = token();
  const phone = token();
  const ops = token();
  const expired = token();
  const dir = mkdtempSync(join(tmpdir(), "ub-router-"));
  const configPath = join(dir, "config.json");
  const dbPath = join(dir, "usage.sqlite");
  const future = new Date(Date.now() + 86400_000).toISOString();
  const past = new Date(Date.now() - 86400_000).toISOString();
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    phoneEnabled: false,
    tailnet: null,
    sandbox: { backend: "just-bash", evidenceId: "s3-non-vm-default", imageDigest: null },
    goBalanceDisabledConfirmedAt: null,
    searchKeyRequired: false,
    credentials: [
      { id: "d", kind: "router", sha256: sha256hex(desktop), callerId: "desktop", profile: "desktop", expiresAt: future, revokedAt: null },
      { id: "p", kind: "router", sha256: sha256hex(phone), callerId: "phone", profile: "phone", expiresAt: future, revokedAt: null },
      { id: "o", kind: "router", sha256: sha256hex(ops), callerId: "ops", profile: "ops", expiresAt: future, revokedAt: null },
      { id: "e", kind: "router", sha256: sha256hex(expired), callerId: "old", profile: "desktop", expiresAt: past, revokedAt: null },
    ],
  }));

  const upstream = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "cmpl_test",
      object: "chat.completion",
      model: "glm-5.3-flash",
      choices: [{ index: 0, message: { role: "assistant", content: "fixture-ok" }, finish_reason: "stop" }],
    }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upPort = (upstream.address() as { port: number }).port;
  process.env.UB_OPENCODE_GO_KEY = "test-upstream-key";
  process.env.UB_OPENCODE_GO_BASE = `http://127.0.0.1:${upPort}/v1`;

  const router = startRouter({
    port: 0,
    configPath,
    lockPath: join(process.cwd(), "package-lock.json"),
    dbPath,
  });
  await new Promise<void>((resolve) => {
    if (router.listening) resolve();
    else router.once("listening", () => resolve());
  });
  const addr = router.address();
  if (!addr || typeof addr === "string") throw new Error("no listen address");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(base, { desktop, phone, ops, expired });
  } finally {
    router.close();
    upstream.close();
  }
}

function ids() {
  return {
    "x-useful-session-id": randomUUID(),
    "x-useful-turn-id": randomUUID(),
    "x-useful-request-id": randomUUID(),
  };
}

test("live is unauthenticated", async () => {
  await withRouter(async (base) => {
    const res = await fetch(`${base}/health/live`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

test("missing token is 401", async () => {
  await withRouter(async (base) => {
    const res = await fetch(`${base}/v1/models`);
    assert.equal(res.status, 401);
  });
});

test("expired token is 401", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${tokens.expired}` } });
    assert.equal(res.status, 401);
  });
});

test("origin header is 403", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/models`, {
      headers: { authorization: `Bearer ${tokens.desktop}`, origin: "https://evil.example" },
    });
    assert.equal(res.status, 403);
  });
});

test("phone cannot use reviewer", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.phone}`,
        "content-type": "application/json",
        ...ids(),
      },
      body: JSON.stringify({ model: "reviewer", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "alias_forbidden");
  });
});

test("desktop models lists workhorse only", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${tokens.desktop}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, "workhorse");
    assert.equal(body.data[0].context_window, 131072);
  });
});

test("duplicate request id is 409", async () => {
  await withRouter(async (base, tokens) => {
    const headers = {
      authorization: `Bearer ${tokens.desktop}`,
      "content-type": "application/json",
      ...ids(),
    };
    const body = JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] });
    const first = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body });
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body });
    assert.equal(second.status, 409);
  });
});

test("completion maps model to alias", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.desktop}`,
        "content-type": "application/json",
        ...ids(),
      },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.model, "workhorse");
    assert.equal(body.choices[0].message.content, "fixture-ok");
    assert.equal(res.headers.get("x-useful-upstream-model"), "glm-5.3-flash");
  });
});
