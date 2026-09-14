import { resolve, relative, isAbsolute, join } from "node:path";
import { lstatSync } from "node:fs";
import { FORBIDDEN_PATH_SUBSTRINGS } from "../../shared/policy.ts";

export function workspaceRoot(): string {
  const fromEnv = process.env.UB_WORKSPACE_ROOT;
  if (!fromEnv) {
    throw new Error("workspace_unconfigured");
  }
  return resolve(fromEnv);
}

/**
 * Reject any path whose existing components include a symlink. Lexical resolve
 * and relative cannot see through a parent component, so `link/pwned.txt` with
 * `link -> /` would pass a resolve-only check while the file is written outside
 * the workspace. Walking each component with lstat closes that hole. Components
 * that do not exist yet are left to mkdir/write, which create real directories.
 */
function assertNoSymlinkComponents(root: string, rel: string): void {
  let current = resolve(root);
  for (const part of rel.split(/[/\\]/).filter(Boolean)) {
    current = join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error("path_symlink");
    }
  }
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
  assertNoSymlinkComponents(root, rel);
  return resolved;
}
