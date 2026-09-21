import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { MAX_SESSION_TOOLS } from "./policy.ts";

/**
 * Which of a connection's tools a session has asked for, and what each
 * connection's tools are.
 *
 * An MCP server's whole tool set no longer sits in context on every turn:
 * `find_tools` looks through this index and records what it handed over, and
 * the step resolver mounts those. eve can replay a resolver in a fresh
 * process on recovery, so the record has to survive the process, which an
 * in-memory map would not.
 *
 * Same write rules as the other stores here: 0600, atomic rename, locked
 * merge. Nothing in it is a secret: tool names, descriptions and argument
 * schemas, all of them things the model already sees.
 */

export type IndexedTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> | null;
};

export type ConnectionIndex = {
  fetchedAt: string;
  tools: IndexedTool[];
};

export type SessionTools = {
  updatedAt: string;
  /** `<connectionId>__<toolName>`, the name eve mounts and the app parses. */
  tools: string[];
};

export type ConnectionToolsStore = {
  schemaVersion: 1;
  index: Record<string, ConnectionIndex>;
  sessions: Record<string, SessionTools>;
};

const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 2000;
const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(4));
/** A listing older than this is refetched the next time a search needs it. */
export const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
/** Sessions kept. The oldest go first; a dropped one just re-asks. */
const MAX_SESSIONS = 100;
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,80}$/;

function sleep(ms: number): void {
  try {
    Atomics.wait(SLEEP_SIGNAL, 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      /* fallback for runtimes without Atomics.wait */
    }
  }
}

export function connectionToolsPath(root = process.env.UB_CONNECTION_TOOLS_PATH): string {
  if (root) return root;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/connection-tools.json");
}

/** The name eve mounts a connection's tool under, and the app parses back. */
export function mountedToolName(connectionId: string, toolName: string): string {
  return `${connectionId}__${toolName}`;
}

export function emptyConnectionToolsStore(): ConnectionToolsStore {
  return { schemaVersion: 1, index: {}, sessions: {} };
}

function parseTool(raw: unknown): IndexedTool | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.name !== "string" || !TOOL_NAME.test(rec.name)) return null;
  const schema = rec.inputSchema && typeof rec.inputSchema === "object" && !Array.isArray(rec.inputSchema)
    ? rec.inputSchema as Record<string, unknown>
    : null;
  return {
    name: rec.name,
    description: typeof rec.description === "string" ? rec.description.slice(0, 400) : "",
    inputSchema: schema,
  };
}

export function parseConnectionToolsStore(raw: unknown): ConnectionToolsStore {
  if (!raw || typeof raw !== "object") throw new Error("connection_tools_format");
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== 1) throw new Error("connection_tools_schema");
  const store = emptyConnectionToolsStore();
  const index = rec.index && typeof rec.index === "object" ? rec.index as Record<string, unknown> : {};
  for (const [id, value] of Object.entries(index)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const tools = (Array.isArray(row.tools) ? row.tools : [])
      .map(parseTool)
      .filter((tool): tool is IndexedTool => tool !== null)
      .slice(0, 200);
    store.index[id] = {
      fetchedAt: typeof row.fetchedAt === "string" ? row.fetchedAt : new Date(0).toISOString(),
      tools,
    };
  }
  const sessions = rec.sessions && typeof rec.sessions === "object"
    ? rec.sessions as Record<string, unknown>
    : {};
  for (const [id, value] of Object.entries(sessions)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const tools = (Array.isArray(row.tools) ? row.tools : [])
      .filter((name): name is string => typeof name === "string" && name.length <= 165 && name.includes("__"))
      .slice(0, MAX_SESSION_TOOLS);
    store.sessions[id] = {
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date(0).toISOString(),
      tools: [...new Set(tools)],
    };
  }
  return store;
}

