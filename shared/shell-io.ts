import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  unlinkSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseShell, seedStore, type ShellStore } from "./shell-store.ts";

export function defaultShellPath(): string {
  if (process.env.UB_SHELL_PATH) return process.env.UB_SHELL_PATH;
  return join(homedir(), ".useful-bot", "shell.json");
}

/**
 * Set beside the store when `readShell` had to reseed. A reseeded roster is a
 * recovery stub, not the truth, and it is indistinguishable from a real one by
 * inspection: valid JSON, one bot. Anything that deletes by absence has to
 * know the difference, so the reseed says so out loud instead of leaving the
 * next reader to guess.
 *
 * The mark records which bots the stub held. That, not a count, is what says
 * whether the roster is still the stub: a restored backup and a bot the owner
 * added both bring ids the stub never had, and neither of them goes through a
 * code path this module could hook.
 */
function reseedMarkerPath(path: string): string {
  return `${path}.reseeded`;
}

type ReseedMark = { at: string; botIds: string[] };

function writeReseedMark(path: string, botIds: string[]): void {
  try {
    const mark: ReseedMark = { at: new Date().toISOString(), botIds };
    writeFileSync(reseedMarkerPath(path), `${JSON.stringify(mark)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch { /* see shellWasReseeded: an unwritable mark is handled there */ }
}

function clearReseedMark(path: string): void {
  try { unlinkSync(reseedMarkerPath(path)); } catch { /* nothing to clear */ }
}

function readReseedMark(path: string): ReseedMark | null {
  try {
    const raw = JSON.parse(readFileSync(reseedMarkerPath(path), "utf8")) as Partial<ReseedMark>;
    return Array.isArray(raw?.botIds) ? { at: String(raw.at ?? ""), botIds: raw.botIds } : null;
  } catch {
    return null;
  }
}

/**
 * Whether the roster on disk is a recovery stub rather than the owner's.
 *
 * Evaluated against the live file every time, so the mark clears itself as
 * soon as the roster holds a bot the stub did not. That covers the restore
 * nothing in this module can observe: copying a `.invalid.*` backup back over
 * the store is a manual file move, and the bots it brings are the proof.
 */
export function shellWasReseeded(path = defaultShellPath()): boolean {
  const mark = readReseedMark(path);
  if (!mark) return false;
  const shell = peekShell(path);
  // No readable roster is its own reason for a deleting caller to stop.
  if (!shell) return true;
  const stub = new Set(mark.botIds);
  if (shell.bots.every((bot) => stub.has(bot.id))) return true;
  clearReseedMark(path);
  return false;
}

/**
 * Read the roster without repairing it. `readShell` treats an unreadable store
 * as a reason to reseed, which is right for the app (an owner with a broken
 * store still gets a working one) and catastrophic for anything that deletes
 * by absence: every other bot's routines and transcripts become orphans.
 *
 * Callers that delete must use this, do nothing when it returns null, and
 * check `shellWasReseeded` as well: null only covers a file this process could
 * not read, not one another process already replaced with a stub.
 */
export function peekShell(path = defaultShellPath()): ShellStore | null {
  if (!existsSync(path)) return null;
  try {
    return parseShell(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function readShell(path = defaultShellPath()): ShellStore {
  if (!existsSync(path)) {
    const seeded = seedStore();
    // A missing store lost nothing, so a mark left over from an older file
    // must not make this fresh one look like a recovery stub.
    clearReseedMark(path);
    writeShell(seeded, path);
    return seeded;
  }
  try {
    return parseShell(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    const bak = `${path}.invalid.${process.pid}.${Date.now()}`;
    try { renameSync(path, bak); } catch { /* ignore */ }
    console.warn(`[useful-bot] shell store was unreadable; reseeded and backed up to ${bak}`);
    const seeded = seedStore();
    // Before the stub lands, not after. The absence of a mark is what lets a
    // deleting caller act, so a crash between the two has to leave a mark with
    // no stub (one sweep suppressed) rather than a stub with no mark (every
    // other bot's routines and transcripts read as orphans).
    writeReseedMark(path, seeded.bots.map((bot) => bot.id));
    writeShell(seeded, path);
    return seeded;
  }
}

export function writeShell(store: ShellStore, path = defaultShellPath()): void {
  const parsed = parseShell(store);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const fd = openSync(tmp, "r");
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Stale below timeout, or one crashed holder makes every writer fail for the
 * whole stale window instead of clearing the corpse. The gap between them is
 * the margin a live holder gets before its lock is stolen mid-fsync.
 */
const LOCK_TIMEOUT_MS = 8000;
const LOCK_STALE_MS = 3000;
const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(4));

function sleep(ms: number): void {
  try {
    Atomics.wait(SLEEP_SIGNAL, 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      /* fallback for runtimes without Atomics.wait */
    }
  }
}

/**
 * Locked read-modify-write for the shell store. The route and the handoff pump
 * both update bot rows, and a plain read/apply/write pair can drop the other
 * writer's row when they overlap; the directory lock keeps the update whole
 * across requests and across processes.
 */
export function updateShell(
  mutate: (store: ShellStore) => ShellStore,
  path = defaultShellPath(),
): ShellStore {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let held = false;
  while (!held) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      held = true;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmdirSync(lock);
      } catch { /* lock vanished; retry */ }
      if (Date.now() > deadline) break;
      sleep(15);
    }
  }
  if (!held) throw new Error("shell_store_locked");
  try {
    const next = mutate(readShell(path));
    writeShell(next, path);
    return next;
  } finally {
    try { rmdirSync(lock); } catch { /* ignore */ }
  }
}
