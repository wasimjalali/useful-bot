import { NextResponse } from "next/server";
import { ApprovalStore, defaultApprovalsPath } from "../../../../../agent/lib/approvals.ts";
import { isGateError, requireDesktop } from "../../../../lib/desktop-gate";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
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
  try {
    const record = new ApprovalStore(Date.now, defaultApprovalsPath()).decide(
      id,
      body.decision,
      body.actionSha256,
    );
    return NextResponse.json({ ok: true, id: record.id, decision: body.decision, status: record.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    const status = message.startsWith("approval_not_found") ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
