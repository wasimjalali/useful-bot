import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { confinedCommand, sandboxAvailable, sandboxProfile } from "../agent/lib/sandbox.ts";

const execFileAsync = promisify(execFile);
const darwin = process.platform === "darwin";

async function confined(root: string, command: string): Promise<{ ok: boolean; stderr: string }> {
  const args = confinedCommand(root, command);
  try {
    const { stderr } = await execFileAsync(args[0], args.slice(1), { cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } });
    return { ok: true, stderr };
  } catch (error) {
    return { ok: false, stderr: String((error as { stderr?: string }).stderr ?? error) };
  }
}

test("the profile names the folder and refuses credential files inside it", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-sb-"));
  const profile = sandboxProfile(root);
  assert.ok(profile.includes(`(allow file-write* (subpath "${realpathSync(root)}"))`));
  assert.ok(profile.includes('(deny file-write* (regex #"/\\.env($|[/.])"))'));
  assert.ok(profile.startsWith("(version 1)\n(allow default)\n(deny file-write*)"));
});

test("a confined line writes inside the folder and nowhere else", { skip: !darwin || !sandboxAvailable() }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ub-sb-"));
  // Beside this user's temp dir, not inside it: the profile allows temp.
  const outside = join(dirname(realpathSync(tmpdir())), `ub-escape-${process.pid}-${Date.now()}`);
  try {
    assert.equal((await confined(root, "echo in > inside.txt && cat inside.txt")).ok, true);
    assert.equal(existsSync(join(root, "inside.txt")), true);

    const escape = await confined(root, `echo out > "${outside}"`);
    assert.equal(escape.ok, false);
    assert.match(escape.stderr, /not permitted/i);
    assert.equal(existsSync(outside), false);

    const env = await confined(root, "echo KEY=1 > .env");
    assert.equal(env.ok, false);
    assert.equal(existsSync(join(root, ".env")), false);

    // Reads outside and deletes inside stay open: that is the classifier's job.
    writeFileSync(join(root, "gone.txt"), "x", "utf8");
    assert.equal((await confined(root, "ls /Users > /dev/null && rm gone.txt")).ok, true);
    assert.equal(existsSync(join(root, "gone.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { force: true });
  }
});
