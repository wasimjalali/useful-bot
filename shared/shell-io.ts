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

export function readShell(path = defaultShellPath()): ShellStore {
  if (!existsSync(path)) {
    const seeded = seedStore();
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

const LOCK_TIMEOUT_MS = 4000;
const LOCK_STALE_MS = 15_000;
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
