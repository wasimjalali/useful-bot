import { readSession } from "../../../../lib/auth";
import { fixtureEnabled, fixtureHandle } from "../../../../lib/chat-fixture";

const EVE = "http://127.0.0.1:4321";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, await context.params, "GET");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, await context.params, "POST");
}

async function proxy(request: Request, params: { path: string[] }, method: string): Promise<Response> {
  const session = await readSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const suffix = params.path.join("/");
  const allowed = suffix === "health" || suffix === "info" || suffix.startsWith("session");
  if (!allowed) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (fixtureEnabled()) {
    const handled = await fixtureHandle(method, suffix, request);
    if (handled) return handled;
  }
  const url = new URL(request.url);
  const target = `${EVE}/eve/v1/${suffix}${url.search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const jwt = process.env.UB_CHANNEL_JWT;
  if (jwt) headers.set("authorization", `Bearer ${jwt}`);
  let body: ArrayBuffer | undefined;
  if (method !== "GET") {
    body = await request.arrayBuffer();
  }
  try {
    const signal = method === "GET"
      ? request.signal
      : AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]);
    const upstream = await fetch(target, { method, headers, body, signal });
    const out = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) out.set("content-type", ct);
    out.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ ok: false, error: "eve unavailable" }, { status: 503 });
  }
}
