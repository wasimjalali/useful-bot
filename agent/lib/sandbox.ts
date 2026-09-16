import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Confinement for a shell line that runs without a card.
 *
 * The classifier reads the line; this decides what the line may touch once
 * it runs, whatever the text said. macOS's seatbelt refuses every file
 * write outside the granted folder (plus this user's temp and cache dirs
 * and /dev), and refuses writes to credential files even inside it. Reads
 * stay open: the folder grant already allows them, and a build needs the
 * toolchain. A line the owner approved on a card runs unconfined, because
 * they read it and said yes to exactly that.
 */

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** Names that never take a write inside the folder, whatever the mode. */
const PROTECTED_NAMES = [
  ".env", ".ssh", ".aws", ".gnupg", ".netrc", "netrc", ".npmrc", ".pypirc",
  ".docker", ".kube", "id_rsa", "id_ecdsa", "id_ed25519", "keychains", "auth.json",
  // The app's own stores and the launch agents that start it.
  ".useful-bot", "LaunchAgents",
  // Shell startup files: a planted line runs in the owner's own shell.
  ".zshenv", ".zprofile", ".zshrc", ".zlogin", ".zlogout",
  ".bash_profile", ".bashrc", ".bash_login", ".bash_logout", ".profile", ".inputrc",
];

export function sandboxAvailable(): boolean {
  return process.platform === "darwin" && existsSync(SANDBOX_EXEC);
}

function sbplString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `root` is the folder the line may write under. Null means none at all: a
 * line judged read-only runs with every write refused except the temp and
 * cache dirs, so a misjudged line still cannot change a file.
 */
export function sandboxProfile(root: string | null): string {
  const real = root === null ? null : realpathSync(root);
  // Tools that ignore TMPDIR fall back to the darwin per-user dirs; those
  // sit beside each other under one parent (.../T for temp, .../C for cache).
  const temp = realpathSync(tmpdir());
  const cache = join(dirname(temp), "C");
  const protectedRules = PROTECTED_NAMES.map(
    (name) => `(deny file-write* (regex #"/${regexEscape(name)}($|[/.])"))`,
  );
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    ...(real === null ? [] : [`(allow file-write* (subpath ${sbplString(real)}))`]),
    `(allow file-write* (subpath ${sbplString(temp)}))`,
    `(allow file-write* (subpath ${sbplString(cache)}))`,
    '(allow file-write* (subpath "/dev"))',
    ...protectedRules,
  ].join("\n");
}

/** The argv that runs `command` confined to `root` (null: no writes at all). */
export function confinedCommand(root: string | null, command: string): string[] {
  return [SANDBOX_EXEC, "-p", sandboxProfile(root), "/bin/sh", "-c", command];
}
