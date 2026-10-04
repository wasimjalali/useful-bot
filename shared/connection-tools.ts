import { connectionHeaders, OAuthExpiredError } from "./connection-auth.ts";
import { ConnectionUrlError } from "./connection-url.ts";
import {
  connectionIndex,
  connectionStatus,
  indexIsStale,
  indexedToolBytes,
  isMountableToolName,
  listingIsDue,
  mountedToolName,
  putConnectionDiscovery,
  putConnectionOperations,
  putConnectionStatus,
  type ConnectionState,
  type ConnectionStatus,
  type IndexedTool,
} from "./connection-tools-store.ts";
import { readConnectionsStore, type ConnectionEntry } from "./connections-store.ts";
import { listMcpToolsWithStats, McpError, measureOpenApiConnection, modelToolNames } from "./mcp-http.ts";
import { specWireBytes, type SpecSize } from "./tool-wire-size.ts";
import { MAX_SESSION_TOOL_BYTES, MAX_SESSION_TOOLS, MOUNTED_TOOL_BUDGET, MOUNTED_TOOL_BYTE_BUDGET } from "./policy.ts";

/**
 * Which connections are mounted for every turn, and how a bot finds the tools
 * of the ones that are not.
 *
 * What the budgets are and are not. eve mounts an OpenAPI connection by
 * fetching the spec itself, so what this side measured and what eve puts on
 * the wire are two fetches of the same endpoint and need not agree: that
 * charge is a deliberate over-estimate of a snapshot. A tool taken on demand
 * is built here, from this index, so its charge is exact.
 *
 * Neither is a defence against a server that deliberately answers one thing
 * to a measurement and another to a mount. The owner approved that server on
 * a card; the budgets are here so an honest one cannot walk a bot into a wall
 * that kills the chat.
 *
 * eve owns OpenAPI spec parsing, and those connections are few, so they stay
 * mounted. So does a small MCP server whose own allow-list is short: two
 * tools cost nothing against the budget and making the bot look them up first
 * would put a round trip in front of every drawing. Everything else waits to
 * be asked for by name.
 */

/**
 * Only an OpenAPI connection is mounted for every turn, and only because eve
 * owns spec parsing and there is no other way to reach one.
 *
 * A pinned MCP server used to be mounted too, on the grounds that two tools
 * cost nothing and a bot should not have to look them up before it can draw.
 * There was no honest number to charge it. eve mounts an MCP connection by
 * asking the server itself and passes its names, descriptions and schemas
 * through with no cap, so nothing measured here bounds what goes on the wire:
 * a server pinned to eight tools could put a hundred kilobytes in front of
 * the model and be charged thirty-seven. A tool taken on demand is built
 * here, from this index, so its size is known before it is mounted. That is
 * the whole reason to prefer it, and it applies to two tools as much as two
 * hundred.
 */
export function isEagerConnection(entry: ConnectionEntry): boolean {
  return entry.kind === "openapi";
}

/**
 * The connections mounted for this turn, in the order they were connected,
 * stopping at the budget.
 *
 * The connect-time check is not enough on its own: rows connected before that
 * check existed, or written by any path that does not go through it, would
 * still put a list in front of the model that the router refuses with a
 * non-retryable error. Clamping here means the model never sees one, whatever
 * is in the store. A connection left out is not lost; it comes back as soon
 * as the ones ahead of it are disconnected.
 */
export function eagerConnections(path?: string, storePath?: string): ConnectionEntry[] {
  const all = readConnectionsStore(path).connections.filter(isEagerConnection);
  const out: ConnectionEntry[] = [];
  let tools = 0;
  let bytes = 0;
  for (const entry of all) {
    const count = mountedToolCount(entry, storePath);
    const size = mountedToolBytes(entry, storePath);
    // A size nobody knows is not a small one.
    if (count === null || size === null) continue;
    // Nor is a name nobody has checked a short one.
    if (!specNamesFit(entry.id, connectionIndex(entry.id, storePath)?.longestName)) continue;
    if (tools + count > MOUNTED_TOOL_BUDGET || bytes + size > MOUNTED_TOOL_BYTE_BUDGET) continue;
    tools += count;
    bytes += size;
    out.push(entry);
  }
  return out;
}

