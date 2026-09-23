import { randomUUID } from "node:crypto";
import { readAgentStore } from "../../shared/agent-store.ts";
import { readImage, writeImage } from "../../shared/images-store.ts";
import { readMediaBytes, saveImage } from "../../shared/media-store.ts";
import { ROUTER_HOST, ROUTER_PORT } from "../../shared/policy.ts";
import { peekShell } from "../../shared/shell-io.ts";
import { ApiError } from "./api-guard.ts";

/** Image models answer slowly; the same ceiling the agent tool uses. */
const GENERATE_TIMEOUT_MS = 150_000;

/**
 * One redraw per id at a time. Two clicks (the chat row and the Library, or
 * two windows) would both pass the image_present check and both pay, so a
 * second request joins the first. On globalThis: the dev server gives each
 * API route its own copy of this module.
 */
const INFLIGHT_KEY = Symbol.for("useful-bot.image-regenerate.inflight");
const inflight: Map<string, Promise<{ path: string }>> =
  ((globalThis as Record<symbol, unknown>)[INFLIGHT_KEY] ??= new Map()) as Map<string, Promise<{ path: string }>>;

/**
 * What a lost image was drawn from, read on the server: the Library entry,
 * else the chat event that showed it. The prompt
 * never comes from the caller, so this route can only redraw what the owner
 * already had.
 */
function source(id: string): { prompt: string; botId: string } | null {
  const read = readMediaBytes(id);
  if (read.status === "moved") return { prompt: read.item.prompt, botId: read.item.botId };
  for (const thread of readAgentStore().threads) {
    const event = thread.events.find((row) => row.imageId === id && row.kind === "image");
    if (event?.text) return { prompt: event.text, botId: thread.botId };
  }
  return null;
}

/**
 * Draw a lost image again from its saved prompt and put it back under the
 * same id, so the chat row and the Library show it where it was. Refuses an
 * id whose file is still there: that one is not lost, and a redraw costs
 * money. A file that is there but unreadable (EACCES and the like) counts as
 * there too: only a moved or missing file is lost.
 */
export function regenerateImage(id: string): Promise<{ path: string }> {
  const running = inflight.get(id);
  if (running) return running;
  const run = redraw(id).finally(() => inflight.delete(id));
  inflight.set(id, run);
  return run;
}

async function redraw(id: string): Promise<{ path: string }> {
  const status = readMediaBytes(id).status;
  if ((status !== "moved" && status !== "missing") || readImage(id)) throw new ApiError(409, "image_present");
  const from = source(id);
  if (!from?.prompt.trim()) throw new ApiError(404, "image_prompt_missing");
  const token = process.env.UB_ROUTER_DESKTOP_TOKEN;
  if (!token) throw new ApiError(503, "router_token_missing");
  type Generated = { data?: Array<{ b64_json?: unknown; mime?: unknown }>; model?: unknown; provider?: unknown } | null;
  let json: Generated;
  try {
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
    json = await res.json().catch((err: unknown) => {
      if (err instanceof Error && err.name === "TimeoutError") throw err;
      return null;
    }) as Generated;
  } catch (err) {
    // The router may have asked the provider already, so a timeout says the
    // image may have been billed rather than that nothing happened.
    if (err instanceof Error && err.name === "TimeoutError") throw new ApiError(504, "regenerate_timeout");
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, "router_unreachable");
  }
  const item = json?.data?.find((row) => typeof row?.b64_json === "string" && row.b64_json.length > 0);
  if (!item || typeof item.b64_json !== "string") throw new ApiError(502, "empty_image");
  // Billed from here on, so the bytes must land somewhere: the media folder
  // first, else the app's own store under the same id (the image route
  // serves it from there, and the next Library load moves it into the
  // folder), the way the generate_image tool does.
  const mime = typeof item.mime === "string" ? item.mime : "image/png";
  const model = typeof json?.model === "string" ? json.model : "";
  const provider = typeof json?.provider === "string" ? json.provider : "";
  try {
    const bot = peekShell()?.bots.find((row) => row.id === from.botId);
    const saved = saveImage({
      id,
      mime,
      bytes: Buffer.from(item.b64_json, "base64"),
      prompt: from.prompt,
      model,
      provider,
      botId: from.botId,
      botName: bot?.name ?? "Useful Bot",
      replace: true,
    });
    return { path: saved.path };
  } catch (err) {
    console.error(`[media] could not save regenerated image ${id} to the media folder`, err);
    try {
      writeImage({ id, mime, b64: item.b64_json, prompt: from.prompt, provider, model });
    } catch (fallbackErr) {
      console.error(`[media] could not keep regenerated image ${id} at all`, fallbackErr);
      throw new ApiError(500, "image_not_saved");
    }
    return { path: "" };
  }
}
