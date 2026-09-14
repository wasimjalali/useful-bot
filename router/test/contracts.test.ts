import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRouter } from "../src/index.ts";
import { LimitStore } from "../src/limits.ts";
import { retryAfterMs } from "../src/retry-after.ts";
import { upstreamConfigError } from "../src/upstreams/opencode.ts";
import { loadRuntimeConfig } from "../../shared/runtime.ts";

type UpstreamHandler = (req: IncomingMessage, res: ServerResponse) => void;

const jsonFixture: UpstreamHandler = (_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    id: "cmpl_test",
    object: "chat.completion",
    model: "glm-5.3-flash",
    choices: [{ index: 0, message: { role: "assistant", content: "fixture-ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
  }));
};

function sha256hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

async function withRouter(
  fn: (base: string, tokens: Record<string, string>) => Promise<void>,
  handler: UpstreamHandler = jsonFixture,
) {
  const desktop = token();
  const phone = token();
  const ops = token();
  const expired = token();
  const device = token();
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
      { id: "dev", kind: "device", sha256: sha256hex(device), callerId: "desktop-device", profile: "desktop", expiresAt: future, revokedAt: null },
    ],
  }));

  const upstream = createServer(handler);
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upPort = (upstream.address() as { port: number }).port;
  const savedEnv = {
    key: process.env.UB_OPENCODE_GO_KEY,
    base: process.env.UB_OPENCODE_GO_BASE,
    providers: process.env.UB_PROVIDERS_PATH,
  };
  const restoreEnv = () => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("UB_OPENCODE_GO_KEY", savedEnv.key);
    restore("UB_OPENCODE_GO_BASE", savedEnv.base);
    restore("UB_PROVIDERS_PATH", savedEnv.providers);
  };
  process.env.UB_OPENCODE_GO_KEY = "test-upstream-key";
  process.env.UB_OPENCODE_GO_BASE = `http://127.0.0.1:${upPort}/v1`;
  process.env.UB_PROVIDERS_PATH = join(dir, "providers.json");

  let router: ReturnType<typeof startRouter> | undefined;
  try {
    router = startRouter({
      port: 0,
      configPath,
      lockPath: join(process.cwd(), "package-lock.json"),
      dbPath,
    });
    await new Promise<void>((resolve) => {
      if (router?.listening) resolve();
      else router?.once("listening", () => resolve());
    });
    const addr = router.address();
    if (!addr || typeof addr === "string") throw new Error("no listen address");
    const base = `http://127.0.0.1:${addr.port}`;
    await fn(base, { desktop, phone, ops, expired, device });
  } finally {
    await new Promise<void>((resolve) => {
      if (!router) {
        resolve();
        return;
      }
      router.close(() => resolve());
    });
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    restoreEnv();
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
    const usage = await fetch(`${base}/v1/usage`, { headers: { authorization: `Bearer ${tokens.desktop}` } });
    assert.equal(usage.status, 200);
    const meter = await usage.json() as { observed_input_tokens: number; observed_output_tokens: number; requests: number; by_model: Array<{ model: string }> };
    assert.equal(meter.requests, 1);
    assert.equal(meter.observed_input_tokens, 11);
    assert.equal(meter.observed_output_tokens, 4);
    assert.equal(meter.by_model[0]?.model, "glm-5.3-flash");
  });
});

test("opencode-go forwards the registry upstream model id", async () => {
  let forwarded: Record<string, unknown> = {};
  await withRouter(async (base, tokens) => {
    writeFileSync(process.env.UB_PROVIDERS_PATH!, JSON.stringify({
      schemaVersion: 1,
      activeProviderId: "opencode-go",
      keys: { "opencode-go": { key: "test-upstream-key", updatedAt: new Date().toISOString() } },
      selectedModel: "glm-5.3",
      effort: "high",
      speed: "standard",
    }));
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-useful-upstream-model"), "glm-5.3-flash");
    assert.equal(forwarded.model, "glm-5.3-flash");
    assert.equal(forwarded.reasoning_effort, "high");
  }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      forwarded = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "cmpl_test",
        object: "chat.completion",
        model: "glm-5.3-flash",
        choices: [{ index: 0, message: { role: "assistant", content: "fixture-ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
      }));
    });
  });
});

