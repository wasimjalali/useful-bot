import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { POLICY_APPROVAL_TTL_MS } from "../../shared/policy.ts";

export type ApprovalTool = "bash" | "write_file" | "memory.upsert";
export type ApprovalDecision = "approve" | "deny";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "consumed";

export interface ApprovalAction {
  tool: ApprovalTool;
  canonicalArgs: string;
  cwd: string;
  targetRevision: string | null;
  backend: string;
  toolVersion: string;
}

export interface StoredApproval {
  id: string;
  sessionId: string;
  turnId: string;
  toolCallId: string;
  tool: ApprovalTool;
  actionSha256: string;
  preview: string;
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
}

export type PendingApproval = Pick<
  StoredApproval,
  "id" | "tool" | "preview" | "actionSha256" | "createdAt" | "expiresAt"
>;

export function defaultApprovalsPath(): string {
  if (process.env.UB_APPROVALS_PATH) return process.env.UB_APPROVALS_PATH;
  return join(homedir(), ".useful-bot", "approvals.json");
}

const LOCK_TIMEOUT_MS = 4000;
const LOCK_STALE_MS = 15_000;
const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(4));

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

/**
 * Cross-process lock for a read/merge/write cycle. Both the Next server and the
 * eve agent process hold their own ApprovalStore, and every persist writes the
 * whole record map, so an unlocked load/mutate/save can drop the other writer's
 * decision. The directory lock keeps one writer at a time.
 */
function withFileLock<T>(lockPath: string | null, fn: () => T): T {
  if (!lockPath) return fn();
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let held = false;
  while (!held) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      held = true;
    } catch {
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) rmdirSync(lockPath);
      } catch { /* lock vanished; retry */ }
      if (Date.now() > deadline) break;
      sleep(15);
    }
  }
  if (!held) throw new Error("approvals_locked");
  try {
    return fn();
  } finally {
    try { rmdirSync(lockPath); } catch { /* ignore */ }
  }
}

