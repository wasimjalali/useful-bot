import { NextResponse } from "next/server";
import { originAllowed } from "../../../../lib/desktop-gate";
import { createBrowserSession, destroySession, readSession, sessionCookie, clearSessionCookie, verifyDeviceToken } from "../../../../lib/auth";

function isLocalDesktop(request: Request): boolean {
  try {
    const host = new URL(request.url).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return false;
  } catch {
    return false;
  }
  return originAllowed(request);
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
