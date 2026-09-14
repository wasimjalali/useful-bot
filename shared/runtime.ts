import { readFileSync, existsSync } from "node:fs";
import { CALLER_LIMITS, type Profile } from "./policy.ts";

export interface CredentialDigest {
  id: string;
  kind: "device" | "channel" | "router";
  sha256: string;
  callerId: string;
  profile: Profile | "ops";
  expiresAt: string;
  revokedAt: string | null;
}

export interface RuntimeConfig {
  schemaVersion: 1;
  phoneEnabled: boolean;
  tailnet: null;
  sandbox: { backend: "just-bash"; evidenceId: string; imageDigest: null };
  goBalanceDisabledConfirmedAt: string | null;
  searchKeyRequired: false;
  credentials: CredentialDigest[];
}

const ALLOWED_KEYS = new Set([
  "schemaVersion",
  "phoneEnabled",
  "tailnet",
  "sandbox",
  "goBalanceDisabledConfirmedAt",
  "searchKeyRequired",
  "credentials",
]);

const CREDENTIAL_KINDS = new Set(["device", "channel", "router"]);
const CREDENTIAL_PROFILES = new Set(Object.keys(CALLER_LIMITS));

function validateCredential(value: unknown, index: number): void {
  const fail = (reason: string): never => {
    throw new Error(`runtime_config_credential:${index}:${reason}`);
  };
  if (!value || typeof value !== "object") fail("shape");
  const cred = value as Record<string, unknown>;
  if (typeof cred.id !== "string" || cred.id.length === 0) fail("id");
  if (typeof cred.kind !== "string" || !CREDENTIAL_KINDS.has(cred.kind)) fail("kind");
  if (typeof cred.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(cred.sha256)) fail("sha256");
  if (typeof cred.callerId !== "string" || cred.callerId.length === 0) fail("callerId");
  if (typeof cred.profile !== "string" || !CREDENTIAL_PROFILES.has(cred.profile)) fail("profile");
  if (typeof cred.expiresAt !== "string" || !Number.isFinite(Date.parse(cred.expiresAt))) fail("expiresAt");
  if (cred.revokedAt !== null
    && (typeof cred.revokedAt !== "string" || !Number.isFinite(Date.parse(cred.revokedAt)))) {
    fail("revokedAt");
  }
}

export function loadRuntimeConfig(path: string): RuntimeConfig {
  if (!existsSync(path)) {
    throw new Error(`runtime_config_missing:${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`runtime_config_unknown_key:${key}`);
    }
  }
  if (raw.schemaVersion !== 1) {
    throw new Error("runtime_config_schema");
  }
  if (raw.searchKeyRequired !== false) {
    throw new Error("runtime_config_search_key");
  }
  const credentials = raw.credentials;
  if (!Array.isArray(credentials)) {
    throw new Error("runtime_config_credentials");
  }
  credentials.forEach((credential, index) => validateCredential(credential, index));
  return raw as unknown as RuntimeConfig;
}

export function limitsFor(profile: Profile | "ops") {
  return CALLER_LIMITS[profile];
}
