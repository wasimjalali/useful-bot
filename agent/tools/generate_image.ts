import { defineTool } from "eve/tools";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { inAppGate, READ_ONLY_BLOCKED, sessionPermission } from "../lib/permission.ts";
import { activeBotId } from "../lib/active-bot.ts";
import { toolRouterIds } from "../lib/router-identity.ts";
import { appendAgentEvent, releaseSend, reserveSend } from "../../shared/agent-store.ts";
import { writeImage } from "../../shared/images-store.ts";
import { readShell } from "../../shared/shell-io.ts";
import { ROUTER_HOST, ROUTER_PORT } from "../../shared/policy.ts";

/** Image models answer slowly; two and a half minutes is the tool's ceiling. */
const GENERATE_TIMEOUT_MS = 150_000;

export default defineTool({
  description:
    "Draw an image from a text prompt with the owner's image model and place it in this chat. Use it when the owner asks for a picture, illustration, icon or render. It only works when an image-capable provider (an OpenAI, xAI, Z.ai or OpenRouter API key) is connected in Settings; when it is not, say so instead of retrying. The drawing lands in the transcript by itself: answer in text and do not link or embed the file.",
  inputSchema: z.object({
    prompt: z.string().min(1).max(4000),
    size: z.enum(["square", "wide", "tall"]).optional(),
    requestId: z.string().min(1).max(120).optional(),
  }),
  async execute(input, ctx) {
    // An image costs real money at the provider and lands in the transcript,
    // so Read only refuses it like every other change inside the app.
    if (inAppGate(sessionPermission(ctx)) === "refuse") return READ_ONLY_BLOCKED;
    const token = process.env.UB_ROUTER_DESKTOP_TOKEN;
    if (!token) {
      throw new Error("router token missing");
    }
    const ids = toolRouterIds(ctx);
    const requestId = input.requestId?.trim();
    if (requestId && !reserveSend("image", requestId)) {
      return { status: "duplicate", error: "that requestId was already sent", requestId };
    }
    let res: Response;
    try {
      res = await fetch(`http://${ROUTER_HOST}:${ROUTER_PORT}/v1/images/generations`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(ids
            ? { "x-useful-session-id": ids.sessionId, "x-useful-request-id": randomUUID() }
            : { "x-useful-session-id": randomUUID(), "x-useful-request-id": randomUUID() }),
        },
        body: JSON.stringify({ model: "image", prompt: input.prompt, size: input.size }),
        signal: AbortSignal.any([AbortSignal.timeout(GENERATE_TIMEOUT_MS), ...(ctx?.abortSignal ? [ctx.abortSignal] : [])]),
      });
    } catch (err) {
      if (requestId) releaseSend("image", requestId);
      throw err;
    }
    if (!res.ok) {
      if (requestId) releaseSend("image", requestId);
      const body = await res.json().catch(() => null) as { error?: { code?: unknown; retryable?: unknown } } | null;
      const code = typeof body?.error?.code === "string" ? body.error.code : `http_${res.status}`;
      if (code === "provider_incompatible" || code === "upstream_credential_missing" || code === "provider_disconnected") {
        return {
          status: "unavailable",
          error: "No image-capable provider is connected. The owner can add an OpenAI, xAI, Z.ai or OpenRouter API key in Settings, or pick an image model there.",
        };
      }
      return { status: "failed", error: code };
    }
    const json = await res.json().catch(() => null) as {
      data?: Array<{ b64_json?: unknown; mime?: unknown }>;
      model?: unknown;
      provider?: unknown;
    } | null;
    const item = Array.isArray(json?.data)
      ? json.data.find((row) => typeof row?.b64_json === "string" && row.b64_json.length > 0)
      : undefined;
    if (!item || typeof item.b64_json !== "string") {
      if (requestId) releaseSend("image", requestId);
      return { status: "failed", error: "empty_image" };
    }
    const imageId = `img${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const botId = activeBotId(readShell(), ctx);
    writeImage({
      id: imageId,
      mime: typeof item.mime === "string" ? item.mime : "image/png",
      b64: item.b64_json,
      prompt: input.prompt,
      provider: typeof json?.provider === "string" ? json.provider : "",
      model: typeof json?.model === "string" ? json.model : "",
    });
    appendAgentEvent(botId, {
      kind: "image",
      text: input.prompt,
      imageId,
      id: `img_${imageId}`,
    });
    return {
      status: "generated",
      imageId,
      model: typeof json?.model === "string" ? json.model : undefined,
      note: "The image is in the chat now. Describe it in words if that helps, but the owner already sees it.",
    };
  },
});
