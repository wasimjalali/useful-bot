import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { effectiveRoot } from "../lib/workspace.ts";
import { commandRisk, outsideFolderRisk, readOnlyRisk } from "../lib/command-risk.ts";
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
  // The app's own stores: approvals, the roster, the grants. read_file and
  // list_dir refuse the same name; a shell line must not be the way round.
  ".useful-bot",
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
  description: "Run a shell command on this Mac, in the attached folder or under the owner's home when none is attached. Lines that only read run at once; what else runs without asking depends on the owner's permission. Not a login shell.",
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
    const { root, permission, scope } = effectiveRoot(ctx?.session?.id);
    // A line that only reads runs in every posture, with every write refused
    // by the sandbox in case the classifier misjudged it. Reading is what the
    // owner expects a bot to do on its own, wherever it is looking.
    const readOnly = readOnlyRisk(input.command) === null;
    if (permission === "read_only" && !readOnly) {
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
    // The posture decides who answers the card. In an attached folder, Auto
    // runs the everyday lines and stops for one that deletes, rewrites
    // history, escalates, runs a payload it cannot read, or reaches outside
    // the folder. Under the owner's home with no folder attached, Auto runs
    // only the lines that read; anything that changes a file asks, because
    // nothing there was handed over the way a project folder is. Full
    // access runs every line inside the scope and stops only for a reach
    // outside it. The tripwire above still refuses credential paths in
    // every posture.
    let risk: string | null = null;
    let askOwner = true;
    if (readOnly) {
      askOwner = false;
    } else if (permission === "full_access") {
      risk = outsideFolderRisk(input.command, root);
      askOwner = risk !== null;
    } else if (scope === "folder") {
      risk = commandRisk(input.command, root);
      askOwner = risk !== null;
    } else {
      risk = commandRisk(input.command, root) ?? "changes files outside a project folder";
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
      if (refreshed.root !== root || refreshed.permission !== permission) {
        return { status: "blocked", error: "workspace_changed" };
      }
    }
    return executeIfApproved(store, rec.id, hash, async () => {
      // What ran without a card runs confined: a read-only line with every
      // write refused, an everyday line with writes kept inside the scope,
      // so a line the classifier misjudged still cannot write outside it. A
      // line the owner approved runs as they read it.
      const args = askOwner
        ? ["/bin/sh", "-c", input.command]
        : confinedCommand(readOnly ? null : root, input.command);
      let stdout: string;
      let stderr: string;
      try {
        ({ stdout, stderr } = await execFileAsync(args[0], args.slice(1), {
          cwd: root,
          timeout: input.timeoutMs ?? 30_000,
          // The turn's signal reaches the child: a Stop must not leave a
          // cancelled line running to its own timeout with side effects
          // landing after the owner gave up.
          signal: ctx?.abortSignal,
          maxBuffer: INPUT_MAX_BYTES,
          env: {
            PATH: "/usr/bin:/bin",
            HOME: root,
            // A read-only line runs with no writable root at all, so its
            // temp dir is the system one the sandbox profile allows.
            TMPDIR: readOnly ? tmpdir() : root,
            LANG: "C",
          },
        }));
      } catch (err) {
        // Output past the input cap rejects the whole execFile call with the
        // partial output attached; clip what came through instead of failing
        // the turn with a raw maxBuffer error. Any other error is real.
        if ((err as NodeJS.ErrnoException).code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw err;
        const partial = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        stdout = partial.stdout ?? "";
        stderr = partial.stderr ?? "";
      }
      const truncated = stdout.length > OUTPUT_MAX_BYTES || stderr.length > OUTPUT_MAX_BYTES;
      return {
        stdout: wrapUntrusted("bash stdout", stdout.slice(0, OUTPUT_MAX_BYTES)),
        stderr: wrapUntrusted("bash stderr", stderr.slice(0, OUTPUT_MAX_BYTES)),
        truncated,
      };
    });
  },
});
