/**
 * Request-boundary guards shared by the JSON API routes: bounded body reads,
 * JSON content-type enforcement, stable error codes, and a small in-process
 * rate limiter for the expensive endpoints. Framework-free on purpose so the
 * rules can be unit-tested without booting Next.
 */

export const JSON_BODY_MAX = 256 * 1024;
export const EVE_BODY_MAX = 1024 * 1024;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Turn a guard error into its response; null when it is not a guard error. */
export function apiError(err: unknown): Response | null {
  if (err instanceof ApiError) {
    return Response.json({ ok: false, error: err.code }, { status: err.status });
  }
  return null;
}

/**
 * Map an internal error to a stable code at the API boundary. Short snake_case
 * codes pass through; anything free-form, such as an fs error carrying an
 * absolute path or a JSON.parse position, is replaced with the fallback.
 */
const CODE = /^[a-z][a-z0-9_.:-]{0,80}$/;

export function errorCode(err: unknown, fallback = "invalid"): string {
  const message = err instanceof Error ? err.message : "";
  return CODE.test(message) ? message : fallback;
}

/** Read a request body with a hard byte cap, before anything is parsed. */
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "payload_too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError(413, "payload_too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Parse a JSON body under the guard. Rejects non-JSON content types with 415. */
export async function readJson(request: Request, maxBytes = JSON_BODY_MAX): Promise<unknown> {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new ApiError(415, "unsupported_media_type");
  }
  const bytes = await readBody(request, maxBytes);
  if (bytes.byteLength === 0) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

/**
 * Token bucket keyed by an opaque caller identity. Returns true when the caller
 * is over budget and the request should be answered 429. In-process only, which
 * is enough for the single loopback web server.
 */
export function rateLimited(key: string, perMinute: number, burst = perMinute): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  const capacity = Math.max(1, Math.floor(burst));
  if (!bucket) {
    buckets.set(key, { tokens: capacity - 1, updated: now });
    return false;
  }
  const refill = ((now - bucket.updated) * perMinute) / 60_000;
  bucket.tokens = Math.min(capacity, bucket.tokens + refill);
  bucket.updated = now;
  if (bucket.tokens < 1) return true;
  bucket.tokens -= 1;
  return false;
}
