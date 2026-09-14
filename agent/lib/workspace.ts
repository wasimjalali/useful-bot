import { resolve, relative, isAbsolute, join } from "node:path";
import { lstatSync } from "node:fs";
import { FORBIDDEN_PATH_SUBSTRINGS } from "../../shared/policy.ts";
import {
  parseWorkspacePermission,
  readSessionGrant,
  type SessionGrant,
  type WorkspacePermission,
} from "../../shared/workspace-store.ts";

export type { WorkspacePermission };

export function workspaceRoot(): string {
  const fromEnv = process.env.UB_WORKSPACE_ROOT;
  if (!fromEnv) {
    throw new Error("workspace_unconfigured");
  }
  return resolve(fromEnv);
}

/**
 * The folder a conversation works in. A session grant (a folder the owner
 * picked in the desktop app) wins; without one the legacy process-global
 * `UB_WORKSPACE_ROOT` applies, and without either the file tools refuse.
 */
export function effectiveRoot(sessionId?: string): {
  root: string;
  grant: SessionGrant | null;
} {
  const grant = sessionId ? readSessionGrant(sessionId) : null;
  if (grant) return { root: resolve(grant.path), grant };
  return { root: workspaceRoot(), grant: null };
}

/**
 * The permission a session holds, `null` when no grant exists (the legacy
 * workspace keeps the always-approval posture).
 */
export function sessionPermission(sessionId?: string): WorkspacePermission | null {
  const grant = sessionId ? readSessionGrant(sessionId) : null;
  return grant ? parseWorkspacePermission(grant.permission) : null;
}

/**
 * Whether a mutating action may run without asking the owner. Only an
 * explicit Full access grant skips the card, and Final confirm turns that
 * back off; every other posture waits for the owner.
 */
export function autoApproved(
  permission: WorkspacePermission | null,
  finalConfirm: boolean,
): boolean {
  return permission === "full_access" && !finalConfirm;
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
  // Only the part under the root is screened. The root itself is a folder the
  // owner picked (or configured) by name, so a project that happens to live in
  // a path containing one of these words stays reachable; anything inside it
  // — a `.env`, a `.git/config`, a `secrets/` directory — is still refused.
  const loweredRel = rel.toLowerCase();
  for (const part of FORBIDDEN_PATH_SUBSTRINGS) {
    if (loweredRel.includes(part.toLowerCase())) {
      throw new Error("path_forbidden");
    }
  }
  assertNoSymlinkComponents(root, rel);
  return resolved;
}
