import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Ask the pinned reviewer to find defects in supplied text. Read-only. Not available to phone.",
  inputSchema: z.object({
    text: z.string().min(1).max(8000),
  }),
  async execute(input) {
    const token = process.env.UB_ROUTER_REVIEWER_TOKEN;
    if (!token) {
      return { text: "reviewer-offline", fixture: true };
    }
    const res = await fetch(process.env.UB_ROUTER_BASE_URL ?? "http://127.0.0.1:4319/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
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
