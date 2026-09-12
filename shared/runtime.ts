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
  return raw as unknown as RuntimeConfig;
}

export function limitsFor(profile: Profile | "ops") {
  return CALLER_LIMITS[profile];
}
