export const LIVE_PIN_MODEL = "deepseek-v4.1-flash";

export function resolveUpstreamModelId(
  entry: { upstreamModelId: string },
  live: string | undefined = process.env.UB_LIVE_UPSTREAM_MODEL_ID,
): string {
  if (!live) return entry.upstreamModelId;
  if (live !== LIVE_PIN_MODEL) {
    throw new Error("live_upstream_pin_rejected");
  }
  return live;
}
