import { NextResponse } from "next/server";
import { readSession } from "../../../lib/auth";
import { appVersion, systemOperator } from "../../../../shared/operator.ts";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let eve = "unknown";
  try {
    const res = await fetch("http://127.0.0.1:4321/eve/v1/health", { signal: AbortSignal.timeout(1500) });
    eve = res.ok ? "available" : "limited";
  } catch {
    eve = "limited";
  }
  return NextResponse.json({
    ok: true,
    profile: session.profile,
    eve,
    operator: systemOperator(),
    version: appVersion(),
    theme: "light",
  });
}
