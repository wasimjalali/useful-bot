import assert from "node:assert/strict";
import test from "node:test";
import { parseWidgetDraft, widgetPayloadTooLarge, WIDGET_JSON_MAX } from "../shared/mcp-apps.ts";
import { renderWidgetHost } from "../shared/mcp-app-host.ts";
import type { WidgetRecord } from "../shared/widgets-store.ts";

test("create_view input becomes a widget draft", () => {
  const draft = parseWidgetDraft({
    toolName: "excalidraw__create_view",
    arguments: { elements: "[{\"type\":\"rectangle\",\"id\":\"r1\"}]" },
  });
  assert.equal(draft?.connectionId, "excalidraw");
  assert.equal(draft?.resourceUri, "ui://excalidraw/mcp-app.html");
  assert.equal(typeof draft?.arguments.elements, "string");
  assert.equal(parseWidgetDraft({ toolName: "bash", arguments: { command: "ls" } }), null);
});

test("the host page does not break out of the JSON script", () => {
  const record: WidgetRecord = {
    id: "callid1234",
    connectionId: "excalidraw",
    toolName: "excalidraw__create_view",
    resourceUri: "ui://excalidraw/mcp-app.html",
    arguments: { elements: "</script><script>alert(1)</script>" },
    result: null,
    createdAt: new Date().toISOString(),
  };
  const html = renderWidgetHost(record, "<html><body>app</body></html>", ["https://esm.sh"]);
  assert.equal(html.includes("</script><script>alert"), false);
  assert.equal(html.includes("\\u003c/script>"), true);
  assert.equal(html.includes("ui/notifications/tool-input"), true);
  assert.equal(html.includes("https://esm.sh"), true);
  assert.equal(html.includes('method.startsWith("ui/")'), false);
});

test("the host page pins esm.sh even when the app lists no CSP domains", () => {
  const record: WidgetRecord = {
    id: "callid5678",
    connectionId: "excalidraw",
    toolName: "excalidraw__create_view",
    resourceUri: "ui://excalidraw/mcp-app.html",
    arguments: {},
    result: null,
    createdAt: new Date().toISOString(),
  };
  const html = renderWidgetHost(record, "<html><body>app</body></html>", []);
  assert.equal(html.includes("https://esm.sh"), true);
  assert.equal(widgetPayloadTooLarge({ elements: "x" }, null), false);
  assert.equal(widgetPayloadTooLarge({ elements: "x".repeat(WIDGET_JSON_MAX + 1) }, null), true);
});
