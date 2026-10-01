import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// @ts-expect-error plain ESM build script module, no types
import { devStamp, runtimeFiles } from "../scripts/runtime-manifest.mjs";

const TRACKED = ["package.json", "shared", "agent"];
const IGNORED = "agent/local-secrets.txt";

function put(root: string, file: string, body = "x"): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), body);
}

function git(root: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: root, stdio: "ignore" });
}

/** A repo with a committed file, an edited one, a deleted one, a new untracked one and an ignored one. */
function checkout(): string {
  const root = mkdtempSync(join(tmpdir(), "ub-runtime-manifest-"));
  git(root, "init", "-q");
  put(root, ".gitignore", "local-secrets.txt\n");
  put(root, "package.json", "{}");
  put(root, "shared/models.ts", "one");
  put(root, "shared/gone.ts", "bye");
  put(root, "agent/agent.ts", "agent");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  put(root, "shared/models.ts", "two");
  rmSync(join(root, "shared/gone.ts"));
  put(root, "shared/stack.ts", "new, not yet added to git");
  put(root, IGNORED, "SECRET=1");
  return root;
}

test("a release stage still copies git's index only", () => {
  const root = checkout();
  const files: string[] = runtimeFiles(root, TRACKED, { worktree: false });
  assert.ok(files.includes("shared/models.ts"));
  assert.ok(!files.includes("shared/stack.ts"), "an untracked file never ships in a release");
  assert.ok(!files.includes(IGNORED));
});

test("a dev stage copies the working tree: new files in, ignored files and deleted files out", () => {
  const root = checkout();
  const files: string[] = runtimeFiles(root, TRACKED, { worktree: true });
  assert.ok(files.includes("shared/stack.ts"), "a file not yet added to git is what the dev app tests");
  assert.ok(files.includes("shared/models.ts"));
  assert.ok(files.includes("agent/agent.ts"));
  assert.ok(files.includes("package.json"));
  assert.ok(!files.includes(IGNORED), "gitignored files never ship, even in a dev stage");
  assert.ok(!files.includes("shared/gone.ts"), "a file deleted from the tree is not copied");
  assert.equal(new Set(files).size, files.length);
});

test("a tracked path with nothing in it is an error in both modes", () => {
  const root = checkout();
  for (const worktree of [false, true]) {
    assert.throws(() => runtimeFiles(root, [...TRACKED, "router/src"], { worktree }), /nothing tracked under router\/src/);
  }
});

test("the dev stamp keeps the base, and changes with the content of what ships", () => {
  const root = checkout();
  const files: string[] = runtimeFiles(root, TRACKED, { worktree: true });
  const first: string = devStamp("0.0.0-dev+abc1234", root, files);
  assert.match(first, /^0\.0\.0-dev\+abc1234\.[0-9a-f]{8}$/);
  assert.equal(devStamp("0.0.0-dev+abc1234", root, files), first, "same content, same stamp");
  put(root, "shared/stack.ts", "edited");
  const second: string = devStamp("0.0.0-dev+abc1234", root, files);
  assert.notEqual(second, first, "an edit with the same commit still makes the app copy again");
});
