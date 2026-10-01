import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * A cross-process lock held by the operating system. Each lock is a SQLite
 * file next to the store (`<lock>.sqlite`); the holder keeps `BEGIN EXCLUSIVE`
 * open on it and releasing is closing the transaction. The kernel drops the
 * lock when the process dies, so there is no stale lock to reclaim, no owner
 * file and no pid check. Synchronous, like the stores that use it.
 *
 * Re-entering a lock this process already holds would deadlock on itself, so
 * it throws `dir_lock_reentered` instead.
 */

// Holding the connection here keeps it alive for as long as the lock is held,
// whatever the caller does with the release handle.
const held = new Map<string, DatabaseSync>();

/**
 * An old directory lock (from before this implementation) is dropped when its
 * owner pid is dead. Anything else is left alone: the new lock never looks at it.
 */
function dropLegacyLock(lock: string): void {
  if (!existsSync(lock)) return;
  try {
    const owner = JSON.parse(readFileSync(join(lock, "owner"), "utf8")) as { pid?: unknown };
    if (!Number.isInteger(owner.pid)) return;
    try {
      process.kill(owner.pid as number, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") rmSync(lock, { recursive: true, force: true });
    }
  } catch {
    /* no owner file: ignore it */
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The age after which the old protocol treated an owner-less lock directory as abandoned. */
const LEGACY_OWNERLESS_STALE_MS = 2_000;

/**
 * Take the OLD protocol's lock directory too, so a previous-version process
 * still running during a mixed-version restart is excluded. New writers are
 * already serialized by the SQLite lock; this only has to keep old ones out.
 * Waits (within the deadline) for a live owner, clears a dead one. Returns the
 * release for our half.
 *
 * TODO: the legacy half can be removed one release after this ships.
 */
function takeLegacyDir(lock: string, deadline: number): (() => void) | null {
  const token = randomUUID();
  for (;;) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, "owner"), JSON.stringify({ pid: process.pid, token }), { mode: 0o600 });
      return () => {
        try {
          const owner = JSON.parse(readFileSync(join(lock, "owner"), "utf8")) as { token?: unknown };
          if (owner.token === token) rmSync(lock, { recursive: true, force: true });
        } catch { /* already gone */ }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    let reclaim = false;
    try {
      const owner = JSON.parse(readFileSync(join(lock, "owner"), "utf8")) as { pid?: unknown };
      reclaim = Number.isInteger(owner.pid) && !pidAlive(owner.pid as number);
    } catch {
      try {
        reclaim = Date.now() - statSync(lock).mtimeMs > LEGACY_OWNERLESS_STALE_MS;
      } catch {
        continue; // gone: take it
      }
    }
    if (reclaim) {
      rmSync(lock, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > deadline) return null;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
  }
}

export function acquireDirLock(
  lock: string,
  options: { timeoutMs: number; errorCode: string; legacyDir?: boolean },
): () => void {
  const file = `${lock}.sqlite`;
  if (held.has(file)) throw new Error("dir_lock_reentered");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + options.timeoutMs;
  if (!options.legacyDir) dropLegacyLock(lock);
  const db = new DatabaseSync(file);
  try {
    chmodSync(file, 0o600);
  } catch { /* the file may not exist until first use */ }
  try {
    db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(options.timeoutMs))}`);
    db.exec("BEGIN EXCLUSIVE");
  } catch (err) {
    db.close();
    const code = (err as { errcode?: number }).errcode;
    // SQLITE_BUSY (5) after the busy timeout, or SQLITE_LOCKED (6).
    if (code === 5 || code === 6 || /locked|busy/i.test(String((err as Error).message))) {
      throw new Error(options.errorCode);
    }
    throw err;
  }
  let releaseLegacy: (() => void) | null = null;
  if (options.legacyDir) {
    try {
      releaseLegacy = takeLegacyDir(lock, deadline);
    } catch (err) {
      db.close();
      throw err;
    }
    if (!releaseLegacy) {
      try { db.exec("ROLLBACK"); } catch { /* nothing was written */ }
      db.close();
      throw new Error(options.errorCode);
    }
  }
  held.set(file, db);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseLegacy?.();
    held.delete(file);
    try { db.exec("ROLLBACK"); } catch { /* nothing was written */ }
    db.close();
  };
}
