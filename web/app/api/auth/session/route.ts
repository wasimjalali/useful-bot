import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { originAllowed } from "../../../../lib/desktop-gate";
import { rateLimited } from "../../../../lib/api-guard";
import { createBrowserSession, destroySession, readSession, sessionCookie, clearSessionCookie, verifyDeviceToken } from "../../../../lib/auth";

/** Opaque, bounded limiter key; never store the raw forwarded address. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const identity = forwarded || request.headers.get("host") || "local";
  return createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/**
 * Auto-session is only for the local UI: the request host must be loopback and
 * the caller must prove it is a same-origin page, through Origin when present
 * or Referer otherwise. A bare request with neither header (a local script, or
 * a remote page using no-cors) does not get a session.
 */
function isLocalDesktop(request: Request): boolean {
  let self: URL;
  try {
    self = new URL(request.url);
  } catch {
    return false;
  }
  if (!isLoopback(self.hostname)) return false;
  const origin = request.headers.get("origin");
  if (origin) return originAllowed(request);
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const ref = new URL(referer);
    // localhost and 127.0.0.1 are the same surface here; Next may normalise the
    // request URL host, so compare only that both ends are loopback and the
    // ports match.
    return isLoopback(ref.hostname) && ref.port === self.port;
  } catch {
    return false;
  }
}

/**
 * Useful Bot is a local app, so the desktop never sees a login wall: a
 * loopback request without a session gets one. A non-loopback caller, or one
 * that fails the origin check, still needs a device token through POST.
 */
export async function GET(request: Request) {
  let session = await readSession();
  if (!session && isLocalDesktop(request)) {
    if (rateLimited(`auth:${clientKey(request)}`, 60)) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
    const created = createBrowserSession("desktop", "desktop");
    session = { callerId: "desktop", profile: "desktop", csrf: created.csrf, expiresAt: created.expiresAt };
    const response = NextResponse.json({
      ok: true,
      profile: "desktop",
      expiresAt: created.expiresAt,
      csrfToken: created.csrf,
    });
    response.headers.append("set-cookie", sessionCookie(created.token));
    return response;
  }
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    profile: session.profile,
    expiresAt: session.expiresAt,
    csrfToken: session.csrf,
  });
}

export async function POST(request: Request) {
  if (rateLimited(`auth:${clientKey(request)}`, 30)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const identity = verifyDeviceToken(header.slice("Bearer ".length).trim());
  if (!identity) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  // Re-issuing a session must retire the one it replaces, or the old cookie
  // stays valid until its own expiry.
  await destroySession();
  const created = createBrowserSession(identity.callerId, identity.profile);
  const response = NextResponse.json({
    ok: true,
    profile: identity.profile,
    expiresAt: created.expiresAt,
    csrfToken: created.csrf,
  });
  response.headers.append("set-cookie", sessionCookie(created.token));
  return response;
}

export async function DELETE(request: Request) {
  if (rateLimited(`auth:${clientKey(request)}`, 60)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const session = await readSession();
  if (session) {
    const csrf = request.headers.get("x-ub-csrf");
    if (!csrf || csrf !== session.csrf) {
      return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
    }
  }
  await destroySession();
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", clearSessionCookie());
  return response;
}
