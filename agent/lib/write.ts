import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { ApprovalStore, actionSha256, executeIfApproved } from "./approvals.ts";
import { resolveWorkspacePath, workspaceRoot } from "./workspace.ts";
import { WRITE_MAX_BYTES } from "../../shared/policy.ts";

let store = new ApprovalStore();

export function getApprovalStore(): ApprovalStore {
  return store;
}

export function setApprovalStore(next: ApprovalStore): void {
  store = next;
}

export async function approvedWrite(input: {
  path: string;
  content: string;
  expectedSha256: string | null;
  sessionId: string;
  turnId: string;
  toolCallId: string;
  autoDecision?: "approve" | "deny";
}): Promise<{ bytes: number; path: string; approvalId: string; actionSha256: string }> {
  if (Buffer.byteLength(input.content, "utf8") > WRITE_MAX_BYTES) {
    throw new Error("write_too_large");
  }
  const root = workspaceRoot();
  const target = resolveWorkspacePath(input.path, root);
  const hash = actionSha256({
    tool: "write_file",
    canonicalArgs: JSON.stringify({ path: input.path, content: input.content, expectedSha256: input.expectedSha256 }),
    cwd: root,
    targetRevision: input.expectedSha256,
    backend: "just-bash",
    toolVersion: "1",
  });
  const rec = store.request({
    sessionId: input.sessionId,
    turnId: input.turnId,
    toolCallId: input.toolCallId,
    tool: "write_file",
    actionSha256: hash,
    preview: `write ${input.path}`,
  });
  if (input.autoDecision) {
    store.decide(rec.id, input.autoDecision, hash);
  }
  return executeIfApproved(store, rec.id, hash, () => {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    const tmp = join(dirname(target), `.${createHash("sha256").update(target).digest("hex").slice(0, 12)}.tmp`);
    writeFileSync(tmp, input.content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const fd = openSync(tmp, "r");
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, target);
    return { bytes: Buffer.byteLength(input.content, "utf8"), path: target, approvalId: rec.id, actionSha256: hash };
  });
}
