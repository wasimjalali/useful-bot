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

export function sandboxProfile(root: string): string {
  const real = realpathSync(root);
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
    `(allow file-write* (subpath ${sbplString(real)}))`,
    `(allow file-write* (subpath ${sbplString(temp)}))`,
    `(allow file-write* (subpath ${sbplString(cache)}))`,
    '(allow file-write* (subpath "/dev"))',
    ...protectedRules,
  ].join("\n");
}

/** The argv that runs `command` confined to `root`. */
export function confinedCommand(root: string, command: string): string[] {
  return [SANDBOX_EXEC, "-p", sandboxProfile(root), "/bin/sh", "-c", command];
}
