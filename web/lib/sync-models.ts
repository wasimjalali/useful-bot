import { refreshProviderModels } from "../../shared/live-models.ts";
import { providerMode, type ProviderMode } from "../../shared/provider-catalog.ts";
import { accessTokenFor } from "../../shared/provider-oauth.ts";
import type { ProviderStore } from "../../shared/providers.ts";

function substituteFields(baseUrl: string, fields: Record<string, string>): string {
  return baseUrl.replace(/\{(\w+)\}/g, (_, name: string) => fields[name] ?? "");
}

/** Refreshes already running, so a poll that lands mid-fetch joins it instead of starting another. */
const inFlight = new Map<string, Promise<unknown>>();

async function refreshOne(store: ProviderStore, id: string, force: boolean): Promise<unknown> {
  const env = process.env;
  const conn = store.connections[id] ?? null;
  let mode: ProviderMode;
  let baseUrl: string;
  let key: string | null = null;
  let headers: Record<string, string>;
  if (conn) {
    mode = providerMode(conn.providerId, conn.mode);
    if (!mode.listsModels) return;
    if (conn.credential.kind === "none" && conn.mode !== "local") return;
    baseUrl = substituteFields(mode.baseUrl, conn.fields);
    if (conn.providerId === "opencode-go" && env.UB_OPENCODE_GO_BASE) baseUrl = env.UB_OPENCODE_GO_BASE;
    headers = { ...(mode.headers ?? {}) };
    if (conn.credential.kind === "key") {
      key = conn.credential.key;
    } else if (conn.credential.kind === "oauth") {
      const auth = accessTokenFor(conn.providerId, conn.credential);
      key = auth.token;
      headers = { ...headers, ...auth.headers };
    }
  } else if (id === "opencode-go:plan") {
    // The implicit env connection for the Go plan.
    mode = providerMode("opencode-go", "plan");
    if (!mode.listsModels) return;
    key = env.UB_OPENCODE_GO_KEY ?? null;
    baseUrl = env.UB_OPENCODE_GO_BASE || mode.baseUrl;
    headers = { ...(mode.headers ?? {}) };
  } else {
    return;
  }
  const running = inFlight.get(id);
  if (running && !force) return running;
  const job = refreshProviderModels({
    providerId: id,
    baseUrl,
    key,
    keyHeader: mode.keyHeader,
    headers,
    query: mode.modelsQuery,
    force,
  }).finally(() => {
    if (inFlight.get(id) === job) inFlight.delete(id);
  });
  inFlight.set(id, job);
  return job;
}

/**
 * Refresh the model list of every connected provider, keyed by connection id
 * so plan and api lists never collide. Only refreshing the active connection
 * left every other connected provider on its two-model static fallback, so a
 * ChatGPT sign in next to an active Go plan never showed its real lineup.
 *
 * The active connection (and `alsoAwait`, a connection just signed in) is
 * awaited, and forced when `force` is set, so the response carries its list.
 * The rest refresh in the background on the 30 minute cache TTL and show up
 * on the next poll, which keeps a slow or offline provider from holding up
 * the response.
 */
export async function syncProviderModels(
  store: ProviderStore,
  opts: { force?: boolean; alsoAwait?: string } = {},
): Promise<void> {
  const env = process.env;
  const ids = new Set(Object.keys(store.connections));
  const implicitGo = !store.connections["opencode-go:plan"] && Boolean(env.UB_OPENCODE_GO_KEY);
  if (implicitGo) ids.add("opencode-go:plan");
  const activeId = store.activeConnectionId ?? (implicitGo ? "opencode-go:plan" : null);
  const awaited = new Set([activeId, opts.alsoAwait].filter((id): id is string => Boolean(id)));
  const waits: Promise<unknown>[] = [];
  for (const id of ids) {
    if (awaited.has(id)) waits.push(refreshOne(store, id, Boolean(opts.force)));
    else void refreshOne(store, id, false).catch((err) => console.error(`[models] refresh ${id} failed`, err));
  }
  await Promise.all(waits);
}
