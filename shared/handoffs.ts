import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ThreadKind } from "./agent-store.ts";

/**
 * Durable bot-to-bot delivery queue. A handoff is written by the sending agent
 * tool and delivered later by the web server, so a send never blocks the
 * sender's turn. One JSON file per record: writers only create files, the
 * consumer only rewrites or deletes them, so concurrent processes cannot
 * clobber a shared document.
 */

export const HANDOFF_SCHEMA = 1;
export const HANDOFF_ATTEMPTS_MAX = 3;
export const HANDOFF_TEXT_MAX = 4000;
export const HANDOFF_LIST_MAX = 50;
/** Delivered records are pruned after this; failed ones keep longer. */
const HANDOFF_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
/** Longer than the 120s deliver timeout, so a crashed claim can be retried. */
const CLAIM_STALE_MS = 10 * 60 * 1000;

export type HandoffStatus = "pending" | "delivered" | "failed";

export type HandoffRecord = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceBotId: string;
  sourceName: string;
  targetBotId: string;
  targetName: string;
  /** Set when the reply belongs in a shared room instead of the target 1:1. */
  groupId: string | null;
  groupName: string | null;
  threadKind: ThreadKind;
  message: string;
  status: HandoffStatus;
  attempts: number;
  lastError: string;
  response: string;
};

export type HandoffDraft = Pick<
  HandoffRecord,
  "sourceBotId" | "sourceName" | "targetBotId" | "targetName" | "message"
> & {
  groupId?: string | null;
  groupName?: string | null;
  threadKind?: ThreadKind;
};

export function handoffDir(): string {
  if (process.env.UB_HANDOFF_DIR) return process.env.UB_HANDOFF_DIR;
  return join(homedir(), ".useful-bot", "handoffs");
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function isId(value: unknown, max = 80): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function newHandoffId(): string {
  return `hnd_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function parseHandoff(raw: unknown): HandoffRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== HANDOFF_SCHEMA) return null;
  if (!isId(rec.id, 120)) return null;
  if (!isId(rec.targetBotId) || !isId(rec.sourceBotId)) return null;
  const status: HandoffStatus = rec.status === "delivered" || rec.status === "failed"
    ? rec.status
    : "pending";
  return {
    schemaVersion: 1,
    id: rec.id,
    createdAt: typeof rec.createdAt === "string" ? rec.createdAt : new Date(0).toISOString(),
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : new Date(0).toISOString(),
    sourceBotId: rec.sourceBotId,
    sourceName: clip(rec.sourceName, 80),
    targetBotId: rec.targetBotId,
    targetName: clip(rec.targetName, 80),
    groupId: isId(rec.groupId) ? rec.groupId : null,
    groupName: clip(rec.groupName, 80) || null,
    threadKind: rec.threadKind === "group" ? "group" : "bot",
    message: clip(rec.message, HANDOFF_TEXT_MAX),
    status,
    attempts: typeof rec.attempts === "number" && Number.isInteger(rec.attempts) && rec.attempts >= 0
      ? Math.min(rec.attempts, 20)
      : 0,
    lastError: clip(rec.lastError, 300),
    response: clip(rec.response, 8000),
  };
}

function handoffPath(id: string, dir = handoffDir()): string {
  return join(dir, `${id}.json`);
}

function claimPath(id: string, dir = handoffDir()): string {
  return join(dir, `${id}.claim`);
}

/**
 * Cross-process delivery claim. O_EXCL creation means exactly one process can
 * hold a record; a claim older than the stale window (process died mid-delivery)
 * is taken over so the record is not stranded.
 */
export function claimHandoff(id: string, dir = handoffDir()): boolean {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = claimPath(id, dir);
  const stamp = Date.now();
  const create = () => {
    try {
      writeFileSync(path, `${JSON.stringify({ pid: process.pid, at: stamp })}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      return true;
    } catch {
      return false;
    }
  };
  if (create()) return true;
  try {
    const info = JSON.parse(readFileSync(path, "utf8")) as { at?: unknown };
    if (typeof info.at !== "number" || stamp - info.at > CLAIM_STALE_MS) {
      unlinkSync(path);
      return create();
    }
  } catch {
    try { unlinkSync(path); } catch { /* ignore */ }
    return create();
  }
  return false;
}