export function onDemandConnections(path?: string): ConnectionEntry[] {
  return readConnectionsStore(path).connections.filter((entry) => !isEagerConnection(entry));
}

/**
 * Whether every tool name eve builds from a spec still fits the provider's
 * sixty-four once `<connectionId>__` is in front of it. An unknown length does
 * not fit.
 */
export function specNamesFit(connectionId: string, longestName: number | undefined): boolean {
  return longestName !== undefined && connectionId.length + 2 + longestName <= 64;
}

/**
 * How many tools an OpenAPI connection mounts, or null when nothing has
 * counted it. A row that predates the count, or one written by a path that
 * skipped it, is unknown, and guessing a modest figure would admit it into a
 * wall it can clear. `ensureMeasured` fills the gap in.
 */
export function mountedToolCount(entry: ConnectionEntry, path?: string): number | null {
  return connectionIndex(entry.id, path)?.operations ?? null;
}

/**
 * Measure the OpenAPI connections whose figures are missing or old, and write
 * them down. Called from the turn resolver, so a connection that predates the
 * count is measured on the next turn instead of staying unmountable.
 */
export async function ensureMeasured(entries: ConnectionEntry[], path?: string): Promise<void> {
  const due = entries.filter((entry) => {
    if (entry.kind !== "openapi") return false;
    const index = connectionIndex(entry.id, path);
    // Missing or old: measure it.
    if (indexIsStale(index)) return true;
    // A recent attempt that failed backs off until the index goes stale, or a
    // spec that cannot be read would be refetched at every turn boundary,
    // eight seconds a time, for a row that stays unmounted either way.
    if (index?.failed) return false;
    // Fresh but incomplete, such as an index written before a figure existed:
    // measure it now rather than leave it unmounted for six hours.
    return mountedToolCount(entry, path) === null
      || mountedToolBytes(entry, path) === null
      || index?.longestName === undefined;
  });
  // Together, not one after another. This runs at a turn boundary and holds
  // the first model call of the turn for as long as it takes.
  await Promise.all(due.map(async (entry) => {
    let size: SpecSize | null = null;
    try {
      size = await measureOpenApiConnection(entry.url, await headersFor(entry));
    } catch {
      size = null;
    }
    try {
      putConnectionOperations(entry.id, size, path);
    } catch {
      // The index is a cache; a write that failed costs one fetch later.
    }
  }));
}

/** Never throws: a measurement is not worth failing a turn boundary over. */
async function headersFor(entry: ConnectionEntry): Promise<Record<string, string>> {
  try {
    return await connectionHeaders(entry);
  } catch {
    return {};
  }
}

/**
 * What one connection weighs on the wire, or null when nothing has measured
 * it. For an MCP server that is its listing, each tool weighed the way the
 * router weighs it. For an OpenAPI spec it is the argument-schema bytes eve
 * builds from that spec, resolved and written down when it was counted, plus
 * a function envelope and a description an operation for each.
 */
export function mountedToolBytes(entry: ConnectionEntry, path?: string): number | null {
  const index = connectionIndex(entry.id, path);
  if (index?.schemaBytes === undefined || index.operations === undefined) return null;
  // An index written before the operation text was measured has no figure
  // for it, and a missing figure is not a zero.
  if (index.textBytes === undefined) return null;
  return specWireBytes({
    operations: index.operations,
    schemaBytes: index.schemaBytes,
    textBytes: index.textBytes,
  });
}

export type ToolHit = {
  connectionId: string;
  connectionName: string;
  /** `<connectionId>__<toolName>`: what eve mounts and the app parses. */
  name: string;
  tool: string;
  description: string;
};

let discoveryLog: (line: string) => void = (line) => console.warn(line);

/** Where the one-line discovery outcome goes. Tests capture it. */
export function setDiscoveryLogger(next: ((line: string) => void) | null): void {
  discoveryLog = next ?? ((line) => console.warn(line));
}

type Failure = { state: ConnectionState; code: string; message: string };

/**
 * Why a listing failed, in words this app wrote. Nothing from the server's own
 * answer or from a header goes in: a server can echo the credential it was
 * sent, and a stored status is read by the app and, through find_tools, the
 * model.
 */
