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
  // Owner decision 2026-09-15: every bot shares the desktop caller, so its day
  // is sized for a whole team, not one chat. OpenCode Go's own fair-use limit
  // is the real ceiling above this.
  desktop: { aliases: ["workhorse"], search: true, rpm: 12, requests24h: 2_000, input24h: 30_000_000, output24h: 3_000_000 },
  phone: { aliases: ["workhorse"], search: true, rpm: 4, requests24h: 40, input24h: 400_000, output24h: 40_000 },
  reviewer: { aliases: ["reviewer"], search: false, rpm: 4, requests24h: 20, input24h: 300_000, output24h: 80_000 },
  eval: { aliases: ["workhorse", "reviewer"], search: true, rpm: 12, requests24h: 80, input24h: 1_000_000, output24h: 160_000 },
  ops: { aliases: [], search: false, rpm: 30, requests24h: 0, input24h: 0, output24h: 0 },
} as const;

// Aggregate ceiling shared by every model caller, not a subscription entitlement.
export const AGGREGATE_LIMITS = {
  requests24h: 2_500,
  input24h: 32_000_000,
  output24h: 3_500_000,
} as const;

export const MAX_ACTIVE_UPSTREAM = 2;
export const MAX_ACTIVE_PER_CALLER = 1;

export const MAX_MESSAGE_COUNT = 256;
/**
 * A count, not the real bound: `MAX_TOOL_SCHEMA_BYTES` is what keeps the
 * upstream payload sane, and a schema's size has little to do with how many
 * there are. 32 was one below what this app actually sends (26 agent tools
 * plus eve's own, 33 in total on 2026-09-15), so adding a single tool killed
 * every turn with `unsupported_parameter`. The headroom here is for the
 * connector and per-session tools a bot picks up, which vary per roster;
 * the byte bound below is what actually protects the upstream.
 */
export const MAX_TOOL_SCHEMAS = 300;
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
  // Credential stores that sit under a home directory a grant may cover.
  // read_file is ungated, so a folder grant on $HOME would otherwise hand
  // these over with no approval card. The list cannot be exhaustive, which is
  // why granting a home directory is a bad idea rather than a safe one; it
  // covers what is both common and unambiguous. A file a project legitimately
  // needs is still reachable through bash, which always shows a card.
  // These earn a substring rule because the real files are named around them
  // (`.env.local`, `id_rsa.pub`). Credential stores with one exact name are on
  // FORBIDDEN_CHILD_SEGMENTS instead, so `.dockerignore` is not read as
  // `.docker`.
  "keychain",
  "netrc",
  ".npmrc",
  ".pypirc",
  ".authinfo",
  // `.kubeconfig` holds cluster credentials as surely as `.kube/config`, so
  // this one wants the substring. `.docker` is the exception that forced the
  // segment screen: `.dockerignore` is not a credential store.
  ".kube",
  "library/cookies",
  "id_rsa",
  "id_ecdsa",
  "id_ed25519",
] as const;
