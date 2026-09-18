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
  ".docker", ".kube", ".kubeconfig", "id_rsa", "id_ecdsa", "id_ed25519", "keychain", "keychains", "auth.json",
  "secrets", ".authinfo",
  // The user-domain stores, spelled as the disk spells them: the text
  // tripwire lowercases, the kernel does not.
  "Library/Keychains", "Library/Cookies",
  // The app's own stores and the launch agents that start it.
  ".useful-bot", "LaunchAgents",
  // Shell startup files: a planted line runs in the owner's own shell.
  ".zshenv", ".zprofile", ".zshrc", ".zlogin", ".zlogout",
  ".bash_profile", ".bashrc", ".bash_login", ".bash_logout", ".profile", ".inputrc",
  "config.fish", ".config/fish",
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
 * Names whose contents are never read by a line that ran without a card.
 * The text tripwire in `bash` is only as good as the text (`cat .e*` names
 * no `.env`), so the kernel refuses the read too. Inside a project folder
 * the build tooling itself reads `.env`, `.npmrc`, `.docker` and `.kube`
 * (dotenv, the registry, the daemon), so those stay readable there; under
 * the home and for read-only lines nothing legitimately needs them.
 */
const READ_DENIED_NAMES = PROTECTED_NAMES.filter((name) => !name.startsWith(".z") && !name.startsWith(".bash") && name !== ".profile" && name !== ".inputrc");
const TOOLING_READS = new Set([".env", ".npmrc", ".docker", ".kube"]);

export type SandboxScope = "folder" | "computer";

/**
 * `root` is the folder the line may write under. Null means none at all: a
 * line judged read-only runs with every write refused except the temp and
 * cache dirs, so a misjudged line still cannot change a file. `scope` says
 * whether that root is a project folder the owner handed over or their
 * home, which decides how strict the read denies are. `unbounded` is Full
 * access: writes land anywhere on the Mac, and only the credential files,
 * the app's own stores and the shell startup files stay refused.
 */
/**
 * System paths the text tripwire in `bash` refuses by substring. The scoped
 * profiles never allowed a write there; the unbounded one says so itself,
 * so a spelling the substring misses still cannot land.
 */
const SYSTEM_WRITE_DENIED = ["/etc", "/private/etc", "/var/db", "/private/var/db", "/Library/Keychains", "/Library/Cookies"];

export function sandboxProfile(root: string | null, scope: SandboxScope = "computer", unbounded = false): string {
  const real = root === null ? null : realpathSync(root);
  // Tools that ignore TMPDIR fall back to the darwin per-user dirs; those
  // sit beside each other under one parent (.../T for temp, .../C for cache).
  const temp = realpathSync(tmpdir());
  const cache = join(dirname(temp), "C");
  const protectedRules = PROTECTED_NAMES.map(
    (name) => `(deny file-write* (regex #"/${regexEscape(name)}($|[/.])"))`,
  );
  // Inside a project folder the build tooling reads its own .env and the
  // like. Scoped, that is the whole of what the line can reach anyway;
  // unbounded, the deny stays on for the rest of the disk and only the
  // folder's own copies are allowed back (a later rule wins).
  const tooling = root !== null && scope === "folder";
  const readDenied = tooling && !unbounded
    ? READ_DENIED_NAMES.filter((name) => !TOOLING_READS.has(name))
    : READ_DENIED_NAMES;
  const readRules = [
    ...readDenied.map((name) => `(deny file-read* (regex #"/${regexEscape(name)}($|[/.])"))`),
    ...(tooling && unbounded && real !== null
      ? [...TOOLING_READS].map((name) => `(allow file-read* (regex #"^${regexEscape(real)}(/.*)?/${regexEscape(name)}($|[/.])"))`)
      : []),
  ];
  return [
    "(version 1)",
    "(allow default)",
    ...(unbounded ? SYSTEM_WRITE_DENIED.map((path) => `(deny file-write* (subpath ${sbplString(path)}))`) : [
      "(deny file-write*)",
      ...(real === null ? [] : [`(allow file-write* (subpath ${sbplString(real)}))`]),
      `(allow file-write* (subpath ${sbplString(temp)}))`,
      `(allow file-write* (subpath ${sbplString(cache)}))`,
      '(allow file-write* (subpath "/dev"))',
    ]),
    ...protectedRules,
    ...readRules,
  ].join("\n");
}

/** The argv that runs `command` confined to `root` (null: no writes at all). */
export function confinedCommand(root: string | null, command: string, scope: SandboxScope = "computer", unbounded = false): string[] {
  return [SANDBOX_EXEC, "-p", sandboxProfile(root, scope, unbounded), "/bin/sh", "-c", command];
}
