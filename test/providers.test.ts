import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReasoning, modelsFor, snapComposer } from "../shared/models.ts";
import {
  clearProviderKey,
  composerState,
  emptyProviderStore,
  last4,
  publicProviders,
  readProviderStore,
  resolveUpstream,
  setActiveProvider,
  setComposer,
  setProviderKey,
  writeProviderStore,
} from "../shared/providers.ts";
import { usageFromPayload, usageFromSseBlock } from "../shared/usage-parse.ts";

test("provider keys persist without leaking in public view", () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-prov-")), "providers.json");
  let store = setProviderKey(emptyProviderStore(), "openai", "sk-test-abcdef1234");
  store = setActiveProvider(store, "openai");
  writeProviderStore(store, path);
  const loaded = readProviderStore(path);
  assert.equal(loaded.keys.openai?.key, "sk-test-abcdef1234");
  const pub = publicProviders(loaded);
  const openai = pub.find((item) => item.id === "openai");
  assert.equal(openai?.connected, true);
  assert.equal(openai?.last4, "1234");
  assert.equal(openai?.active, true);
  assert.equal(JSON.stringify(pub).includes("sk-test-abcdef1234"), false);
  store = clearProviderKey(loaded, "openai");
  assert.equal(store.keys.openai, undefined);
  assert.equal(store.activeProviderId, "opencode-go");
});

test("a corrupt providers file is set aside instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-prov-"));
  const path = join(dir, "providers.json");
  writeFileSync(path, "{ torn", "utf8");
  const loaded = readProviderStore(path);
  assert.deepEqual(loaded.keys, {});
  assert.equal(existsSync(path), false);
  const backup = readdirSync(dir).find((name: string) => name.includes(".invalid."));
  assert.equal(typeof backup, "string");
});

test("resolveUpstream prefers the active compatible provider", () => {
  let store = setProviderKey(emptyProviderStore(), "openrouter", "or-key-12345678");
  store = setActiveProvider(store, "openrouter");
  const resolved = resolveUpstream(store, "workhorse", {});
  assert.equal(resolved.providerId, "openrouter");
  assert.equal(resolved.model, "openai/gpt-4.1-mini");
  assert.equal(resolved.opencodeSession, false);
});

test("resolveUpstream falls back to OpenCode env when the active key is missing", () => {
  const resolved = resolveUpstream(emptyProviderStore(), "workhorse", { UB_OPENCODE_GO_KEY: "go-env-key" });
  assert.equal(resolved.providerId, "opencode-go");
  assert.equal(resolved.model, "glm-5.3-flash");
  assert.equal(last4("go-env-key"), "-key");
});

test("anthropic cannot be made active", () => {
  const store = setProviderKey(emptyProviderStore(), "anthropic", "sk-ant-12345678");
  assert.throws(() => setActiveProvider(store, "anthropic"), /provider_incompatible/);
});

test("composer snaps effort to what the selected model supports", () => {
  const go = modelsFor("opencode-go");
  assert.equal(go.some((item) => item.efforts.includes("max")), true);
  const flash = snapComposer("opencode-go", "OpenCode Go", "glm-5.3-flash", "max", "fast");
  assert.equal(flash.effort, "max");
  assert.equal(flash.effortLabel, "Max");
  assert.equal(flash.speed, "standard");
  assert.equal(flash.speeds.some((item) => item.id === "fast"), false);
  const openaiFast = snapComposer("openai", "OpenAI", "gpt-4.1-mini", null, "fast");
  assert.equal(openaiFast.speed, "fast");
  assert.equal(openaiFast.speeds.some((item) => item.id === "fast"), true);
  const openai = snapComposer("openai", "OpenAI", "gpt-4.1-mini", "high", "standard");
  assert.equal(openai.effort, null);
  assert.equal(openai.efforts.length, 0);
  let store = setComposer(emptyProviderStore(), { modelId: "glm-5.3", effort: "max" });
  const state = composerState(store);
  assert.equal(state.modelId, "glm-5.3");
  assert.equal(state.effort, "max");
  const payload = applyReasoning("opencode-go", "max", "standard", { model: "glm-5.3" });
  assert.equal(payload.reasoning_effort, "max");
  const grok = applyReasoning("opencode-go", "xhigh", "standard", { model: "grok-4.6" });
  assert.equal(grok.reasoning_effort, "xhigh");
});

test("usage parser reads completion and sse payloads", () => {
  assert.deepEqual(usageFromPayload({
    usage: { prompt_tokens: 11, completion_tokens: 4 },
  }), { inputTokens: 11, outputTokens: 4 });
  assert.equal(usageFromPayload({ id: "x" }), null);
  assert.deepEqual(usageFromSseBlock("data: {\"usage\":{\"input_tokens\":3,\"output_tokens\":2}}\n"), {
    inputTokens: 3,
    outputTokens: 2,
  });
  // A usage-less data line before the usage line must not end the scan.
  assert.deepEqual(
    usageFromSseBlock("data: {\"foo\":1}\n\ndata: {\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}"),
    { inputTokens: 10, outputTokens: 5 },
  );
  // Malformed JSON before a valid usage line is skipped, not fatal.
  assert.deepEqual(
    usageFromSseBlock("data: {oops\ndata: {\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":2}}"),
    { inputTokens: 7, outputTokens: 2 },
  );
  assert.equal(usageFromPayload({ usage: { prompt_tokens: 1.5, completion_tokens: 2 } }), null);
  assert.equal(usageFromPayload({ usage: { prompt_tokens: 1e12, completion_tokens: 2 } }), null);
});
