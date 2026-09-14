import { RouterError } from "./errors.ts";
import { MAX_ACTIVE_PER_CALLER, MAX_ACTIVE_UPSTREAM } from "../../shared/policy.ts";

/**
 * In-memory concurrency ceiling from SPEC.md:238: at most two upstream
 * requests active across the router and one per caller. Acquired before the
 * step id is reserved so excess requests never consume a step or quota hit.
 */
export class ConcurrencyGate {
  private total = 0;
  private readonly byCaller = new Map<string, number>();

  acquire(callerId: string): void {
    const active = this.byCaller.get(callerId) ?? 0;
    if (active >= MAX_ACTIVE_PER_CALLER) {
      throw new RouterError({
        status: 409,
        type: "invalid_request_error",
        code: "session_busy",
        message: "session_busy",
      });
    }
    if (this.total >= MAX_ACTIVE_UPSTREAM) {
      throw new RouterError({
        status: 429,
        type: "rate_limit_error",
        code: "global_budget_exhausted",
        message: "global_budget_exhausted",
        retryable: true,
      });
    }
    this.total += 1;
    this.byCaller.set(callerId, active + 1);
  }

  release(callerId: string): void {
    const active = this.byCaller.get(callerId) ?? 0;
    if (active <= 1) this.byCaller.delete(callerId);
    else this.byCaller.set(callerId, active - 1);
    if (this.total > 0) this.total -= 1;
  }
}
