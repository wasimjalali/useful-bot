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
