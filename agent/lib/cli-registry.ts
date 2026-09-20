import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { loneCommandHead } from "./command-risk.ts";
import { ownerPath } from "../../shared/user-path.ts";

/**
 * The command-line tools a bot knows how to look for and install.
 *
 * A fixed table rather than a free-form `npm install -g <whatever the model
 * guessed>`: the package name for a CLI is rarely the command's own name
 * (`claude` ships as `@anthropic-ai/claude-code`), a wrong guess installs
 * someone else's package under a name the owner will then trust, and an
 * approval card is only useful if what it shows was chosen from a list
 * rather than assembled. Anything not here is still installable by hand
 * through `bash`, where the owner reads the whole line.
 */

/** How to tell whether a CLI already holds a sign-in. */
export type SignInCheck =
  /** Any one of these paths existing. Never read, only looked for. */
  | { kind: "file"; paths: string[] }
  /** A keychain item by service name. Looked up without its password. */
  | { kind: "keychain"; service: string; paths?: string[] };

export type CliEntry = {
  /** The name the owner and the model use, and the command on PATH. */
  id: string;
  label: string;
  /** The exact line an install runs. Shown on the approval card verbatim. */
  install: string;
  /** Null when the CLI has no stored credential worth probing for. */
  signIn: SignInCheck | null;
   /**
   * State this CLI keeps somewhere its own name does not imply, ADDED to
   * what the name does. `credentialPathsFor` derives `~/.<name>`,
   * `~/.config/<name>` and the two `~/.local` ones for any program on PATH,
   * so almost every CLI needs nothing here, including ones this table has
   * never heard of. The exceptions are the two that keep their token in the
   * macOS keyring, which no name can imply: Claude Code and gh.
   */
  state: string[];
  docs: string;
};

export const CLI_REGISTRY: readonly CliEntry[] = [
  {
    id: "codex",
    label: "OpenAI Codex",
    install: "npm install -g @openai/codex",
    signIn: { kind: "file", paths: [".codex/auth.json"] },
    // `~/.codex` is derived from the name.
    state: [],
    docs: "https://developers.openai.com/codex/cli",
  },
  {
    id: "claude",
    label: "Claude Code",
    install: "npm install -g @anthropic-ai/claude-code",
    // macOS keeps this one in the login keychain; the file is the fallback
    // on an install that predates that or runs with a different store.
    signIn: { kind: "keychain", service: "Claude Code-credentials", paths: [".claude/.credentials.json"] },
    // The login keychain, which the `/keychains` deny refuses. Nothing under
    // `~/.claude` itself is denied, so it needs no rule of its own.
    state: ["Library/Keychains/login.keychain-db"],
    docs: "https://docs.claude.com/en/docs/claude-code",
  },
  {
    id: "opencode",
    label: "opencode",
    install: "npm install -g opencode-ai",
    signIn: { kind: "file", paths: [".local/share/opencode/auth.json"] },
    state: [],
    docs: "https://opencode.ai/docs",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    install: "npm install -g @google/gemini-cli",
    signIn: { kind: "file", paths: [".gemini/oauth_creds.json"] },
    state: [],
    docs: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "gh",
    label: "GitHub CLI",
    // No npm package; Homebrew is the supported install on macOS, and a Mac
    // without Homebrew gets that as the error rather than a silent miss.
    install: "brew install gh",
    signIn: { kind: "file", paths: [".config/gh/hosts.yml"] },
    // `hosts.yml` records the account but not the token: gh keeps that in the
    // macOS keyring, so without this it reads its own host file, finds no
    // usable token and reports "the token in default is invalid". Caught by
    // running `gh auth status` through the profile, not by reading the code.
    state: ["Library/Keychains/login.keychain-db"],
    docs: "https://cli.github.com",
  },
  {
    id: "wrangler",
    label: "Cloudflare Wrangler",
    install: "npm install -g wrangler",
    // Its store sits among the owner's other credentials and the sandbox
    // refuses it in every posture, so the CLI reports its own auth instead.
    signIn: null,
    state: [],
    docs: "https://developers.cloudflare.com/workers/wrangler",
  },
  {
    id: "vercel",
    label: "Vercel CLI",
    install: "npm install -g vercel",
    signIn: null,
    state: [],
    docs: "https://vercel.com/docs/cli",
  },
] as const;

