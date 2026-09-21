import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore, actionSha256 } from "../agent/lib/approvals.ts";
import { applyShellAction, seedStore } from "../shared/shell-store.ts";
import { writeShell } from "../shared/shell-io.ts";

test("approval provenance is frozen when the card is raised", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-apr-prov-"));
  const shellPath = join(dir, "shell.json");
  const approvalsPath = join(dir, "approvals.json");
  const previous = process.env.UB_SHELL_PATH;
  process.env.UB_SHELL_PATH = shellPath;
  try {
    let store = seedStore();
    store = applyShellAction(store, {
      type: "touchChat",
      botId: store.bots[0].id,
      preview: "work",
      sessionId: "sess-prov",
    }).store;
    store = applyShellAction(store, {
      type: "setWorkspace",
      botId: store.bots[0].id,
      workspace: { path: "/tmp/project", permission: "auto" },
    }).store;
    writeShell(store, shellPath);
    const originalName = store.bots[0].name;
    const botId = store.bots[0].id;
    const hash = actionSha256({
      tool: "bash",
      canonicalArgs: "pwd",
      cwd: "/tmp/project",
      targetRevision: null,
      backend: "host",
      toolVersion: "1",
    });
    const raised = new ApprovalStore(() => 1_000, approvalsPath).request({
      sessionId: "sess-prov",
      turnId: "t",
      toolCallId: "c",
      tool: "bash",
      actionSha256: hash,
      preview: "pwd",
      cwd: "/tmp/project",
    });
    store.bots[0].name = "Renamed";
    writeShell(store, shellPath);
    const pending = new ApprovalStore(() => 1_000, approvalsPath).listPending()[0];
    assert.equal(pending.id, raised.id);
    assert.equal(pending.botId, botId);
    assert.equal(pending.botName, originalName);
    assert.equal(pending.sessionId, "sess-prov");
    assert.equal(pending.cwd, "/tmp/project");
  } finally {
    if (previous === undefined) delete process.env.UB_SHELL_PATH;
    else process.env.UB_SHELL_PATH = previous;
  }
});
