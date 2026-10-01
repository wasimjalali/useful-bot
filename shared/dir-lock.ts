import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

export function acquireDirLock(
  lock: string,
  options: { timeoutMs: number; errorCode: string },
): () => void {
  const file = `${lock}.sqlite`;
  if (held.has(file)) throw new Error("dir_lock_reentered");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  dropLegacyLock(lock);
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
  held.set(file, db);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.delete(file);
    try { db.exec("ROLLBACK"); } catch { /* nothing was written */ }
    db.close();
  };
}
