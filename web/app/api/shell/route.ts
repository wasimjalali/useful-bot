import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import { applyShellAction, parseShell, type ShellAction } from "../../../../shared/shell-store.ts";
import { readShell, writeShell } from "../../../../shared/shell-io.ts";

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  try {
    return NextResponse.json({ ok: true, store: readShell() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
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
