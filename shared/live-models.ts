import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mergeLiveModels, modelsFor, type ModelOption } from "./models.ts";

const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheFile = {
  schemaVersion: 1;
  providers: Record<string, { fetchedAt: number; models: ModelOption[] }>;
};

export function modelsCachePath(root = process.env.UB_MODELS_CACHE_PATH): string {
  if (root) return root;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/models-cache.json");
}

function emptyCache(): CacheFile {
  return { schemaVersion: 1, providers: {} };
}

export function readModelsCache(path = modelsCachePath()): CacheFile {
  if (!existsSync(path)) return emptyCache();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
    if (raw?.schemaVersion !== 1 || !raw.providers || typeof raw.providers !== "object") return emptyCache();
    return raw;
  } catch {
    return emptyCache();
  }
}

export function writeModelsCache(cache: CacheFile, path = modelsCachePath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(cache)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function cachedModels(providerId: string, path = modelsCachePath()): ModelOption[] {
  return readModelsCache(path).providers[providerId]?.models ?? [];
}

export function catalogFor(providerId: string, path = modelsCachePath()): ModelOption[] {
  const live = cachedModels(providerId, path);
  return live.length > 0 ? live : modelsFor(providerId);
}

export function parseModelList(raw: unknown): string[] {
  if (Array.isArray(raw)) return idsFromRows(raw);
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  if (Array.isArray(rec.data)) return idsFromRows(rec.data);
  if (Array.isArray(rec.models)) return idsFromRows(rec.models);
  return [];
}

function idsFromRows(rows: unknown[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (typeof row === "string" && row.trim()) ids.push(row.trim());
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) ids.push(id.trim());
  }
  return ids.filter((id) => !/embed|whisper|tts|moderation/i.test(id));
}

export async function fetchProviderModelIds(
  baseUrl: string,
  key?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "useful-bot/1.0",
  };
  if (key) headers.authorization = `Bearer ${key}`;
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers,
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return [];
  return parseModelList(await res.json());
}

export async function refreshProviderModels(input: {
  providerId: string;
  baseUrl: string;
  key?: string | null;
  force?: boolean;
  path?: string;
  fetchImpl?: typeof fetch;
}): Promise<ModelOption[]> {
  const path = input.path ?? modelsCachePath();
  const cache = readModelsCache(path);
  const current = cache.providers[input.providerId];
  const fresh = current && Date.now() - current.fetchedAt < CACHE_TTL_MS && current.models.length > 0;
  if (!input.force && fresh) return current.models;
  try {
    const ids = await fetchProviderModelIds(input.baseUrl, input.key, input.fetchImpl);
    if (ids.length === 0) return current?.models?.length ? current.models : modelsFor(input.providerId);
    const models = mergeLiveModels(input.providerId, ids);
    cache.providers[input.providerId] = { fetchedAt: Date.now(), models };
    writeModelsCache(cache, path);
    return models;
  } catch {
    return current?.models?.length ? current.models : modelsFor(input.providerId);
  }
}
