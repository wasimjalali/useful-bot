import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogFor, writeModelsCache } from "../shared/live-models.ts";
import { hydrateModel } from "../shared/models.ts";
import type { ProviderStore } from "../shared/providers.ts";
import { syncProviderModels } from "../web/lib/sync-models.ts";

test("every connected provider gets its live list, not only the active one", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-sync-models-")), "models-cache.json");
  process.env.UB_MODELS_CACHE_PATH = path;
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("https://models.dev/")) return new Response("{}");
    if (url === "https://api.openai.com/v1/models") return new Response(JSON.stringify({ models: [{ slug: "gpt-6-astra", visibility: "list" }] }));
    return new Response(JSON.stringify({ data: [{ id: "kimi-k3" }] }));
  }) as typeof fetch;
  try {
    // A Go plan active and ChatGPT signed in next to it: the ChatGPT list
    // used to stay on its static fallback because only the active refreshed.
    const store = {
      activeConnectionId: "opencode-go:plan",
      connections: {
        "opencode-go:plan": { id: "opencode-go:plan", providerId: "opencode-go", mode: "plan", fields: {}, credential: { kind: "key", key: "go-key-12345678" } },
        "openai:oauth": {
          id: "openai:oauth",
          providerId: "openai",
          mode: "oauth",
          fields: {},
          credential: { kind: "oauth", accessToken: "token-12345678", refreshToken: null, expiresAt: null, accountId: null, clientId: "oaiapp_test" },
        },
      },
    } as unknown as ProviderStore;
    await syncProviderModels(store, { force: true, alsoAwait: "openai:oauth" });
    assert.equal(urls.some((url) => url === "https://api.openai.com/v1/models"), true);
    // The list omits the GPT-6 models the plan runs; they are merged in (UB-016), after the listed one.
    assert.deepEqual(catalogFor("openai:oauth", path).map((item) => item.id).sort(), ["gpt-6-astra", "gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"]);
    assert.deepEqual(catalogFor("opencode-go:plan", path).map((item) => item.id), ["kimi-k3"]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});

test("a ChatGPT sign-in from the old Codex route is skipped: no list call with its token", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-sync-legacy-")), "models-cache.json");
  process.env.UB_MODELS_CACHE_PATH = path;
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response("{}");
  }) as typeof fetch;
  try {
    const store = {
      activeConnectionId: "openai:oauth",
      connections: {
        "openai:oauth": {
          id: "openai:oauth",
          providerId: "openai",
          mode: "oauth",
          fields: {},
          credential: { kind: "oauth", accessToken: "codex-token-12345678", refreshToken: "r", expiresAt: null, accountId: "acct" },
        },
      },
    } as unknown as ProviderStore;
    await syncProviderModels(store, { force: true, alsoAwait: "openai:oauth" });
    assert.equal(urls.some((url) => url.startsWith("https://api.openai.com/")), false);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});

test("a ChatGPT sign-in whose access token is expired makes no list call", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-sync-expired-")), "models-cache.json");
  process.env.UB_MODELS_CACHE_PATH = path;
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response("{}");
  }) as typeof fetch;
  try {
    const store = {
      activeConnectionId: "openai:oauth",
      connections: {
        "openai:oauth": {
          id: "openai:oauth",
          providerId: "openai",
          mode: "oauth",
          fields: {},
          credential: { kind: "oauth", accessToken: "token-12345678", refreshToken: "r", expiresAt: Date.now() - 1000, accountId: null, clientId: "oaiapp_test" },
        },
      },
    } as unknown as ProviderStore;
    await syncProviderModels(store, { force: true, alsoAwait: "openai:oauth" });
    assert.equal(urls.some((url) => url.startsWith("https://api.openai.com/")), false);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});

test("a refresh with a new key lands after one still running with the old key", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-sync-race-")), "models-cache.json");
  process.env.UB_MODELS_CACHE_PATH = path;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("https://models.dev/")) return new Response("{}");
    const auth = (init?.headers as Record<string, string>).authorization;
    // The old key's list is slow, so without ordering it would write last.
    if (auth === "Bearer old-key-12345678") {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(JSON.stringify({ data: [{ id: "old-model" }] }));
    }
    return new Response(JSON.stringify({ data: [{ id: "new-model" }] }));
  }) as typeof fetch;
  const storeWith = (key: string) => ({
    activeConnectionId: "zai:api",
    connections: {
      "zai:api": { id: "zai:api", providerId: "zai", mode: "api", fields: {}, credential: { kind: "key", key } },
    },
  }) as unknown as ProviderStore;
  try {
    const first = syncProviderModels(storeWith("old-key-12345678"));
    const second = syncProviderModels(storeWith("new-key-12345678"), { force: true });
    await Promise.all([first, second]);
    assert.deepEqual(catalogFor("zai:api", path).map((item) => item.id), ["new-model"]);
    // A poll with the new key after that joins nothing stale and keeps the new list.
    await syncProviderModels(storeWith("new-key-12345678"));
    assert.deepEqual(catalogFor("zai:api", path).map((item) => item.id), ["new-model"]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});

