import { NextResponse } from "next/server";
import { isGateError, requireOwner } from "../../../../lib/desktop-gate";
import { apiError, errorCode, rateLimited, readJson } from "../../../../lib/api-guard";
import { providerMode } from "../../../../../shared/provider-catalog.ts";
import { oauthStartRetired } from "../../../../lib/providers-write";
import { startChatGptSignIn } from "../../../../../shared/chatgpt-signin.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireOwner(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  if (rateLimited(`providers-oauth:${gate.session.callerId}`, 60)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let body: { providerId?: unknown; newAccount?: unknown; clientId?: unknown; retryClientId?: unknown };
  try {
    body = await readJson(request) as typeof body;
  } catch (err) {
    return apiError(err) ?? NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    const providerId = typeof body.providerId === "string" ? body.providerId : "";
    // A route turned off by its vendor's terms says so (UB-015), like every other write does.
    const retired = oauthStartRetired(providerId);
    if (retired) return NextResponse.json({ ok: false, error: "provider_route_retired", message: retired }, { status: 409 });
    // Only providers with a sign-in entry accept this route.
    const mode = providerMode(providerId, "oauth");
    if (mode.signIn === "chatgpt") {
      // Browser flow: the app opens the authorize URL, the loopback callback
      // route finishes the sign-in and the poll reports it.
      const started = startChatGptSignIn({
        newAccount: body.newAccount === true,
        ...(typeof body.clientId === "string" ? { clientId: body.clientId } : {}),
        ...(typeof body.retryClientId === "string" ? { retryClientId: body.retryClientId } : {}),
      });
      return NextResponse.json({
        ok: true,
        pollId: started.pollId,
        flow: "browser",
        userCode: "",
        verificationUrl: started.authorizeUrl,
        verificationUrlComplete: null,
        expiresAt: started.expiresAt,
        intervalMs: started.intervalMs,
        account: started.account,
        accounts: started.accounts,
        reusesSaved: started.reusesSaved,
        clientId: started.clientId,
      });
    }
    throw new Error("provider_oauth");
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}
