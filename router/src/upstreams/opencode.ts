import { createHash } from "node:crypto";
import { RouterError } from "../errors.ts";
import type { RegistryEntry } from "../registry.ts";
import { resolveUpstreamModelId as resolveLiveModel } from "../../../shared/live-model.ts";

const GO_DEFAULT = "https://opencode.ai/zen/go/v1";

function resolveUpstreamModelId(entry: { upstreamModelId: string }): string {
  try {
    return resolveLiveModel(entry);
  } catch {
    throw new RouterError({
      status: 503,
      type: "internal_error",
      code: "configuration_unverified",
      message: "live upstream pin rejected",
    });
  }
}

export function sessionHeader(callerId: string, sessionId: string, role: string): string {
  return createHash("sha256").update(`${callerId}:${sessionId}:${role}`).digest("hex");
}

export async function completeUpstream(input: {
  entry: RegistryEntry;
  body: unknown;
  sessionId: string;
  callerId: string;
  signal: AbortSignal;
}): Promise<Response> {
  const key = process.env.UB_OPENCODE_GO_KEY;
  if (!key) {
    throw new RouterError({
      status: 503,
      type: "internal_error",
      code: "configuration_unverified",
      message: "upstream credential missing",
    });
  }
  const base = process.env.UB_OPENCODE_GO_BASE || GO_DEFAULT;
  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const payload = input.body as Record<string, unknown>;
  const forwarded = {
    ...payload,
    model: resolveUpstreamModelId(input.entry),
    max_tokens: typeof payload.max_tokens === "number" ? payload.max_tokens : input.entry.maxOutputTokens,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "user-agent": "useful-bot/1.0",
      "x-opencode-session": sessionHeader(input.callerId, input.sessionId, "root"),
    },
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
  return response;
}
