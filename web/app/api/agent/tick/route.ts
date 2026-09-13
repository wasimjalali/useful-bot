import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { originAllowed } from "../../../../lib/desktop-gate";
import {
  agentsEnabled,
  handoffsInFlight,
  pumpHandoffs,
} from "../../../../lib/agent-exec";

/**
 * Handoff pump. The sending agent tool only queues a record, so delivery is
 * driven from here: the UI poll POSTs every few seconds and wakePump() POSTs
 * once right after a send. The agent key reaches this route as a header; the
 * browser reaches it as a same-origin desktop request.
 */

function keyMatches(candidate: string | null): boolean {
  if (!candidate) return false;
  const probe = createHash("sha256").update(candidate).digest();
  const secrets = [process.env.UB_CHANNEL_JWT, process.env.UB_CHANNEL_JWT_SECRET]
    .filter((value): value is string => Boolean(value));
  return secrets.some((secret) => {
    const expected = createHash("sha256").update(secret).digest();
    return timingSafeEqual(probe, expected);
  });
}

function authorised(request: Request): boolean {
  return keyMatches(request.headers.get("x-ub-agent-key")) || originAllowed(request);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: agentsEnabled(),
    inFlight: handoffsInFlight(),
  });
}

export async function POST(request: Request) {
  if (!agentsEnabled()) {
    return NextResponse.json({ ok: false, error: "agent_credential_missing" }, { status: 503 });
  }
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const raw = Number(new URL(request.url).searchParams.get("limit") ?? "2");
  const limit = Number.isFinite(raw) ? Math.min(4, Math.max(1, Math.trunc(raw))) : 2;
  try {
    const result = await pumpHandoffs(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "pump_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
