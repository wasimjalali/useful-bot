import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { parseShellState, seedShell, type ShellState } from "../../shared/shell-store.ts";

export function shellPath(): string {
  return process.env.UB_SHELL_PATH ?? join(process.env.HOME ?? homedir(), ".useful-bot/shell.json");
}

export function loadShell(): ShellState {
  const path = shellPath();
  if (!existsSync(path)) {
    const seeded = seedShell();
    saveShell(seeded);
    return seeded;
  }
  try {
    return parseShellState(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    const seeded = seedShell();
    saveShell(seeded);
    return seeded;
  }
}

export function saveShell(state: ShellState): ShellState {
  const parsed = parseShellState(state);
  const path = shellPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
  return parsed;
}
