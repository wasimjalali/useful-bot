import { resolve, relative, isAbsolute, join } from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import { FORBIDDEN_PATH_SUBSTRINGS } from "../../shared/policy.ts";
import { FORBIDDEN_CHILD_SEGMENTS, isGrantableRootPath } from "../../shared/shell-store.ts";
import {
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
 * The folder a conversation works in, verified at tool time. The grant is
 * read ONCE here: pairing a root from one read with a permission from
 * another is a race a concurrent permission change could exploit. A root
 * that is itself a symlink, or whose path segments name a credential store,
 * is refused here regardless of what any route accepted earlier.
 */
export function effectiveRoot(sessionId?: string): { root: string; grant: SessionGrant | null } {
  const grant = sessionId ? readSessionGrant(sessionId) : null;
  if (!grant) return { root: workspaceRoot(), grant: null };
  assertSafeRoot(grant.path);
  return { root: resolve(grant.path), grant };
}

/**
 * The root is a capability, so the tool re-checks it at call time: not a
 * symlink, a real directory, and not a folder whose own name is a
 * credential store. The route validated this at attach time; paths can be
 * swapped afterwards.
 */
export function assertSafeRoot(path: string): string {
  if (!isGrantableRootPath(path)) throw new Error("workspace_path_forbidden");
  let root = resolve(path);
  let stat;
  try {
    stat = lstatSync(root);
  } catch {
    throw new Error("workspace_root_missing");
  }
  if (stat.isSymbolicLink()) throw new Error("workspace_root_symlink");
  if (!stat.isDirectory()) throw new Error("workspace_root_not_directory");
  // resolve() is lexical; realpath sees through anything a component above
  // might hide. A root that is not what it says it is must not be used.
  if (realpathSync(root) !== root) throw new Error("workspace_root_symlink");
  return root;
}

/**
 * Whether a write inside the granted folder may land without asking the
 * owner. Auto and Full access both let the bot edit the folder it was
 * given; Read only refuses earlier, and no grant at all (the legacy root)
 * still waits for the owner. Commands have their own gate in `bash`.
 */
export function autoApproved(permission: WorkspacePermission | null): boolean {
  return permission === "full_access" || permission === "auto";
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
  // A leading `..` SEGMENT is the escape; a file honestly named `..notes` is
  // not, and a prefix test refuses it for no reason.
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) {
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
  // Exact segment names, so a credential store is refused without `.docker`
  // also refusing the `.dockerignore` next to it.
  for (const segment of loweredRel.split(/[/\\]/)) {
    if (segment && FORBIDDEN_CHILD_SEGMENTS.has(segment)) {
      throw new Error("path_forbidden");
    }
  }
  assertNoSymlinkComponents(root, rel);
  return resolved;
}
