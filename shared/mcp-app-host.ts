import { findConnectionById } from "./connections-store.ts";
import { readMcpResource } from "./mcp-http.ts";
import type { WidgetRecord } from "./widgets-store.ts";

function jsonScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const ESM = "https://esm.sh";
const CSP_ORIGIN = /^https:\/\/[a-z0-9.-]+$/i;
const MAX_CSP_DOMAINS = 8;

function cspExtra(domains: string[]): string {
  const extra = domains
    .filter((d) => CSP_ORIGIN.test(d) && d.toLowerCase() !== ESM)
    .slice(0, MAX_CSP_DOMAINS);
  return [ESM, ...extra].join(" ");
}

function cspFor(domains: string[]): string {
  const extra = cspExtra(domains);
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${extra}`,
    `style-src 'unsafe-inline' ${extra}`,
    `img-src data: blob: ${extra}`,
    `font-src data: ${extra}`,
    `connect-src ${extra}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join("; ");
}

/**
 * Host page for an MCP App. The widget HTML is srcdoc'd into a sandboxed
 * iframe. The page answers ui/initialize and pushes the stored tool input.
 *
 * A srcdoc frame inherits this page's policy on top of its own, so the host
 * carries the same allowlist as the app. With a stricter host policy every
 * script the app loads is blocked and the card stays blank. The host itself
 * loads nothing: its one script is inline.
 */
function withCsp(html: string, domains: string[]): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspFor(domains)}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${meta}`);
  return `${meta}${html}`;
}

export function renderWidgetHost(record: WidgetRecord, appHtml: string, cspDomains: string[]): string {
  const payload = jsonScript({
    id: record.id,
    toolName: record.toolName,
    arguments: record.arguments,
    result: record.result,
  });
  const framed = withCsp(appHtml, cspDomains);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${cspFor(cspDomains)}">
<style>
  html, body { margin: 0; background: #fff; overflow: hidden; }
  iframe { display: block; width: 100%; height: 480px; border: 0; background: #fff; }
</style>
</head>
<body>
<iframe id="app" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
<script>
const payload = ${payload};
const iframe = document.getElementById("app");
iframe.srcdoc = ${jsonScript(framed)};
function send(msg) {
  iframe.contentWindow && iframe.contentWindow.postMessage(msg, "*");
}
window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  const data = event.data;
  if (!data || data.jsonrpc !== "2.0") return;
  if (data.method === "ui/initialize") {
    send({
      jsonrpc: "2.0",
      id: data.id,
      result: {
        protocolVersion: "2026-01-26",
        hostCapabilities: {},
        hostInfo: { name: "useful-bot", version: "0.0.0" },
        hostContext: {
          theme: "light",
          displayMode: "inline",
          platform: "desktop",
          containerDimensions: { width: 720, height: 480 },
          toolInfo: { tool: { name: payload.toolName, inputSchema: { type: "object" } } }
        }
      }
    });
    return;
  }
  if (data.method === "ui/notifications/initialized") {
    send({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: payload.arguments || {} } });
    if (payload.result) {
      send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: payload.result });
    }
    return;
  }
  if (data.method === "ui/notifications/size-changed" && data.params && data.params.height) {
    const h = Math.max(240, Math.min(720, Number(data.params.height) || 480));
    iframe.style.height = h + "px";
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ubSize) {
      window.webkit.messageHandlers.ubSize.postMessage({ height: h });
    }
  }
});
</script>
</body>
</html>`;
}

export async function htmlForWidget(record: WidgetRecord): Promise<{ html: string; mimeType: string }> {
  const entry = findConnectionById(record.connectionId);
  const resourceUri = record.resourceUri ?? "ui://excalidraw/mcp-app.html";
  if (!entry || entry.kind !== "mcp") {
    return { html: renderWidgetHost(record, emptyCanvas(record), []), mimeType: "text/html; charset=utf-8" };
  }
  try {
    const resource = await readMcpResource(entry.url, resourceUri);
    const domains = [
      ...(resource.csp?.resourceDomains ?? []),
      ...(resource.csp?.connectDomains ?? []),
    ];
    return {
      html: renderWidgetHost(record, resource.text, domains),
      mimeType: "text/html; charset=utf-8",
    };
  } catch {
    return { html: renderWidgetHost(record, emptyCanvas(record), []), mimeType: "text/html; charset=utf-8" };
  }
}

function emptyCanvas(_record: WidgetRecord): string {
  return `<!doctype html><html><body style="margin:0;font:13px/1.4 sans-serif;color:#171717;padding:16px">Drawing</body></html>`;
}
