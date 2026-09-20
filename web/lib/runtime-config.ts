import { statSync } from "node:fs";
import { loadRuntimeConfig, type CredentialDigest, type RuntimeConfig } from "../../shared/runtime.ts";

/**
 * Runtime config cached on the file's mtime+size (spec S9): revocation takes
 * effect on the next request without a restart, while a busy route does not
 * re-read the file per call. The cache key includes the path so a test that
 * rewrites UB_ROUTER_CONFIG between cases cannot read the previous config.
 *
 * Kept free of next/ imports so the ingress classifier and tests can use it
 * under node --test.
 */
let configCache: { path: string; mtimeMs: number; size: number; config: RuntimeConfig | null } | null = null;

export function runtimeConfig(): RuntimeConfig | null {
  const path = process.env.UB_ROUTER_CONFIG;
  if (!path) return null;
  let stat;
  try {
    stat = statSync(path);
  } catch {
    configCache = null;
    return null;
  }
  if (configCache
    && configCache.path === path
    && configCache.mtimeMs === stat.mtimeMs
    && configCache.size === stat.size) {
    return configCache.config;
  }
  let config: RuntimeConfig | null = null;
  try {
    config = loadRuntimeConfig(path);
  } catch {
    config = null;
  }
  configCache = { path, mtimeMs: stat.mtimeMs, size: stat.size, config };
  return config;
}

/** The device/router rows a Bearer token may sign in under. */
export function deviceCredentials(): CredentialDigest[] {
  return (runtimeConfig()?.credentials ?? [])
    .filter((item) => item.kind === "device" || item.kind === "router");
}

/**
 * The credential row a session is bound to (S9), re-resolved per request.
 * Returns the row while it is still usable, null when it is missing, revoked,
 * or expired — the gate turns that into 401 `credential_invalid`.
 */
export function credentialById(id: string): CredentialDigest | null {
  const now = Date.now();
  // An id can leave a revoked row behind beside its live replacement
  // (--rotate-phone keeps the history), so resolve to the row that is
  // actually usable rather than the first match.
  return (runtimeConfig()?.credentials ?? [])
    .find((row) => row.id === id && !row.revokedAt && Date.parse(row.expiresAt) > now) ?? null;
}

/** Spec S9/§4.6: a `phone` session is invalid the moment `phoneEnabled` is false. */
export function phoneDisabled(): boolean {
  return runtimeConfig()?.phoneEnabled !== true;
}
