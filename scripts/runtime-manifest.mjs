// Which files a runtime stage carries, and the version stamp of a dev one.
// Used by scripts/build-runtime.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The files under `tracked`. A release takes git's index only, so a stray
 * untracked or ignored file (an `.env`) can never ship. A dev stage
 * (`worktree: true`) takes the working tree instead, because the dev app exists
 * to try changes that are not committed yet: new files not yet added to git
 * are in, ignored files stay out (`--exclude-standard`), and a file deleted from
 * the tree is skipped. The secret scan in build-runtime still runs on both.
 */
export function runtimeFiles(root, tracked, { worktree = false } = {}) {
  const args = worktree ? ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...tracked] : ["ls-files", "-z", "--", ...tracked];
  let files = execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  if (worktree) files = [...new Set(files)].filter((file) => existsSync(path.join(root, file)));
  for (const item of tracked) {
    if (!files.some((file) => file === item || file.startsWith(`${item}/`))) throw new Error(`nothing tracked under ${item}`);
  }
  return files;
}

/**
 * `<base>.<8 hex of what ships>`. The app copies its runtime only when the
 * stamp differs from the installed one, and two dev builds from the same commit
 * can differ in the files that are not committed, so the base alone would skip
 * the copy and keep running the old code.
 */
export function devStamp(base, root, files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(path.join(root, file)));
    hash.update("\0");
  }
  return `${base}.${hash.digest("hex").slice(0, 8)}`;
}
