import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { catalogFor } from "./live-models.ts";
import {
  isEffortId,
  isSpeedId,
  snapComposer,
  type ComposerPublic,
  type EffortId,
  type SpeedId,
} from "./models.ts";

export type ProviderId = "opencode-go" | "openai" | "anthropic" | "openrouter" | "google";

export interface ProviderCatalogItem {
  id: ProviderId;
  name: string;
  kind: "coding-plan" | "api";
  hint: string;
  baseUrl: string;
  compatible: boolean;
  models: { workhorse: string; reviewer: string };
}

export const PROVIDER_CATALOG: ProviderCatalogItem[] = [
  {
    id: "opencode-go",
    name: "OpenCode Go",
    kind: "coding-plan",
    hint: "Coding plan key from OpenCode Go.",
    baseUrl: "https://opencode.ai/zen/go/v1",
    compatible: true,
    models: { workhorse: "glm-5.3-flash", reviewer: "glm-5.3" },
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "api",
    hint: "API key from platform.openai.com.",
    baseUrl: "https://api.openai.com/v1",
    compatible: true,
    models: { workhorse: "gpt-4.1-mini", reviewer: "gpt-4.1" },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "api",
    hint: "One key for many models, including Claude.",
    baseUrl: "https://openrouter.ai/api/v1",
    compatible: true,
    models: { workhorse: "openai/gpt-4.1-mini", reviewer: "anthropic/claude-sonnet-4" },
  },
  {
    id: "google",
    name: "Google",
    kind: "api",
    hint: "Gemini API key. OpenAI-compatible endpoint.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    compatible: true,
    models: { workhorse: "gemini-2.5-flash", reviewer: "gemini-2.5-pro" },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "api",
    hint: "Claude API key. Route Claude through OpenRouter in this build.",
    baseUrl: "https://api.anthropic.com/v1",
    compatible: false,
    models: { workhorse: "claude-sonnet-4-0", reviewer: "claude-sonnet-4-0" },
  },
];

export interface ProviderKeyRec {
  key: string;
  updatedAt: string;
}

export interface ProviderStore {
  schemaVersion: 1;
  activeProviderId: ProviderId;
  keys: Partial<Record<ProviderId, ProviderKeyRec>>;
  selectedModel: string | null;
  effort: EffortId | null;
  speed: SpeedId;
}

export interface ProviderPublic {
  id: ProviderId;
  name: string;
  kind: "coding-plan" | "api";
  hint: string;
  compatible: boolean;
  connected: boolean;
  last4: string | null;
  source: "settings" | "env" | null;
  active: boolean;
  models: { workhorse: string; reviewer: string };
}

const ALLOWED = new Set(PROVIDER_CATALOG.map((item) => item.id));

export function providersPath(root = process.env.UB_PROVIDERS_PATH): string {
  if (root) return root;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/providers.json");
}

export function emptyProviderStore(): ProviderStore {
  return {
    schemaVersion: 1,
    activeProviderId: "opencode-go",
    keys: {},
    selectedModel: null,
    effort: null,
    speed: "standard",
  };
}

export function catalogItem(id: ProviderId): ProviderCatalogItem {
  const item = PROVIDER_CATALOG.find((entry) => entry.id === id);
  if (!item) throw new Error("provider_unknown");
  return item;
}

export function last4(key: string): string {
  const trimmed = key.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}

export function parseProviderStore(raw: unknown): ProviderStore {
  if (!raw || typeof raw !== "object") throw new Error("providers_format");
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== 1) throw new Error("providers_schema");
  const active = rec.activeProviderId;
  if (typeof active !== "string" || !ALLOWED.has(active as ProviderId)) {
    throw new Error("providers_active");
  }
  const keys: ProviderStore["keys"] = {};
  if (rec.keys && typeof rec.keys === "object" && rec.keys !== null) {
    for (const [id, value] of Object.entries(rec.keys as Record<string, unknown>)) {
      if (!ALLOWED.has(id as ProviderId) || !value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      if (typeof row.key !== "string" || typeof row.updatedAt !== "string") continue;
      keys[id as ProviderId] = { key: row.key, updatedAt: row.updatedAt };
    }
  }
  return {
    schemaVersion: 1,
    activeProviderId: active as ProviderId,
    keys,
    selectedModel: typeof rec.selectedModel === "string" && rec.selectedModel ? rec.selectedModel : null,
    effort: isEffortId(rec.effort) ? rec.effort : null,
    speed: isSpeedId(rec.speed) ? rec.speed : "standard",
  };
}

export function readProviderStore(path = providersPath()): ProviderStore {
  if (!existsSync(path)) return emptyProviderStore();
  return parseProviderStore(JSON.parse(readFileSync(path, "utf8")));
}

