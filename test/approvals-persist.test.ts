import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApprovalStore,
  actionSha256,
  executeIfApproved,
  waitUntilNotPending,
} from "../agent/lib/approvals.ts";

function hashFor(args: string) {
  return actionSha256({
    tool: "memory.upsert",
    canonicalArgs: args,
    cwd: "memory",
    targetRevision: null,
    backend: "memory",
    toolVersion: "1",
  });
}

test("file-backed store shares request decide and consume across instances", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-apr-")), "approvals.json");
  const hash = hashFor('{"title":"pref"}');
  const writer = new ApprovalStore(Date.now, path);
  const rec = writer.request({
    sessionId: "s",
    turnId: "t",
    toolCallId: "c",
    tool: "memory.upsert",
    actionSha256: hash,
    preview: "memory pref",
  });
  const ui = new ApprovalStore(Date.now, path);
  assert.equal(ui.listPending().length, 1);
  assert.equal(ui.listPending()[0].id, rec.id);
  ui.decide(rec.id, "approve", hash);
  let ran = false;
  await executeIfApproved(new ApprovalStore(Date.now, path), rec.id, hash, () => {
    ran = true;
    return "ok";
  });
  assert.equal(ran, true);
  assert.equal(new ApprovalStore(Date.now, path).listPending().length, 0);
});

test("waitUntilNotPending settles when another process approves", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-apr-")), "approvals.json");
  const hash = hashFor('{"title":"wait"}');
  const agent = new ApprovalStore(Date.now, path);
  const rec = agent.request({
    sessionId: "s",
    turnId: "t",
    toolCallId: "c",
    tool: "memory.upsert",
    actionSha256: hash,
    preview: "memory wait",
  });
  const waiter = waitUntilNotPending(agent, rec.id, 2000, 20);
  setTimeout(() => {
    new ApprovalStore(Date.now, path).decide(rec.id, "approve", hash);
  }, 40);
  const settled = await waiter;
  assert.equal(settled.status, "approved");
});

test("an approved record from an earlier boot cannot be consumed after restart", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-apr-")), "approvals.json");
  const hash = hashFor('{"title":"restart"}');
  const before = new ApprovalStore(Date.now, path, "boot-a");
  const rec = before.request({
    sessionId: "s",
    turnId: "t",
    toolCallId: "c",
    tool: "memory.upsert",
    actionSha256: hash,
    preview: "memory restart",
  });
  // The UI process has its own epoch and may still record the decision.
  new ApprovalStore(Date.now, path, "ui-boot").decide(rec.id, "approve", hash);
  let ran = false;
  await assert.rejects(
    () => executeIfApproved(new ApprovalStore(Date.now, path, "boot-b"), rec.id, hash, () => {
      ran = true;
    }),
    /approval_expired/,
  );
  assert.equal(ran, false);
});

test("denied wait does not execute", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ub-apr-")), "approvals.json");
  const hash = hashFor('{"title":"no"}');
  const agent = new ApprovalStore(Date.now, path);
  const rec = agent.request({
    sessionId: "s",
    turnId: "t",
    toolCallId: "c",
    tool: "memory.upsert",
    actionSha256: hash,
    preview: "memory no",
  });
  const waiter = waitUntilNotPending(agent, rec.id, 2000, 20);
  setTimeout(() => {
    new ApprovalStore(Date.now, path).decide(rec.id, "deny", hash);
  }, 40);
  const settled = await waiter;
  assert.equal(settled.status, "denied");
  let ran = false;
  await assert.rejects(
    () => executeIfApproved(agent, rec.id, hash, () => {
      ran = true;
    }),
    /approval_denied/,
  );
  assert.equal(ran, false);
});
