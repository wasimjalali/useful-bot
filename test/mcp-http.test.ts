import assert from "node:assert/strict";
import test from "node:test";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { listMcpTools, modelToolNames, setMcpFetch } from "../shared/mcp-http.ts";
import { parseWidgetDraft } from "../shared/mcp-apps.ts";

test("tools/list parses SSE, drops app-only names from the model list", async () => {
  setConnectionLookup(async () => "8.8.8.8");
  const calls: string[] = [];
  setMcpFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    calls.push(body.method ?? "");
    if (body.method === "initialize") {
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } })}\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response(`event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: [
          { name: "read_me", description: "docs", _meta: { ui: { visibility: ["model", "app"] } } },
          { name: "create_view", description: "draw", _meta: { ui: { resourceUri: "ui://excalidraw/mcp-app.html" } } },
          { name: "save_checkpoint", description: "app", _meta: { ui: { visibility: ["app"] } } },
        ],
      },
    })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  });
  try {
    const tools = await listMcpTools("https://mcp.excalidraw.com/mcp");
    assert.deepEqual(calls, ["initialize", "tools/list"]);
    assert.equal(tools.length, 3);
    assert.equal(tools[1].resourceUri, "ui://excalidraw/mcp-app.html");
    assert.deepEqual(modelToolNames(tools), ["read_me", "create_view"]);
  } finally {
    setMcpFetch(null);
    setConnectionLookup(null);
  }
});

test("a private MCP URL is refused before fetch", async () => {
  let fetched = false;
  setMcpFetch(async () => {
    fetched = true;
    return new Response("{}");
  });
  try {
    await assert.rejects(() => listMcpTools("http://192.168.0.5/mcp"), /url_http/);
    assert.equal(fetched, false);
  } finally {
    setMcpFetch(null);
  }
});
