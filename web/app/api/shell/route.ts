import { NextResponse } from "next/server";
import { readSession } from "../../../lib/auth";
import { applyShellAction, parseShell, type ShellAction } from "../../../../shared/shell-store.ts";
import { readShell, writeShell } from "../../../../shared/shell-io.ts";

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

async function requireDesktop(request: Request) {
  const session = await readSession();
  if (!session) return { error: NextResponse.json({ ok: false }, { status: 401 }) };
  if (session.profile !== "desktop") {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  if (!originAllowed(request)) {
    return { error: NextResponse.json({ ok: false, error: "origin" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if ("error" in gate && gate.error) return gate.error;
  return NextResponse.json({ ok: true, store: readShell() });
}

export async function PUT(request: Request) {
  const gate = await requireDesktop(request);
  if ("error" in gate && gate.error) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session!.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  try {
    const body = await request.json() as { store?: unknown; action?: ShellAction };
    const current = readShell();
    const next = body.action
      ? applyShellAction(current, body.action).store
      : parseShell(body.store);
    writeShell(next);
    return NextResponse.json({ ok: true, store: next });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
