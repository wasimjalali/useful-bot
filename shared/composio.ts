import { Composio } from "@composio/core";
import {
  connectorsPath,
  isToolkitSlug,
  readConnectorsStore,
  setConnectedToolkits,
  updateConnectorsStore,
  type ConnectorsStore,
} from "./connectors-store.ts";

/**
 * The one place that talks to the Composio SDK. The web route and the agent
 * tools call these functions; nothing else imports @composio/core.
 *
 * One Tool Router session per store. Its id is persisted so every process
 * reuses it; a session Composio no longer knows (deleted, expired, new key)
 * is replaced and the new id written back. The session is created without a
 * toolkit filter so the catalogue listing stays complete; the agent tools
 * restrict themselves to the connected toolkits instead.
 */

export interface ConnectorToolkit {
  slug: string;
  name: string;
  logo: string | null;
  noAuth: boolean;
  connected: boolean;
  accountId: string | null;
  status: string | null;
}

export interface ConnectorSearchHit {
  toolkit: string;
  tool: string;
  description: string;
  inputSchema: Record<string, unknown> | null;
}

export interface ConnectorSearchResult {
  tools: ConnectorSearchHit[];
  guidance: string[];
  notConnected: string[];
}

/** The slice of a Composio session this module uses. Tests stub it. */
export interface ComposioSessionLike {
  sessionId: string;
  authorize(
    toolkit: string,
    options?: { callbackUrl?: string },
  ): Promise<{ id: string; redirectUrl?: string | null }>;
  toolkits(options?: { search?: string; limit?: number; cursor?: string; isConnected?: boolean }): Promise<{
    items: Array<{
      slug: string;
      name: string;
      isNoAuth: boolean;
      logo?: string | undefined;
      connection?: {
        isActive: boolean;
        connectedAccount?: { status: string; id: string } | undefined;
      } | undefined;
    }>;
    cursor: string | undefined;
  }>;
  search(params: { query: string; toolkits?: string[] }): Promise<unknown>;
  execute(toolSlug: string, args?: Record<string, unknown>): Promise<unknown>;
}

export interface ComposioLike {
  sessions: {
    create(userId: string, config: Record<string, unknown>): Promise<ComposioSessionLike>;
    use(id: string): Promise<ComposioSessionLike>;
  };
  connectedAccounts: {
    list(query: { userIds: string[]; limit?: number }): Promise<{
      items: Array<{ id: string; toolkit?: { slug: string } }>;
    }>;
    delete(id: string): Promise<unknown>;
  };
}

export type ComposioFactory = (apiKey: string) => ComposioLike;

const DEFAULT_FACTORY: ComposioFactory = (apiKey) =>
  new Composio({ apiKey, allowTracking: false }) as unknown as ComposioLike;

let factory: ComposioFactory = DEFAULT_FACTORY;
let cached: { apiKey: string; sessionId: string; session: ComposioSessionLike } | null = null;

/** Tests swap the SDK for a stub. Passing nothing restores the real one. */
export function setComposioFactory(next: ComposioFactory | null): void {
  factory = next ?? DEFAULT_FACTORY;
  cached = null;
}

export const SESSION_CONFIG = {
  manageConnections: { enable: false },
  sandbox: { enable: false },
} as const;

/**
 * The connected toolkit a tool slug belongs to, or null. Toolkit slugs can
 * carry underscores (microsoft_teams), so the match is longest-first and on a
 * whole segment: GMAIL_SEND_EMAIL -> gmail, MICROSOFT_TEAMS_SEND -> microsoft_teams,
 * and a slug that merely starts with the letters of a toolkit matches nothing.
 */
export function toolkitOf(toolSlug: string, known: readonly string[]): string | null {
  const slug = toolSlug.trim().toLowerCase();
  for (const toolkit of [...known].sort((a, b) => b.length - a.length)) {
    if (slug === toolkit || slug.startsWith(`${toolkit}_`)) return toolkit;
  }
  return null;
}

/** Composio answered 401: the stored key is not one it knows. */
export function isKeyRejected(err: unknown): boolean {
  const rec = err as { statusCode?: unknown; status?: unknown } | null;
  return Boolean(rec && typeof rec === "object" && (rec.statusCode === 401 || rec.status === 401));
}

function requireKey(store: ConnectorsStore): string {
  if (!store.apiKey) throw new Error("connectors_no_key");
  return store.apiKey;
}

