import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  catalogFor,
  parseModelList,
  refreshProviderModels,
} from "../shared/live-models.ts";
import { hydrateModel, inferCapabilities, mergeLiveModels, snapComposer } from "../shared/models.ts";

test("parseModelList reads OpenAI list envelopes", () => {
  assert.deepEqual(parseModelList({
    object: "list",
    data: [{ id: "glm-5.3-flash" }, { id: "kimi-k3" }, { id: "text-embedding-3-small" }],
  }), ["glm-5.3-flash", "kimi-k3"]);
});

test("live OpenCode IDs hydrate efforts instead of staying on the two-model fallback", () => {
  const models = mergeLiveModels("opencode-go", ["kimi-k3", "glm-5.3-flash", "grok-4.6"]);
  assert.equal(models[0]?.id, "glm-5.3-flash");
  assert.equal(models.some((item) => item.id === "kimi-k3"), true);
  assert.deepEqual(hydrateModel("opencode-go", "kimi-k3").efforts, ["low", "high", "max"]);
  assert.deepEqual(inferCapabilities("grok-4.6").efforts, ["low", "medium", "high", "xhigh"]);
  const composer = snapComposer("opencode-go", "OpenCode Go", "kimi-k3", "max", "standard", models);
  assert.equal(composer.modelId, "kimi-k3");
  assert.equal(composer.models.length, 3);
  assert.equal(composer.effort, "max");
});

test("refreshProviderModels writes the fetched catalog to cache", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-models-")), "models-cache.json");
  const models = await refreshProviderModels({
    providerId: "opencode-go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    force: true,
    path,
    fetchImpl: async () => new Response(JSON.stringify({
      data: [{ id: "glm-5.3-flash" }, { id: "minimax-m3" }, { id: "qwen3.8-flash" }],
    })),
  });
  assert.equal(models.length, 3);
  assert.equal(catalogFor("opencode-go", path).some((item) => item.id === "minimax-m3"), true);
});
