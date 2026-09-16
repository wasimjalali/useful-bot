import { defineTool } from "eve/tools";
import { z } from "zod";
import { wrapUntrusted } from "../../shared/untrusted.ts";

export default defineTool({
  description: "Search the public web via the local router. No search key is held here.",
  inputSchema: z.object({
    query: z.string().min(1).max(512),
    count: z.number().int().min(1).max(5).optional(),
  }),
  async execute(input) {
    const token = process.env.UB_ROUTER_DESKTOP_TOKEN;
    if (!token) {
      throw new Error("router token missing");
    }
    const res = await fetch("http://127.0.0.1:4319/v1/search", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: input.query, count: input.count ?? 5 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`search_failed:${res.status}`);
    }
    // Titles, urls and snippets are outside text: serialise the payload and
    // mark it untrusted, the way connector_search does for app text.
    const json = await res.json();
    return wrapUntrusted("web search", JSON.stringify(json));
  },
});
