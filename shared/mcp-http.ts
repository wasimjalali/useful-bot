import { assertConnectionUrl, assertResolvedPublic } from "./connection-url.ts";

/**
 * Tiny Streamable HTTP JSON-RPC client for listing tools and reading UI
 * resources. Tool execution stays in eve. Tests inject fetch.
 */

export type McpToolInfo = {
  name: string;
  description: string;
  visibility: Array<"model" | "app">;
  /** The server listed "app" itself. A tool with no visibility is not one. */
  appCallable: boolean;
  resourceUri: string | null;
};

export type McpResource = {
  uri: string;
  mimeType: string;
  text: string;
  csp: {
    connectDomains: string[];
    resourceDomains: string[];
    frameDomains: string[];
    baseUriDomains: string[];
  } | null;
};

type FetchFn = typeof fetch;

let injectedFetch: FetchFn | null = null;

export function setMcpFetch(next: FetchFn | null): void {
  injectedFetch = next;
}

function activeFetch(): FetchFn {
  return injectedFetch ?? fetch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseSseData(body: string): unknown {
  const lines = body.split(/\r?\n/);
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("mcp_parse");
    }
  }
  return JSON.parse(data.join("\n"));
}

async function rpc(
  url: string,
  method: string,
  params: Record<string, unknown> | undefined,
  headers: Record<string, string>,
  id: number,
): Promise<{ result: unknown; sessionId: string | null }> {
  const target = await assertResolvedPublic(url);
  const res = await activeFetch()(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!res.ok) throw new Error(`mcp_http_${res.status}`);
  const sessionId = res.headers.get("mcp-session-id");
  const body = await res.text();
  const parsed = parseSseData(body);
  const rec = asRecord(parsed);
  if (!rec) throw new Error("mcp_parse");
  if (rec.error) {
    const err = asRecord(rec.error);
    throw new Error(typeof err?.message === "string" ? err.message.slice(0, 200) : "mcp_error");
  }
  return { result: rec.result, sessionId };
}

function toolVisibility(meta: unknown): Array<"model" | "app"> {
  const rec = asRecord(meta);
  const ui = asRecord(rec?.ui);
  const raw = ui?.visibility;
  if (!Array.isArray(raw) || raw.length === 0) return ["model", "app"];
  const out: Array<"model" | "app"> = [];
  for (const item of raw) {
    if (item === "model" || item === "app") out.push(item);
  }
  return out.length ? out : ["model", "app"];
}

function toolAppCallable(meta: unknown): boolean {
  const raw = asRecord(asRecord(meta)?.ui)?.visibility;
  return Array.isArray(raw) && raw.includes("app");
}

function toolResourceUri(meta: unknown): string | null {
  const rec = asRecord(meta);
  const ui = asRecord(rec?.ui);
  if (typeof ui?.resourceUri === "string" && ui.resourceUri.startsWith("ui://")) return ui.resourceUri;
  if (typeof rec?.["ui/resourceUri"] === "string" && rec["ui/resourceUri"].startsWith("ui://")) {
    return rec["ui/resourceUri"];
  }
  return null;
}

export async function listMcpTools(
  url: string,
  headers: Record<string, string> = {},
): Promise<McpToolInfo[]> {
  const init = await rpc(url, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "useful-bot", version: "0.0.0" },
  }, headers, 1);
  const sessionHeaders = init.sessionId
    ? { ...headers, "mcp-session-id": init.sessionId }
    : headers;
  const listed = await rpc(url, "tools/list", {}, sessionHeaders, 2);
  const rec = asRecord(listed.result);
  const tools = Array.isArray(rec?.tools) ? rec.tools : [];
  const out: McpToolInfo[] = [];
  for (const item of tools) {
    const row = asRecord(item);
    if (!row || typeof row.name !== "string") continue;
    out.push({
      name: row.name.slice(0, 80),
      description: typeof row.description === "string" ? row.description.slice(0, 400) : "",
      visibility: toolVisibility(row._meta),
      appCallable: toolAppCallable(row._meta),
      resourceUri: toolResourceUri(row._meta),
    });
    if (out.length >= 200) break;
  }
  return out;
}