export function readConnectionToolsStore(path = connectionToolsPath()): ConnectionToolsStore {
  if (!existsSync(path)) return emptyConnectionToolsStore();
  try {
    return parseConnectionToolsStore(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    // A file this app cannot read is a cache, not a record: it is set aside
    // and rebuilt rather than taking the turn down with it.
    const bak = `${path}.invalid.${Date.now()}`;
    try { renameSync(path, bak); } catch { /* ignore */ }
    return emptyConnectionToolsStore();
  }
}

export function writeConnectionToolsStore(
  store: ConnectionToolsStore,
  path = connectionToolsPath(),
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(tmp, 0o600);
  const fd = openSync(tmp, "r");
  fsyncSync(fd);
  closeSync(fd);
  renameSync(tmp, path);
}

export function updateConnectionToolsStore<T>(
  fn: (store: ConnectionToolsStore) => T,
  path = connectionToolsPath(),
): T {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let held = false;
  while (!held) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      held = true;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmdirSync(lock);
      } catch {
        /* lock vanished; retry */
      }
      if (Date.now() > deadline) break;
      sleep(15);
    }
  }
  if (!held) throw new Error("connection_tools_locked");
  try {
    const existed = existsSync(path);
    const store = readConnectionToolsStore(path);
    const before = JSON.stringify(store);
    const result = fn(store);
    pruneSessions(store);
    const after = JSON.stringify(store);
    if (!existed || after !== before) writeConnectionToolsStore(store, path);
    return result;
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      /* ignore */
    }
  }
}

function pruneSessions(store: ConnectionToolsStore): void {
  const ids = Object.keys(store.sessions);
  if (ids.length <= MAX_SESSIONS) return;
  ids
    .sort((a, b) => Date.parse(store.sessions[b].updatedAt) - Date.parse(store.sessions[a].updatedAt))
    .slice(MAX_SESSIONS)
    .forEach((id) => delete store.sessions[id]);
}

/** Replace one connection's listing. Called after a connect and on a refresh. */
export function putConnectionIndex(
  connectionId: string,
  tools: IndexedTool[],
  path = connectionToolsPath(),
): void {
  updateConnectionToolsStore((store) => {
    store.index[connectionId] = {
      fetchedAt: new Date().toISOString(),
      tools: tools.slice(0, 200),
    };
  }, path);
}

export function connectionIndex(
  connectionId: string,
  path = connectionToolsPath(),
): ConnectionIndex | null {
  return readConnectionToolsStore(path).index[connectionId] ?? null;
}

export function indexIsStale(index: ConnectionIndex | null, now = Date.now()): boolean {
  if (!index) return true;
  const at = Date.parse(index.fetchedAt);
  return !Number.isFinite(at) || now - at > INDEX_TTL_MS;
}

/** What a session has picked up, in the order it picked it up. */
export function sessionTools(sessionId: string, path = connectionToolsPath()): string[] {
  return readConnectionToolsStore(path).sessions[sessionId]?.tools ?? [];
}

export type ActivationOutcome = {
  /** The names now mounted for this session, including ones it already had. */
  tools: string[];
  /** Names refused because the session is already holding its limit. */
  refused: string[];
};

/**
 * Record that a session may use these tools from now on. The cap is here
 * rather than at the wall the router puts up: past it the model is told it is
 * holding its limit, instead of the turn being refused with an error that
 * retires the session.
 */
export function activateSessionTools(
  sessionId: string,
  names: string[],
  path = connectionToolsPath(),
): ActivationOutcome {
  return updateConnectionToolsStore((store) => {
    const current = store.sessions[sessionId]?.tools ?? [];
    const held = new Set(current);
    const refused: string[] = [];
    for (const name of names) {
      if (held.has(name)) continue;
      if (held.size >= MAX_SESSION_TOOLS) {
        refused.push(name);
        continue;
      }
      held.add(name);
      current.push(name);
    }
    store.sessions[sessionId] = { updatedAt: new Date().toISOString(), tools: current };
    return { tools: [...current], refused };
  }, path);
}
