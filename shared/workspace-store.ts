import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
// The permission vocabulary is client-safe and lives beside the bot fields
// that carry it; this store only adds persistence on top.
import {
  parseWorkspacePermission,
  type WorkspacePermission,
} from "./shell-store.ts";

export type { WorkspacePermission };
export { parseWorkspacePermission };

/**
 * Workspace grants and project recents.
 *
 * A grant is the per-session answer to "which folder may this conversation
 * work in, and how much may it do there". The web server writes it at turn
 * time from the bot's shell fields; the eve agent process reads it at tool
 * execution time. One file, two processes, so writes go through the same
 * directory-lock + atomic-replace convention as the other stores.
 */

export const WORKSPACE_SCHEMA = 1;
/** Grants outlive their session usefulness quickly; keep the file small. */
export const GRANTS_MAX = 64;
export const PROJECTS_MAX = 12;

export type SessionGrant = {
  sessionId: string;
  path: string;
  permission: WorkspacePermission;
  finalConfirm: boolean;
  updatedAt: string;
};

export type ProjectEntry = {
  id: string;
  path: string;
  name: string;
  lastUsedAt: string;
};

export type WorkspaceStore = {
  schemaVersion: 1;
  grants: SessionGrant[];
  projects: ProjectEntry[];
};

export function defaultWorkspacePath(): string {
  if (process.env.UB_WORKSPACE_STORE_PATH) return process.env.UB_WORKSPACE_STORE_PATH;
  return join(homedir(), ".useful-bot", "workspace.json");
}

function seedStore(at = new Date()): WorkspaceStore {
  return { schemaVersion: WORKSPACE_SCHEMA, grants: [], projects: [] };
}

function parseGrant(raw: unknown): SessionGrant | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const sessionId = typeof rec.sessionId === "string" && rec.sessionId.length > 0 && rec.sessionId.length <= 200
    ? rec.sessionId
    : null;
  const path = typeof rec.path === "string" && rec.path.startsWith("/") ? rec.path : null;
  const permission = parseWorkspacePermission(rec.permission);
  if (!sessionId || !path || !permission) return null;
  return {
    sessionId,
    path,
    permission,
    finalConfirm: rec.finalConfirm === true,
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : new Date(0).toISOString(),
  };
}

function parseProject(raw: unknown): ProjectEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || rec.id.length === 0 || rec.id.length > 80) return null;
  if (typeof rec.path !== "string" || !rec.path.startsWith("/")) return null;
  if (typeof rec.name !== "string" || rec.name.length === 0) return null;
  return {
    id: rec.id,
    path: rec.path,
    name: rec.name.slice(0, 120),
    lastUsedAt: typeof rec.lastUsedAt === "string" ? rec.lastUsedAt : new Date(0).toISOString(),
  };
}

export function parseWorkspaceStore(raw: unknown): WorkspaceStore {
  if (!raw || typeof raw !== "object") throw new Error("workspace_invalid");
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== WORKSPACE_SCHEMA) throw new Error("workspace_schema");
  if (rec.grants !== undefined && !Array.isArray(rec.grants)) throw new Error("workspace_grants");
  if (rec.projects !== undefined && !Array.isArray(rec.projects)) throw new Error("workspace_projects");
  const grants = (rec.grants ?? [])
    .map(parseGrant)
    .filter((grant): grant is SessionGrant => grant !== null)
    // One grant per session: the newest write wins.
    .filter((grant, index, all) => all.findIndex((other) => other.sessionId === grant.sessionId) === index)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(-GRANTS_MAX);
  const projects = (rec.projects ?? [])
    .map(parseProject)
    .filter((project): project is ProjectEntry => project !== null)
    .filter((project, index, all) => all.findIndex((other) => other.path === project.path) === index)
    .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
    .slice(-PROJECTS_MAX);
  return { schemaVersion: WORKSPACE_SCHEMA, grants, projects };
}

function readStoreFile(path: string): WorkspaceStore {
  if (!existsSync(path)) return seedStore();
  try {
    return parseWorkspaceStore(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    // An unreadable store must never block a turn: grants are a capability
    // cache, so starting empty only means tools fall back to the legacy root.
    return seedStore();
  }
}

function writeStoreFile(store: WorkspaceStore, path: string): void {
  const parsed = parseWorkspaceStore(store);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const fd = openSync(tmp, "r");
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

const LOCK_TIMEOUT_MS = 2_000;
const LOCK_STALE_MS = 5_000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Locked read-modify-write; the web server and the agent both write. */
export function updateWorkspaceStore(
  mutate: (store: WorkspaceStore) => WorkspaceStore,
  path = defaultWorkspacePath(),
): WorkspaceStore {
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
      } catch { /* lock vanished; retry */ }
      if (Date.now() > deadline) break;
      sleep(15);
    }
  }
  if (!held) throw new Error("workspace_locked");
  try {
    const next = mutate(readStoreFile(path));
    writeStoreFile(next, path);
    return next;
  } finally {
    try { rmdirSync(lock); } catch { /* ignore */ }
  }
}

export function readWorkspaceStore(path = defaultWorkspacePath()): WorkspaceStore {
  return readStoreFile(path);
}

/** The grant for one session, read fresh: permissions change mid-session. */
export function readSessionGrant(sessionId: string, path = defaultWorkspacePath()): SessionGrant | null {
  if (!sessionId) return null;
  return readStoreFile(path).grants.find((grant) => grant.sessionId === sessionId) ?? null;
}

export function upsertSessionGrant(
  input: { sessionId: string; path: string; permission: WorkspacePermission; finalConfirm: boolean },
  at = new Date(),
  path = defaultWorkspacePath(),
): void {
  updateWorkspaceStore((store) => {
    const stamp = at.toISOString();
    const grant: SessionGrant = { ...input, updatedAt: stamp };
    const grants = [
      ...store.grants.filter((item) => item.sessionId !== input.sessionId),
      grant,
    ]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(-GRANTS_MAX);
    return { ...store, grants };
  }, path);
}

export function projectIdFor(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 24);
}

export function upsertProject(
  input: { path: string; name: string },
  at = new Date(),
  path = defaultWorkspacePath(),
): ProjectEntry {
  const entry: ProjectEntry = {
    id: projectIdFor(input.path),
    path: input.path,
    name: input.name.slice(0, 120),
    lastUsedAt: at.toISOString(),
  };
  updateWorkspaceStore((store) => {
    const projects = [
      ...store.projects.filter((item) => item.path !== input.path),
      entry,
    ]
      .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
      .slice(-PROJECTS_MAX);
    return { ...store, projects };
  }, path);
  return entry;
}

export function removeProject(id: string, path = defaultWorkspacePath()): void {
  updateWorkspaceStore((store) => ({
    ...store,
    projects: store.projects.filter((item) => item.id !== id),
  }), path);
}