test("a provider whose list fails is not asked again on every poll", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-sync-backoff-")), "models-cache.json");
  process.env.UB_MODELS_CACHE_PATH = path;
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("unauthorized", { status: 401 });
  }) as typeof fetch;
  const store = {
    activeConnectionId: "moonshot:api",
    connections: {
      "moonshot:api": { id: "moonshot:api", providerId: "moonshot", mode: "api", fields: {}, credential: { kind: "key", key: "revoked-key-1234" } },
    },
  } as unknown as ProviderStore;
  try {
    await syncProviderModels(store);
    await syncProviderModels(store);
    assert.equal(calls, 1);
    // A save forces a fresh try straight away.
    await syncProviderModels(store, { force: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});

test("UB-016: the GPT-6 models the list omits join the ChatGPT list only, and a listed row wins", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-sync-unlisted-")), "models-cache.json");
  process.env.UB_MODELS_CACHE_PATH = path;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://models.dev/")) return new Response("{}");
    // gpt-6-luna is listed with its own facts; gpt-6.1-sol and gpt-6-sol are not listed.
    return new Response(JSON.stringify({ models: [
      { slug: "gpt-6-astra", visibility: "list" },
      { slug: "gpt-6-luna", visibility: "list", display_name: "Listed Luna", context_window: 123000 },
    ] }));
  }) as typeof fetch;
  try {
    const oauth = { kind: "oauth", accessToken: "token-12345678", refreshToken: null, expiresAt: null, accountId: null, clientId: "oaiapp_test", subject: "sub-a" };
    const store = {
      activeConnectionId: "openai:oauth",
      connections: {
        "openai:oauth": { id: "openai:oauth", providerId: "openai", mode: "oauth", fields: {}, credential: oauth },
        "openai:api": { id: "openai:api", providerId: "openai", mode: "api", fields: {}, credential: { kind: "key", key: "sk-test-12345678" } },
      },
    } as unknown as ProviderStore;
    await syncProviderModels(store, { force: true, alsoAwait: "openai:oauth" });
    const chatgpt = catalogFor("openai:oauth", path);
    assert.deepEqual(chatgpt.map((item) => item.id).sort(), ["gpt-6-astra", "gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"]);
    const luna = chatgpt.find((item) => item.id === "gpt-6-luna");
    assert.equal(luna?.label, "Listed Luna", "the listed row keeps its own facts");
    assert.equal(luna?.contextTokens, 123000);
    assert.equal(luna?.unlisted, undefined, "listed means the router must never drop it");
    assert.equal(chatgpt.find((item) => item.id === "gpt-6.1-sol")?.unlisted, true);
    assert.equal(chatgpt.find((item) => item.id === "gpt-6.1-sol")?.label, "GPT-6.1 Sol");
    assert.equal(chatgpt.find((item) => item.id === "gpt-6-astra")?.unlisted, undefined);
    // The API-key connection is never given them.
    await syncProviderModels(store, { force: true, alsoAwait: "openai:api" });
    assert.equal(catalogFor("openai:api", path).some((item) => item.unlisted || /gpt-6\.1-sol|gpt-6-sol/.test(item.id)), false);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});

test("UB-016: a ChatGPT list cached by 1.1.2 refetches on the next unforced refresh instead of waiting out its TTL", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-sync-stale-")), "models-cache.json");
  process.env.UB_MODELS_CACHE_PATH = path;
  const realFetch = globalThis.fetch;
  let lists = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://models.dev/")) return new Response("{}");
    lists += 1;
    return new Response(JSON.stringify({ models: [{ slug: "gpt-6-astra", visibility: "list" }] }));
  }) as typeof fetch;
  try {
    const store = {
      activeConnectionId: "openai:oauth",
      connections: {
        "openai:oauth": {
          id: "openai:oauth", providerId: "openai", mode: "oauth", fields: {},
          credential: { kind: "oauth", accessToken: "token-stale-cache-12345678", refreshToken: null, expiresAt: null, accountId: null, clientId: "oaiapp_test" },
        },
      },
    } as unknown as ProviderStore;
    writeModelsCache({ schemaVersion: 3, providers: { "openai:oauth": { fetchedAt: Date.now(), models: [hydrateModel("openai:oauth", "gpt-6-astra")] } } }, path);
    await syncProviderModels(store, { alsoAwait: "openai:oauth" });
    assert.equal(lists, 1, "a young cache without the unlisted rows is still refetched");
    assert.equal(catalogFor("openai:oauth", path).some((item) => item.id === "gpt-6.1-sol"), true);
    await syncProviderModels(store, { alsoAwait: "openai:oauth" });
    assert.equal(lists, 1, "once the rows are there the 30 minute TTL holds again");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});
