import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireDirLock } from "../shared/dir-lock.ts";

const LIB = join(process.cwd(), "shared/dir-lock.ts");
const opts = (timeoutMs: number) => ({ timeoutMs, errorCode: "test_locked" });
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-lock-"));
  return { dir, lock: join(dir, "x.lock") };
};

function child(dir: string, name: string, body: string) {
  const script = join(dir, `${name}.ts`);
  writeFileSync(script, `import { appendFileSync } from "node:fs";\nimport { acquireDirLock } from ${JSON.stringify(LIB)};\n${body}`);
  const proc = spawn(process.execPath, ["--experimental-strip-types", script], { stdio: "ignore" });
  const exited = new Promise<number | null>((resolve) => proc.on("exit", (code) => resolve(code)));
  return { proc, exited };
}

async function waitFor(path: string): Promise<void> {
  for (let i = 0; i < 200 && !existsSync(path); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(existsSync(path), true, `${path} never appeared`);
}

test("two processes contending run their critical sections strictly one at a time", async () => {
  const { dir, lock } = fresh();
  const log = join(dir, "log.txt");
  const body = `
    for (let i = 0; i < 4; i += 1) {
      const release = acquireDirLock(${JSON.stringify(lock)}, { timeoutMs: 20000, errorCode: "locked" });
      appendFileSync(${JSON.stringify(log)}, "enter " + process.pid + "\\n");
      await new Promise((resolve) => setTimeout(resolve, 60));
      appendFileSync(${JSON.stringify(log)}, "exit " + process.pid + "\\n");
      release();
    }
  `;
  const exits = await Promise.all([child(dir, "a", body).exited, child(dir, "b", body).exited, child(dir, "c", body).exited]);
  assert.deepEqual(exits, [0, 0, 0]);
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 24);
  lines.forEach((line, at) => assert.ok(line.startsWith(at % 2 === 0 ? "enter" : "exit"), lines.join(" | ")));
  for (let at = 0; at < lines.length; at += 2) assert.equal(lines[at].split(" ")[1], lines[at + 1].split(" ")[1]);
});

test("a holder killed with SIGKILL mid-section frees the lock at once, with no stale wait", async () => {
  const { dir, lock } = fresh();
  const held = join(dir, "held");
  const holder = child(dir, "holder", `
    acquireDirLock(${JSON.stringify(lock)}, { timeoutMs: 5000, errorCode: "locked" });
    appendFileSync(${JSON.stringify(held)}, "1");
    await new Promise((resolve) => setTimeout(resolve, 60000));
  `);
  await waitFor(held);
  holder.proc.kill("SIGKILL");
  await holder.exited;
  const started = Date.now();
  const release = acquireDirLock(lock, opts(5000));
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
  release();
});

test("a live holder that never releases makes the waiter throw the locked error within the deadline", async () => {
  const { dir, lock } = fresh();
  const held = join(dir, "held");
  const holder = child(dir, "holder", `
    acquireDirLock(${JSON.stringify(lock)}, { timeoutMs: 5000, errorCode: "locked" });
    appendFileSync(${JSON.stringify(held)}, "1");
    await new Promise((resolve) => setTimeout(resolve, 60000));
  `);
  try {
    await waitFor(held);
    const started = Date.now();
    assert.throws(() => acquireDirLock(lock, opts(400)), /test_locked/);
    const took = Date.now() - started;
    assert.ok(took >= 300 && took < 2000, `took ${took} ms`);
  } finally {
    holder.proc.kill("SIGKILL");
    await holder.exited;
  }
});

test("re-entering a lock this process holds fails loudly instead of deadlocking", () => {
  const { lock } = fresh();
  const release = acquireDirLock(lock, opts(2000));
  const started = Date.now();
  assert.throws(() => acquireDirLock(lock, opts(2000)), /dir_lock_reentered/);
  assert.ok(Date.now() - started < 500);
  release();
  // Released: it can be taken again, and releasing twice is harmless.
  const again = acquireDirLock(lock, opts(2000));
  again();
  again();
});

test("an old directory lock is dropped when its owner is dead and ignored otherwise", () => {
  const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  const old = (pid: number) => {
    const { lock } = fresh();
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), JSON.stringify({ pid, token: "t" }));
    return lock;
  };
  const stale = old(Number(dead.stdout));
  acquireDirLock(stale, opts(2000))();
  assert.equal(existsSync(stale), false, "the dead owner's directory was removed");
  const live = old(process.pid);
  acquireDirLock(live, opts(2000))();
  assert.equal(existsSync(live), true, "a live owner's directory is left alone, and does not block the new lock");
});

test("with legacyDir, a live old-protocol holder keeps new writers out until it lets go", async () => {
  const { dir, lock } = fresh();
  const held = join(dir, "held");
  // A previous-version writer: holds the old lock directory with a live pid.
  const old = child(dir, "oldwriter", `
    import { mkdirSync, writeFileSync, rmSync } from "node:fs";
    mkdirSync(${JSON.stringify(lock)});
    writeFileSync(${JSON.stringify(join(lock, "owner"))}, JSON.stringify({ pid: process.pid, token: "old" }));
    appendFileSync(${JSON.stringify(held)}, "1");
    await new Promise((resolve) => setTimeout(resolve, 900));
    rmSync(${JSON.stringify(lock)}, { recursive: true, force: true });
  `);
  await waitFor(held);
  const started = Date.now();
  const release = acquireDirLock(lock, { ...opts(10_000), legacyDir: true });
  assert.ok(Date.now() - started >= 600, `got in after only ${Date.now() - started} ms`);
  // While we hold it, the old protocol sees a live owner at the legacy path.
  assert.equal(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).pid, process.pid);
  release();
  assert.equal(existsSync(lock), false, "our legacy directory is removed on release");
  await old.exited;
});

test("with legacyDir, a live old holder that never lets go makes the waiter throw within the deadline", async () => {
  const { dir, lock } = fresh();
  const held = join(dir, "held");
  const old = child(dir, "oldwriter", `
    import { mkdirSync, writeFileSync } from "node:fs";
    mkdirSync(${JSON.stringify(lock)});
    writeFileSync(${JSON.stringify(join(lock, "owner"))}, JSON.stringify({ pid: process.pid, token: "old" }));
    appendFileSync(${JSON.stringify(held)}, "1");
    await new Promise((resolve) => setTimeout(resolve, 60000));
  `);
  try {
    await waitFor(held);
    const started = Date.now();
    assert.throws(() => acquireDirLock(lock, { ...opts(400), legacyDir: true }), /test_locked/);
    assert.ok(Date.now() - started < 2000);
    // The SQLite half was given back: a plain acquire is not blocked by it.
    acquireDirLock(lock, opts(1000))();
  } finally {
    old.proc.kill("SIGKILL");
    await old.exited;
  }
});

test("with legacyDir, a dead or owner-less old lock directory is cleared", () => {
  const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  const { lock } = fresh();
  mkdirSync(lock);
  writeFileSync(join(lock, "owner"), JSON.stringify({ pid: Number(dead.stdout), token: "old" }));
  const started = Date.now();
  const release = acquireDirLock(lock, { ...opts(5000), legacyDir: true });
  assert.ok(Date.now() - started < 1000);
  release();
  // An old-version lock has no owner file at all; it is stale after the old 2 s.
  const bare = fresh().lock;
  mkdirSync(bare);
  const bareStarted = Date.now();
  acquireDirLock(bare, { ...opts(8000), legacyDir: true })();
  assert.ok(Date.now() - bareStarted >= 1500 && Date.now() - bareStarted < 6000);
});
