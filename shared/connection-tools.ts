import { connectionHeaders } from "./connection-auth.ts";
import {
  connectionIndex,
  indexIsStale,
  indexedToolBytes,
  mountedToolName,
  putConnectionIndex,
  putConnectionOperations,
  type IndexedTool,
} from "./connection-tools-store.ts";
import { readConnectionsStore, type ConnectionEntry } from "./connections-store.ts";
import { listMcpTools, measureOpenApiConnection, modelToolNames } from "./mcp-http.ts";
import type { SpecSize } from "./tool-wire-size.ts";
import { EAGER_TOOL_ALLOWANCE, MOUNTED_TOOL_BUDGET, MOUNTED_TOOL_BYTE_BUDGET } from "./policy.ts";
import { MAX_TOOL_INPUT_SCHEMA_BYTES } from "./mcp-http.ts";

/**
 * Which connections are mounted for every turn, and how a bot finds the tools
 * of the ones that are not.
 *
 * eve owns OpenAPI spec parsing, and those connections are few, so they stay
 * mounted. So does a small MCP server whose own allow-list is short: two
 * tools cost nothing against the budget and making the bot look them up first
 * would put a round trip in front of every drawing. Everything else waits to
 * be asked for by name.
 */

export function isEagerConnection(entry: ConnectionEntry): boolean {
  if (entry.kind === "openapi") return true;
  return entry.toolsAllow !== null && entry.toolsAllow.length <= EAGER_TOOL_ALLOWANCE;
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
 * How many tool schemas one connection puts in front of the model. An
 * allow-list is exact; otherwise the last listing is the best figure there
 * is, and an unlisted server is assumed to be as big as one can get, which is
 * the number the cap has to survive.
 */
/**
 * How big a connection is, or null when nothing has measured it.
 *
 * An eager MCP row carries its own allow-list, so its size is exact. The one
 * unknown is an OpenAPI row whose operations were never counted: a row that
 * predates the count, or one written by a path that skipped it. eve mounts
 * that spec's whole operation list, which can be any size, so guessing a
 * modest figure here would admit it and walk the bot into the wall the
 * budget exists to keep out of reach. `ensureMeasured` fills the gap in.
 */
export function mountedToolCount(entry: ConnectionEntry, path?: string): number | null {
  if (entry.toolsAllow) return entry.toolsAllow.length;
  const index = connectionIndex(entry.id, path);
  if (index?.operations !== undefined) return index.operations;
  if (index && index.tools.length > 0) return index.tools.length;
  return null;
}

/**
 * Count an eager OpenAPI connection nobody has measured, once, and write it
 * down. Called from the turn resolver, so a connection that predates the
 * count is measured on the next turn instead of staying unmountable.
 */
export async function ensureMeasured(entries: ConnectionEntry[], path?: string): Promise<void> {
  for (const entry of entries) {
    // A pinned MCP server nobody has listed is being charged a ceiling. One
    // listing replaces that with what it really weighs, and the listing is
    // what `find_tools` would have fetched anyway.
    if (entry.kind === "mcp") {
      if (connectionIndex(entry.id, path)) continue;
      try {
        await refreshConnectionIndex(entry, path);
      } catch {
        // Unreachable now is not unreachable for good; the ceiling holds.
      }
      continue;
    }
    if (mountedToolCount(entry, path) !== null && mountedToolBytes(entry, path) !== null) continue;
    // A spec that cannot be counted must not be refetched on every turn: an
    // eight-second timeout at each turn boundary, forever, for a row that
    // stays unmounted either way. One attempt per index lifetime is enough;
    // a spec that comes back is picked up on the next one.
    if (!indexIsStale(connectionIndex(entry.id, path))) continue;
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
  }
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
const OPERATION_DESCRIPTION_BYTES = 200;

export function mountedToolBytes(entry: ConnectionEntry, path?: string): number | null {
  const index = connectionIndex(entry.id, path);
  if (entry.kind === "openapi") {
    if (index?.schemaBytes === undefined || index.operations === undefined) return null;
    return index.schemaBytes + index.operations * (76 + OPERATION_DESCRIPTION_BYTES);
  }
  // A pinned server nobody has listed yet is charged the most its allow-list
  // could weigh: a ceiling rather than a guess, and it keeps the connection
  // mountable meanwhile. `ensureMeasured` replaces it with the truth.
  if (!index || index.tools.length === 0) {
    const allowed = entry.toolsAllow?.length;
    if (allowed === undefined) return null;
    return allowed * (76 + 80 + 400 + MAX_TOOL_INPUT_SCHEMA_BYTES);
  }
  const allow = entry.toolsAllow ? new Set(entry.toolsAllow) : null;
  let bytes = 0;
  for (const tool of index.tools) {
    if (allow && !allow.has(tool.name)) continue;
    bytes += indexedToolBytes(tool, entry.id, entry.name);
  }
  return bytes;
}

export type ToolHit = {
  connectionId: string;
  connectionName: string;
  /** `<connectionId>__<toolName>`: what eve mounts and the app parses. */
  name: string;
  tool: string;
  description: string;
};

/**
 * Refresh one connection's listing from the server. Only tools the server
 * shows the model are kept, and an allow-list still applies: a tool the owner
 * did not allow is not one this bot may pick up later either.
 */
export async function refreshConnectionIndex(
  entry: ConnectionEntry,
  storePath?: string,
): Promise<IndexedTool[]> {
  const headers = await connectionHeaders(entry);
  const listed = await listMcpTools(entry.url, headers);
  const visible = new Set(modelToolNames(listed));
  const allow = entry.toolsAllow ? new Set(entry.toolsAllow) : null;
  const tools: IndexedTool[] = listed
    .filter((tool) => visible.has(tool.name) && (!allow || allow.has(tool.name)))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      inputSchemaBytes: tool.inputSchemaBytes,
    }));
  putConnectionIndex(entry.id, tools, storePath);
  return tools;
}

