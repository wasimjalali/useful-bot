import { NextResponse } from "next/server";
import { createBrowserSession, readSession, sessionCookie, clearSessionCookie, verifyDeviceToken } from "../../../../lib/auth";

export async function GET() {
  const session = await readSession();
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
  const response = NextResponse.json({ ok: true });
  response.headers.set("set-cookie", clearSessionCookie());
  return response;
}
