import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { loadRuntimeConfig, type CredentialDigest } from "../../shared/runtime.ts";
import {
  dropBrowserSession,
  getBrowserSession,
  putBrowserSession,
  type BrowserSession,
} from "../../shared/web-sessions.ts";

const COOKIE = "ub_session";

/** Browser session lifetime. Kept in one place so cookie and record cannot drift. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function loadDeviceCredentials(): CredentialDigest[] {
  const path = process.env.UB_ROUTER_CONFIG;
  if (!path) return [];
  try {
    return loadRuntimeConfig(path).credentials.filter((item) => item.kind === "device" || item.kind === "router");
  } catch {
    return [];
  }
}

export function verifyDeviceToken(token: string): { callerId: string; profile: string } | null {
  const presented = digest(token);
  const now = Date.now();
  for (const cred of loadDeviceCredentials()) {
    const stored = Buffer.from(cred.sha256, "hex");
    if (stored.length !== 32) continue;
    if (!timingSafeEqual(presented, stored)) continue;
    if (cred.revokedAt) continue;
    if (Date.parse(cred.expiresAt) <= now) continue;
    return { callerId: cred.callerId, profile: cred.profile };
  }
  return null;
}

export function createBrowserSession(callerId: string, profile: string): { token: string; csrf: string; expiresAt: number } {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  putBrowserSession(token, { callerId, profile, csrf, expiresAt });
  return { token, csrf, expiresAt };
}

export async function readSession(): Promise<BrowserSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return getBrowserSession(token);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) dropBrowserSession(token);
}

export function sessionCookie(token: string): string {
  // Matching the server-side session expiry, so the app survives a reload.
  // Secure is intentionally omitted: the UI is loopback http today, and adding
  // it (with a __Host- prefix) is required before serving the UI over https.
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export { COOKIE };
