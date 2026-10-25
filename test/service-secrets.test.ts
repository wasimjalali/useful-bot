import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// @ts-expect-error plain ESM script module, no types
import { spawnWithSecrets } from "../scripts/service-secrets.mjs";
// @ts-expect-error plain ESM script module, no types
import { engineEnv } from "../scripts/service.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRELOAD = join(ROOT, "scripts/secrets-preload.mjs");
const PRELOAD_URL = pathToFileURL(PRELOAD).href;
const MARK = "ub-secret-marker-7f3a91c4d2e8";
const KEY = "UB_TEST_SECRET_MARK";
const darwin = process.platform === "darwin";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "ub-service-secrets-"));
}

/** What `ps -E` shows for a pid: argv plus the exec-time environment (macOS, same uid). */
function procargs(pid: number): string {
  return execFileSync("ps", ["-E", "-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8" });
}

function readLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout!.on("data", (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end >= 0) resolve(buffer.slice(0, end));
    });
    child.once("exit", (code) => reject(new Error(`child exited ${code} before answering: ${buffer}`)));
  });
}

/** A node script that prints one JSON line about itself, then idles until killed. */
function idleScript(dir: string, body = ""): string {
  const file = join(dir, "idle.mjs");
  writeFileSync(file, `${body}\nprocess.stdout.write(JSON.stringify({ pid: process.pid, seen: process.env.${KEY} ?? null }) + "\\n");\nsetInterval(() => {}, 1000);\n`);
  return file;
}

