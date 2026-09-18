import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { confinedCommand, sandboxAvailable, sandboxProfile } from "../agent/lib/sandbox.ts";
import { selectSandbox } from "../shared/sandbox.ts";

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
  // Credential stores are not readable either; a glob defeats the text
  // tripwire, the kernel does not care how the path was spelled.
  assert.ok(profile.includes('(deny file-read* (regex #"/\\.ssh($|[/.])"))'));
  assert.ok(profile.includes('(deny file-read* (regex #"/\\.useful-bot($|[/.])"))'));
  // Under the home and for read-only lines .env is denied too; inside a
  // project folder the build tooling reads it, so there it stays readable.
  assert.ok(profile.includes('(deny file-read* (regex #"/\\.env($|[/.])"))'));
  const folder = sandboxProfile(root, "folder");
  assert.equal(folder.includes('(deny file-read* (regex #"/\\.env($|[/.])"))'), false);
  assert.ok(folder.includes('(deny file-read* (regex #"/\\.ssh($|[/.])"))'));
  const readOnly = sandboxProfile(null);
  assert.equal(readOnly.includes("(allow file-write* (subpath \"/Users"), false);
  assert.ok(readOnly.includes('(deny file-read* (regex #"/\\.env($|[/.])"))'));
});

test("a pinned just-bash stays just-bash even when docker is on PATH", () => {
  const decision = selectSandbox("just-bash", (name) => name === "docker");
  assert.equal(decision.backend, "just-bash");
  assert.equal(decision.isolation, "non-vm");
  // The binaries are still reported for the setup and verify scripts.
  assert.equal(decision.binaries.docker, true);
  assert.equal(decision.binaries.microsandbox, false);
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

test("the Full access profile writes anywhere but into credential files and the app's stores", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-sb-"));
  const full = sandboxProfile(root, "computer", true);
  assert.equal(full.includes("(deny file-write*)"), false);
  assert.equal(full.includes("(allow file-write* (subpath"), false);
  assert.ok(full.startsWith("(version 1)\n(allow default)"));
  assert.ok(full.includes('(deny file-write* (regex #"/\\.ssh($|[/.])"))'));
  assert.ok(full.includes('(deny file-write* (regex #"/\\.useful-bot($|[/.])"))'));
  assert.ok(full.includes('(deny file-write* (regex #"/\\.zshrc($|[/.])"))'));
  assert.ok(full.includes('(deny file-write* (regex #"/config\\.fish($|[/.])"))'));
  assert.ok(full.includes('(deny file-write* (regex #"/\\.config/fish($|[/.])"))'));
  assert.ok(full.includes('(deny file-write* (regex #"/Library/Keychains($|[/.])"))'));
  for (const name of ["secrets", "\\.authinfo", "\\.kubeconfig", "keychain"]) {
    assert.ok(full.includes(`(deny file-write* (regex #"/${name}($|[/.])"))`), name);
    assert.ok(full.includes(`(deny file-read* (regex #"/${name}($|[/.])"))`), name);
  }
  assert.ok(full.includes('(deny file-read* (regex #"/Library/Cookies($|[/.])"))'));
  // Unbounded in a project folder: .env stays unreadable everywhere but
  // under the folder itself.
  const fullFolder = sandboxProfile(root, "folder", true);
  assert.ok(fullFolder.includes('(deny file-read* (regex #"/\\.env($|[/.])"))'));
  assert.ok(fullFolder.includes(`(allow file-read* (regex #"^${realpathSync(root).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/.*)?/\\.env($|[/.])"))`));
  const scopedFolder = sandboxProfile(root, "folder");
  assert.equal(scopedFolder.includes('(deny file-read* (regex #"/\\.env($|[/.])"))'), false);
  assert.ok(full.includes('(deny file-read* (regex #"/\\.ssh($|[/.])"))'));
  for (const path of ["/etc", "/private/etc", "/var/db", "/private/var/db", "/Library/Keychains", "/Library/Cookies"]) {
    assert.ok(full.includes(`(deny file-write* (subpath "${path}"))`), path);
  }
  const args = confinedCommand(root, "true", "computer", true);
  assert.equal(args[2], full);
});

test("a Full access line writes outside the folder and still not into a credential file", { skip: !darwin || !sandboxAvailable() }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ub-sb-"));
  const outside = join(dirname(realpathSync(tmpdir())), `ub-full-${process.pid}-${Date.now()}`);
  try {
    const args = confinedCommand(root, `echo out > "${outside}"`, "computer", true);
    await execFileAsync(args[0], args.slice(1), { cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } });
    assert.equal(existsSync(outside), true);
    mkdirSync(join(root, ".ssh"), { recursive: true });
    const key = confinedCommand(root, "echo x > .ssh/id_rsa", "computer", true);
    await assert.rejects(() => execFileAsync(key[0], key.slice(1), { cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } }), /not permitted/i);
    assert.equal(existsSync(join(root, ".ssh", "id_rsa")), false);
    // A system path the tripwire names by substring is refused by the
    // kernel too, however it is spelled.
    const hosts = confinedCommand(root, `echo x > /et"c"/ub-sandbox-test-${process.pid}`, "computer", true);
    await assert.rejects(() => execFileAsync(hosts[0], hosts.slice(1), { cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } }), /not permitted|permission denied/i);
    assert.equal(existsSync(`/etc/ub-sandbox-test-${process.pid}`), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { force: true });
  }
});
