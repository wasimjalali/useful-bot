import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { RouterError } from "./errors.ts";
import { CALLER_LIMITS } from "../../shared/policy.ts";
import type { AuthedCaller } from "./auth.ts";

export class LimitStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        request_id TEXT PRIMARY KEY,
        caller_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hits (
        caller_id TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
    `);
  }

  rememberRequest(requestId: string, callerId: string, now: number): void {
    const existing = this.db.prepare("SELECT request_id FROM requests WHERE request_id = ?").get(requestId);
    if (existing) {
      throw new RouterError({
        status: 409,
        type: "invalid_request_error",
        code: "duplicate_request",
        message: "duplicate_request",
      });
    }
    this.db.prepare("INSERT INTO requests (request_id, caller_id, created_at) VALUES (?, ?, ?)").run(
      requestId,
      callerId,
      now,
    );
  }

  hit(caller: AuthedCaller, now: number): void {
    const limits = CALLER_LIMITS[caller.profile];
    const minuteAgo = now - 60_000;
    const recent = this.db.prepare("SELECT COUNT(*) AS c FROM hits WHERE caller_id = ? AND ts > ?").get(
      caller.callerId,
      minuteAgo,
    ) as { c: number };
    if (recent.c >= limits.rpm) {
      throw new RouterError({
        status: 429,
        type: "rate_limit_error",
        code: "caller_rate_limit",
        message: "caller_rate_limit",
        retryable: true,
      });
    }
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const day = this.db.prepare("SELECT COUNT(*) AS c FROM hits WHERE caller_id = ? AND ts > ?").get(
      caller.callerId,
      dayAgo,
    ) as { c: number };
    if (limits.requests24h > 0 && day.c >= limits.requests24h) {
      throw new RouterError({
        status: 429,
        type: "rate_limit_error",
        code: "caller_budget_exhausted",
        message: "caller_budget_exhausted",
        retryable: true,
      });
    }
    this.db.prepare("INSERT INTO hits (caller_id, ts) VALUES (?, ?)").run(caller.callerId, now);
  }
}
