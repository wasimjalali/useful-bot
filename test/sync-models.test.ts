import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogFor } from "../shared/live-models.ts";
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
    if (url.includes("chatgpt.com")) return new Response(JSON.stringify({ models: [{ slug: "gpt-6-astra", visibility: "list" }] }));
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
          credential: { kind: "oauth", accessToken: "token-12345678", refreshToken: null, expiresAt: null, accountId: "acct" },
        },
      },
    } as unknown as ProviderStore;
    await syncProviderModels(store, { force: true, alsoAwait: "openai:oauth" });
    assert.equal(urls.some((url) => url === "https://chatgpt.com/backend-api/codex/models?client_version=99.0.0"), true);
    assert.deepEqual(catalogFor("openai:oauth", path).map((item) => item.id), ["gpt-6-astra"]);
    assert.deepEqual(catalogFor("opencode-go:plan", path).map((item) => item.id), ["kimi-k3"]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UB_MODELS_CACHE_PATH;
  }
});
