import { RouterError } from "./errors.ts";

const RETRY_AFTER_MIN_MS = 1_000;
const RETRY_AFTER_MAX_MS = 300_000;
const RETRY_AFTER_DEFAULT_MS = 60_000;
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const FAILURE_OPEN_MS = 30_000;
/**
 * A model the upstream says it does not have, and a reservation that overran
 * its budget, are worse than a flaky minute: they need a change somewhere
 * before the alias can work again. They used to set a flag with nothing to
 * clear it, so the alias stayed dead for the life of the router process and
 * the only way back was restarting the services. It is a long cool-down now,
 * not a headstone: whatever the owner fixes (a model reselected, a budget
 * raised) takes effect at the latest five minutes later, and a cause that is
 * still there simply opens it again on the next call.
 */
const DISABLE_OPEN_MS = 300_000;

interface CircuitState {
  openUntil: number;
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
      current = { openUntil: 0, failures: [] };
      this.states.set(alias, current);
    }
    return current;
  }

  assertClosed(alias: string, now = Date.now()): void {
    const current = this.state(alias);
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

  disable(alias: string, now = Date.now()): void {
    const current = this.state(alias);
    current.openUntil = Math.max(current.openUntil, now + DISABLE_OPEN_MS);
  }

  recordFailure(alias: string, error: RouterError, now = Date.now()): void {
    const current = this.state(alias);
    if (error.code === "upstream_rate_limited") {
      const retryAfter = clampRetryAfter(error.retryAfterMs);
      current.openUntil = Math.max(current.openUntil, now + retryAfter);
      return;
    }
    if (error.code === "model_unavailable") {
      current.openUntil = Math.max(current.openUntil, now + DISABLE_OPEN_MS);
      return;
    }
    // A timeout is a 5xx-class failure too: three in the window open the
    // alias the same way a protocol error does.
    if (error.code === "upstream_protocol_error" || error.code === "upstream_timeout") {
      current.failures = current.failures.filter((at) => now - at < FAILURE_WINDOW_MS);
      current.failures.push(now);
      if (current.failures.length >= FAILURE_THRESHOLD) {
        current.openUntil = Math.max(current.openUntil, now + FAILURE_OPEN_MS);
      }
    }
  }
}
