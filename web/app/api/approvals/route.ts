import { NextResponse } from "next/server";
import { ApprovalStore, defaultApprovalsPath } from "../../../../agent/lib/approvals.ts";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import { rateLimited } from "../../../lib/api-guard";

export const runtime = "nodejs";

function store(): ApprovalStore {
  return new ApprovalStore(Date.now, defaultApprovalsPath());
}

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  // The card list polls; a generous cap still stops a runaway loop from
  // hammering the store lock.
  if (rateLimited(`approvals:${gate.session.callerId}`, 240)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  return NextResponse.json({ ok: true, approvals: store().listPending() });
}
