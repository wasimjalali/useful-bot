import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir, tmpdir } from "node:os";
import { effectiveRoot } from "../lib/workspace.ts";
import { commandRisk, readOnlyRisk, wipeRisk } from "../lib/command-risk.ts";
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
  // The app's own stores: approvals, the roster, the grants. read_file and
  // list_dir refuse the same name; a shell line must not be the way round.
  ".useful-bot",
  "/etc",
  "/private/etc",
  "/var/db",
  "/library/keychains",
  "/library/cookies",
];
/**
 * `..` is a path traversal marker in the scoped postures: it costs the odd
 * benign `echo "a..b"`, but the owner still sees the command on a card, so
 * a false block is a retype, while a miss is a read the card made look
 * routine. Full access has no folder boundary to traverse, so it keeps only
 * the credential list above.
 */
const SCOPED_COMMAND_SUBSTRINGS = [".."];

function blockedReason(command: string, scoped: boolean): string | null {
  const lowered = command.toLowerCase();
  for (const part of scoped ? [...BLOCKED_COMMAND_SUBSTRINGS, ...SCOPED_COMMAND_SUBSTRINGS] : BLOCKED_COMMAND_SUBSTRINGS) {
    if (lowered.includes(part.toLowerCase())) return `command references ${part}`;
  }
  return null;
}

export default defineTool({
  description: "Run a shell command on this Mac, in the attached folder or under the owner's home when none is attached. Lines that only read run at once; what else runs without asking depends on the owner's permission: Full access runs everything, anywhere on the Mac, and asks only before a wipe. Not a login shell.",
  inputSchema: z.object({
    command: z.string().min(1).max(8192),
    timeoutMs: z.number().int().min(1).max(60_000).optional(),
  }),
  async execute(input, ctx) {
    // One grant read for root AND permission: two reads could pair a root
    // from before a permission change with the permission after it. A
    // grant whose folder is gone still answers a tripwired line with the
    // block, not a workspace error.
    let workspace;
    try {
      workspace = effectiveRoot(ctx?.session?.id);
    } catch (error) {
      const blocked = blockedReason(input.command, true);
      if (blocked) return { status: "blocked", error: blocked };
      throw error;
    }
    const { root, permission, scope } = workspace;
    // The HOME the line runs with, so `~` in it is the root in both scopes.
    const shellHome = root;
    const blocked = blockedReason(input.command, permission !== "full_access");
    if (blocked) {
      return { status: "blocked", error: blocked };
    }
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
    // access runs every line, wherever on the Mac it reaches, and stops
    // only for a wipe: a remover aimed at the disk, a volume, a home or a
    // top-level folder in one, or disk formatting. The tripwire above still
    // refuses credential paths in every posture.
    let risk: string | null = null;
    let askOwner = true;
    if (readOnly) {
      askOwner = false;
    } else if (permission === "full_access") {
      // `~` is what the line runs with (`shellHome` below); the owner's
      // real home is where the top-level folders are.
      risk = wipeRisk(input.command, root, shellHome, scope === "computer" ? root : homedir());
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
      // so a line the classifier misjudged still cannot write outside it.
      // Full access writes anywhere but into credential files and the
      // app's own stores. A line the owner approved runs as they read it.
      const args = askOwner
        ? ["/bin/sh", "-c", input.command]
        : confinedCommand(readOnly ? null : root, input.command, scope, permission === "full_access" && !readOnly);
      let stdout: string;
      let stderr: string;
      let exitCode = 0;
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
            HOME: shellHome,
            // A read-only line runs with no writable root at all, so its
            // temp dir is the system one the sandbox profile allows.
            TMPDIR: readOnly ? tmpdir() : root,
            LANG: "C",
          },
        }));
      } catch (err) {
        // A line that exits non-zero (`grep` with no match, a failing test)
        // is a result, not a tool failure: the exit code and the output go
        // back as they are. Rejecting instead would hand the model an error
        // whose text is the whole sandbox command line, which reads like a
        // permission refusal. Output past the input cap rejects the whole
        // execFile call with the partial output attached; clip what came
        // through. Anything else (a spawn failure, an abort) is real.
        const failed = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; signal?: string | null };
        const exited = typeof failed.code === "number" && !failed.signal;
        if (!exited && failed.code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw err;
        // A line killed at the output cap did not finish: not exit 0.
        exitCode = typeof failed.code === "number" ? failed.code : 1;
        stdout = failed.stdout ?? "";
        stderr = failed.stderr ?? "";
      }
      const truncated = stdout.length > OUTPUT_MAX_BYTES || stderr.length > OUTPUT_MAX_BYTES;
      return {
        stdout: wrapUntrusted("bash stdout", stdout.slice(0, OUTPUT_MAX_BYTES)),
        stderr: wrapUntrusted("bash stderr", stderr.slice(0, OUTPUT_MAX_BYTES)),
        exitCode,
        truncated,
      };
    });
  },
});
