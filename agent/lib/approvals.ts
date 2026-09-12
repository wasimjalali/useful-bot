import { createHash, timingSafeEqual } from "node:crypto";
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

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  request(input: {
    sessionId: string;
    turnId: string;
    toolCallId: string;
    tool: ApprovalTool;
    actionSha256: string;
    preview: string;
  }): StoredApproval {
    this.seq += 1;
    const createdAt = this.now();
    const record: StoredApproval = {
      id: `apr_${this.seq.toString().padStart(4, "0")}`,
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
    return record;
  }

  decide(id: string, decision: ApprovalDecision, presentedHash: string): StoredApproval {
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
    return record;
  }

  consume(id: string, presentedHash: string): StoredApproval {
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
    return record;
  }

  invalidateOnRestart(): void {
    for (const record of this.records.values()) {
      if (record.status === "pending" || record.status === "approved") {
        record.status = "expired";
      }
    }
  }

  private refreshExpiry(record: StoredApproval): void {
    if (record.status === "pending" && this.now() >= record.expiresAt) {
      record.status = "expired";
    }
  }
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
