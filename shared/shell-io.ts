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
    const bak = `${path}.invalid.${process.pid}`;
    try { renameSync(path, bak); } catch { /* ignore */ }
    const seeded = seedStore();
    writeShell(seeded, path);
    return seeded;
  }
}

export function writeShell(store: ShellStore, path = defaultShellPath()): void {
  const parsed = parseShell(store);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
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
