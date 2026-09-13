import { NextResponse } from "next/server";
import { readSession } from "../../../lib/auth";
import { loadShell, saveShell } from "../../../lib/shell-persist";
import { parseShellState } from "../../../../shared/shell-store.ts";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, shell: loadShell() });
}

export async function PUT(request: Request) {
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
  try {
    const body = await request.json() as { shell?: unknown };
    const parsed = parseShellState(body.shell);
    return NextResponse.json({ ok: true, shell: saveShell(parsed) });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
}
