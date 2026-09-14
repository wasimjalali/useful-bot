import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { RouterError } from "./errors.ts";
import { CALLER_LIMITS } from "../../shared/policy.ts";
import type { AuthedCaller } from "./auth.ts";

export interface UsageRow {
  callerId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  at: number;
}

export interface UsageBucket {
  provider: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageSummary {
  caller_id: string;
  window_start: string;
  reserved_input_tokens: null;
  reserved_output_tokens: null;
  observed_input_tokens: number;
  observed_output_tokens: number;
  requests: number;
  provider_remaining: null;
  by_model: UsageBucket[];
}

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const HIT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const USAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;

export class LimitStore {
  private readonly db: DatabaseSync;
  private lastPrune = 0;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL");
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
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caller_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        ts INTEGER NOT NULL
      );
    `);
    this.prune(Date.now());
  }

  private prune(now: number): void {
    if (now - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.lastPrune = now;
    this.db.prepare("DELETE FROM requests WHERE created_at < ?").run(now - REQUEST_TTL_MS);
    this.db.prepare("DELETE FROM hits WHERE ts < ?").run(now - HIT_RETENTION_MS);
    this.db.prepare("DELETE FROM usage WHERE ts < ?").run(now - USAGE_RETENTION_MS);
  }

  recordUsage(row: UsageRow): void {
    this.prune(row.at);
    this.db.prepare(
      "INSERT INTO usage (caller_id, provider, model, input_tokens, output_tokens, ts) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(row.callerId, row.provider, row.model, row.inputTokens, row.outputTokens, row.at);
  }

  summarize(callerId?: string, now = Date.now(), windowMs = 7 * 24 * 60 * 60 * 1000): UsageSummary {
    const start = now - windowMs;
    const totals = callerId
      ? this.db.prepare(
        "SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output FROM usage WHERE caller_id = ? AND ts > ?",
      ).get(callerId, start) as { requests: number; input: number; output: number }
      : this.db.prepare(
        "SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output FROM usage WHERE ts > ?",
      ).get(start) as { requests: number; input: number; output: number };
    const rows = callerId
      ? this.db.prepare(
        "SELECT provider, model, COUNT(*) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM usage WHERE caller_id = ? AND ts > ? GROUP BY provider, model ORDER BY output DESC, input DESC",
      ).all(callerId, start) as Array<{ provider: string; model: string; requests: number; input: number; output: number }>
      : this.db.prepare(
        "SELECT provider, model, COUNT(*) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM usage WHERE ts > ? GROUP BY provider, model ORDER BY output DESC, input DESC",
      ).all(start) as Array<{ provider: string; model: string; requests: number; input: number; output: number }>;
    return {
      caller_id: callerId ?? "desktop",
      window_start: new Date(start).toISOString(),
      reserved_input_tokens: null,
      reserved_output_tokens: null,
      observed_input_tokens: Number(totals.input),
      observed_output_tokens: Number(totals.output),
      requests: Number(totals.requests),
      provider_remaining: null,
      by_model: rows.map((row) => ({
        provider: row.provider,
        model: row.model,
        requests: Number(row.requests),
        inputTokens: Number(row.input),
        outputTokens: Number(row.output),
      })),
    };
  }

  rememberRequest(requestId: string, callerId: string, now: number): void {
    this.prune(now);
    const key = `${callerId}\u0000${requestId}`;
    const info = this.db.prepare(
      "INSERT INTO requests (request_id, caller_id, created_at) VALUES (?, ?, ?) ON CONFLICT(request_id) DO NOTHING",
    ).run(key, callerId, now);
    if (Number(info.changes) === 0) {
      throw new RouterError({
        status: 409,
        type: "invalid_request_error",
        code: "duplicate_request",
        message: "duplicate_request",
      });
    }
  }

  hit(caller: AuthedCaller, now: number): void {
    const limits = CALLER_LIMITS[caller.profile];
    this.prune(now);
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
    if (limits.input24h > 0 || limits.output24h > 0) {
      const tokens = this.db.prepare(
        "SELECT COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output FROM usage WHERE caller_id = ? AND ts > ?",
      ).get(caller.callerId, dayAgo) as { input: number; output: number };
      if ((limits.input24h > 0 && Number(tokens.input) >= limits.input24h)
        || (limits.output24h > 0 && Number(tokens.output) >= limits.output24h)) {
        throw new RouterError({
          status: 429,
          type: "rate_limit_error",
          code: "caller_budget_exhausted",
          message: "caller_budget_exhausted",
          retryable: true,
        });
      }
    }
    this.db.prepare("INSERT INTO hits (caller_id, ts) VALUES (?, ?)").run(caller.callerId, now);
  }
}
