import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RouterError } from "./errors.ts";
import type { Alias } from "../../shared/contracts.ts";

export interface RegistryEntry {
  alias: Alias;
  upstreamModelId: string;
  modelContextWindowTokens: number;
  maxOutputTokens: number;
  reasoningEffort: "low" | "high";
  evidence: {
    liveVerified: boolean;
    packageLockHash: string | null;
  };
}

interface RegistryFile {
  schemaVersion: number;
  entries: RegistryEntry[];
}

export function loadRegistry(lockPath: string): RegistryEntry[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const registryPath = join(here, "../../shared/registry.json");
  const file = JSON.parse(readFileSync(registryPath, "utf8")) as RegistryFile;
  if (file.schemaVersion !== 1 || file.entries.length !== 2) {
    throw new RouterError({
      status: 503,
      type: "internal_error",
      code: "configuration_unverified",
      message: "registry invalid",
    });
  }
  const lockHash = createHash("sha256").update(readFileSync(lockPath)).digest("hex");
  for (const entry of file.entries) {
    if (!entry.evidence.liveVerified) {
      throw new RouterError({
        status: 503,
        type: "internal_error",
        code: "configuration_unverified",
        message: "registry not live-verified",
      });
    }
    if (entry.evidence.packageLockHash && entry.evidence.packageLockHash !== lockHash) {
      throw new RouterError({
        status: 503,
        type: "internal_error",
        code: "configuration_unverified",
        message: "package-lock hash mismatch",
      });
    }
  }
  return file.entries;
}

export function entryFor(entries: RegistryEntry[], alias: string): RegistryEntry {
  const found = entries.find((item) => item.alias === alias);
  if (!found) {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "unknown_alias",
      message: "unknown_alias",
    });
  }
  return found;
}