export function classifyDiscoveryError(err: unknown): Failure {
  if (err instanceof OAuthExpiredError) {
    return { state: "expired", code: "oauth_expired", message: "The sign-in expired. Reconnect to continue." };
  }
  if (err instanceof McpError) {
    if (err.kind === "auth") {
      return { state: "auth_failed", code: `http_${err.status ?? 401}`, message: "The server refused the credential." };
    }
    if (err.kind === "unreachable") {
      return { state: "unreachable", code: err.status ? `http_${err.status}` : "network", message: "The server could not be reached." };
    }
    if (err.kind === "parse") {
      return { state: "discovery_failed", code: "parse", message: "The server's answer was not JSON-RPC." };
    }
    return {
      state: "discovery_failed",
      code: err.status ? `http_${err.status}` : "protocol",
      message: err.message === "mcp_unsupported_version"
        ? "The server speaks a protocol version this app does not."
        : "The server did not answer like an MCP server.",
    };
  }
  if (err instanceof ConnectionUrlError) {
    return err.message === "url_resolve"
      ? { state: "unreachable", code: "dns", message: "The server's address could not be resolved." }
      : { state: "discovery_failed", code: err.message, message: "The server's address is not one this app will call." };
  }
  if (err instanceof Error && err.message.startsWith("connection_secret_missing")) {
    return { state: "auth_failed", code: "credential_missing", message: "The saved credential is missing." };
  }
  return { state: "discovery_failed", code: "unknown", message: "Listing the tools failed." };
}

function logOutcome(entry: ConnectionEntry, status: ConnectionStatus): void {
  discoveryLog(
    `[useful-bot] connection ${entry.id} discovery ${status.state}`
      + `${status.lastError ? ` (${status.lastError.code})` : ""}`
      + ` tools=${status.toolCount ?? "-"}${status.dropped ? ` dropped=${status.dropped}` : ""}`,
  );
}

export type Discovery = { status: ConnectionStatus; tools: IndexedTool[] };

/**
 * Ask a connection what it offers, and write down what came of it: the
 * listing for `find_tools` to search and a status that says why when there is
 * none. The one place a listing is attempted for an MCP server (the connect
 * flow, a search past its TTL and the Connectors page all come through here),
 * and it never throws, so a server that is down cannot take a caller with it.
 *
 * Only tools the server shows the model are kept, and an allow-list still
 * applies: a tool the owner did not allow is not one a bot may pick up later.
 * `headers` is for a caller that holds the credential already, such as a
 * connect whose row has not been read back.
 */
export async function discoverConnection(
  entry: ConnectionEntry,
  opts: { headers?: Record<string, string>; storePath?: string } = {},
): Promise<Discovery> {
  const checkedAt = new Date().toISOString();
  const store = opts.storePath;
  const done = (status: ConnectionStatus, tools: IndexedTool[] | null): Discovery => {
    try {
      putConnectionDiscovery(entry.id, { tools, status }, store);
    } catch {
      // The index is a cache; a write that failed costs one listing later.
    }
    logOutcome(entry, status);
    return { status, tools: tools ?? connectionIndex(entry.id, store)?.tools ?? [] };
  };
  if (entry.kind === "openapi") {
    let size = null;
    try {
      size = await measureOpenApiConnection(entry.url, opts.headers ?? await connectionHeaders(entry));
    } catch {
      size = null;
    }
    try { putConnectionOperations(entry.id, size, store); } catch { /* a cache */ }
    const status: ConnectionStatus = size === null
      ? {
        state: "discovery_failed",
        lastError: { code: "spec_unreadable", message: "The API description could not be read." },
        checkedAt,
        toolCount: null,
      }
      : { state: size.operations > 0 ? "ready" : "zero_tools", lastError: null, checkedAt, toolCount: size.operations };
    try { putConnectionStatus(entry.id, status, store); } catch { /* a cache */ }
    logOutcome(entry, status);
    return { status, tools: [] };
  }
  try {
    const headers = opts.headers ?? await connectionHeaders(entry);
    const listed = await listMcpToolsWithStats(entry.url, headers);
    // Screened before it is kept or returned, not only when the store is next
    // read: a name the upstream would refuse was handed to the model as
    // callable, activated, and then silently never mounted.
    const valid = listed.tools.filter((tool) => isMountableToolName(entry.id, tool.name));
    const dropped = listed.dropped + (listed.tools.length - valid.length);
    if (listed.total > 0 && valid.length === 0) {
      return done({
        state: "malformed",
        lastError: { code: "all_tools_invalid", message: `The server listed ${listed.total} tools and none could be used.` },
        checkedAt,
        toolCount: 0,
        dropped,
      }, []);
    }
    const visible = new Set(modelToolNames(valid));
    const allow = entry.toolsAllow ? new Set(entry.toolsAllow) : null;
    const tools: IndexedTool[] = valid
      .filter((tool) => visible.has(tool.name) && (!allow || allow.has(tool.name)))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        inputSchemaBytes: tool.inputSchemaBytes,
      }));
    return done({
      state: tools.length > 0 ? "ready" : "zero_tools",
      lastError: null,
      checkedAt,
      toolCount: tools.length,
      ...(dropped ? { dropped } : {}),
    }, tools);
  } catch (err) {
    const failure = classifyDiscoveryError(err);
    // A server that went quiet keeps the listing it gave last time. One that
    // answered and refused, or answered nonsense, does not: that listing is
    // no longer something it will honour.
    return done({
      state: failure.state,
      lastError: { code: failure.code, message: failure.message },
      checkedAt,
      toolCount: null,
    }, failure.state === "unreachable" ? null : []);
  }
}

