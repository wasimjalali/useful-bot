import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type BrowserSession = {
  callerId: string;
  profile: string;
  csrf: string;
  expiresAt: number;
};

export function defaultWebSessionsPath(): string {
  if (process.env.UB_WEB_SESSIONS_PATH) return process.env.UB_WEB_SESSIONS_PATH;
  return join(homedir(), ".useful-bot", "web-sessions.json");
}

export function sessionKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function load(path = defaultWebSessionsPath()): Record<string, BrowserSession> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { sessions?: Record<string, BrowserSession> };
    return parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {};
  } catch {
    return {};
  }
}

function save(sessions: Record<string, BrowserSession>, path = defaultWebSessionsPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const now = Date.now();
  const kept: Record<string, BrowserSession> = {};
  for (const [key, rec] of Object.entries(sessions)) {
    if (rec && rec.expiresAt > now) kept[key] = rec;
  }
  try {
    writeFileSync(tmp, `${JSON.stringify({ sessions: kept })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const fd = openSync(tmp, "r");
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

export function putBrowserSession(token: string, rec: BrowserSession, path = defaultWebSessionsPath()): void {
  const sessions = load(path);
  sessions[sessionKey(token)] = rec;
  save(sessions, path);
}

export function getBrowserSession(token: string, path = defaultWebSessionsPath()): BrowserSession | null {
  const rec = load(path)[sessionKey(token)];
  if (!rec || rec.expiresAt <= Date.now()) return null;
  return rec;
}

export function dropBrowserSession(token: string, path = defaultWebSessionsPath()): void {
  const sessions = load(path);
  delete sessions[sessionKey(token)];
  save(sessions, path);
}
