import { createHash } from "node:crypto";
import { RouterError } from "../errors.ts";
import type { RegistryEntry } from "../registry.ts";
import { applyReasoning, modelOption, modelSeesImages } from "../../../shared/models.ts";
import { catalogFor } from "../../../shared/live-models.ts";
import { readProviderStore, resolveUpstream } from "../../../shared/providers.ts";
import { retryAfterMs } from "../retry-after.ts";

export function sessionHeader(callerId: string, sessionId: string, role: string): string {
  return createHash("sha256").update(`${callerId}:${sessionId}:${role}`).digest("hex");
}

export function upstreamConfigError(error: unknown): RouterError {
  const raw = error instanceof Error ? error.message : "";
  const known = raw === "upstream_credential_missing"
    || raw === "provider_unknown"
    || raw === "provider_incompatible"
    || raw === "provider_disconnected";
  const code = known ? raw : "configuration_unverified";
  return new RouterError({
    status: 503,
    type: "internal_error",
    code,
    message: code,
  });
}

const CLIENT_CONTROLLED_KEYS = new Set(["reasoning_effort", "service_tier"]);

const IMAGE_OMITTED = "[Attached image omitted: the selected model cannot see images.]";

/**
 * A history with pictures in it outlives the model it was made with. When
 * the owner switches to a model the catalog says is text-only, the image
 * parts become a note in their place so the turn still runs; a model the
 * catalog does not know keeps them, and the upstream decides.
 */
export function withoutImagesForTextModel(messages: unknown, sees: boolean | null): unknown {
  if (sees !== false || !Array.isArray(messages)) return messages;
  return messages.map((message) => {
    const entry = message as { content?: unknown };
    if (!entry || !Array.isArray(entry.content)) return message;
    return {
      ...entry,
      content: entry.content.map((part) => {
        const p = part as { type?: unknown };
        return p?.type === "image_url" ? { type: "text", text: IMAGE_OMITTED } : part;
      }),
    };
  });
}

export async function completeUpstream(input: {
  entry: RegistryEntry;
  body: unknown;
  sessionId: string;
  callerId: string;
  signal: AbortSignal;
}): Promise<{ response: Response; providerId: string; model: string; fallback: boolean }> {
  let resolved: ReturnType<typeof resolveUpstream>;
  try {
    resolved = resolveUpstream(readProviderStore(), input.entry.alias, process.env);
  } catch (error) {
    throw upstreamConfigError(error);
  }
  const url = `${resolved.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payload = input.body as Record<string, unknown>;
  const forwardedBody: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!CLIENT_CONTROLLED_KEYS.has(key)) forwardedBody[key] = value;
  }
  // The model the owner picked in the composer, resolved from the providers
  // store the same way the provider and key are. Pinning the registry id here
  // (audit round 1) made the model menu a placebo: every workhorse call went
  // to glm-5.3-flash whatever the chip said. The registry still names the
  // alias, its window policy and the fallback; the selection names the model.
  const model = resolved.model;
  const sees = modelSeesImages(modelOption(resolved.providerId, model, catalogFor(resolved.providerId)));
  const forwarded = applyReasoning(resolved.providerId, resolved.effort, resolved.speed, {
    ...forwardedBody,
    messages: withoutImagesForTextModel(forwardedBody.messages, sees),
    model,
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
  if (response.status >= 200 && response.status < 300) {
    return { response, providerId: resolved.providerId, model, fallback: resolved.fallback };
  }
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
  if (response.status === 429) {
    throw new RouterError({
      status: 429,
      type: "rate_limit_error",
      code: "upstream_rate_limited",
      message: "upstream_rate_limited",
      retryable: true,
      retryAfterMs: retryAfterMs(response),
    });
  }
  if (response.status === 404) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "model_unavailable",
      message: "model_unavailable",
    });
  }
  throw new RouterError({
    status: 502,
    type: "upstream_error",
    code: "upstream_protocol_error",
    message: "upstream_protocol_error",
  });
}
