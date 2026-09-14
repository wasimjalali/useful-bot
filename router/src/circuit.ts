import { RouterError } from "./errors.ts";

const RETRY_AFTER_MIN_MS = 1_000;
const RETRY_AFTER_MAX_MS = 300_000;
const RETRY_AFTER_DEFAULT_MS = 60_000;
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const FAILURE_OPEN_MS = 30_000;

interface CircuitState {
  openUntil: number;
  disabled: boolean;
  failures: number[];
}

function clampRetryAfter(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms)) return RETRY_AFTER_DEFAULT_MS;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, Math.round(ms)));
}

export class AliasCircuit {
  private readonly states = new Map<string, CircuitState>();

  private state(alias: string): CircuitState {
    let current = this.states.get(alias);
    if (!current) {
      current = { openUntil: 0, disabled: false, failures: [] };
      this.states.set(alias, current);
    }
    return current;
  }

  assertClosed(alias: string, now = Date.now()): void {
    const current = this.state(alias);
    if (current.disabled) {
      throw new RouterError({
        status: 503,
        type: "internal_error",
        code: "circuit_open",
        message: "circuit_open",
        alias: alias as "workhorse" | "reviewer",
      });
    }
    if (current.openUntil > now) {
      throw new RouterError({
        status: 503,
        type: "internal_error",
        code: "circuit_open",
        message: "circuit_open",
        alias: alias as "workhorse" | "reviewer",
        retryable: true,
        retryAfterMs: current.openUntil - now,
      });
    }
  }

  recordSuccess(alias: string): void {
    const current = this.state(alias);
    current.failures = [];
    current.openUntil = 0;
  }

  disable(alias: string): void {
    this.state(alias).disabled = true;
  }

  recordFailure(alias: string, error: RouterError, now = Date.now()): void {
    const current = this.state(alias);
    if (error.code === "upstream_rate_limited") {
      const retryAfter = clampRetryAfter(error.retryAfterMs);
      current.openUntil = Math.max(current.openUntil, now + retryAfter);
      return;
    }
    if (error.code === "model_unavailable") {
      current.disabled = true;
      return;
    }
    if (error.code === "upstream_protocol_error") {
      current.failures = current.failures.filter((at) => now - at < FAILURE_WINDOW_MS);
      current.failures.push(now);
      if (current.failures.length >= FAILURE_THRESHOLD) {
        current.openUntil = Math.max(current.openUntil, now + FAILURE_OPEN_MS);
      }
    }
  }
}
