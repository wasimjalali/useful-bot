import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
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
  docs: string;
};

export const CLI_REGISTRY: readonly CliEntry[] = [
  {
    id: "codex",
    label: "OpenAI Codex",
    install: "npm install -g @openai/codex",
    signIn: { kind: "file", paths: [".codex/auth.json"] },
    docs: "https://developers.openai.com/codex/cli",
  },
  {
    id: "claude",
    label: "Claude Code",
    install: "npm install -g @anthropic-ai/claude-code",
    // macOS keeps this one in the login keychain; the file is the fallback
    // on an install that predates that or runs with a different store.
    signIn: { kind: "keychain", service: "Claude Code-credentials", paths: [".claude/.credentials.json"] },
    docs: "https://docs.claude.com/en/docs/claude-code",
  },
  {
    id: "opencode",
    label: "opencode",
    install: "npm install -g opencode-ai",
    signIn: { kind: "file", paths: [".local/share/opencode/auth.json"] },
    docs: "https://opencode.ai/docs",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    install: "npm install -g @google/gemini-cli",
    signIn: { kind: "file", paths: [".gemini/oauth_creds.json"] },
    docs: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "gh",
    label: "GitHub CLI",
    // No npm package; Homebrew is the supported install on macOS, and a Mac
    // without Homebrew gets that as the error rather than a silent miss.
    install: "brew install gh",
    signIn: { kind: "file", paths: [".config/gh/hosts.yml"] },
    docs: "https://cli.github.com",
  },
  {
    id: "wrangler",
    label: "Cloudflare Wrangler",
    install: "npm install -g wrangler",
    // Its store sits among the owner's other credentials and the sandbox
    // refuses it in every posture, so the CLI reports its own auth instead.
    signIn: null,
    docs: "https://developers.cloudflare.com/workers/wrangler",
  },
  {
    id: "vercel",
    label: "Vercel CLI",
    install: "npm install -g vercel",
    signIn: null,
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
