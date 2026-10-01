import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

/**
 * A directory lock with an owner. The holder writes its pid and a token into
 * the lock; a waiter reclaims the lock only when that pid is dead (or, for a
 * lock whose owner file never appeared, once it is older than `staleMs`), and
 * a release removes the lock only when the token is still its own. A live
 * writer is never robbed by a timer, however long it runs.
 */

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but is not ours to signal.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwner(lock: string): { pid: number; token: string } | null {
  try {
    const parsed = JSON.parse(readFileSync(join(lock, "owner"), "utf8")) as { pid?: unknown; token?: unknown };
    return Number.isInteger(parsed.pid) && typeof parsed.token === "string"
      ? { pid: parsed.pid as number, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

/** Move a dead holder's lock aside (atomic, so one waiter wins) and drop it. */
function reclaim(lock: string, expectedToken: string | null): void {
  const aside = `${lock}.stale.${process.pid}.${randomUUID().slice(0, 8)}`;
  try {
    renameSync(lock, aside);
  } catch {
    return; // another waiter got it first
  }
  const moved = readOwner(aside);
  if (expectedToken !== null && moved?.token !== expectedToken) {
    // A live lock replaced the dead one between the check and the move: put it back.
    try { renameSync(aside, lock); } catch { rmSync(aside, { recursive: true, force: true }); }
    return;
  }
  rmSync(aside, { recursive: true, force: true });
}

export function acquireDirLock(
  lock: string,
  options: { timeoutMs: number; staleMs: number; errorCode: string },
): () => void {
  const token = randomUUID();
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      try {
        writeFileSync(join(lock, "owner"), JSON.stringify({ pid: process.pid, token }), { mode: 0o600 });
      } catch (err) {
        rmSync(lock, { recursive: true, force: true });
        throw err;
      }
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const holder = readOwner(lock);
    let reclaimable = false;
    if (holder) {
      reclaimable = !pidAlive(holder.pid);
    } else {
      try {
        reclaimable = Date.now() - statSync(lock).mtimeMs > options.staleMs;
      } catch {
        continue; // vanished: try to take it
      }
    }
    if (reclaimable) {
      reclaim(lock, holder?.token ?? null);
      continue;
    }
    if (Date.now() > deadline) throw new Error(options.errorCode);
    sleep(15);
  }
  return () => {
    if (readOwner(lock)?.token === token) rmSync(lock, { recursive: true, force: true });
  };
}