/** The listing, refetched when it is missing or too old to trust. */
export async function ensureConnectionIndex(
  entry: ConnectionEntry,
  storePath?: string,
): Promise<IndexedTool[]> {
  const current = connectionIndex(entry.id, storePath);
  if (!indexIsStale(current)) return current?.tools ?? [];
  try {
    return await refreshConnectionIndex(entry, storePath);
  } catch {
    // A server that is down must not take the search down with it: what was
    // listed last time is still the best answer available.
    return current?.tools ?? [];
  }
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
  // A tool that matched every word beats one that matched most of them.
  const matched = words.filter((word) => name.includes(word) || prose.includes(word)).length;
  if (matched === words.length) score += 5;
  return score;
}

/**
 * The best matches for a query across the connections that are not mounted.
 * Reads each one's cached listing, refreshing a stale one, and never throws
 * for a single server being unreachable.
 */
export async function searchConnectionTools(
  query: string,
  limit: number,
  connectionsPath?: string,
  storePath?: string,
): Promise<ToolHit[]> {
  const entries = onDemandConnections(connectionsPath);
  // Together, not one after another: each refresh is bounded at fifteen
  // seconds, and an owner with several servers that have gone quiet was
  // waiting that long for each of them before the search answered.
  const listings = await Promise.all(
    entries.map(async (entry) => [entry, await ensureConnectionIndex(entry, storePath)] as const),
  );
  const hits: Array<ToolHit & { score: number }> = [];
  for (const [entry, tools] of listings) {
    for (const tool of tools) {
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
  return hits.slice(0, limit).map(({ score: _score, ...hit }) => hit);
}

/** Split a mounted name back into the connection and the tool it names. */
export function splitMountedName(name: string): { connectionId: string; tool: string } | null {
  const at = name.indexOf("__");
  if (at <= 0 || at + 2 >= name.length) return null;
  return { connectionId: name.slice(0, at), tool: name.slice(at + 2) };
}
