import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { workspaceRoot } from "../lib/workspace.ts";
import { actionSha256, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";

const execFileAsync = promisify(execFile);

export default defineTool({
  description: "Run an approved command in the Useful Bot workspace. Not a login shell.",
  inputSchema: z.object({
    command: z.string(),
    timeoutMs: z.number().int().min(1).max(60_000).optional(),
  }),
  async execute(input) {
    const root = workspaceRoot();
    const hash = actionSha256({
      tool: "bash",
      canonicalArgs: JSON.stringify({ command: input.command }),
      cwd: root,
      targetRevision: null,
      backend: "just-bash",
      toolVersion: "1",
    });
    const store = getApprovalStore();
    const rec = store.request({
      sessionId: "live",
      turnId: "live",
      toolCallId: "live",
      tool: "bash",
      actionSha256: hash,
      preview: input.command,
    });
    await waitUntilNotPending(store, rec.id);
    return executeIfApproved(store, rec.id, hash, async () => {
      const args = ["/bin/sh", "-c", input.command];
      const { stdout, stderr } = await execFileAsync(args[0], args.slice(1), {
        cwd: root,
        timeout: input.timeoutMs ?? 30_000,
        maxBuffer: 32 * 1024,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: root,
          TMPDIR: root,
          LANG: "C",
        },
      });
      return { stdout: stdout.slice(0, 32 * 1024), stderr: stderr.slice(0, 32 * 1024) };
    });
  },
});
