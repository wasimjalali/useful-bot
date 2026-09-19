import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseConnectionId, providerMode, type KeyHeader } from "./provider-catalog.ts";
import { mergeLiveModels, modelsFor, type ModelMeta, type ModelOption } from "./models.ts";

const CACHE_TTL_MS = 30 * 60 * 1000;
/** Context windows and modalities change with releases, not by the hour. */
const META_TTL_MS = 24 * 60 * 60 * 1000;
export const MODELS_DEV_URL = "https://models.dev/api.json";

/**
 * Version 2 added the models.dev facts on each row. A version 1 file reads
 * as empty so the first refresh after the upgrade fetches them instead of
 * serving a fresh-looking list with no context window on it.
 */
const CACHE_SCHEMA = 2;

type CacheFile = {
  schemaVersion: typeof CACHE_SCHEMA;
  providers: Record<string, { fetchedAt: number; models: ModelOption[] }>;
  /** models.dev facts per provider, keyed by the provider's model id. */
  meta?: { fetchedAt: number; providers: Record<string, Record<string, ModelMeta>> };
};

export function modelsCachePath(root = process.env.UB_MODELS_CACHE_PATH): string {
  if (root) return root;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/models-cache.json");
}

function emptyCache(): CacheFile {
  return { schemaVersion: CACHE_SCHEMA, providers: {} };
}

/**
 * The last parse, kept while the file on disk is the one it came from. The
 * file is several hundred KB and was parsed on every composer poll (each 2.5 s
 * per open app) and twice per model call in the router. Writers replace the
 * file by rename, so a new inode, size or mtime means a new file; any process
 * may be the writer, which is why this asks the disk instead of trusting
 * itself.
 */
let parsed: { path: string; ino: number; size: number; mtimeMs: number; cache: CacheFile } | undefined;

export function readModelsCache(path = modelsCachePath()): CacheFile {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return emptyCache();
  }
  if (parsed && parsed.path === path && parsed.ino === stat.ino && parsed.size === stat.size && parsed.mtimeMs === stat.mtimeMs) {
    return parsed.cache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
    if (raw?.schemaVersion !== CACHE_SCHEMA || !raw.providers || typeof raw.providers !== "object") return emptyCache();
    parsed = { path, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, cache: raw };
    return raw;
  } catch {
    return emptyCache();
  }
}