export function modelToolNames(tools: McpToolInfo[]): string[] {
  return tools.filter((tool) => tool.visibility.includes("model")).map((tool) => tool.name);
}

export async function readMcpResource(
  url: string,
  uri: string,
  headers: Record<string, string> = {},
): Promise<McpResource> {
  if (!uri.startsWith("ui://") && !uri.startsWith("https://")) throw new Error("mcp_resource_uri");
  const init = await rpc(url, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "useful-bot", version: "0.0.0" },
  }, headers, 1);
  const sessionHeaders = init.sessionId
    ? { ...headers, "mcp-session-id": init.sessionId }
    : headers;
  const read = await rpc(url, "resources/read", { uri }, sessionHeaders, 3);
  const rec = asRecord(read.result);
  const contents = Array.isArray(rec?.contents) ? rec.contents : [];
  const first = asRecord(contents[0]);
  if (!first) throw new Error("mcp_resource");
  const text = typeof first.text === "string"
    ? first.text
    : typeof first.blob === "string"
      ? Buffer.from(first.blob, "base64").toString("utf8")
      : "";
  if (!text) throw new Error("mcp_resource");
  const meta = asRecord(first._meta);
  const ui = asRecord(meta?.ui);
  const csp = asRecord(ui?.csp);
  return {
    uri: typeof first.uri === "string" ? first.uri : uri,
    mimeType: typeof first.mimeType === "string" ? first.mimeType : "text/html",
    text,
    csp: csp ? {
      connectDomains: Array.isArray(csp.connectDomains) ? csp.connectDomains.filter((d): d is string => typeof d === "string") : [],
      resourceDomains: Array.isArray(csp.resourceDomains) ? csp.resourceDomains.filter((d): d is string => typeof d === "string") : [],
      frameDomains: Array.isArray(csp.frameDomains) ? csp.frameDomains.filter((d): d is string => typeof d === "string") : [],
      baseUriDomains: Array.isArray(csp.baseUriDomains) ? csp.baseUriDomains.filter((d): d is string => typeof d === "string") : [],
    } : null,
  };
}

const TOOL_RESULT_MAX = 256 * 1024;

/**
 * Run one tool for an MCP App's own frame (the app's `tools/call`). The
 * caller decides which tools the app may reach; this only runs and bounds it.
 */
export async function callMcpTool(
  url: string,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const init = await rpc(url, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "useful-bot", version: "0.0.0" },
  }, headers, 1);
  const sessionHeaders = init.sessionId
    ? { ...headers, "mcp-session-id": init.sessionId }
    : headers;
  const called = await rpc(url, "tools/call", { name, arguments: args }, sessionHeaders, 4);
  const rec = asRecord(called.result);
  if (!rec) throw new Error("mcp_tool_result");
  if (JSON.stringify(rec).length > TOOL_RESULT_MAX) throw new Error("mcp_tool_result_too_large");
  return rec;
}

export async function countOpenApiOperations(specUrl: string): Promise<number | null> {
  const target = await assertResolvedPublic(specUrl);
  try {
    const res = await activeFetch()(target, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = await res.text();
    if (body.length > 1_000_000) return null;
    const json = JSON.parse(body) as { paths?: Record<string, Record<string, unknown>> };
    const paths = json.paths ?? {};
    let n = 0;
    for (const path of Object.values(paths)) {
      if (!path || typeof path !== "object") continue;
      for (const method of Object.keys(path)) {
        if (["get", "post", "put", "patch", "delete", "head", "options"].includes(method.toLowerCase())) n++;
      }
    }
    return n;
  } catch {
    return null;
  }
}
