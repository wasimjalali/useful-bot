import { createHash } from "node:crypto";
import { RouterError } from "../errors.ts";
import type { RegistryEntry } from "../registry.ts";
import { applyReasoning, modelOption, modelSeesImages } from "../../../shared/models.ts";
import { catalogFor } from "../../../shared/live-models.ts";
import { POLICY_WINDOW_TOKENS } from "../../../shared/policy.ts";
import {
  readProviderStore,
  recordConnectionError,
  resolveUpstream,
  setOAuthCredential,
  updateProviderStore,
  type Credential,
} from "../../../shared/providers.ts";
import { accessTokenFor, refreshCredential } from "../../../shared/provider-oauth.ts";
import { postChatCompletions } from "./openai-chat.ts";
import { postMessages } from "./anthropic-messages.ts";
import { postResponses } from "./openai-responses.ts";
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

function authFailed(): RouterError {
  return new RouterError({
    status: 502,
    type: "upstream_error",
    code: "upstream_auth_failed",
    message: "upstream auth failed",
  });
}

/** The token and the auth-derived headers (ChatGPT-Account-Id) for one call. */
function tokenFor(providerId: string, credential: Credential): { token: string; headers: Record<string, string> } {
  if (credential.kind === "key") return { token: credential.key, headers: {} };
  if (credential.kind === "oauth") {
    const info = accessTokenFor(providerId, credential);
    return { token: info.token, headers: info.headers };
  }
  return { token: "", headers: {} };
}

function persistOAuthCredential(providerId: string, credential: Credential): void {
  updateProviderStore((store) => setOAuthCredential(store, providerId, credential));
}

/**
 * Status notes are bookkeeping: a lock that cannot be taken in time must
 * not turn the model call itself into a failure, so both writers swallow
 * their own errors.
 */
function noteConnectionError(connectionId: string, code: string): void {
  try {
    updateProviderStore((store) => (
      store.connections[connectionId] ? recordConnectionError(store, connectionId, code) : store
    ));
  } catch { /* best effort */ }
}

/**
 * A success clears the last failure the router recorded on the connection.
 * The check runs inside the lock, so a failure recorded a moment ago by
 * another call is not wiped by this stale success.
 */
function clearConnectionError(connectionId: string): void {
  try {
    updateProviderStore((store) => {
      const conn = store.connections[connectionId];
      if (!conn || !conn.lastError) return store;
      return { ...store, connections: { ...store.connections, [connectionId]: { ...conn, lastError: null } } };
    });
  } catch { /* best effort */ }
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
  let credential = resolved.credential;
  if (credential.kind === "oauth") {
    if (accessTokenFor(resolved.providerId, credential).expired) {
      try {
        credential = await refreshCredential(resolved.providerId, credential);
        persistOAuthCredential(resolved.providerId, credential);
      } catch {
        noteConnectionError(resolved.connection.id, "upstream_auth_failed");
        throw authFailed();
      }
    }
  }
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
  const option = modelOption(resolved.connection.id, model, catalogFor(resolved.connection.id));
  const sees = modelSeesImages(option);
  // eve compacts at 90% of the model's window (agent/lib/model-window.ts reads
  // the same catalog), so the output cap keeps to the last tenth: a prompt at
  // the threshold plus a full answer still fits a small model's window.
  // `modelOption` falls back to the list's first model; only the picked
  // model's own window may size its cap.
  const sized = option?.id === model && option.contextTokens && option.contextTokens > 0 ? option.contextTokens : null;
  const outputCap = Math.min(input.entry.maxOutputTokens, Math.floor((sized ?? POLICY_WINDOW_TOKENS) / 10));
  const forwarded = applyReasoning(resolved.providerId, resolved.effort, resolved.speed, {
    ...forwardedBody,
    messages: withoutImagesForTextModel(forwardedBody.messages, sees),
    model,
    max_tokens: typeof payload.max_tokens === "number" ? Math.min(payload.max_tokens, outputCap) : outputCap,
  });
  const dispatch = (): Promise<Response> => {
    const auth = tokenFor(resolved.providerId, credential);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "useful-bot/1.0",
      ...(resolved.mode.headers ?? {}),
      ...auth.headers,
    };
    if (auth.token) {
      if (resolved.keyHeader === "x-api-key") headers["x-api-key"] = auth.token;
      else if (resolved.keyHeader === "api-key") headers["api-key"] = auth.token;
      else headers.authorization = `Bearer ${auth.token}`;
    }
    if (resolved.opencodeSession) {
      headers["x-opencode-session"] = sessionHeader(input.callerId, input.sessionId, "root");
    }
    if (resolved.protocol === "openai-responses") {
      return postResponses({
        baseUrl: resolved.baseUrl,
        model,
        chatgpt: resolved.providerId === "openai",
        body: forwarded,
        headers,
        signal: input.signal,
      });
    }
    if (resolved.protocol === "anthropic-messages") {
      return postMessages({ baseUrl: resolved.baseUrl, model, body: forwarded, headers, signal: input.signal });
    }
    return postChatCompletions({ baseUrl: resolved.baseUrl, body: forwarded, headers, signal: input.signal });
  };
  let response = await dispatch();
  // One refresh and one retry on an oauth 401, then the auth failure below.
  if (response.status === 401 && credential.kind === "oauth") {
    try {
      await response.body?.cancel();
    } catch { /* the retry carries on regardless */ }
    try {
      credential = await refreshCredential(resolved.providerId, credential);
      persistOAuthCredential(resolved.providerId, credential);
    } catch {
      noteConnectionError(resolved.connection.id, "upstream_auth_failed");
      throw authFailed();
    }
    response = await dispatch();
  }
  if (response.status >= 200 && response.status < 300) {
    clearConnectionError(resolved.connection.id);
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
    noteConnectionError(resolved.connection.id, "upstream_auth_failed");
    throw authFailed();
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
