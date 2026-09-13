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
  if (keyMatches(request.headers.get("x-ub-agent-key"))) return true;
  // Browser callers: the UI always sends Origin on its POST, so a request with
  // no Origin is not the app and gets no pass. originAllowed() alone treats a
  // missing Origin as same-origin, which any local script can fake.
  const origin = request.headers.get("origin");
  return Boolean(origin) && originAllowed(request);
}

export async function GET(request: Request) {
  if (!agentsEnabled() || !authorised(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
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
  // Delivery can take up to two minutes. Answer now and let the pump run in the
  // background: the UI poll would otherwise stay blocked and stop scheduling
  // ticks, and queue state is durable anyway.
  void pumpHandoffs(limit).catch(() => undefined);
  return NextResponse.json({ ok: true, started: true, inFlight: handoffsInFlight() });
}
