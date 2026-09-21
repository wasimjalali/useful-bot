import { connectionHeaders } from "./connection-auth.ts";
import {
  connectionIndex,
  indexIsStale,
  mountedToolName,
  putConnectionIndex,
  type IndexedTool,
} from "./connection-tools-store.ts";
import { readConnectionsStore, type ConnectionEntry } from "./connections-store.ts";
import { listMcpTools, modelToolNames } from "./mcp-http.ts";
import { EAGER_TOOL_ALLOWANCE, MOUNTED_TOOL_BUDGET, MOUNTED_TOOL_BYTE_BUDGET } from "./policy.ts";

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
 * What a row nobody has measured is assumed to be worth. Modest on purpose:
 * this figure is only used by the clamp, which is a backstop, and assuming
 * the worst there would unmount a connection that has been working for weeks
 * just because nothing had written its size down yet. The connect-time check
 * is where an unknown size fails closed.
 */
const UNMEASURED_TOOLS = 20;

export function mountedToolCount(entry: ConnectionEntry, path?: string): number {
  if (entry.toolsAllow) return entry.toolsAllow.length;
  const index = connectionIndex(entry.id, path);
  if (index?.operations !== undefined) return index.operations;
  if (index && index.tools.length > 0) return index.tools.length;
  return UNMEASURED_TOOLS;
}

/**
 * How many bytes of argument schema one connection puts in front of the
 * model, as far as this side can see. eve generates an OpenAPI connection's
 * schemas from the spec and never hands them back, so those are counted at a
 * flat rate rather than pretended to be zero.
 */
const UNSEEN_SCHEMA_BYTES = 400;

export function mountedToolBytes(entry: ConnectionEntry, path?: string): number {
  const index = connectionIndex(entry.id, path);
  if (!index || index.tools.length === 0) return mountedToolCount(entry, path) * UNSEEN_SCHEMA_BYTES;
  const allow = entry.toolsAllow ? new Set(entry.toolsAllow) : null;
  let bytes = 0;
  for (const tool of index.tools) {
    if (allow && !allow.has(tool.name)) continue;
    bytes += tool.inputSchema
      ? JSON.stringify(tool.inputSchema).length
      : UNSEEN_SCHEMA_BYTES;
    bytes += tool.name.length + tool.description.length;
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
  const hits: Array<ToolHit & { score: number }> = [];
  for (const entry of entries) {
    const tools = await ensureConnectionIndex(entry, storePath);
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
