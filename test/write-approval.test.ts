import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore, executeIfApproved } from "../agent/lib/approvals.ts";
import { approvedWrite, getApprovalStore, setApprovalStore } from "../agent/lib/write.ts";

test("denied write does not create the file", async () => {
  const root = mkdtempSync(join(tmpdir(), "ub-ws-"));
  process.env.UB_WORKSPACE_ROOT = root;
  setApprovalStore(new ApprovalStore(() => 1_000));
  await assert.rejects(
    () => approvedWrite({
      path: "out.txt",
      content: "secret-should-not-land",
      expectedSha256: null,
      sessionId: "s",
      turnId: "t",
      toolCallId: "c1",
      autoDecision: "deny",
    }),
    /approval_denied/,
  );
  assert.equal(existsSync(join(root, "out.txt")), false);
});

test("approved write is exact bytes and replay is rejected", async () => {
  const root = mkdtempSync(join(tmpdir(), "ub-ws-"));
  process.env.UB_WORKSPACE_ROOT = root;
  mkdirSync(root, { recursive: true });
  setApprovalStore(new ApprovalStore(() => 1_000));
  const first = await approvedWrite({
    path: "note.txt",
    content: "S3-APPROVED-BYTES",
    expectedSha256: null,
    sessionId: "s",
    turnId: "t",
    toolCallId: "c2",
    autoDecision: "approve",
  });
  assert.equal(readFileSync(first.path, "utf8"), "S3-APPROVED-BYTES");
  await assert.rejects(
    () => executeIfApproved(getApprovalStore(), first.approvalId, first.actionSha256, () => "replay"),
    /approval_replay/,
  );
  assert.equal(readFileSync(first.path, "utf8"), "S3-APPROVED-BYTES");
});

test("path escape is rejected before write", async () => {
  const root = mkdtempSync(join(tmpdir(), "ub-ws-"));
  process.env.UB_WORKSPACE_ROOT = root;
  setApprovalStore(new ApprovalStore(() => 1_000));
  await assert.rejects(
    () => approvedWrite({
      path: "../escape.txt",
      content: "nope",
      expectedSha256: null,
      sessionId: "s",
      turnId: "t",
      toolCallId: "c3",
      autoDecision: "approve",
    }),
    /path_escape/,
  );
});
