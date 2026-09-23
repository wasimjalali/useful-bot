import { RouterError } from "./errors.ts";
import { readCapped } from "./read-capped.ts";

export function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(header);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return undefined;
}

/** Spend and credit limits OpenAI reports as a 429 `code` (the set Codex treats as quota). */
const QUOTA_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

/**
 * A 429 is either "slow down" or "the plan or the credit is used up", and
 * only the body says which, the way OpenAI's own Codex client reads it
 * (codex-rs/codex-api/src/api_bridge.rs). A used-up limit is not retried:
 * it answers 402, which no client retries, with the reset time when the
 * provider gave one, so the app can say what happened and until when.
 */
export async function upstreamLimitError(response: Response): Promise<RouterError> {
  const text = await readCapped(response, 16_384).catch(async () => {
    // Too large or unreadable: an ordinary rate limit, and the socket is
    // released rather than left for the collector.
    await response.body?.cancel().catch(() => {});
    return "";
  });
  let type = "";
  let code = "";
  let resetsAt: number | undefined;
  try {
    const error = (JSON.parse(text) as { error?: Record<string, unknown> } | null)?.error;
    if (error && typeof error === "object") {
      type = typeof error.type === "string" ? error.type : "";
      code = typeof error.code === "string" ? error.code : "";
      if (typeof error.resets_at === "number" && Number.isFinite(error.resets_at)) {
        resetsAt = Math.round(error.resets_at);
      } else if (typeof error.resets_in_seconds === "number" && Number.isFinite(error.resets_in_seconds)) {
        resetsAt = Math.round(Date.now() / 1000 + error.resets_in_seconds);
      }
    }
  } catch { /* not JSON: an ordinary rate limit */ }
  const used = (name: string) => new RouterError({
    status: 402,
    type: "rate_limit_error",
    code: name,
    // The reset rides in the message: it is what reaches the app through
    // eve's failure text.
    message: resetsAt !== undefined ? `${name} resets_at=${resetsAt}` : name,
    retryable: false,
  });
  if (type === "usage_limit_reached") return used("upstream_usage_limit");
  if (type === "usage_not_included") return used("upstream_usage_not_included");
  if (type === "insufficient_quota" || QUOTA_CODES.has(code)) return used("upstream_quota_exhausted");
  return new RouterError({
    status: 429,
    type: "rate_limit_error",
    code: "upstream_rate_limited",
    message: "upstream_rate_limited",
    retryable: true,
    retryAfterMs: retryAfterMs(response),
  });
}
