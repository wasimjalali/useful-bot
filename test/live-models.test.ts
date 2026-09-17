import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MODELS_DEV_URL,
  catalogFor,
  parseModelList,
  parseModelsDev,
  readModelsCache,
  refreshProviderModels,
  writeModelsCache,
} from "../shared/live-models.ts";
import { hydrateModel, inferCapabilities, mergeLiveModels, modelSeesImages, snapComposer } from "../shared/models.ts";

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

test("models.dev facts land on the live rows: context window and image input", async () => {
  const catalog = parseModelsDev({
    "opencode-go": {
      models: {
        "glm-5.3-flash": { limit: { context: 1_000_000, output: 131_072 }, modalities: { input: ["text", "image"], output: ["text"] } },
        "glm-5.3": { limit: { context: 1_000_000 }, modalities: { input: ["text"] } },
        "odd": { limit: { context: "big" } },
      },
    },
    junk: { models: "no" },
  });
  assert.deepEqual(catalog["opencode-go"]?.["glm-5.3-flash"], { contextTokens: 1_000_000, inputs: ["text", "image"] });
  assert.equal(catalog["opencode-go"]?.odd, undefined);
  assert.equal(catalog.junk, undefined);

  const path = join(mkdtempSync(join(tmpdir(), "ub-models-")), "models-cache.json");
  const models = await refreshProviderModels({
    providerId: "opencode-go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    force: true,
    path,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url === MODELS_DEV_URL) {
        return new Response(JSON.stringify({
          "opencode-go": {
            models: {
              "glm-5.3-flash": { limit: { context: 1_000_000 }, modalities: { input: ["text", "image"] } },
              "glm-5.3": { limit: { context: 1_000_000 }, modalities: { input: ["text"] } },
            },
          },
        }));
      }
      return new Response(JSON.stringify({ data: [{ id: "glm-5.3-flash" }, { id: "glm-5.3" }, { id: "mystery-1" }] }));
    },
  });
  const flash = models.find((item) => item.id === "glm-5.3-flash");
  const plain = models.find((item) => item.id === "glm-5.3");
  const mystery = models.find((item) => item.id === "mystery-1");
  assert.equal(flash?.contextTokens, 1_000_000);
  assert.equal(modelSeesImages(flash), true);
  assert.equal(modelSeesImages(plain), false);
  // A model the catalog does not know says nothing, and callers treat that as unknown, not "no".
  assert.equal(mystery?.contextTokens, undefined);
  assert.equal(modelSeesImages(mystery), null);
  assert.equal(catalogFor("opencode-go", path).find((item) => item.id === "glm-5.3")?.inputs?.includes("image"), false);
});

test("the parsed models cache is reused until another process replaces the file", () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-models-memo-")), "models-cache.json");
  const row = (id: string) => mergeLiveModels("opencode-go", [id]);
  writeModelsCache({ schemaVersion: 2, providers: { "opencode-go": { fetchedAt: 1, models: row("kimi-k3") } } }, path);
  const first = readModelsCache(path);
  assert.equal(readModelsCache(path), first, "an unchanged file is not parsed again");
  // What another process does: a whole new file renamed over this one, same
  // byte length, inside the same clock tick.
  const next = JSON.stringify({ schemaVersion: 2, providers: { "opencode-go": { fetchedAt: 1, models: row("kimi-k4") } } });
  writeFileSync(`${path}.other`, `${next}\n`);
  renameSync(`${path}.other`, path);
  assert.equal(catalogFor("opencode-go", path)[0]?.id, "kimi-k4");
});
