import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";

export const runtime = "nodejs";

function fixtureReview(text: string): string {
  const clipped = text.trim().slice(0, 80) || "(empty)";
  return [
    "Reviewer (fixture, no live glm-5.3 on this host).",
    `Supplied text starts: ${clipped}`,
    "High: none found without a live reviewer model.",
    "Advisory only. This is not an owner security signoff.",
  ].join("\n");
}

async function liveReview(text: string, token: string): Promise<string> {
  const res = await fetch(process.env.UB_ROUTER_BASE_URL ?? "http://127.0.0.1:4319/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "reviewer",
      messages: [{ role: "user", content: text }],
      max_tokens: 1024,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`reviewer_failed:${res.status}`);
  }
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content?.trim() || "Reviewer returned no text.";
}

export async function POST(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  const body = await request.json() as { text?: unknown };
  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const text = body.text.trim().slice(0, 8000);
  const token = process.env.UB_ROUTER_REVIEWER_TOKEN;
  try {
    if (!token) {
      return NextResponse.json({ ok: true, fixture: true, text: fixtureReview(text) });
    }
    const review = await liveReview(text, token);
    return NextResponse.json({ ok: true, fixture: false, text: review });
  } catch (err) {
    const message = err instanceof Error ? err.message : "reviewer_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
