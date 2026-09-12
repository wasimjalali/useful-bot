import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { loadRuntimeConfig, type CredentialDigest } from "../../shared/runtime.ts";

const COOKIE = "ub_session";
const sessions = new Map<string, { callerId: string; profile: string; csrf: string; expiresAt: number }>();

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
  const testHash = process.env.UB_WEB_DEVICE_SHA256;
  if (testHash) {
    const stored = Buffer.from(testHash, "hex");
    if (stored.length === 32 && timingSafeEqual(presented, stored)) {
      return { callerId: "desktop", profile: "desktop" };
    }
  }
  return null;
}

export function createBrowserSession(callerId: string, profile: string): { token: string; csrf: string; expiresAt: number } {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  sessions.set(createHash("sha256").update(token).digest("hex"), { callerId, profile, csrf, expiresAt });
  return { token, csrf, expiresAt };
}

export async function readSession(): Promise<{ callerId: string; profile: string; csrf: string } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rec = sessions.get(createHash("sha256").update(token).digest("hex"));
  if (!rec || rec.expiresAt <= Date.now()) return null;
  return rec;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export { COOKIE };