export function writeProviderStore(store: ProviderStore, path = providersPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(store)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function setProviderKey(store: ProviderStore, id: ProviderId, key: string, now = new Date()): ProviderStore {
  if (!ALLOWED.has(id)) throw new Error("provider_unknown");
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 8192) throw new Error("provider_key");
  if (/\s/.test(trimmed)) throw new Error("provider_key");
  return {
    ...store,
    keys: {
      ...store.keys,
      [id]: { key: trimmed, updatedAt: now.toISOString() },
    },
  };
}

export function clearProviderKey(store: ProviderStore, id: ProviderId): ProviderStore {
  const keys = { ...store.keys };
  delete keys[id];
  const activeProviderId = store.activeProviderId === id ? "opencode-go" : store.activeProviderId;
  return { ...store, keys, activeProviderId };
}

export function setActiveProvider(store: ProviderStore, id: ProviderId): ProviderStore {
  if (!ALLOWED.has(id)) throw new Error("provider_unknown");
  const item = catalogItem(id);
  if (!item.compatible) throw new Error("provider_incompatible");
  if (!store.keys[id] && id !== "opencode-go") throw new Error("provider_disconnected");
  return setComposer({ ...store, activeProviderId: id }, { modelId: item.models.workhorse });
}

export function publicProviders(
  store: ProviderStore,
  envConnected: Partial<Record<ProviderId, boolean>> = {},
): ProviderPublic[] {
  return PROVIDER_CATALOG.map((item) => {
    const rec = store.keys[item.id];
    const fromEnv = Boolean(envConnected[item.id]);
    const connected = Boolean(rec) || fromEnv;
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      hint: item.hint,
      compatible: item.compatible,
      connected,
      last4: rec ? last4(rec.key) : null,
      source: rec ? "settings" : fromEnv ? "env" : null,
      active: store.activeProviderId === item.id,
      models: item.models,
    };
  });
}

export function composerState(store: ProviderStore): ComposerPublic {
  const active = catalogItem(store.activeProviderId);
  return snapComposer(
    active.id,
    active.name,
    store.selectedModel ?? active.models.workhorse,
    store.effort,
    store.speed,
    catalogFor(active.id),
  );
}

export function setComposer(
  store: ProviderStore,
  patch: { modelId?: string; effort?: EffortId | null; speed?: SpeedId },
): ProviderStore {
  const next = { ...store };
  if (patch.modelId !== undefined) next.selectedModel = patch.modelId;
  if (patch.effort !== undefined) next.effort = patch.effort;
  if (patch.speed !== undefined) next.speed = patch.speed;
  const snapped = composerState(next);
  return {
    ...next,
    selectedModel: snapped.modelId || null,
    effort: snapped.effort,
    speed: snapped.speed,
  };
}

export function resolveUpstream(
  store: ProviderStore,
  alias: "workhorse" | "reviewer",
  env: NodeJS.ProcessEnv = process.env,
): {
  providerId: ProviderId;
  key: string;
  baseUrl: string;
  model: string;
  opencodeSession: boolean;
  effort: EffortId | null;
  speed: SpeedId;
  fallback: boolean;
} {
  const active = catalogItem(store.activeProviderId);
  const stored = store.keys[active.id]?.key;
  const envKey = active.id === "opencode-go" ? env.UB_OPENCODE_GO_KEY : undefined;
  const key = envKey || stored;
  const composer = composerState(store);
  if (key && active.compatible) {
    const baseUrl = active.id === "opencode-go"
      ? (env.UB_OPENCODE_GO_BASE || active.baseUrl)
      : active.baseUrl;
    return {
      providerId: active.id,
      key,
      baseUrl,
      model: alias === "reviewer" ? active.models.reviewer : (composer.modelId || active.models.workhorse),
      opencodeSession: active.id === "opencode-go",
      effort: composer.effort,
      speed: composer.speed,
      fallback: false,
    };
  }
  const go = catalogItem("opencode-go");
  const goKey = env.UB_OPENCODE_GO_KEY || store.keys["opencode-go"]?.key;
  if (!goKey) throw new Error("upstream_credential_missing");
  const goComposer = snapComposer(
    "opencode-go",
    go.name,
    alias === "reviewer" ? go.models.reviewer : go.models.workhorse,
    store.effort,
    store.speed,
    catalogFor("opencode-go"),
  );
  return {
    providerId: "opencode-go",
    key: goKey,
    baseUrl: env.UB_OPENCODE_GO_BASE || go.baseUrl,
    model: alias === "reviewer" ? go.models.reviewer : go.models.workhorse,
    opencodeSession: true,
    effort: goComposer.effort,
    speed: goComposer.speed,
    fallback: store.activeProviderId !== "opencode-go",
  };
}
