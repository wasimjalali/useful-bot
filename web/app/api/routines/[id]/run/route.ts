import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../../../lib/desktop-gate";
import { errorCode, rateLimited } from "../../../../../lib/api-guard";
import { agentsEnabled, routinesInFlight, runRoutineNow } from "../../../../../lib/agent-exec";
import { readRoutine } from "../../../../../../shared/routines-store.ts";

export const runtime = "nodejs";

/**
 * Manual "Test run". A turn can take up to two minutes, which is longer than
 * the app's request timeout, so the run starts in the background and the pane
 * reads the outcome from the routine's run history on its next poll.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!agentsEnabled()) {
    return NextResponse.json({ ok: false, error: "agent_credential_missing" }, { status: 503 });
  }
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  if (rateLimited(`routine-run:${gate.session.callerId}`, 20)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { id } = await context.params;
  try {
    const routine = readRoutine(id);
    if (!routine) return NextResponse.json({ ok: false, error: "routine_missing" }, { status: 404 });
    if (routinesInFlight().includes(id)) {
      return NextResponse.json({ ok: false, error: "routine_busy" }, { status: 409 });
    }
    void runRoutineNow(id).catch(() => undefined);
    return NextResponse.json({ ok: true, started: true, routineId: id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}