export function findCli(name: string): CliEntry | null {
  const wanted = name.trim().toLowerCase();
  return CLI_REGISTRY.find((entry) => entry.id === wanted) ?? null;
}

/**
 * Where a command name resolves on the PATH a bot's shell lines run with, or
 * null. Walks the directories rather than shelling out to `which`, so
 * listing seven CLIs costs no processes at all.
 */
export function resolveBin(name: string, path = ownerPath()): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

const KEYCHAIN_PROBE_TIMEOUT_MS = 5_000;

/**
 * Whether the item exists. Deliberately without `-w`: this asks the keychain
 * a yes-or-no question and never takes the secret out of it, so the answer
 * can be reported to the model without handing it anything.
 */
function keychainItemExists(service: string): boolean {
  try {
    execFileSync("/usr/bin/security", ["find-generic-password", "-s", service], {
      timeout: KEYCHAIN_PROBE_TIMEOUT_MS,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the CLI looks signed in, or null when it keeps no store this can
 * ask about. A stored credential is not a valid one: an expired token looks
 * the same from here, which is why the wording the tool returns says the
 * sign-in is present rather than that it works.
 */
export function signedIn(entry: CliEntry): boolean | null {
  if (!entry.signIn) return null;
  const home = homedir();
  const files = entry.signIn.paths ?? [];
  if (files.some((relative) => existsSync(join(home, relative)))) return true;
  if (entry.signIn.kind === "keychain") return keychainItemExists(entry.signIn.service);
  return false;
}

export type CliStatus = {
  name: string;
  label: string;
  path: string | null;
  installed: boolean;
  /** Null when there is nothing to check; see `signedIn`. */
  signedIn: boolean | null;
  install: string;
  docs: string;
};

/**
 * The credential stores one shell line may reach, which is the store of the
 * CLI it runs and nothing else. Empty for every other line.
 *
 * Codex and Claude Code never had to solve this: in those products the CLI
 * is the parent process, so it reads its own token before it sandboxes
 * anything the model asked for. Here the CLI is the child, inside the
 * profile, so the profile has to let it through. Deciding that per command
 * rather than per posture is what keeps `cat` out of the keychain while
 * `claude -p` still authenticates.
 *
 * `loneCommandHead` refuses anything but a single plain command, so a chain,
 * a pipe, a substitution or a redirection gets nothing, whatever it names.
 */
export function credentialPathsFor(command: string, path = ownerPath()): string[] {
  const head = loneCommandHead(command);
  if (!head) return [];
  // A relative program (`./codex`) is not the CLI on PATH, whatever it is
  // called, and resolving it would depend on a cwd this cannot verify.
  if (head.includes("/") && !head.startsWith("/")) return [];
  const name = head.slice(head.lastIndexOf("/") + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return [];
  // The program has to be one the owner really has, or any word at all would
  // name a directory to open.
  const resolved = resolveBin(name, path);
  if (!resolved) return [];
  if (head.startsWith("/")) {
    // An absolute path only inherits the credentials if it IS the binary the
    // bare name resolves to. `/tmp/evil/codex` is not codex.
    try {
      if (realpathSync(head) !== realpathSync(resolved)) return [];
    } catch {
      return [];
    }
  }
  const home = realpathSync(homedir());
  // The registry ADDS to what the name implies rather than replacing it: gh
  // needs both its own directory and the keyring, and a row that quietly
  // dropped the derived half would have been a second version of the bug
  // this whole change is about.
  const stores = [...new Set([...derivedStores(name), ...(findCli(name)?.state ?? [])])];
  return stores
    .map((relative) => join(home, relative))
    .filter((store) => literalStore(store, home));
}

/**
 * Whether the store is really the directory its path says it is.
 *
 * Without this, a derived name is a way through the deny list: a bot at Full
 * access can create `~/.anything` and a program called `anything` on a
 * writable PATH directory, and if `~/.anything` is a symlink then the
 * profile resolves it and opens whatever it points at, after the denies, so
 * the allow wins. `~/.anything -> ~/.ssh` would hand out the owner's keys.
 * The workspace root is screened the same way and for the same reason (see
 * `assertSafeRoot`): a path that is not what it says it is is not used.
 */
function literalStore(store: string, home: string): boolean {
  try {
    if (lstatSync(store).isSymbolicLink()) return false;
    const stat = statSync(store);
    if (!stat.isDirectory() && !stat.isFile()) return false;
    // resolve() is lexical; realpath sees through a link in any component
    // above it too.
    if (realpathSync(store) !== store) return false;
    if (!store.startsWith(`${home}/`)) return false;
    const relative = store.slice(home.length + 1);
    // The protected list stays the last gate for everything, registry rows
    // included, so a row added later cannot quietly open `~/.ssh`. The one
    // way past it is this list: named in full, and a FILE, so no row can
    // satisfy the exemption with the directory that file sits in.
    if (PROTECTED_STORE_EXEMPT.has(relative)) return stat.isFile();
    return !namesProtectedStore(relative);
  } catch {
    return false;
  }
}

/**
 * The exact paths a registry row may open although the protected list names
 * them. Only the login keychain file, because two CLIs keep their token as a
 * keychain item and nothing else can reach it for them. Its siblings, and
 * every other keychain on this Mac, stay refused.
 */
const PROTECTED_STORE_EXEMPT = new Set(["Library/Keychains/login.keychain-db"]);

/**
 * Where a tool called `name` conventionally keeps its own state, for a CLI
 * the registry has never heard of.
 *
 * Without this, every CLI whose token file happens to be called `auth.json`
 * would report itself signed out until someone added a registry row, which
 * is the same class of bug as the PATH this change set out to fix. The
 * registry stays for what cannot be derived, like Claude Code's keychain
 * item; everything else follows the convention its own name implies.
 *
 * Still one directory, still only for the line that runs that program. A
 * tool named after a credential store the profile protects derives nothing:
 * a program called `ssh` does not get `~/.ssh` by being run.
 */
function derivedStores(name: string): string[] {
  // A program named after one of the shared directories would derive the
  // whole of it: `config` would open `~/.config`, every tool's settings
  // inside it, and `local` would open `~/.local`, the PATH directory
  // included. These are containers, never one tool's own state.
  if (RESERVED_DERIVED_NAMES.has(name.toLowerCase())) return [];
  const candidates = [
    `.${name}`,
    join(".config", name),
    join(".local", "share", name),
    join(".local", "state", name),
  ];
  return candidates.filter((relative) => !namesProtectedStore(relative) && !holdsProtectedStore(relative));
}

/** Container directories, which are nobody's own state. */
const RESERVED_DERIVED_NAMES = new Set([
  "config", "local", "share", "state", "cache", "bin", "lib", "library",
  "applications", "desktop", "documents", "downloads", "tmp", "var",
]);

/**
 * Whether the path is an ancestor of a store the profile protects. Opening
 * `~/.config` opens `~/.config/fish` with it, so the deny has to be read as
 * covering everything above it as well as the name itself.
 */
function holdsProtectedStore(relative: string): boolean {
  const lowered = relative.toLowerCase();
  return NEVER_DERIVED.some((name) => name.startsWith(`${lowered}/`));
}

/**
 * Whether a derived path would open one of the stores the profile refuses on
 * purpose. Matched on the whole relative path, the way the profile's own
 * rules are written, so `.config/fish` is caught as well as `.ssh`.
 */
function namesProtectedStore(relative: string): boolean {
  const lowered = relative.toLowerCase();
  return NEVER_DERIVED.some((name) => lowered === name || lowered.startsWith(`${name}/`) || lowered.endsWith(`/${name}`));
}

/**
 * Credential stores that are never a CLI's own working state, whatever a
 * program on PATH happens to be called. Kept beside the profile's deny list
 * rather than derived from it: this is the list that must not grow by
 * accident when a new protected name is added there.
 */
const NEVER_DERIVED = [
  ".ssh", ".aws", ".gnupg", ".docker", ".kube", ".npm", ".npmrc", ".pypirc",
  ".netrc", ".authinfo", ".config/fish", ".useful-bot", ".git", ".env",
  "library/keychains", "library/cookies",
];

export function cliStatus(entry: CliEntry, path = ownerPath()): CliStatus {
  const resolved = resolveBin(entry.id, path);
  return {
    name: entry.id,
    label: entry.label,
    path: resolved,
    installed: resolved !== null,
    // Only worth a keychain probe once the CLI is actually there.
    signedIn: resolved === null ? null : signedIn(entry),
    install: entry.install,
    docs: entry.docs,
  };
}