test("a secret reaches the service's process.env but not its exec environment", { skip: !darwin }, async () => {
  const dir = scratch();
  const kids: ChildProcess[] = [];
  try {
    const script = idleScript(dir);
    const child: ChildProcess = spawnWithSecrets(process.execPath, [script], {
      cwd: dir,
      env: { PATH: process.env.PATH },
      secrets: { [KEY]: MARK },
      preload: PRELOAD,
      stdio: ["pipe", "pipe", "inherit"],
    });
    kids.push(child);
    const line = JSON.parse(await readLine(child));
    assert.equal(line.seen, MARK, "the service reads its secret from process.env");
    assert.ok(!procargs(line.pid).includes(MARK), "the secret is not in the kernel's procargs for the service");

    // The control: the old way, the secret in the exec environment, is readable. This is what the test proves it can see.
    const old = spawn(process.execPath, [script], { cwd: dir, env: { PATH: process.env.PATH, [KEY]: MARK }, stdio: ["ignore", "pipe", "inherit"] });
    kids.push(old);
    const oldLine = JSON.parse(await readLine(old));
    assert.ok(procargs(oldLine.pid).includes(MARK), "the control child launched with the secret in env is readable through ps -E");
  } finally {
    for (const kid of kids) kid.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the preload refuses bad input with exit 2 and a JSON line, and starts with no secrets on empty input", () => {
  const run = (input: string | undefined) =>
    spawnSync(process.execPath, ["--import", PRELOAD_URL, "-e", `process.stdout.write(String(Object.keys(process.env).filter((k) => k.startsWith("UB_")).length))`], {
      input,
      env: { PATH: process.env.PATH },
      encoding: "utf8",
    });
  for (const [label, input] of [
    ["not JSON", "not json\n"],
    ["an array", "[]\n"],
    ["null", "null\n"],
    ["a key outside UB_", JSON.stringify({ PATH: "/x" }) + "\n"],
    ["a non-string value", JSON.stringify({ UB_X: 1 }) + "\n"],
    ["a lowercase UB_ key", JSON.stringify({ UB_x: "v" }) + "\n"],
  ] as const) {
    const result = run(input);
    assert.equal(result.status, 2, label);
    assert.equal(result.stdout, "", `${label}: the service body never ran`);
    const line = JSON.parse(result.stderr.trim().split("\n").at(-1)!);
    assert.equal(typeof line.error, "string", label);
    assert.ok(!result.stderr.includes("not json") || label === "not JSON", label);
  }
  for (const input of ["", "\n", "{}\n"]) {
    const result = run(input);
    assert.equal(result.status, 0, JSON.stringify(input));
    assert.equal(result.stdout, "0");
  }
});

test("no process the service starts inherits a secret, however it is started", { skip: !darwin }, async () => {
  const dir = scratch();
  let service: ChildProcess | null = null;
  let grandchildPid: number | null = null;
  try {
    // The service: starts a child of every kind without an env of its own, once with `env: process.env`, and
    // reports what each saw. A node child gets the secret through its own stdin handoff, so its process.env has it
    // but its procargs do not.
    const grandchild = join(dir, "grandchild.mjs");
    writeFileSync(grandchild, `process.stdout.write(JSON.stringify({ pid: process.pid, seen: process.env.${KEY} ?? null }) + "\\n"); setInterval(() => {}, 1000);\n`);
    const body = `
      import cp from "node:child_process";
      import { promisify } from "node:util";
      const probe = ["-c", 'printf "%s" "\${${KEY}-gone}"'];
      const results = {};
      results.execFileSync = cp.execFileSync("/bin/sh", probe, { encoding: "utf8" });
      results.execFileSyncEnv = cp.execFileSync("/bin/sh", probe, { encoding: "utf8", env: process.env });
      results.execSync = cp.execSync('printf "%s" "\${${KEY}-gone}"', { encoding: "utf8" });
      results.spawnSync = cp.spawnSync("/bin/sh", probe, { encoding: "utf8" }).stdout;
      results.spawnSyncNoArgs = cp.spawnSync("/bin/sh", { encoding: "utf8", input: 'printf "%s" "\${${KEY}-gone}"' }).stdout;
      results.spawn = await new Promise((r) => { let o = ""; const c = cp.spawn("/bin/sh", probe, { env: process.env }); c.stdout.on("data", (d) => (o += d)); c.on("close", () => r(o)); });
      results.execFile = await new Promise((r) => cp.execFile("/bin/sh", probe, (e, out) => r(out)));
      results.exec = await new Promise((r) => cp.exec('printf "%s" "\${${KEY}-gone}"', (e, out) => r(out)));
      results.execPromisified = (await promisify(cp.execFile)("/bin/sh", probe)).stdout;
      const kid = cp.fork(${JSON.stringify(grandchild)}, [], { stdio: ["ignore", "pipe", "inherit", "ipc"], env: process.env });
      results.forkPid = await new Promise((r) => kid.stdout.once("data", (d) => r(JSON.parse(String(d)))));
      process.stdout.write(JSON.stringify(results) + "\\n");
      setInterval(() => {}, 1000);
    `;
    const script = join(dir, "service.mjs");
    writeFileSync(script, body);
    service = spawnWithSecrets(process.execPath, [script], {
      cwd: dir,
      env: { PATH: process.env.PATH },
      secrets: { [KEY]: MARK },
      preload: PRELOAD,
      stdio: ["pipe", "pipe", "inherit"],
    });
    const results = JSON.parse(await readLine(service!));
    grandchildPid = results.forkPid.pid;
    for (const name of ["execFileSync", "execFileSyncEnv", "execSync", "spawnSync", "spawnSyncNoArgs", "spawn", "execFile", "exec", "execPromisified"]) {
      assert.equal(results[name], "gone", `${name}: the child's env had no secret`);
    }
    assert.equal(results.forkPid.seen, MARK, "a forked node child (Next's dev server) still gets the secret in its process.env");
    assert.ok(!procargs(results.forkPid.pid).includes(MARK), "and not in its exec environment");
  } finally {
    if (grandchildPid) process.kill(grandchildPid, "SIGKILL");
    service?.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a release stage carries the files that deliver the secrets, and no launcher assigns one into an env", () => {
  const build = readFileSync(join(ROOT, "scripts/build-runtime.mjs"), "utf8");
  for (const file of ["scripts/service-secrets.mjs", "scripts/secrets-preload.mjs"]) {
    assert.ok(build.includes(`"${file}"`), `${file} is in the runtime payload's tracked list`);
  }
  for (const file of ["scripts/service.mjs", "scripts/smoke-runtime.mjs"]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.ok(!/\benv\.UB_(ENGINE_TOKEN|ROUTER_DESKTOP_TOKEN|OPENCODE_GO_KEY)\s*=/.test(source), `${file} assigns no secret into an env`);
  }
});

test("the service launcher keeps secrets out of every environment it builds", () => {
  const env = engineEnv();
  for (const key of ["UB_ENGINE_TOKEN", "UB_ROUTER_DESKTOP_TOKEN", "UB_OPENCODE_GO_KEY"]) {
    assert.ok(!(key in env), `${key} is not in the engine's exec environment`);
  }
  assert.equal(env.PI_OFFLINE, "1");
});
