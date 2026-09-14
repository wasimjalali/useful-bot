import { isGateError, requireDesktop } from "../../../../lib/desktop-gate";
import {
  eveGetAllowed,
  evePostAllowed,
  eveSessionRoute,
  isEveSessionPost,
  rewriteEveTurnBody,
  sessionRouteHeader,
  type SessionRoute,
} from "../../../../../shared/eve-proxy.ts";
import { channelJwt } from "../../../../lib/agent-exec";
import { readShell } from "../../../../../shared/shell-io.ts";
import { groupMembers, speakersFrom } from "../../../../../shared/threads.ts";

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
  // Only the owner desktop session may reach eve: a device/router credential
  // minted a browser session must not get a chat-completions proxy.
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const session = gate.session;
  const suffix = params.path.join("/");
  const allowed = method === "GET" ? eveGetAllowed(suffix) : evePostAllowed(suffix);
  if (!allowed) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (method !== "GET") {
    const csrf = request.headers.get("x-ub-csrf");
    if (!csrf || csrf !== session.csrf) {
      return Response.json({ ok: false, error: "csrf" }, { status: 403 });
    }
  }
  const url = new URL(request.url);
  const target = `${EVE}/eve/v1/${suffix}${url.search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // Same credential path as the handoff pump: env token if present, otherwise
  // sign one from the channel secret.
  const jwt = channelJwt();
  if (jwt) headers.set("authorization", `Bearer ${jwt}`);
  let body: ArrayBuffer | undefined;
  let route: SessionRoute | null = null;
  if (method !== "GET") {
    body = await request.arrayBuffer();
    if (isEveSessionPost(suffix)) {
      try {
        const raw = new TextDecoder().decode(body);
        const shell = readShell();
        route = eveSessionRoute(raw, shell);
        if (!route) {
          return Response.json({ ok: false, error: "eve_bot_missing" }, { status: 400 });
        }
        const bot = shell.bots.find((item) => item.id === route?.threadId) ?? null;
        const members = bot && bot.kind === "group"
          ? groupMembers(speakersFrom(shell.bots), bot.memberIds)
          : [];
        body = new TextEncoder().encode(rewriteEveTurnBody(raw, bot, route, members)).buffer;
        headers.set("content-type", "application/json");
      } catch {
        /* keep the original body: a malformed turn must fail at eve, not here */
      }
    }
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
    const encoded = sessionRouteHeader(route);
    // Tells the caller which bot or group answered, and which member an
    // @mention directed the turn at.
    if (encoded) out.set("x-ub-route", encoded);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ ok: false, error: "eve unavailable" }, { status: 503 });
  }
}