export function releaseHandoffClaim(id: string, dir = handoffDir()): void {
  try { unlinkSync(claimPath(id, dir)); } catch { /* ignore */ }
}

/** Keep the queue directory bounded: old delivered and failed records go. */
function pruneHandoffs(dir: string): void {
  if (!existsSync(dir)) return;
  const cutoff = Date.now() - HANDOFF_KEEP_MS;
  for (const name of readdirSync(dir)) {
    const id = name.endsWith(".json") ? name.slice(0, -5) : "";
    if (!id) {
      if (name.endsWith(".claim")) {
        try {
          const info = JSON.parse(readFileSync(join(dir, name), "utf8")) as { at?: unknown };
          if (typeof info.at === "number" && info.at < cutoff) unlinkSync(join(dir, name));
        } catch {
          try { unlinkSync(join(dir, name)); } catch { /* ignore */ }
        }
      }
      continue;
    }
    const record = readHandoff(id, dir);
    if (!record || record.status === "pending") continue;
    if (Date.parse(record.updatedAt) < cutoff) dropHandoff(id, dir);
  }
}

export function writeHandoff(record: HandoffRecord, dir = handoffDir()): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = handoffPath(record.id, dir);
  const tmp = `${path}.${process.pid}.${Date.now()}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const fd = openSync(tmp, "r");
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

export function queueHandoff(input: HandoffDraft, dir = handoffDir()): HandoffRecord {
  const now = new Date().toISOString();
  const record: HandoffRecord = {
    schemaVersion: 1,
    id: newHandoffId(),
    createdAt: now,
    updatedAt: now,
    sourceBotId: input.sourceBotId,
    sourceName: clip(input.sourceName, 80),
    targetBotId: input.targetBotId,
    targetName: clip(input.targetName, 80),
    groupId: input.groupId ?? null,
    groupName: input.groupName ? clip(input.groupName, 80) : null,
    threadKind: input.threadKind ?? "bot",
    message: clip(input.message, HANDOFF_TEXT_MAX),
    status: "pending",
    attempts: 0,
    lastError: "",
    response: "",
  };
  writeHandoff(record, dir);
  try { pruneHandoffs(dir); } catch { /* pruning is best effort */ }
  return record;
}

export function readHandoff(id: string, dir = handoffDir()): HandoffRecord | null {
  const path = handoffPath(id, dir);
  if (!existsSync(path)) return null;
  try {
    return parseHandoff(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function listHandoffs(dir = handoffDir()): HandoffRecord[] {
  if (!existsSync(dir)) return [];
  const rows: HandoffRecord[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const record = readHandoff(name.slice(0, -5), dir);
    if (record) rows.push(record);
  }
  rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  return rows;
}

/** Oldest first, so a fan-out is delivered in the order the owner confirmed. */
export function listDeliverable(dir = handoffDir()): HandoffRecord[] {
  return listHandoffs(dir)
    .filter((record) => (
      record.status === "pending"
      || (record.status === "failed" && record.attempts < HANDOFF_ATTEMPTS_MAX)
    ))
    .slice(0, HANDOFF_LIST_MAX);
}

export function markDelivered(id: string, response: string, dir = handoffDir()): HandoffRecord | null {
  const record = readHandoff(id, dir);
  if (!record) return null;
  const next: HandoffRecord = {
    ...record,
    status: "delivered",
    attempts: record.attempts + 1,
    lastError: "",
    response: clip(response, 8000),
    updatedAt: new Date().toISOString(),
  };
  writeHandoff(next, dir);
  releaseHandoffClaim(id, dir);
  return next;
}

export function markFailed(id: string, error: string, dir = handoffDir()): HandoffRecord | null {
  const record = readHandoff(id, dir);
  if (!record) return null;
  const attempts = record.attempts + 1;
  const next: HandoffRecord = {
    ...record,
    status: attempts >= HANDOFF_ATTEMPTS_MAX ? "failed" : "pending",
    attempts,
    lastError: clip(error, 300),
    updatedAt: new Date().toISOString(),
  };
  writeHandoff(next, dir);
  releaseHandoffClaim(id, dir);
  return next;
}

export function dropHandoff(id: string, dir = handoffDir()): void {
  rmSync(handoffPath(id, dir), { force: true });
  releaseHandoffClaim(id, dir);
}