function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function actionSha256(action: ApprovalAction): string {
  const payload = JSON.stringify({
    tool: action.tool,
    canonicalArgs: action.canonicalArgs,
    cwd: action.cwd,
    targetRevision: action.targetRevision,
    backend: action.backend,
    toolVersion: action.toolVersion,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export class ApprovalStore {
  readonly records = new Map<string, StoredApproval>();
  private seq = 0;
  private readonly now: () => number;
  private readonly persistPath: string | null;

  constructor(now: () => number = Date.now, persistPath: string | null = null) {
    this.now = now;
    this.persistPath = persistPath;
    this.load();
  }

  request(input: {
    sessionId: string;
    turnId: string;
    toolCallId: string;
    tool: ApprovalTool;
    actionSha256: string;
    preview: string;
  }): StoredApproval {
    return this.locked(() => {
      this.load();
      this.seq += 1;
      const createdAt = this.now();
      const record: StoredApproval = {
        id: this.persistPath
          ? `apr_${randomUUID().replaceAll("-", "").slice(0, 16)}`
          : `apr_${this.seq.toString().padStart(4, "0")}`,
        sessionId: input.sessionId,
        turnId: input.turnId,
        toolCallId: input.toolCallId,
        tool: input.tool,
        actionSha256: input.actionSha256,
        preview: input.preview,
        createdAt,
        expiresAt: createdAt + POLICY_APPROVAL_TTL_MS,
        status: "pending",
      };
      this.records.set(record.id, record);
      this.persist();
      return record;
    });
  }

  decide(id: string, decision: ApprovalDecision, presentedHash: string): StoredApproval {
    return this.locked(() => {
      this.load();
      const record = this.records.get(id);
      if (!record) {
        throw new Error(`approval_not_found:${id}`);
      }
      this.refreshExpiry(record);
      if (record.status !== "pending") {
        throw new Error(`approval_not_pending:${record.status}`);
      }
      if (!hashesEqual(record.actionSha256, presentedHash)) {
        throw new Error("approval_hash_mismatch");
      }
      record.status = decision === "approve" ? "approved" : "denied";
      this.persist();
      return record;
    });
  }

  consume(id: string, presentedHash: string): StoredApproval {
    return this.locked(() => {
      this.load();
      const record = this.records.get(id);
      if (!record) {
        throw new Error(`approval_not_found:${id}`);
      }
      this.refreshExpiry(record);
      if (!hashesEqual(record.actionSha256, presentedHash)) {
        throw new Error("approval_hash_mismatch");
      }
      if (record.status === "consumed") {
        throw new Error("approval_replay");
      }
      if (record.status === "denied") {
        throw new Error("approval_denied");
      }
      if (record.status === "expired") {
        throw new Error("approval_expired");
      }
      if (record.status !== "approved") {
        throw new Error(`approval_not_approved:${record.status}`);
      }
      record.status = "consumed";
      this.persist();
      return record;
    });
  }

  get(id: string): StoredApproval | undefined {
    return this.locked(() => {
      this.load();
      const record = this.records.get(id);
      if (!record) return undefined;
      const before = record.status;
      this.refreshExpiry(record);
      if (record.status !== before) this.persist();
      return record;
    });
  }

  listPending(): PendingApproval[] {
    return this.locked(() => {
      this.load();
      let changed = false;
      const out: PendingApproval[] = [];
      for (const record of this.records.values()) {
        const before = record.status;
        this.refreshExpiry(record);
        if (record.status !== before) changed = true;
        if (record.status === "pending") {
          out.push({
            id: record.id,
            tool: record.tool,
            preview: record.preview,
            actionSha256: record.actionSha256,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt,
          });
        }
      }
      if (changed) this.persist();
      out.sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
      return out;
    });
  }

  invalidateOnRestart(): void {
    this.locked(() => {
      this.load();
      for (const record of this.records.values()) {
        if (record.status === "pending" || record.status === "approved") {
          record.status = "expired";
        }
      }
      this.persist();
    });
  }

  private locked<T>(fn: () => T): T {
    return withFileLock(this.persistPath ? `${this.persistPath}.lock` : null, fn);
  }

  private refreshExpiry(record: StoredApproval): void {
    if (record.status === "pending" && this.now() >= record.expiresAt) {
      record.status = "expired";
    }
  }

  private load(): void {
    if (!this.persistPath) return;
    this.records.clear();
    if (!existsSync(this.persistPath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.persistPath, "utf8")) as { records?: StoredApproval[] };
      const rows = Array.isArray(parsed.records) ? parsed.records : [];
      for (const row of rows) {
        if (!row || typeof row.id !== "string" || typeof row.actionSha256 !== "string") continue;
        this.records.set(row.id, row);
      }
    } catch {
      this.records.clear();
    }
  }

  private persist(): void {
    if (!this.persistPath) return;
    mkdirSync(dirname(this.persistPath), { recursive: true, mode: 0o700 });
    const tmp = `${this.persistPath}.${process.pid}.${Date.now()}.tmp`;
    const body = `${JSON.stringify({ records: [...this.records.values()] })}\n`;
    try {
      writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
      const fd = openSync(tmp, "r");
      fsyncSync(fd);
      closeSync(fd);
      renameSync(tmp, this.persistPath);
    } catch (err) {
      try { unlinkSync(tmp); } catch { /* ignore */ }
      throw err;
    }
  }
}

export async function waitUntilNotPending(
  store: ApprovalStore,
  id: string,
  timeoutMs = POLICY_APPROVAL_TTL_MS,
  intervalMs = 250,
): Promise<StoredApproval> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = store.get(id);
    if (!record) throw new Error(`approval_not_found:${id}`);
    if (record.status !== "pending") return record;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const expired = store.get(id);
  if (expired && expired.status !== "pending") return expired;
  throw new Error("approval_expired");
}

export async function executeIfApproved<T>(
  store: ApprovalStore,
  id: string,
  presentedHash: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  store.consume(id, presentedHash);
  return await fn();
}