/**
 * The listing, refetched when it is missing, too old to trust, or when the
 * last attempt did not work and enough time has passed to try again. The
 * status comes back with it so a search can say why a server has nothing.
 */
export async function ensureConnectionListing(
  entry: ConnectionEntry,
  storePath?: string,
): Promise<Discovery> {
  const current = connectionIndex(entry.id, storePath);
  const status = connectionStatus(entry.id, storePath);
  if (!listingIsDue(current, status)) {
    return {
      tools: current?.tools ?? [],
      status: status ?? {
        state: current && current.tools.length > 0 ? "ready" : "zero_tools",
        lastError: null,
        checkedAt: current?.fetchedAt ?? new Date(0).toISOString(),
        toolCount: current?.tools.length ?? null,
      },
    };
  }
  return discoverConnection(entry, { storePath });
}

/** The listing, refetched when it is due. */
export async function ensureConnectionIndex(
  entry: ConnectionEntry,
  storePath?: string,
): Promise<IndexedTool[]> {
  return (await ensureConnectionListing(entry, storePath)).tools;
}

/**
 * Word overlap between a query and a tool's name and description. Whole-word
 * matches in the name count most: a query of "send email" should put
 * `send_email` above a tool that merely mentions email in its prose.
 */
export function scoreTool(query: string, tool: IndexedTool, connectionName: string): number {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
  if (words.length === 0) return 0;
  const name = tool.name.toLowerCase();
  const nameWords = new Set(name.split(/[^a-z0-9]+/).filter(Boolean));
  const prose = `${tool.description} ${connectionName}`.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (nameWords.has(word)) score += 10;
    else if (name.includes(word)) score += 6;
    if (prose.includes(word)) score += 2;
  }
  // A query that names the server ("tella", "send a slack message") is asking
  // for that server's tools, whatever else the words matched elsewhere.
  const serverWords = connectionName.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
  if (serverWords.some((word) => words.includes(word))) score += 20;
  // A tool that matched every word beats one that matched most of them.
  const matched = words.filter((word) => name.includes(word) || prose.includes(word)).length;
  if (matched === words.length) score += 5;
  return score;
}

/** A connected server a search could not use, and why. */
export type UnavailableServer = {
  connectionId: string;
  server: string;
  state: ConnectionState;
  hint: string;
};

function oneLineName(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);
}

/** What a bot should do about a server in this state, in words this app wrote. */
function unavailableHint(state: ConnectionState, name: string): string {
  switch (state) {
    case "auth_failed":
    case "expired":
      return `Ask the owner to reconnect ${name} in Connectors.`;
    case "unreachable":
      return `${name} could not be reached. Try again in a couple of minutes.`;
    case "malformed":
      return `${name} answered, but none of its tools could be used. Tell the owner.`;
    case "pending":
      return `${name} is still being set up. Try again shortly.`;
    default:
      return `${name} did not answer like an MCP server. Ask the owner to check it in Connectors.`;
  }
}

/**
 * The best matches for a query across the connections that are not mounted,
 * and the servers that could not be searched. Reads each one's cached
 * listing, refreshing one that is due, and never throws for a single server
 * being unreachable.
 */
