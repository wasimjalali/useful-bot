import { resolve, relative, isAbsolute } from "node:path";
import { lstatSync } from "node:fs";
import { FORBIDDEN_PATH_SUBSTRINGS } from "../../shared/policy.ts";

export function workspaceRoot(): string {
  const fromEnv = process.env.UB_WORKSPACE_ROOT;
  if (!fromEnv) {
    throw new Error("workspace_unconfigured");
  }
  return resolve(fromEnv);
}

export function resolveWorkspacePath(inputPath: string, root: string = workspaceRoot()): string {
  if (!inputPath || inputPath.includes("\0")) {
    throw new Error("path_invalid");
  }
  const resolved = resolve(root, inputPath);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("path_escape");
  }
  const lowered = resolved.toLowerCase();
  for (const part of FORBIDDEN_PATH_SUBSTRINGS) {
    if (lowered.includes(part.toLowerCase())) {
      throw new Error("path_forbidden");
    }
  }
  try {
    const stat = lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      throw new Error("path_symlink");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      if (error instanceof Error && error.message.startsWith("path_")) throw error;
    }
  }
  return resolved;
}