/** A session Composio does not know any more: deleted, expired, or never ours. */
export function isSessionGone(err: unknown): boolean {
  const rec = err as { statusCode?: unknown; status?: unknown; code?: unknown } | null;
  if (!rec || typeof rec !== "object") return false;
  return rec.statusCode === 404 || rec.statusCode === 410 || rec.status === 404 || rec.status === 410 ||
    rec.code === "NOT_FOUND";
}

async function createSession(client: ComposioLike, store: ConnectorsStore, path: string): Promise<ComposioSessionLike> {
  const session = await client.sessions.create(store.userId, { ...SESSION_CONFIG });
  updateConnectorsStore((scratch) => {
    // Only pin the id if the key is still the one it was created under.
    if (scratch.apiKey === store.apiKey) scratch.sessionId = session.sessionId;
  }, path);
  return session;
}

/** The store's session, resumed or created. */
export async function connectorsSession(path = connectorsPath()): Promise<ComposioSessionLike> {
  const store = readConnectorsStore(path);
  const apiKey = requireKey(store);
  if (cached && cached.apiKey === apiKey && cached.sessionId === store.sessionId) return cached.session;
  const client = factory(apiKey);
  let session: ComposioSessionLike;
  if (store.sessionId) {
    try {
      session = await client.sessions.use(store.sessionId);
    } catch (err) {
      if (!isSessionGone(err)) throw err;
      session = await createSession(client, store, path);
    }
  } else {
    session = await createSession(client, store, path);
  }
  cached = { apiKey, sessionId: session.sessionId, session };
  return session;
}

/**
 * Runs one operation on the session. A session that died after it was cached
 * (Composio expired it, the owner deleted it in the dashboard) is dropped and
 * recreated once, then the operation is retried on the new one.
 */
async function withSession<T>(
  path: string,
  op: (session: ComposioSessionLike) => Promise<T>,
  retry = true,
): Promise<T> {
  const session = await connectorsSession(path);
  try {
    return await op(session);
  } catch (err) {
    if (!isSessionGone(err)) throw err;
    cached = null;
    updateConnectorsStore((scratch) => {
      if (scratch.sessionId === session.sessionId) scratch.sessionId = null;
    }, path);
    if (!retry) throw new Error("session_expired");
    return op(await connectorsSession(path));
  }
}

/**
 * Catalogue rows for the dialog. Connected rows come first. Also refreshes the
 * store's connected cache from the connected page Composio returned, so the
 * agent tools see a disconnect made from Composio's own dashboard on the next
 * listing. The cache is written only from that page, never from a search.
 */
export async function listConnectorToolkits(
  options: { search?: string; limit?: number } = {},
  path = connectorsPath(),
): Promise<ConnectorToolkit[]> {
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const search = options.search?.trim() || undefined;
  return withSession(path, async (session) => {
    const rows = new Map<string, ConnectorToolkit>();
    const connected = await session.toolkits({ isConnected: true, limit: 100 });
    for (const item of connected.items) rows.set(item.slug, toRow(item));
    const connectedSlugs = [...rows.values()].filter((row) => row.connected).map((row) => row.slug);
    updateConnectorsStore((store) => setConnectedToolkits(store, connectedSlugs), path);
    if (search || rows.size < limit) {
      const page = await session.toolkits({ search, limit });
      for (const item of page.items) if (!rows.has(item.slug)) rows.set(item.slug, toRow(item));
    }
    const list = [...rows.values()].filter((row) => !search || matches(row, search));
    list.sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
    return list.slice(0, limit);
  });
}

function matches(row: ConnectorToolkit, search: string): boolean {
  const needle = search.toLowerCase();
  return row.slug.includes(needle) || row.name.toLowerCase().includes(needle);
}

function toRow(item: Awaited<ReturnType<ComposioSessionLike["toolkits"]>>["items"][number]): ConnectorToolkit {
  const account = item.connection?.connectedAccount;
  const connected = item.connection?.isActive === true && account?.status === "ACTIVE";
  return {
    slug: item.slug,
    name: item.name,
    logo: item.logo ?? null,
    noAuth: item.isNoAuth,
    connected,
    accountId: account?.id ?? null,
    status: account?.status ?? null,
  };
}

