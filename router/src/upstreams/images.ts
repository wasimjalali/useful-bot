import { RouterError } from "../errors.ts";
import { retryAfterMs } from "../retry-after.ts";
import {
  readProviderStore,
  resolveUpstream,
} from "../../../shared/providers.ts";
import {
  authFailed,
  clearConnectionError,
  noteConnectionError,
  tokenFor,
  upstreamConfigError,
} from "./opencode.ts";

/**
 * OpenAI shaped POST {base}/images/generations. The three modes that carry
 * the `images` flag (openai:api, xai:api, zai:api) all speak it; what differs
 * is the size knob and whether the answer is base64 or a URL to download.
 */

/** The tool asks in shapes; the provider takes the numbers it knows. */
export type ImageSize = "square" | "wide" | "tall";

const SIZE_DIMENSIONS: Record<ImageSize, string> = {
  square: "1024x1024",
  wide: "1536x1024",
  tall: "1024x1536",
};

const SIZE_ASPECT: Record<ImageSize, string> = {
  square: "1:1",
  wide: "16:9",
  tall: "9:16",
};

/** One downloaded image may not exceed this; beyond it is not one of ours. */
const IMAGE_FETCH_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_FETCH_MS = 60_000;

const IMAGE_MIME = /^image\/(png|jpeg|gif|webp)/;

export interface NormalizedImage {
  b64: string;
  mime: string;
}

function sizeParams(providerId: string, size: ImageSize | undefined): Record<string, unknown> {
  if (!size) return {};
  // xAI takes aspect_ratio instead of a pixel size (docs.x.ai images
  // generation); OpenAI and Z.AI both take WxH on `size`.
  if (providerId === "xai") return { aspect_ratio: SIZE_ASPECT[size] };
  return { size: SIZE_DIMENSIONS[size] };
}

async function fetchImageBytes(url: string, signal: AbortSignal, fetchImpl: typeof fetch): Promise<{ bytes: Buffer; mime: string }> {
  // The URL came from the upstream's answer, not from the caller, but it is
  // still fetched like anything remote: no redirects followed blindly, a
  // byte cap, and an image content type or nothing.
  const res = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.any([AbortSignal.timeout(IMAGE_FETCH_MS), signal]),
    headers: { accept: "image/*", "user-agent": "useful-bot/1.0" },
  });
  if (!res.ok) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream_protocol_error",
    });
  }
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_MIME.test(mime)) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream_protocol_error",
    });
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > IMAGE_FETCH_MAX_BYTES) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream_protocol_error",
    });
  }
  return { bytes, mime };
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 6 && bytes.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (bytes.length > 6 && bytes.subarray(0, 6).toString("ascii") === "GIF87a") return "image/gif";
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/**
 * One image generation against the resolved "image" role. Answers the
 * normalized {b64, mime} list the tool persists; url answers are downloaded
 * and re-encoded so the caller never holds a link that expires.
 */
export async function generateImage(input: {
  prompt: string;
  size?: ImageSize;
  n: number;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ providerId: string; model: string; images: NormalizedImage[] }> {
  let resolved: ReturnType<typeof resolveUpstream>;
  try {
    resolved = resolveUpstream(readProviderStore(), "image", process.env);
  } catch (error) {
    throw upstreamConfigError(error);
  }
  const credential = resolved.credential;
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
  const url = `${resolved.baseUrl.replace(/\/$/, "")}/images/generations`;
  const doFetch = input.fetchImpl ?? fetch;
  const response = await doFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: resolved.model,
      prompt: input.prompt,
      n: input.n,
      ...sizeParams(resolved.providerId, input.size),
    }),
    redirect: "manual",
    signal: input.signal,
  });
  if (response.status >= 200 && response.status < 300) {
    clearConnectionError(resolved.connection.id);
  } else if (response.status >= 300 && response.status < 400) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream redirect rejected",
    });
  } else if (response.status === 401 || response.status === 403) {
    noteConnectionError(resolved.connection.id, "upstream_auth_failed");
    throw authFailed();
  } else if (response.status === 429) {
    throw new RouterError({
      status: 429,
      type: "rate_limit_error",
      code: "upstream_rate_limited",
      message: "upstream_rate_limited",
      retryable: true,
      retryAfterMs: retryAfterMs(response),
    });
  } else if (response.status === 404) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "model_unavailable",
      message: "model_unavailable",
    });
  } else {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream_protocol_error",
    });
  }
  const json = await response.json().catch(() => null) as { data?: unknown } | null;
  const data = Array.isArray(json?.data) ? json.data : null;
  if (!data || data.length === 0) {
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream_protocol_error",
    });
  }
  const images: NormalizedImage[] = [];
  for (const item of data) {
    const rec = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (typeof rec.b64_json === "string" && rec.b64_json) {
      const bytes = Buffer.from(rec.b64_json, "base64");
      const mime = sniffMime(bytes) ?? "image/png";
      images.push({ b64: rec.b64_json, mime });
      continue;
    }
    if (typeof rec.url === "string" && /^https:\/\/[^\s]+$/.test(rec.url)) {
      const fetched = await fetchImageBytes(rec.url, input.signal, doFetch);
      images.push({ b64: fetched.bytes.toString("base64"), mime: fetched.mime });
      continue;
    }
    throw new RouterError({
      status: 502,
      type: "upstream_error",
      code: "upstream_protocol_error",
      message: "upstream_protocol_error",
    });
  }
  return { providerId: resolved.providerId, model: resolved.model, images };
}
