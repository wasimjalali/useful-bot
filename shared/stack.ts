import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The one place that knows where this install keeps its state and which
 * ports and Keychain names it owns.
 *
 * Two stacks can run side by side: the daily app and the "Useful Bot Dev"
 * build. With no UB_STACK / UB_STATE_ROOT / port / prefix setting every value
 * here is today's daily literal, so a daily install behaves exactly as it
 * always has. The dev build's launcher sets UB_STACK=dev, UB_STATE_ROOT, the
 * three ports, UB_KEYCHAIN_PREFIX and UB_MEDIA_DIR, and `assertStack` refuses
 * to start a dev service with any of them missing or equal to the daily value,
 * so a partial dev environment can never quietly fall back onto the daily
 * stack's state, ports, Keychain items or media folder.
 *
 * Runtime code reads these through the functions below. No other module
 * carries 4319, 4320, 4321, `com.usefulbot.` or a `.useful-bot` path join
 * (test/dev-stack.test.ts greps for them).
 */

type Env = Record<string, string | undefined>;

export type StackName = "daily" | "dev";

export const LOOPBACK = "127.0.0.1";

/** What the daily app has always used. The dev stack must differ on every one. */
export const DAILY = {
  routerPort: 4319,
  webPort: 4320,
  evePort: 4321,
  keychainPrefix: "com.usefulbot",
  stateDir: ".useful-bot",
  mediaDir: "Useful Bot",
} as const;

/** The folder name the app's own stores live under, in any stack. */
export const APP_STATE_DIR = DAILY.stateDir;

const PORT_VARS = [
  ["UB_ROUTER_PORT", DAILY.routerPort],
  ["UB_WEB_PORT", DAILY.webPort],
  ["UB_EVE_PORT", DAILY.evePort],
] as const;

// Reverse-DNS shape, lower case, no trailing dot: "com.usefulbot", "com.usefulbot.dev".
const PREFIX_SHAPE = /^[a-z0-9]+(\.[a-z0-9][a-z0-9-]*)+$/;

export class StackConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`dev stack is misconfigured: ${problems.join("; ")}`);
    this.name = "StackConfigError";
    this.problems = problems;
  }
}

export function stackName(env: Env = process.env): StackName {
  const raw = env.UB_STACK?.trim();
  if (!raw || raw === "daily") return "daily";
  if (raw === "dev") return "dev";
  throw new Error(`UB_STACK must be "daily" or "dev", got "${raw}"`);
}

function homeDir(env: Env): string {
  return env.HOME || homedir();
}

/** Where every store lives: UB_STATE_ROOT, else ~/.useful-bot. */
export function stateRoot(env: Env = process.env): string {
  const raw = env.UB_STATE_ROOT;
  if (raw) return raw;
  return join(homeDir(env), DAILY.stateDir);
}

export function statePath(...segments: string[]): string {
  return join(stateRoot(), ...segments);
}

export function routerConfigPath(env: Env = process.env): string {
  return env.UB_ROUTER_CONFIG || join(stateRoot(env), "config.json");
}

export function routerDbPath(env: Env = process.env): string {
  return env.UB_ROUTER_DB || join(stateRoot(env), "router", "usage.sqlite");
}

