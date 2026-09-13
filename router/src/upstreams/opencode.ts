import { createHash } from "node:crypto";
import { RouterError } from "../errors.ts";
import type { RegistryEntry } from "../registry.ts";
import { applyReasoning } from "../../../shared/models.ts";
import { readProviderStore, resolveUpstream } from "../../../shared/providers.ts";

export function sessionHeader(callerId: string, sessionId: string, role: string): string {
  return createHash("sha256").update(`${callerId}:${sessionId}:${role}`).digest("hex");
}

export async function completeUpstream(input: {
  entry: RegistryEntry;
  body: unknown;
  sessionId: string;
  callerId: string;
  signal: AbortSignal;
}): Promise<{ response: Response; providerId: string; model: string }> {
  let resolved: ReturnType<typeof resolveUpstream>;
  try {
    resolved = resolveUpstream(readProviderStore(), input.entry.alias, process.env);
  } catch {
    throw new RouterError({
      status: 503,
      type: "internal_error",
      code: "configuration_unverified",
      message: "upstream credential missing",
    });
  }
  const url = `${resolved.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payload = input.body as Record<string, unknown>;
  const forwarded = applyReasoning(resolved.providerId, resolved.effort, resolved.speed, {
    ...payload,
    model: resolved.model,
    max_tokens: typeof payload.max_tokens === "number" ? payload.max_tokens : input.entry.maxOutputTokens,
  });
  const headers: Record<string, string> = {
    authorization: `Bearer ${resolved.key}`,
    "content-type": "application/json",
    "user-agent": "useful-bot/1.0",
  };
  if (resolved.opencodeSession) {
    headers["x-opencode-session"] = sessionHeader(input.callerId, input.sessionId, "root");
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(forwarded),
    redirect: "manual",
    signal: input.signal,
  });
  if (response.status >= 300 && response.status < 400) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream redirect rejected",
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_auth_failed",
      message: "upstream auth failed",
    });
  }
  return { response, providerId: resolved.providerId, model: resolved.model };
}
