export type Alias = "workhorse" | "reviewer";
export type Profile = "desktop" | "phone" | "reviewer" | "eval";
export type SandboxBackendName = "microsandbox" | "docker" | "just-bash";
export type Isolation = "verified-vm" | "non-vm";

export const POLICY_WINDOW_TOKENS = 131_072;
export const POLICY_OUTPUT_TOKENS = 4_096;
export const POLICY_APPROVAL_TTL_MS = 5 * 60 * 1000;
export const POLICY_NODE_MAJOR = 24;
export const POLICY_EVE_VERSION = "0.54.3";
export const ABSOLUTE_NODE = "/usr/local/bin/node";
export const ROUTER_HOST = "127.0.0.1";
export const ROUTER_PORT = 4319;
export const EVE_HOST = "127.0.0.1";
export const EVE_PORT = 4321;
export const BODY_LIMIT_BYTES = 1_048_576;
export const WRITE_MAX_BYTES = 64 * 1024;
export const READ_MAX_BYTES = 16 * 1024;

export const CALLER_LIMITS = {
  desktop: { aliases: ["workhorse"], search: true, rpm: 12, requests24h: 200, input24h: 2_000_000, output24h: 200_000 },
  phone: { aliases: ["workhorse"], search: true, rpm: 4, requests24h: 40, input24h: 400_000, output24h: 40_000 },
  reviewer: { aliases: ["reviewer"], search: false, rpm: 4, requests24h: 20, input24h: 300_000, output24h: 80_000 },
  eval: { aliases: ["workhorse", "reviewer"], search: true, rpm: 12, requests24h: 80, input24h: 1_000_000, output24h: 160_000 },
  ops: { aliases: [], search: false, rpm: 30, requests24h: 0, input24h: 0, output24h: 0 },
} as const;

// Aggregate ceiling shared by every model caller, not a subscription entitlement.
export const AGGREGATE_LIMITS = {
  requests24h: 300,
  input24h: 3_000_000,
  output24h: 400_000,
} as const;

export const MAX_ACTIVE_UPSTREAM = 2;
export const MAX_ACTIVE_PER_CALLER = 1;

export const MAX_MESSAGE_COUNT = 256;
export const MAX_TOOL_SCHEMAS = 32;
export const MAX_TOOL_SCHEMA_BYTES = 128 * 1024;

export const FORBIDDEN_PATH_SUBSTRINGS = [
  ".env",
  "secrets",
  ".ssh",
  ".aws",
  ".gnupg",
  ".git",
  "LaunchAgents",
  "auth.json",
] as const;
