import { randomUUID } from "node:crypto";
import { readAgentStore } from "../../shared/agent-store.ts";
import { readImage } from "../../shared/images-store.ts";
import { readMediaBytes, saveImage } from "../../shared/media-store.ts";
import { ROUTER_HOST, ROUTER_PORT } from "../../shared/policy.ts";
import { peekShell } from "../../shared/shell-io.ts";
import { ApiError } from "./api-guard.ts";

/** Image models answer slowly; the same ceiling the agent tool uses. */
const GENERATE_TIMEOUT_MS = 150_000;

/**
 * What a lost image was drawn from, read on the server: the Library entry,
 * else the chat event that showed it, else the app's own store. The prompt
 * never comes from the caller, so this route can only redraw what the owner
 * already had.
 */
function source(id: string): { prompt: string; botId: string } | null {
  const read = readMediaBytes(id);
  if (read.status === "moved" || read.status === "error") return { prompt: read.item.prompt, botId: read.item.botId };
  for (const thread of readAgentStore().threads) {
    const event = thread.events.find((row) => row.imageId === id && row.kind === "image");
    if (event?.text) return { prompt: event.text, botId: thread.botId };
  }
  const legacy = readImage(id);
  return legacy ? { prompt: legacy.prompt, botId: "" } : null;
}

/**
 * Draw a lost image again from its saved prompt and put it back under the
 * same id, so the chat row and the Library show it where it was. Refuses an
 * id whose file is still there: that one is not lost, and a redraw costs
 * money.
 */
export async function regenerateImage(id: string): Promise<{ path: string }> {
  if (readMediaBytes(id).status === "ok" || readImage(id)) throw new ApiError(409, "image_present");
  const from = source(id);
  if (!from?.prompt.trim()) throw new ApiError(404, "image_prompt_missing");
  const token = process.env.UB_ROUTER_DESKTOP_TOKEN;
  if (!token) throw new ApiError(503, "router_token_missing");
  const res = await fetch(`http://${ROUTER_HOST}:${ROUTER_PORT}/v1/images/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-useful-session-id": randomUUID(),
      "x-useful-request-id": randomUUID(),
    },
    body: JSON.stringify({ model: "image", prompt: from.prompt }),
    signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { code?: unknown } } | null;
    const code = typeof body?.error?.code === "string" ? body.error.code : `router_${res.status}`;
    throw new ApiError(502, code);
  }
  const json = await res.json().catch(() => null) as {
    data?: Array<{ b64_json?: unknown; mime?: unknown }>;
    model?: unknown;
    provider?: unknown;
  } | null;
  const item = json?.data?.find((row) => typeof row?.b64_json === "string" && row.b64_json.length > 0);
  if (!item || typeof item.b64_json !== "string") throw new ApiError(502, "empty_image");
  const bot = peekShell()?.bots.find((row) => row.id === from.botId);
  const saved = saveImage({
    id,
    mime: typeof item.mime === "string" ? item.mime : "image/png",
    bytes: Buffer.from(item.b64_json, "base64"),
    prompt: from.prompt,
    model: typeof json?.model === "string" ? json.model : "",
    provider: typeof json?.provider === "string" ? json.provider : "",
    botId: from.botId,
    botName: bot?.name ?? "Useful Bot",
    replace: true,
  });
  return { path: saved.path };
}
