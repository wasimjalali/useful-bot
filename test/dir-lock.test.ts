import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