/** Starts the hosted OAuth flow. The URL goes to the browser, never the model. */
export async function authorizeConnector(
  toolkit: string,
  callbackUrl: string,
  path = connectorsPath(),
): Promise<{ redirectUrl: string; accountId: string }> {
  if (!isToolkitSlug(toolkit)) throw new Error("toolkit_invalid");
  return withSession(path, async (session) => {
    const request = await session.authorize(toolkit, { callbackUrl });
    if (!request.redirectUrl) throw new Error("authorize_no_redirect");
    return { redirectUrl: request.redirectUrl, accountId: request.id };
  });
}

/**
 * Revokes one connected account. Ownership is proven by listing this store's
 * user's accounts and finding the id there; an id that is not in that list
 * is refused, whatever Composio would say about it.
 */
export async function disconnectConnector(accountId: string, path = connectorsPath()): Promise<void> {
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(accountId)) throw new Error("account_invalid");
  const store = readConnectorsStore(path);
  const client = factory(requireKey(store));
  const mine = await client.connectedAccounts.list({ userIds: [store.userId], limit: 100 });
  const account = mine.items.find((item) => item.id === accountId);
  if (!account) throw new Error("account_foreign");
  await client.connectedAccounts.delete(accountId);
  cached = null;
  const slug = account.toolkit?.slug;
  if (slug) {
    updateConnectorsStore((scratch) => {
      setConnectedToolkits(scratch, scratch.connectedToolkits.filter((item) => item !== slug));
    }, path);
  }
}

/** Search restricted to the connected toolkits, trimmed for the model. */
export async function searchConnectorTools(
  useCase: string,
  path = connectorsPath(),
): Promise<ConnectorSearchResult> {
  const store = readConnectorsStore(path);
  if (store.connectedToolkits.length === 0) throw new Error("no_connectors");
  const raw = (await withSession(path, (session) =>
    session.search({ query: useCase, toolkits: store.connectedToolkits }),
  )) as {
    results?: Array<{ primaryToolSlugs?: string[]; relatedToolSlugs?: string[]; executionGuidance?: string; knownPitfalls?: string[] }>;
    toolSchemas?: Record<string, { toolkit: string; toolSlug: string; description?: string; inputSchema?: Record<string, unknown> }>;
    toolkits?: Array<{ toolkit: string; hasActiveConnection: boolean }>;
  };
  const wanted = new Set<string>();
  const guidance: string[] = [];
  for (const result of raw.results ?? []) {
    for (const slug of result.primaryToolSlugs ?? []) wanted.add(slug);
    for (const slug of result.relatedToolSlugs ?? []) wanted.add(slug);
    if (result.executionGuidance) guidance.push(result.executionGuidance);
    for (const pitfall of result.knownPitfalls ?? []) guidance.push(pitfall);
  }
  const tools: ConnectorSearchHit[] = [];
  const allowed = new Set(store.connectedToolkits);
  for (const [slug, schema] of Object.entries(raw.toolSchemas ?? {})) {
    if (!wanted.has(slug) && wanted.size > 0) continue;
    if (!allowed.has(schema.toolkit.toLowerCase())) continue;
    tools.push({
      toolkit: schema.toolkit.toLowerCase(),
      tool: schema.toolSlug,
      description: schema.description ?? "",
      inputSchema: schema.inputSchema ?? null,
    });
  }
  const notConnected = (raw.toolkits ?? [])
    .filter((item) => !item.hasActiveConnection)
    .map((item) => item.toolkit.toLowerCase());
  return { tools, guidance: guidance.slice(0, 8), notConnected };
}

/** Executes one tool. The caller has already decided the approval question. */
export async function executeConnectorTool(
  toolSlug: string,
  args: Record<string, unknown>,
  path = connectorsPath(),
): Promise<unknown> {
  const store = readConnectorsStore(path);
  if (store.connectedToolkits.length === 0) throw new Error("no_connectors");
  const toolkit = toolkitOf(toolSlug, store.connectedToolkits);
  if (!toolkit) {
    const err = new Error("not_connected") as Error & { toolkit: string };
    err.toolkit = toolSlug.split("_")[0]?.toLowerCase() ?? "unknown";
    throw err;
  }
  // Never replay an execute: a write that the owner approved once must not
  // run twice on a recreated session. The caller sees session_expired and the
  // model asks again, which mints a fresh card.
  return withSession(path, (session) => session.execute(toolSlug, args), false);
}