export function writeModelsCache(cache: CacheFile, path = modelsCachePath()): void {
  // Callers edit the object they read and hand it back. Dropped first, so a
  // write that fails cannot leave an edited copy standing in for the file.
  parsed = undefined;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Atomic like the catalogue cache: readers see the old file or the new one.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(cache)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

export function cachedModels(providerId: string, path = modelsCachePath()): ModelOption[] {
  return readModelsCache(path).providers[providerId]?.models ?? [];
}

/**
 * Live list for a connection, keyed by connection id so plan and api lists
 * do not collide. Falls back to the static or catalogue derived list. Caches
 * written before connections existed are keyed by bare provider id, so those
 * are read once as a bridge until the next refresh rewrites the entry.
 */
export function catalogFor(connectionId: string, path = modelsCachePath()): ModelOption[] {
  const live = cachedModels(connectionId, path);
  if (live.length > 0) return live;
  try {
    const legacy = cachedModels(parseConnectionId(connectionId).providerId, path);
    if (legacy.length > 0) return legacy;
  } catch {
    /* not a connection id, modelsFor below handles bare ids and unknowns */
  }
  return modelsFor(connectionId);
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

/**
 * The models.dev catalog, reduced to what this app needs: the context window
 * and the input modalities per model, per provider. The provider keys there
 * match this app's provider ids. Rows without a usable limit are skipped.
 */
export function parseModelsDev(raw: unknown): Record<string, Record<string, ModelMeta>> {
  const out: Record<string, Record<string, ModelMeta>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [providerId, provider] of Object.entries(raw as Record<string, unknown>)) {
    const models = (provider as { models?: unknown })?.models;
    if (!models || typeof models !== "object") continue;
    const rows: Record<string, ModelMeta> = {};
    for (const [id, model] of Object.entries(models as Record<string, unknown>)) {
      if (!model || typeof model !== "object") continue;
      const limit = (model as { limit?: { context?: unknown } }).limit;
      const inputs = (model as { modalities?: { input?: unknown } }).modalities?.input;
      const meta: ModelMeta = {};
      if (limit && Number.isInteger(limit.context) && (limit.context as number) > 0) {
        meta.contextTokens = limit.context as number;
      }
      if (Array.isArray(inputs) && inputs.every((item) => typeof item === "string")) {
        meta.inputs = inputs as string[];
      }
      if (meta.contextTokens || meta.inputs) rows[id] = meta;
    }
    if (Object.keys(rows).length > 0) out[providerId] = rows;
  }
  return out;
}

async function fetchModelsDev(fetchImpl: typeof fetch): Promise<Record<string, Record<string, ModelMeta>>> {
  const res = await fetchImpl(MODELS_DEV_URL, {
    headers: { accept: "application/json", "user-agent": "useful-bot/1.0" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return {};
  return parseModelsDev(await res.json());
}

/**
 * Catalog facts for a provider, refreshed from models.dev once a day and
 * kept in the same cache file as the live list. A failed fetch keeps the
 * last copy; no copy at all means the models carry no facts, which the
 * callers treat as unknown rather than as "no".
 */
export async function modelMetaFor(
  providerId: string,
  path = modelsCachePath(),
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, ModelMeta>> {
  const cache = readModelsCache(path);
  const fresh = cache.meta && Date.now() - cache.meta.fetchedAt < META_TTL_MS;
  if (fresh) return cache.meta?.providers[providerId] ?? {};
  try {
    const providers = await fetchModelsDev(fetchImpl);
    if (Object.keys(providers).length === 0) return cache.meta?.providers[providerId] ?? {};
    const latest = readModelsCache(path);
    latest.meta = { fetchedAt: Date.now(), providers };
    writeModelsCache(latest, path);
    return providers[providerId] ?? {};
  } catch {
    return cache.meta?.providers[providerId] ?? {};
  }
}

export async function fetchProviderModelIds(
  baseUrl: string,
  key?: string | null,
  fetchImpl: typeof fetch = fetch,
  keyHeader: KeyHeader = "bearer",
  headers: Record<string, string> = {},
): Promise<string[]> {
  const out: Record<string, string> = {
    accept: "application/json",
    "user-agent": "useful-bot/1.0",
    ...headers,
  };
  if (key) {
    if (keyHeader === "x-api-key") out["x-api-key"] = key;
    else if (keyHeader === "api-key") out["api-key"] = key;
    else out.authorization = `Bearer ${key}`;
  }
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: out,
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return [];
  return parseModelList(await res.json());
}

/**
 * models.dev key for the meta lookup. Prefers an explicit override, then the
 * catalogue modelsDevId for the connection, then the raw id for legacy bare
 * provider calls. Null means models.dev has no entry, so no meta is fetched.
 */
function metaKeyFor(providerId: string, override?: string | null): string | null {
  if (override !== undefined) return override;
  try {
    const parsed = parseConnectionId(providerId);
    return providerMode(parsed.providerId, parsed.mode).modelsDevId;
  } catch {
    return providerId;
  }
}

export async function refreshProviderModels(input: {
  providerId: string;
  baseUrl: string;
  key?: string | null;
  keyHeader?: KeyHeader;
  headers?: Record<string, string>;
  modelsDevId?: string | null;
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
    const ids = await fetchProviderModelIds(input.baseUrl, input.key, input.fetchImpl, input.keyHeader, input.headers);
    if (ids.length === 0) return current?.models?.length ? current.models : modelsFor(input.providerId);
    const metaKey = metaKeyFor(input.providerId, input.modelsDevId);
    const meta = metaKey ? await modelMetaFor(metaKey, path, input.fetchImpl) : {};
    const models = mergeLiveModels(input.providerId, ids, meta);
    // The fetch awaited above can overlap a refresh for a different provider,
    // so the snapshot taken before the await is stale by write time. Re-read
    // the cache and set only this provider's entry, or the write would clobber
    // the models the overlapping refresh just stored.
    const latest = readModelsCache(path);
    latest.providers[input.providerId] = { fetchedAt: Date.now(), models };
    writeModelsCache(latest, path);
    return models;
  } catch {
    return current?.models?.length ? current.models : modelsFor(input.providerId);
  }
}
