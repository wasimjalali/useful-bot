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
import { channelJwt, syncSessionWorkspace } from "../../../../lib/agent-exec";
import { EVE_BODY_MAX, apiError, rateLimited, readBody } from "../../../../lib/api-guard";
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
    if (rateLimited(`eve:${session.callerId}`, 60)) {
      return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
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
  let body: Uint8Array | undefined;
  let route: SessionRoute | null = null;
  if (method !== "GET") {
    try {
      body = await readBody(request, EVE_BODY_MAX);
    } catch (err) {
      const guarded = apiError(err);
      if (guarded) return guarded;
      throw err;
    }
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
        body = new TextEncoder().encode(rewriteEveTurnBody(raw, bot, route, members));
        headers.set("content-type", "application/json");
        // The tools that run during this turn read the workspace grant for
        // the session, so it has to be current — stamped or revoked — before
        // the turn reaches eve. Continuation posts carry the session id in
        // the path; a create gets its grant stamped from the response below.
        if (suffix !== "session") {
          const sessionId = suffix.split("/")[1] ?? "";
          if (sessionId && bot) syncSessionWorkspace(sessionId, bot);
        }
      } catch {
        /* keep the original body: a malformed turn must fail at eve, not here */
      }
    }
  }
  try {
    const signal = method === "GET"
      ? request.signal
      : AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]);
    // readBody allocates an exact-length Uint8Array, so its backing buffer is
    // the payload; the cast narrows ArrayBufferLike to the BodyInit type.
    const upstream = await fetch(target, { method, headers, body: body?.buffer as ArrayBuffer | undefined, signal });
    if (!upstream.ok) {
      // Keep the upstream status but never relay eve's internal error body to
      // the caller; it can carry runtime and prompt detail.
      await upstream.body?.cancel().catch(() => undefined);
      return Response.json(
        { ok: false, error: "eve_error", status: upstream.status },
        { status: upstream.status },
      );
    }
    const out = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) out.set("content-type", ct);
    out.set("cache-control", "no-store");
    // A session create answers with the fresh session id. Capture the small
    // JSON body to stamp the grant before returning it: a tolerant parse that
    // fails still passes the body through untouched. The shell is re-read so
    // the stamp cannot come from a pre-request snapshot.
    if (method === "POST" && suffix === "session" && route) {
      const text = await upstream.text();
      try {
        const parsed = JSON.parse(text) as { sessionId?: string };
        if (parsed.sessionId) {
          const fresh = readShell();
          const bot = fresh.bots.find((item) => item.id === route?.threadId) ?? null;
          if (bot) syncSessionWorkspace(parsed.sessionId, bot);
        }
      } catch {
        /* grant stamping is best effort; the body itself is intact */
      }
      return new Response(text, { status: upstream.status, headers: out });
    }
    const encoded = sessionRouteHeader(route);
    // Tells the caller which bot or group answered, and which member an
    // @mention directed the turn at.
    if (encoded) out.set("x-ub-route", encoded);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ ok: false, error: "eve_unavailable" }, { status: 503 });
  }
}
