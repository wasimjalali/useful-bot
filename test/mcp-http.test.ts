import assert from "node:assert/strict";
import test from "node:test";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { callMcpTool, listMcpTools, modelToolNames, setMcpFetch } from "../shared/mcp-http.ts";
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
    // Only a tool the server itself marked for the app is callable from it.
    assert.deepEqual(tools.map((tool) => tool.appCallable), [true, false, true]);
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

test("tools/call runs one tool and hands back its result", async () => {
  setConnectionLookup(async () => "8.8.8.8");
  const sent: Array<{ method?: string; params?: unknown }> = [];
  setMcpFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: unknown };
    sent.push(body);
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        headers: { "content-type": "application/json", "mcp-session-id": "s1" },
      });
    }
    return new Response(`data: ${JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      result: { content: [{ type: "text", text: "https://excalidraw.com/#json=a,b" }] },
    })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  });
  try {
    const result = await callMcpTool("https://mcp.excalidraw.com/mcp", "export_to_excalidraw", { json: "{}" });
    assert.deepEqual(sent[1], {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "export_to_excalidraw", arguments: { json: "{}" } },
    });
    assert.deepEqual(result, { content: [{ type: "text", text: "https://excalidraw.com/#json=a,b" }] });
  } finally {
    setMcpFetch(null);
    setConnectionLookup(null);
  }
});
