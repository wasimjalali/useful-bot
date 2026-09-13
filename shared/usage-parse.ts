export interface ObservedUsage {
  inputTokens: number;
  outputTokens: number;
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function usageFromPayload(payload: unknown): ObservedUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as { usage?: Record<string, unknown> }).usage;
  if (!usage) return null;
  const input = asCount(usage.prompt_tokens) ?? asCount(usage.input_tokens);
  const output = asCount(usage.completion_tokens) ?? asCount(usage.output_tokens);
  if (input === null || output === null) return null;
  return { inputTokens: input, outputTokens: output };
}

export function usageFromSseBlock(block: string): ObservedUsage | null {
  for (const line of block.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      return usageFromPayload(JSON.parse(data));
    } catch {
      /* keep scanning */
    }
  }
  return null;
}
