import { userInfo } from "node:os";
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

export function systemOperator(): Operator {
  try {
    const name = titleName(userInfo().username || "Desktop owner");
    return { name, initials: initialsFor(name) };
  } catch {
    return { name: "Desktop owner", initials: "DO" };
  }
}

export function appVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = JSON.parse(readFileSync(join(here, "../package.json"), "utf8")) as { version?: string };
    return raw.version || "dev";
  } catch {
    return "dev";
  }
}
