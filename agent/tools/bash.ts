import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { effectiveRoot } from "../lib/workspace.ts";
import { commandRisk, outsideFolderRisk } from "../lib/command-risk.ts";
import { confinedCommand, sandboxAvailable } from "../lib/sandbox.ts";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";
import { FORBIDDEN_PATH_SUBSTRINGS } from "../../shared/policy.ts";
import { wrapUntrusted } from "../../shared/untrusted.ts";

const execFileAsync = promisify(execFile);

const OUTPUT_MAX_BYTES = 32 * 1024;
const INPUT_MAX_BYTES = 1024 * 1024;

/**
 * Best-effort refusal for commands that reach for credential stores or walk
 * out of the workspace. cwd/env confinement alone does not stop an absolute
 * path, so this is a tripwire in addition to the owner's per-command approval.
 */
const BLOCKED_COMMAND_SUBSTRINGS = [
  ...FORBIDDEN_PATH_SUBSTRINGS,
  // Substrings that only ever name something outside the folder. `..` earns
  // its place as a path traversal marker even though it costs the odd benign
  // `echo "a..b"`: the owner still sees the command on a card, so a false
  // block is a retype, while a miss is a read the card made look routine.
  "..",
  "/etc",
  "/private/etc",
  "/var/db",
  "/library/keychains",
  "/library/cookies",
];

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
    // One grant read for root AND permission: two reads could pair a root
    // from before a permission change with the permission after it.
    const { root, grant } = effectiveRoot(ctx?.session?.id);
    if (grant?.permission === "read_only") {
      return { status: "blocked", error: "workspace_read_only" };
    }
    const hash = actionSha256({
      tool: "bash",
      canonicalArgs: JSON.stringify({ command: input.command }),
      cwd: root,
      targetRevision: null,
      backend: "just-bash",
      toolVersion: "1",
    });
    // The posture decides who answers the card. Auto runs the everyday
    // lines and stops for one that deletes, rewrites history, escalates,
    // runs a payload it cannot read, or reaches outside the folder. Full
    // access runs every line inside the folder and stops only for a reach
    // outside it: the grant was for this folder. No grant at all (the
    // legacy root) always waits for the owner. The tripwire above still
    // refuses credential paths in every posture.
    const permission = grant?.permission ?? null;
    let risk: string | null = null;
    let askOwner = true;
    switch (permission) {
      case "auto":
        risk = commandRisk(input.command, root);
        askOwner = risk !== null;
        break;
      case "full_access":
        risk = outsideFolderRisk(input.command, root);
        askOwner = risk !== null;
        break;
      default:
        // No grant, or a posture this build does not know: the owner decides.
        askOwner = true;
    }
    // Nothing runs unconfined without the owner: a system with no sandbox
    // gets a card for every line instead of a bare shell.
    if (!askOwner && !sandboxAvailable()) {
      risk = "no sandbox on this system";
      askOwner = true;
    }
    const store = getApprovalStore();
    const rec = store.request({
      ...approvalActor(ctx),
      tool: "bash",
      actionSha256: hash,
      preview: risk ? `${input.command}\n${risk}` : input.command,
    });
    if (!askOwner) {
      store.decide(rec.id, "approve", hash);
    } else {
      await waitUntilNotPending(store, rec.id);
      // The workspace may have changed while the card sat open. The approval
      // was granted against the cwd AND the posture at request time, so a
      // changed root, a changed permission, or a revoked grant all refuse the
      // approval rather than spend it on something the owner did not see.
      // Same rule as the write path.
      let refreshed;
      try {
        refreshed = effectiveRoot(ctx?.session?.id);
      } catch {
        // A grant revoked with no legacy root configured leaves nothing to
        // run in. That is the workspace changing, not a tool crash.
        return { status: "blocked", error: "workspace_changed" };
      }
      const permissionNow = refreshed.grant?.permission ?? null;
      if (refreshed.root !== root || permissionNow !== permission) {
        return { status: "blocked", error: "workspace_changed" };
      }
    }
    return executeIfApproved(store, rec.id, hash, async () => {
      // What ran without a card runs confined to the folder, so a line the
      // classifier misjudged still cannot write outside it. A line the
      // owner approved runs as they read it.
      const args = askOwner ? ["/bin/sh", "-c", input.command] : confinedCommand(root, input.command);
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
      const truncated = stdout.length > OUTPUT_MAX_BYTES || stderr.length > OUTPUT_MAX_BYTES;
      return {
        stdout: wrapUntrusted("bash stdout", stdout.slice(0, OUTPUT_MAX_BYTES)),
        stderr: wrapUntrusted("bash stderr", stderr.slice(0, OUTPUT_MAX_BYTES)),
        truncated,
      };
    });
  },
});
