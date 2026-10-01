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

// A guard with no owner file (its taker died between mkdir and the write, or
// is about to write) is the only kind aged out; one with an owner is never
// taken by age, so a live reclaimer that pauses keeps it.
const GUARD_OWNERLESS_STALE_MS = 5_000;

/**
 * Remove a dead holder's lock, exclusively. The guard `<lock>.reclaim` has the
 * same durable ownership as the lock: pid plus token, reclaimed only when its
 * holder pid is dead, released only by its own token. Under the guard the
 * owner is read, judged dead, and read once more right before the removal; the
 * removal happens only if the guard is still ours and the owner is unchanged.
 * A lock a live holder has since taken is never removed. Returns quietly when
 * another waiter is reclaiming; throws on a real failure.
 */
function reclaim(lock: string, staleMs: number): void {
  const guard = `${lock}.reclaim`;
  const token = randomUUID();
  try {
    mkdirSync(guard, { mode: 0o700 });
    try {
      writeFileSync(join(guard, "owner"), JSON.stringify({ pid: process.pid, token }), { mode: 0o600 });
    } catch (err) {
      rmSync(guard, { recursive: true, force: true });
      throw err;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    // Someone holds the guard. Take it over only from a dead holder (or an
    // ownerless one past its age), re-reading the token right before removing.
    const holder = readOwner(guard);
    let abandoned = false;
    if (holder) {
      abandoned = !pidAlive(holder.pid);
    } else {
      try {
        abandoned = Date.now() - statSync(guard).mtimeMs > GUARD_OWNERLESS_STALE_MS;
      } catch { /* gone already */ }
    }
    if (abandoned && readOwner(guard)?.token === holder?.token) rmSync(guard, { recursive: true, force: true });
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
    // One more look right before removing: the owner must be the one judged
    // dead, and the guard must still be ours.
    if (dead && readOwner(lock)?.token === holder?.token && readOwner(guard)?.token === token) {
      rmSync(lock, { recursive: true, force: true });
    }
  } finally {
    if (readOwner(guard)?.token === token) rmSync(guard, { recursive: true, force: true });
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