export async function findConnectionTools(
  query: string,
  limit: number,
  connectionsPath?: string,
  storePath?: string,
): Promise<{ hits: ToolHit[]; unavailable: UnavailableServer[] }> {
  const entries = onDemandConnections(connectionsPath);
  // Together, not one after another: each refresh is bounded at fifteen
  // seconds, and an owner with several servers that have gone quiet was
  // waiting that long for each of them before the search answered.
  const listings = await Promise.all(
    entries.map(async (entry) => [entry, await ensureConnectionListing(entry, storePath)] as const),
  );
  const hits: Array<ToolHit & { score: number }> = [];
  const unavailable: UnavailableServer[] = [];
  for (const [entry, { tools, status }] of listings) {
    const working = status.state === "ready" || status.state === "zero_tools";
    // A server that merely went quiet still has the listing from last time.
    const stale = status.state === "unreachable" && tools.length > 0;
    if (!working && !stale) {
      unavailable.push({
        connectionId: entry.id,
        server: oneLineName(entry.name),
        state: status.state,
        hint: unavailableHint(status.state, oneLineName(entry.name)),
      });
      continue;
    }
    // The listing can be hours old; an allow-list the owner narrowed since
    // applies now, or the tool is found, charged and then never mounted.
    const allow = entry.toolsAllow ? new Set(entry.toolsAllow) : null;
    for (const tool of tools) {
      if (allow && !allow.has(tool.name)) continue;
      const score = scoreTool(query, tool, entry.name);
      if (score <= 0) continue;
      hits.push({
        score,
        connectionId: entry.id,
        connectionName: entry.name,
        name: mountedToolName(entry.id, tool.name),
        tool: tool.name,
        description: tool.description,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { hits: hits.slice(0, limit).map(({ score: _score, ...hit }) => hit), unavailable };
}

export async function searchConnectionTools(
  query: string,
  limit: number,
  connectionsPath?: string,
  storePath?: string,
): Promise<ToolHit[]> {
  return (await findConnectionTools(query, limit, connectionsPath, storePath)).hits;
}

/** Split a mounted name back into the connection and the tool it names. */
export function splitMountedName(name: string): { connectionId: string; tool: string } | null {
  const at = name.indexOf("__");
  if (at <= 0 || at + 2 >= name.length) return null;
  return { connectionId: name.slice(0, at), tool: name.slice(at + 2) };
}

export type MountedPick = {
  split: { connectionId: string; tool: string };
  entry: ConnectionEntry;
  indexed: IndexedTool;
  /** What the tool is charged, the way it is mounted. */
  weight: number;
};

/**
 * Which of a session's picked-up tools actually mount, in the order the
 * session took them. The one selection the resolver mounts with
 * (agent/tools/connection_tools.ts) and admission weighs
 * (web/lib/agent-exec.ts `mountedToolChars`): MCP connections only, inside the
 * owner's allow-list as it is now, with an indexed listing, and clamped by the
 * cumulative count (MAX_SESSION_TOOLS) and byte (MAX_SESSION_TOOL_BYTES)
 * limits. A tool that would not mount is skipped, and so is not charged.
 */
export function selectMountedTools(
  names: Iterable<string>,
  lookup: {
    connection: (connectionId: string) => ConnectionEntry | null | undefined;
    indexed: (connectionId: string, tool: string) => IndexedTool | undefined;
  },
): MountedPick[] {
  const picks: MountedPick[] = [];
  let bytes = 0;
  for (const name of names) {
    const split = splitMountedName(name);
    if (!split) continue;
    const entry = lookup.connection(split.connectionId);
    if (!entry || entry.kind !== "mcp") continue;
    // The owner can narrow a server's allow-list after a session picked a tool up.
    if (entry.toolsAllow && !entry.toolsAllow.includes(split.tool)) continue;
    const indexed = lookup.indexed(split.connectionId, split.tool);
    if (!indexed) continue;
    const weight = indexedToolBytes(indexed, entry.id, entry.name);
    if (picks.length + 1 > MAX_SESSION_TOOLS || bytes + weight > MAX_SESSION_TOOL_BYTES) continue;
    bytes += weight;
    picks.push({ split, entry, indexed, weight });
  }
  return picks;
}