function portFrom(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw.trim());
  if (!/^\d+$/.test(raw.trim()) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a port number from 1 to 65535, got "${raw}"`);
  }
  return value;
}

export function routerPort(env: Env = process.env): number {
  return portFrom(env, "UB_ROUTER_PORT", DAILY.routerPort);
}

export function webPort(env: Env = process.env): number {
  return portFrom(env, "UB_WEB_PORT", DAILY.webPort);
}

export function evePort(env: Env = process.env): number {
  return portFrom(env, "UB_EVE_PORT", DAILY.evePort);
}

/** `http://127.0.0.1:<router port>`, no path. */
export function routerOrigin(env: Env = process.env): string {
  return `http://${LOOPBACK}:${routerPort(env)}`;
}

/** The router's OpenAI-style base, ending in /v1. UB_ROUTER_BASE_URL still wins. */
export function routerApiBase(env: Env = process.env): string {
  return env.UB_ROUTER_BASE_URL ?? `${routerOrigin(env)}/v1`;
}

export function eveOrigin(env: Env = process.env): string {
  return `http://${LOOPBACK}:${evePort(env)}`;
}

/** The loopback origin the web service binds; UB_WEB_BASE_URL still wins. */
export function webOrigin(env: Env = process.env): string {
  return env.UB_WEB_BASE_URL || `http://${LOOPBACK}:${webPort(env)}`;
}

export function keychainPrefix(env: Env = process.env): string {
  const raw = env.UB_KEYCHAIN_PREFIX;
  if (raw === undefined || raw === "") return DAILY.keychainPrefix;
  if (!PREFIX_SHAPE.test(raw)) {
    throw new Error(`UB_KEYCHAIN_PREFIX must look like com.usefulbot.dev (lower case, dot separated), got "${raw}"`);
  }
  return raw;
}

/** A Keychain service name in this stack: `<prefix>.<name>`. */
export function keychainName(name: string, env: Env = process.env): string {
  return `${keychainPrefix(env)}.${name}`;
}

/**
 * Everything wrong with this environment for the stack it names. Empty means
 * fine. A daily environment is checked only for malformed values it chose to
 * set; a dev one must also set every stack value and none of them may equal
 * the daily one.
 */
export function stackProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  let stack: StackName;
  try {
    stack = stackName(env);
  } catch (error) {
    return [(error as Error).message];
  }
  const dev = stack === "dev";
  const home = homeDir(env);
  const set = (name: string) => env[name] !== undefined && env[name] !== "";

  for (const [name, daily] of PORT_VARS) {
    if (!set(name)) {
      if (dev) problems.push(`${name} is required on the dev stack`);
      continue;
    }
    try {
      const value = portFrom(env, name, daily);
      if (dev && value === daily) problems.push(`${name} is ${value}, the daily port`);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }

  if (!set("UB_KEYCHAIN_PREFIX")) {
    if (dev) problems.push("UB_KEYCHAIN_PREFIX is required on the dev stack");
  } else {
    try {
      const value = keychainPrefix(env);
      if (dev && value === DAILY.keychainPrefix) problems.push(`UB_KEYCHAIN_PREFIX is ${value}, the daily prefix`);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }

  if (dev) {
    const root = env.UB_STATE_ROOT;
    if (!root) {
      problems.push("UB_STATE_ROOT is required on the dev stack");
    } else if (!root.startsWith("/")) {
      problems.push(`UB_STATE_ROOT must be an absolute path, got "${root}"`);
    } else if (resolve(root) === resolve(home, DAILY.stateDir)) {
      problems.push(`UB_STATE_ROOT is ${resolve(root)}, the daily state root`);
    } else if (resolve(root) === resolve(home, ".useful-bot-dev")) {
      // The owner's older dev data lives there; the dev stack never adopts it.
      problems.push(`UB_STATE_ROOT is ${resolve(root)}, which holds older owner data`);
    }
    const media = env.UB_MEDIA_DIR;
    if (!media) {
      problems.push("UB_MEDIA_DIR is required on the dev stack");
    } else if (resolve(media) === resolve(home, "Documents", DAILY.mediaDir)) {
      problems.push(`UB_MEDIA_DIR is ${resolve(media)}, the daily media folder`);
    }
  }
  return problems;
}

/** Throws a StackConfigError when the dev stack's environment is incomplete or points at daily. */
export function assertStack(env: Env = process.env): void {
  const problems = stackProblems(env);
  if (problems.length > 0) throw new StackConfigError(problems);
}

/**
 * The startup check every service entry runs: print what is wrong and exit
 * non-zero, before anything is read, written, bound or launched.
 */
export function enforceStack(service: string, env: Env = process.env): void {
  const problems = stackProblems(env);
  if (problems.length === 0) return;
  process.stderr.write(`${JSON.stringify({ service, error: "stack_misconfigured", problems })}\n`);
  process.exit(1);
}

/**
 * `.useful-bot` and its dashed siblings (`.useful-bot-dev`,
 * `.useful-bot-dev-app`): every folder the app keeps state in, in any stack.
 * Not `.useful-botany`: the name ends there, or carries on with a separator.
 */
const APP_STATE_SEGMENT = /^\.useful-bot($|[^a-z0-9_])/i;
const APP_STATE_IN_TEXT = /\.useful-bot(?![a-z0-9_])/i;

/** True for one path segment that names an app-state folder. */
export function isAppStateSegment(segment: string): boolean {
  return APP_STATE_SEGMENT.test(segment);
}

/** True when a shell line (or any text) names an app-state folder anywhere in it. */
export function mentionsAppState(text: string): boolean {
  return APP_STATE_IN_TEXT.test(text);
}
