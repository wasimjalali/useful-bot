import { NextResponse } from "next/server";
import { readSession } from "../../../../lib/auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (session.profile !== "desktop") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  const body = (await request.json()) as { decision?: string; actionSha256?: string };
  if (body.decision !== "approve" && body.decision !== "deny") {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  if (typeof body.actionSha256 !== "string") {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const { id } = await context.params;
  return NextResponse.json({ ok: true, id, decision: body.decision });
}
