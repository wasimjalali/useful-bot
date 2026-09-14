import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { workspaceRoot } from "../lib/workspace.ts";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";
import { FORBIDDEN_PATH_SUBSTRINGS } from "../../shared/policy.ts";

const execFileAsync = promisify(execFile);

const OUTPUT_MAX_BYTES = 32 * 1024;
const INPUT_MAX_BYTES = 1024 * 1024;

/**
 * Best-effort refusal for commands that reach for credential stores or walk
 * out of the workspace. cwd/env confinement alone does not stop an absolute
 * path, so this is a tripwire in addition to the owner's per-command approval.
 */
const BLOCKED_COMMAND_SUBSTRINGS = [...FORBIDDEN_PATH_SUBSTRINGS, "keychain", ".."];

function blockedReason(command: string): string | null {
  const lowered = command.toLowerCase();
  for (const part of BLOCKED_COMMAND_SUBSTRINGS) {
    if (lowered.includes(part.toLowerCase())) return `command references ${part}`;
  }
  return null;
}

export default defineTool({
  description: "Run an approved command in the Useful Bot workspace. Not a login shell.",
  inputSchema: z.object({
    command: z.string().min(1).max(8192),
    timeoutMs: z.number().int().min(1).max(60_000).optional(),
  }),
  async execute(input, ctx) {
    const blocked = blockedReason(input.command);
    if (blocked) {
      return { status: "blocked", error: blocked };
    }
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
      ...approvalActor(ctx),
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
        maxBuffer: INPUT_MAX_BYTES,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: root,
          TMPDIR: root,
          LANG: "C",
        },
      });
      return {
        stdout: stdout.slice(0, OUTPUT_MAX_BYTES),
        stderr: stderr.slice(0, OUTPUT_MAX_BYTES),
        truncated: stdout.length > OUTPUT_MAX_BYTES || stderr.length > OUTPUT_MAX_BYTES,
      };
    });
  },
});