test("device credential cannot authenticate to router", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${tokens.device}` } });
    assert.equal(res.status, 401);
  });
});

test("malformed json body is 400", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: "{ this is not json",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "invalid_request");
  });
});

test("request id is scoped per caller", async () => {
  await withRouter(async (base, tokens) => {
    const shared = ids();
    const body = JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] });
    const run = (token: string) => fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...shared },
      body,
    });
    assert.equal((await run(tokens.desktop)).status, 200);
    assert.equal((await run(tokens.phone)).status, 200);
  });
});

test("upstream 5xx is normalized to a redacted 502", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.equal(JSON.parse(text).error.code, "upstream_protocol_error");
    assert.equal(text.includes("secret provider detail"), false);
  }, (_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "secret provider detail" } }));
  });
});

test("upstream 429 maps to a retryable rate limit", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.error.code, "upstream_rate_limited");
    assert.equal(body.error.retryable, true);
    assert.equal(body.error.retry_after_ms, 2000);
  }, (_req, res) => {
    res.writeHead(429, { "content-type": "application/json", "retry-after": "2" });
    res.end("{}");
  });
});

test("upstream model 404 maps to model_unavailable", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "model_unavailable");
  }, (_req, res) => {
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
});

test("streaming proxies sse and records usage", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const text = await res.text();
    assert.equal(text.includes("fixture-ok"), true);
    assert.equal(text.includes("data: [DONE]"), true);
    const usage = await fetch(`${base}/v1/usage`, { headers: { authorization: `Bearer ${tokens.desktop}` } });
    const meter = await usage.json() as { requests: number; observed_input_tokens: number };
    assert.equal(meter.requests, 1);
    assert.equal(meter.observed_input_tokens, 11);
  }, (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "fixture-ok" } }] })}\r\n\r\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 4 } })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
});

test("client abort cancels the upstream stream", async () => {
  let upstreamClosed = false;
  await withRouter(async (base, tokens) => {
    const controller = new AbortController();
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }], stream: true }),
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    if (!res.body) throw new Error("no stream body");
    const reader = res.body.getReader();
    await reader.read();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }, (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "hi" } }] })}\n\n`);
    res.on("close", () => {
      upstreamClosed = true;
    });
    setTimeout(() => res.end(), 1500);
  });
  assert.equal(upstreamClosed, true);
});

test("ops sees aggregate usage labeled aggregate", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 200);
    const usage = await fetch(`${base}/v1/usage`, { headers: { authorization: `Bearer ${tokens.ops}` } });
    const meter = await usage.json() as { requests: number; caller_id: string };
    assert.equal(meter.requests, 1);
    assert.equal(meter.caller_id, "aggregate");
  });
});

test("ops sees every registry model", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${tokens.ops}` } });
    assert.equal(res.status, 200);
    const body = await res.json() as { data: Array<{ id: string }> };
    assert.equal(body.data.length, 2);
    assert.deepEqual(body.data.map((entry) => entry.id).sort(), ["reviewer", "workhorse"]);
  });
});

test("unknown completion options are rejected", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({
        model: "workhorse",
        messages: [{ role: "user", content: "hi" }],
        reasoning_effort: "high",
      }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "unsupported_parameter");
  });
});

test("caller-supplied effort and service tier are rejected", async () => {
  await withRouter(async (base, tokens) => {
    for (const extra of [{ service_tier: "priority" }, { reasoning_effort: "high" }]) {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
        body: JSON.stringify({
          model: "workhorse",
          messages: [{ role: "user", content: "hi" }],
          ...extra,
        }),
      });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error.code, "unsupported_parameter");
    }
  });
});

test("wrong method on a known route is 405 with Allow", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/models`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokens.desktop}` },
    });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET");
  });
});

test("unknown route is 404", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/nope`, { headers: { authorization: `Bearer ${tokens.desktop}` } });
    assert.equal(res.status, 404);
  });
});

