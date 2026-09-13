import { NextResponse } from "next/server";
import { ApprovalStore, defaultApprovalsPath } from "../../../../agent/lib/approvals.ts";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";

export const runtime = "nodejs";

function store(): ApprovalStore {
  return new ApprovalStore(Date.now, defaultApprovalsPath());
}

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  return NextResponse.json({ ok: true, approvals: store().listPending() });
}
