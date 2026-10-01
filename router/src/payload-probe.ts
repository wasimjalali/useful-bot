import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stackName } from "../../shared/stack.ts";

/**
 * Dev-only payload probe (UB-009). With UB_PAYLOAD_PROBE_DIR set, every
 * request body the router sends to a provider is written there as JSON, so
 * "what the model sees" can be read, not guessed. The body only: headers
 * never reach this module, and anything credential-shaped in the body is
 * replaced. Refused outright on the daily stack.
 */

type Env = Record<string, string | undefined>;

const SECRET_KEY = /^(authorization|proxy-authorization|api[-_]?key|x-api-key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|client[-_]?secret|password|bearer)$/i;
const SECRET_VALUE = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\b(?:ghp|gho|ghs|github_pat|xox[abprs]|AKIA|AIza)[A-Za-z0-9_-]{12,}/g,
];
export const REDACTED = "[redacted]";

export function scrub(value: unknown): unknown {
  if (typeof value === "string") return SECRET_VALUE.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = SECRET_KEY.test(key) ? REDACTED : scrub(inner);
    return out;
  }
  return value;
}

let announced = false;

/** The folder to dump into, or null. A daily stack never gets one. */
export function probeDir(env: Env = process.env): string | null {
  const dir = env.UB_PAYLOAD_PROBE_DIR?.trim();
  if (!dir) return null;
  if (stackName(env) !== "dev") {
    if (!announced) {
      announced = true;
      process.stderr.write(`${JSON.stringify({ service: "router", warning: "payload_probe_refused", reason: "not the dev stack" })}\n`);
    }
    return null;
  }
  if (!announced) {
    announced = true;
    process.stderr.write(`${JSON.stringify({ service: "router", warning: "payload_probe_active", dir })}\n`);
  }
  return dir;
}

/** Never throws: a probe that cannot write must not fail a turn. */
export function dumpUpstreamBody(upstream: string, model: string, body: unknown, env: Env = process.env): string | null {
  const dir = probeDir(env);
  if (!dir) return null;
  try {
    mkdirSync(dir, { recursive: true });
    const safe = (text: string) => text.replace(/[^A-Za-z0-9._-]+/g, "_");
    const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safe(upstream)}-${safe(model)}.json`);
    writeFileSync(file, JSON.stringify(scrub(body), null, 2), { mode: 0o600 });
    return file;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ service: "router", warning: "payload_probe_write_failed", message: (error as Error).message })}\n`);
    return null;
  }
}
