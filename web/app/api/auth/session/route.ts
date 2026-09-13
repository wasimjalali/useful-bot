import { NextResponse } from "next/server";
import { originAllowed } from "../../../../lib/desktop-gate";
import { createBrowserSession, destroySession, readSession, sessionCookie, clearSessionCookie, verifyDeviceToken } from "../../../../lib/auth";

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost";
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
    const created = createBrowserSession("desktop", "desktop");
    session = { callerId: "desktop", profile: "desktop", csrf: created.csrf };
    const response = NextResponse.json({
      ok: true,
      profile: "desktop",
      expiresAt: created.expiresAt,
      csrfToken: created.csrf,
    });
    response.headers.set("set-cookie", sessionCookie(created.token));
    return response;
  }
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    profile: session.profile,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    csrfToken: session.csrf,
  });
}

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const identity = verifyDeviceToken(header.slice("Bearer ".length).trim());
  if (!identity) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const created = createBrowserSession(identity.callerId, identity.profile);
  const response = NextResponse.json({
    ok: true,
    profile: identity.profile,
    expiresAt: created.expiresAt,
    csrfToken: created.csrf,
  });
  response.headers.set("set-cookie", sessionCookie(created.token));
  return response;
}

export async function DELETE() {
  await destroySession();
  const response = NextResponse.json({ ok: true });
  response.headers.set("set-cookie", clearSessionCookie());
  return response;
}
