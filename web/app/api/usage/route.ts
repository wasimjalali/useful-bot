import { join } from "node:path";
import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import { LimitStore } from "../../../../router/src/limits.ts";
import { CALLER_LIMITS } from "../../../../shared/policy.ts";
import { readProviderStore } from "../../../../shared/providers.ts";

function usageDbPath(): string {
  return process.env.UB_ROUTER_DB ?? join(process.env.HOME ?? "/tmp", ".useful-bot/router/usage.sqlite");
}

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const summary = new LimitStore(usageDbPath()).summarize();
  const caps = CALLER_LIMITS.desktop;
  const store = readProviderStore();
  return NextResponse.json({
    ok: true,
    ...summary,
    activeProviderId: store.activeProviderId,
    caps: {
      requests24h: caps.requests24h,
      input24h: caps.input24h,
      output24h: caps.output24h,
    },
  });
}
