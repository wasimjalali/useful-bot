import { userInfo } from "node:os";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Operator = {
  name: string;
  initials: string;
};

function titleName(raw: string): string {
  const cleaned = raw.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Desktop owner";
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "UB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

/**
 * The Mac account's full name ("Wasim Jalali"), the one the app shows in the
 * rail and Settings (NSFullUserName). `id -F` reads it without a prompt; an
 * account with no full name, or another platform, falls back to the login.
 */
export function ownerName(): string {
  try {
    const full = execFileSync("/usr/bin/id", ["-F"], { encoding: "utf8", timeout: 2000 }).trim();
    if (full) return full;
  } catch {
    // Not macOS, or no full name set: the login name below still names them.
  }
  return titleName(userInfo().username || "Desktop owner");
}

export function systemOperator(): Operator {
  try {
    const name = ownerName();
    return { name, initials: initialsFor(name) };
  } catch {
    return { name: "Desktop owner", initials: "DO" };
  }
}

export function appVersion(): string {
  // The built web server runs from a traced copy with no package.json beside
  // it, so its launcher passes the version in.
  if (process.env.UB_APP_VERSION) return process.env.UB_APP_VERSION;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = JSON.parse(readFileSync(join(here, "../package.json"), "utf8")) as { version?: string };
    return raw.version || "dev";
  } catch {
    return "dev";
  }
}
