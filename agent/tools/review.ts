import { randomUUID } from "node:crypto";
import { defineTool } from "eve/tools";
import { z } from "zod";

// One session and turn per process; the request id is fresh per call. The
// router refuses /v1/chat/completions without these UUIDs (see agent/agent.ts).
const REVIEWER_SESSION_ID = randomUUID();
const REVIEWER_TURN_ID = randomUUID();

export default defineTool({
  description: "Ask the pinned reviewer to find defects in supplied text. Read-only. Not available to phone.",
  inputSchema: z.object({
    text: z.string().min(1).max(8000),
  }),
  async execute(input) {
    const token = process.env.UB_ROUTER_REVIEWER_TOKEN;
    if (!token) {
      // The S2 probe relies on the fixture; otherwise the model must never be
      // handed placeholder text shaped as a real answer.
      if (process.env.UB_S2_FIXTURE === "1") {
        return { text: "reviewer-offline", fixture: true };
      }
      return {
        status: "unavailable",
        error: "reviewer_unconfigured",
        hint: "The reviewer credential is not provisioned on this Mac.",
      };
    }
    const res = await fetch(process.env.UB_ROUTER_BASE_URL ?? "http://127.0.0.1:4319/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-useful-session-id": REVIEWER_SESSION_ID,
        "x-useful-turn-id": REVIEWER_TURN_ID,
        "x-useful-request-id": randomUUID(),
      },
      body: JSON.stringify({
        model: "reviewer",
        messages: [{ role: "user", content: input.text }],
        max_tokens: 1024,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`reviewer_failed:${res.status}`);
    }
    const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    return { text, fixture: false };
  },
});
