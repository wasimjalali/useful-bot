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

// The reclaim lock guards a critical section of a few syscalls, so only age
// can mark one abandoned.
const RECLAIM_STALE_MS = 5_000;

/**
 * Remove a dead holder's lock, exclusively. Whoever holds `<lock>.reclaim`
 * re-reads the owner and removes the lock only after confirming, right then,
 * that its holder is dead (or that an owner-less lock is past the stale age).
 * A lock that was already replaced by a live holder is left alone, so two
 * waiters racing over one dead owner cannot remove each other's live lock.
 * Returns quietly when another waiter is reclaiming; throws on a real failure.
 */
function reclaim(lock: string, staleMs: number): void {
  const guard = `${lock}.reclaim`;
  try {
    mkdirSync(guard, { mode: 0o700 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    try {
      if (Date.now() - statSync(guard).mtimeMs > RECLAIM_STALE_MS) rmSync(guard, { recursive: true, force: true });
    } catch { /* gone already */ }
    return;
  }
  try {
    const holder = readOwner(lock);
    let dead: boolean;
    if (holder) {
      dead = !pidAlive(holder.pid);
    } else {
      try {
        dead = Date.now() - statSync(lock).mtimeMs > staleMs;
      } catch {
        return; // no lock any more
      }
    }
    if (dead) rmSync(lock, { recursive: true, force: true });
  } finally {
    rmSync(guard, { recursive: true, force: true });
  }
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
    // The deadline is checked on every pass, whatever happens below.
    if (Date.now() > deadline) throw new Error(options.errorCode);
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
      try {
        reclaim(lock, options.staleMs);
      } catch {
        // Not "someone else reclaimed it": the store is locked as far as this caller can tell.
        throw new Error(options.errorCode);
      }
      sleep(5);
      continue;
    }
    sleep(15);
  }
  return () => {
    if (readOwner(lock)?.token === token) rmSync(lock, { recursive: true, force: true });
  };
}
