import { RouterError } from "./errors.ts";

const RETRY_AFTER_MIN_MS = 1_000;
const RETRY_AFTER_MAX_MS = 300_000;
const RETRY_AFTER_DEFAULT_MS = 60_000;
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const FAILURE_OPEN_MS = 30_000;
/**
 * A model the upstream says it does not have is worse than a flaky minute: it
 * needs the owner to pick a different one. It used to set a flag with nothing
 * to clear it, so the alias stayed dead for the life of the router process and
 * the only way back was restarting the services. It is a long cool-down now,
 * not a headstone: a model reselected in the composer takes effect at the
 * latest five minutes later, and a model that is still missing simply opens
 * the alias again on the next call.
 *
 * `disable()` is not this. A reservation that overran its budget is a spend
 * guard, and a guard that lifts itself on a timer is not one.
 */
const MISSING_MODEL_OPEN_MS = 300_000;

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
    // The spend tripwire, which no timer lifts. Its own code, because the app
    // tells the owner to wait out a `circuit_open` and no wait clears this:
    // the two states read alike from the outside and do not mean alike.
    if (current.disabled) {
      throw new RouterError({
        status: 503,
        type: "internal_error",
        code: "circuit_disabled",
        message: "circuit_disabled",
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

  /**
   * Stop calling this alias until the router restarts. The one caller is a
   * reservation that overran its budget, which means the spend accounting and
   * the upstream disagree. That is not something a wait fixes.
   */
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
      current.openUntil = Math.max(current.openUntil, now + MISSING_MODEL_OPEN_MS);
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
