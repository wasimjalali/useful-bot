import { NextResponse } from "next/server";
import { originHeaderAllowed } from "../../shared/origin.ts";
import { readSession } from "./auth";

export function originAllowed(request: Request): boolean {
  return originHeaderAllowed(request.headers.get("origin"), request.url);
}

export async function requireDesktop(request: Request): Promise<
  { error: NextResponse } | { session: { callerId: string; profile: string; csrf: string } }
> {
  const session = await readSession();
  if (!session) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  if (session.profile !== "desktop") {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  if (!originAllowed(request)) {
    return { error: NextResponse.json({ ok: false, error: "origin" }, { status: 403 }) };
  }
  return { session };
}

export function isGateError(
  gate: { error: NextResponse } | { session: { callerId: string; profile: string; csrf: string } },
): gate is { error: NextResponse } {
  return "error" in gate;
}
