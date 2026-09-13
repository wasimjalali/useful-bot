import { NextResponse } from "next/server";
import { MemoryStore } from "../../../../agent/lib/memory.ts";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const notes = new MemoryStore().list("desktop");
  return NextResponse.json({ ok: true, notes });
}