test("three protocol failures open the alias circuit", async () => {
  await withRouter(async (base, tokens) => {
    const call = () => fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }] }),
    });
    for (let i = 0; i < 3; i += 1) {
      const res = await call();
      assert.equal(res.status, 502);
      await res.text();
    }
    const opened = await call();
    assert.equal(opened.status, 503);
    assert.equal((await opened.json()).error.code, "circuit_open");
  }, (_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end("{}");
  });
});

test("oversize stream event is rejected", async () => {
  await withRouter(async (base, tokens) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.desktop}`, "content-type": "application/json", ...ids() },
      body: JSON.stringify({ model: "workhorse", messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text.includes("upstream_protocol_error"), true);
  }, (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
    res.write(`data: ${"a".repeat(300 * 1024)}`);
    res.end();
  });
});

test("shared retry-after parser accepts seconds and http dates", () => {
  assert.equal(retryAfterMs(new Response(null, { headers: { "retry-after": "2" } })), 2000);
  const dated = retryAfterMs(new Response(null, { headers: { "retry-after": new Date(Date.now() + 3000).toUTCString() } }));
  assert.equal(typeof dated, "number");
  assert.equal((dated ?? 0) > 0, true);
  assert.equal(retryAfterMs(new Response(null)), undefined);
});

test("request ids expire after 24h", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-limits-"));
  const path = join(dir, "usage.sqlite");
  const now = Date.now();
  const store = new LimitStore(path);
  store.rememberRequest("step-1", "desktop", now - 25 * 60 * 60 * 1000);
  const reopened = new LimitStore(path);
  reopened.rememberRequest("step-1", "desktop", now);
});

test("hit enforces 24h token budgets", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-limits-"));
  const store = new LimitStore(join(dir, "usage.sqlite"));
  const caller = { callerId: "desktop", profile: "desktop" as const, aliases: ["workhorse"], search: true };
  const now = Date.now();
  store.recordUsage({ callerId: "desktop", provider: "opencode-go", model: "glm-5.3-flash", inputTokens: 0, outputTokens: 200_000, at: now });
  assert.throws(() => store.hit(caller, now), /caller_budget_exhausted/);
});

test("upstream config errors keep their distinct code", () => {
  assert.equal(upstreamConfigError(new Error("provider_unknown")).code, "provider_unknown");
  assert.equal(upstreamConfigError(new Error("provider_disconnected")).code, "provider_disconnected");
  assert.equal(upstreamConfigError(new Error("providers_schema")).code, "configuration_unverified");
});

test("runtime config rejects malformed credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-cfg-"));
  const write = (credential: Record<string, unknown>) => {
    const path = join(dir, `${randomUUID()}.json`);
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1,
      phoneEnabled: false,
      tailnet: null,
      sandbox: { backend: "just-bash", evidenceId: "s3-non-vm-default", imageDigest: null },
      goBalanceDisabledConfirmedAt: null,
      searchKeyRequired: false,
      credentials: [credential],
    }));
    return path;
  };
  const base = {
    id: "x",
    kind: "router",
    sha256: sha256hex("token"),
    callerId: "desktop",
    profile: "desktop",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: null,
  };
  assert.doesNotThrow(() => loadRuntimeConfig(write(base)));
  assert.throws(() => loadRuntimeConfig(write({ ...base, sha256: "nothex" })), /runtime_config_credential/);
  assert.throws(() => loadRuntimeConfig(write({ ...base, expiresAt: "whenever" })), /runtime_config_credential/);
  assert.throws(() => loadRuntimeConfig(write({ ...base, kind: "bogus" })), /runtime_config_credential/);
  assert.throws(() => loadRuntimeConfig(write({ ...base, profile: "bogus" })), /runtime_config_credential/);
});
