import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireDirLock } from "../shared/dir-lock.ts";

const options = (timeoutMs: number, staleMs = 20) => ({ timeoutMs, staleMs, errorCode: "test_locked" });
const fresh = () => join(mkdtempSync(join(tmpdir(), "ub-lock-")), "x.lock");

test("a live holder keeps the lock past the stale age; a waiter times out instead of stealing it", () => {
  const lock = fresh();
  const release = acquireDirLock(lock, options(1000));
  const started = Date.now();
  // The stale age (20 ms) passes many times over while the holder is alive.
  assert.throws(() => acquireDirLock(lock, options(250)), /test_locked/);
  assert.ok(Date.now() - started >= 200);
  assert.equal(existsSync(lock), true, "the live holder's lock was not taken");
  release();
  assert.equal(existsSync(lock), false);
  acquireDirLock(lock, options(250))();
});

test("a lock whose holder process is dead is reclaimed at once", () => {
  const lock = fresh();
  // A pid that is certainly gone: a child that already exited.
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  const deadPid = Number(child.stdout);
  assert.ok(deadPid > 0);
  mkdirLockedBy(lock, deadPid, "dead-token");
  const started = Date.now();
  const release = acquireDirLock(lock, options(2000, 60_000));
  assert.ok(Date.now() - started < 1000, "reclaimed without waiting for the stale age");
  release();
});

test("release removes only the lock it owns", () => {
  const lock = fresh();
  const release = acquireDirLock(lock, options(250));
  // Someone else took the lock over (their owner token is in the file now).
  const owner = JSON.parse(readFileSync(join(lock, "owner"), "utf8")) as { pid: number };
  writeFileSync(join(lock, "owner"), JSON.stringify({ pid: owner.pid, token: "somebody-else" }));
  release();
  assert.equal(existsSync(lock), true, "a release that lost the lock leaves the new holder's lock alone");
});

function mkdirLockedBy(lock: string, pid: number, token: string): void {
  // Builds the lock a crashed process left behind.
  const result = spawnSync("/bin/sh", ["-c", `mkdir -p "${lock}" && printf '%s' '{"pid":${pid},"token":"${token}"}' > "${lock}/owner"`]);
  assert.equal(result.status, 0);
}

test("two processes racing to reclaim one dead lock both get it in turn, never together", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-lock-race-"));
  const lock = join(dir, "x.lock");
  const log = join(dir, "log.txt");
  const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  mkdirLockedBy(lock, Number(dead.stdout), "dead-token");
  const script = join(dir, "child.ts");
  writeFileSync(script, `
    import { appendFileSync } from "node:fs";
    import { acquireDirLock } from ${JSON.stringify(join(process.cwd(), "shared/dir-lock.ts"))};
    const release = acquireDirLock(${JSON.stringify(lock)}, { timeoutMs: 10000, staleMs: 60000, errorCode: "locked" });
    appendFileSync(${JSON.stringify(log)}, "enter " + process.pid + "\\n");
    await new Promise((resolve) => setTimeout(resolve, 300));
    appendFileSync(${JSON.stringify(log)}, "exit " + process.pid + "\\n");
    release();
  `);
  const exits = await Promise.all([0, 1, 2].map(() => new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", script], { stdio: "ignore" });
    child.on("exit", resolve);
  })));
  assert.deepEqual(exits, [0, 0, 0]);
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 6);
  // enter, exit, enter, exit...: a live holder was never removed under it.
  lines.forEach((line, at) => assert.ok(line.startsWith(at % 2 === 0 ? "enter" : "exit"), lines.join(" | ")));
  for (let at = 0; at < lines.length; at += 2) assert.equal(lines[at].split(" ")[1], lines[at + 1].split(" ")[1]);
});

test("a reclaim that fails for a real reason surfaces as the locked error instead of looping", () => {
  const lock = fresh();
  const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  mkdirLockedBy(lock, Number(dead.stdout), "dead-token");
  // The reclaim lock cannot be created in a read-only folder.
  const parent = join(lock, "..");
  chmodSync(parent, 0o500);
  try {
    const started = Date.now();
    assert.throws(() => acquireDirLock(lock, options(5000, 60_000)), /test_locked/);
    assert.ok(Date.now() - started < 2000);
  } finally {
    chmodSync(parent, 0o700);
  }
});

test("a reclaimer that pauses holding the guard keeps it: nobody reclaims by age, and the live lock is never removed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-lock-pause-"));
  const lock = join(dir, "x.lock");
  const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  mkdirLockedBy(lock, Number(dead.stdout), "dead-token");
  const ready = join(dir, "ready");
  const script = join(dir, "pauser.ts");
  // The paused reclaimer: takes the guard as a live process, signals, then
  // sleeps well past the old 5 s age before letting go of it.
  writeFileSync(script, `
    import { mkdirSync, writeFileSync, rmSync } from "node:fs";
    const guard = ${JSON.stringify(`${lock}.reclaim`)};
    mkdirSync(guard);
    writeFileSync(guard + "/owner", JSON.stringify({ pid: process.pid, token: "pauser" }));
    writeFileSync(${JSON.stringify(ready)}, "1");
    await new Promise((resolve) => setTimeout(resolve, 6500));
    rmSync(guard, { recursive: true, force: true });
  `);
  const child = spawn(process.execPath, ["--experimental-strip-types", script], { stdio: "ignore" });
  const exited = new Promise((resolve) => child.on("exit", resolve));
  for (let i = 0; i < 100 && !existsSync(ready); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(existsSync(ready), true);
  const started = Date.now();
  const release = acquireDirLock(lock, { timeoutMs: 20_000, staleMs: 60_000, errorCode: "test_locked" });
  const waited = Date.now() - started;
  // The old behaviour took the guard from the paused holder after 5 s; now the
  // waiter has to wait for it to let go.
  assert.ok(waited >= 6000, `waited only ${waited} ms`);
  const owner = JSON.parse(readFileSync(join(lock, "owner"), "utf8")) as { pid: number };
  assert.equal(owner.pid, process.pid, "the lock is ours, not removed or replaced");
  await exited;
  assert.equal(existsSync(lock), true, "the live lock survived the paused reclaimer's resume");
  release();
  assert.equal(existsSync(lock), false);
});
