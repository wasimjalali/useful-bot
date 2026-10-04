import { assertConnectionUrl, assertResolvedPublic } from "./connection-url.ts";
import { measureOpenApiSpecText, type SpecSize } from "./tool-wire-size.ts";
import { mountedSchemaBytes } from "./json-schema-zod.ts";

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
  /**
   * The server's own JSON Schema for the tool's arguments, or null when it
   * sent none or one too big to keep. A tool mounted on demand is presented
   * to the model from this, so a listing that dropped it left the model
   * guessing at argument names.
   */
  inputSchema: Record<string, unknown> | null;
  /**
   * What this tool's arguments weigh when this app mounts it: zod's emission
   * of the schema it kept, which is what goes on the wire.
   */
  inputSchemaBytes: number;
};

/**
 * How much of one tool's argument schema is worth keeping. A server is free
 * to send a schema of any size and the index holds one per tool; past this
 * the wrapper falls back to a passthrough object and puts the shape in its
 * description instead.
 */
export const MAX_TOOL_INPUT_SCHEMA_BYTES = 4 * 1024;

function toolInputSchema(raw: unknown): Record<string, unknown> | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(rec), "utf8");
  } catch {
    return null;
  }
  if (bytes <= MAX_TOOL_INPUT_SCHEMA_BYTES) return rec;
  // Too big to keep whole. Dropping it outright left the model a tool with
  // no argument contract at all: it guessed, the server refused, and the
  // step was spent. What is kept is the shape without the prose: property
  // names, their types and which are required.
  return trimSchema(rec);
}

function trimSchema(rec: Record<string, unknown>): Record<string, unknown> | null {
  const properties = asRecord(rec.properties);
  if (!properties) return null;
  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const field = asRecord(value);
    const type = field?.type;
    trimmed[key] = typeof type === "string" || Array.isArray(type) ? { type } : {};
    // Room for the object and `required` that wrap this map.
    if (Buffer.byteLength(JSON.stringify(trimmed), "utf8") > MAX_TOOL_INPUT_SCHEMA_BYTES - 512) {
      delete trimmed[key];
      break;
    }
  }
  if (Object.keys(trimmed).length === 0) return null;
  const required = Array.isArray(rec.required)
    ? rec.required.filter((item): item is string => typeof item === "string" && item in trimmed)
    : [];
  return { type: "object", properties: trimmed, ...(required.length ? { required } : {}) };
}

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

/**
 * How much of a response this side will take. `res.text()` reads whatever
 * arrives before anything can look at it, so a server that answers with a
 * gigabyte takes the app down before the size check it was heading for. The
 * limit is enforced while reading, not after.
 */
const MAX_RPC_BODY_BYTES = 4 * 1024 * 1024;
const MAX_SPEC_BODY_BYTES = 1024 * 1024;

async function boundedText(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    const whole = await res.text();
    if (Buffer.byteLength(whole, "utf8") > max) throw new Error("mcp_body_too_large");
    return whole;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > max) throw new Error("mcp_body_too_large");
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* already done */ }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Why a call failed, in the four kinds the rest of the app acts on.
 * `auth`: the server wants a credential or refused this one (401, 403).
 * `unreachable`: nothing usable answered (network, DNS, timeout, 5xx).
 * `protocol`: it answered, but not as an MCP server of a version we speak.
 * `parse`: what came back was not JSON-RPC at all.
 * `message` never carries a header or a token; the 401's `scope` and
 * `resource_metadata` hints are kept apart for the OAuth side to use.
 */
export type McpErrorKind = "auth" | "unreachable" | "protocol" | "parse";

export class McpError extends Error {
  readonly kind: McpErrorKind;
  readonly status: number | null;
  readonly scope: string | null;
  readonly resourceMetadata: string | null;

  constructor(
    kind: McpErrorKind,
    message: string,
    extra: { status?: number; scope?: string | null; resourceMetadata?: string | null } = {},
  ) {
    super(message);
    this.name = "McpError";
    this.kind = kind;
    this.status = extra.status ?? null;
    this.scope = extra.scope ?? null;
    this.resourceMetadata = extra.resourceMetadata ?? null;
  }
}

/** The versions this client speaks, newest first. */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"] as const;
const MCP_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[0];
const MAX_LIST_PAGES = 20;
const MAX_LISTED_TOOLS = 200;

function wwwAuthenticateParam(header: string, name: string): string | null {
  const quoted = new RegExp(`${name}="([^"]*)"`, "i").exec(header)?.[1];
  if (quoted) return quoted;
  return new RegExp(`${name}=([^\\s,"]+)`, "i").exec(header)?.[1] ?? null;
}

/**
 * The JSON-RPC messages in a response body. A JSON body is one message (or a
 * batch); an event stream is one per event, events split on a blank line and
 * the lines of one event's `data:` joined with a newline, as SSE defines it.
 * An event that does not parse is skipped rather than fatal: a server may
 * stream a comment or a ping ahead of its answer.
 */
function rpcMessages(body: string, contentType: string): { messages: unknown[]; unparsed: number } {
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    try {
      const parsed = JSON.parse(body) as unknown;
      return { messages: Array.isArray(parsed) ? parsed : [parsed], unparsed: 0 };
    } catch {
      // Some servers stream without saying so; fall through to the stream parse.
    }
  }
  const messages: unknown[] = [];
  let unparsed = 0;
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data: string[] = [];
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const value = line.slice(5);
      data.push(value.startsWith(" ") ? value.slice(1) : value);
    }
    if (data.length === 0) continue;
    try {
      messages.push(JSON.parse(data.join("\n")));
    } catch {
      unparsed += 1;
    }
  }
  return { messages, unparsed };
}

type Session = {
  url: string;
  /** The caller's credentials, plus the session and version once negotiated. */
  headers: Record<string, string>;
  /** The caller's credentials alone: what a fresh handshake starts from. */
  base: Record<string, string>;
};

async function post(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  const target = await assertResolvedPublic(url);
  let res: Response;
  try {
    res = await activeFetch()(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(payload),
      // Never follow one. `assertResolvedPublic` pinned this host, and a
      // redirect takes the request, its credential header and the SSRF check
      // somewhere it never looked. Only `authorization` is stripped on a
      // cross-origin hop; an `X-Api-Key` would go with it.
      redirect: "error",
      signal,
    });
  } catch (err) {
    // Network, DNS, TLS, the deadline. Kept readable: `aborted` is the
    // caller's own deadline firing.
    throw new McpError("unreachable", err instanceof Error ? err.message.slice(0, 200) : "mcp_unreachable");
  }
  if (!res.ok) {
    try { await res.body?.cancel(); } catch { /* already done */ }
    if (res.status === 401 || res.status === 403) {
      const www = res.headers.get("www-authenticate") ?? "";
      throw new McpError("auth", `mcp_http_${res.status}`, {
        status: res.status,
        scope: wwwAuthenticateParam(www, "scope"),
        resourceMetadata: wwwAuthenticateParam(www, "resource_metadata"),
      });
    }
    throw new McpError(res.status >= 500 || res.status === 429 ? "unreachable" : "protocol", `mcp_http_${res.status}`, {
      status: res.status,
    });
  }
  return res;
}

/** The message carrying this request's id, whether it answers or fails. */
function answerTo(messages: unknown[], id: number): Record<string, unknown> | null {
  return messages
    .map(asRecord)
    .find((rec): rec is Record<string, unknown> => Boolean(rec && rec.id === id && ("result" in rec || "error" in rec)))
    ?? null;
}

/**
 * Read a response until it holds this request's answer. An event stream is
 * parsed as it arrives and dropped the moment the answer is in: a server may
 * keep the stream open, or trail heartbeats, long after it has said what was
 * asked, and waiting for the end turned a finished call into a timeout.
 */
async function readAnswer(
  res: Response,
  id: number,
): Promise<{ answer: Record<string, unknown> | null; seen: number; unparsed: number }> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.body || !contentType.toLowerCase().includes("text/event-stream")) {
    const { messages, unparsed } = rpcMessages(await boundedText(res, MAX_RPC_BODY_BYTES), contentType);
    return { answer: answerTo(messages, id), seen: messages.length, unparsed };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  let seen = 0;
  let unparsed = 0;
  const take = (events: string[]): Record<string, unknown> | null => {
    for (const event of events) {
      const parsed = rpcMessages(event, contentType);
      seen += parsed.messages.length;
      unparsed += parsed.unparsed;
      const hit = answerTo(parsed.messages, id);
      if (hit) return hit;
    }
    return null;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RPC_BODY_BYTES) throw new Error("mcp_body_too_large");
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      const hit = take(events);
      if (hit) return { answer: hit, seen, unparsed };
    }
    buffer += decoder.decode();
    return { answer: take([buffer]), seen, unparsed };
  } finally {
    try { await reader.cancel(); } catch { /* already done */ }
  }
}

async function rpcOnce(
  session: Session,
  method: string,
  params: Record<string, unknown> | undefined,
  id: number,
  signal?: AbortSignal,
): Promise<{ result: unknown; sessionId: string | null }> {
  const res = await post(session.url, { jsonrpc: "2.0", id, method, params }, session.headers, signal);
  const sessionId = res.headers.get("mcp-session-id");
  let read: Awaited<ReturnType<typeof readAnswer>>;
  try {
    read = await readAnswer(res, id);
  } catch (err) {
    if (err instanceof Error && err.message === "mcp_body_too_large") throw new McpError("protocol", err.message);
    throw new McpError("unreachable", err instanceof Error ? err.message.slice(0, 200) : "mcp_unreachable");
  }
  // The answer is the message carrying this request's id. Anything else in
  // the stream is the server talking to us (a notification, a ping) and is
  // not what was asked.
  const { answer } = read;
  if (!answer) {
    if (read.seen === 0 || read.unparsed > 0) throw new McpError("parse", "mcp_parse");
    throw new McpError("protocol", "mcp_no_response");
  }
  if (answer.error) {
    const err = asRecord(answer.error);
    throw new McpError("protocol", typeof err?.message === "string" ? err.message.slice(0, 200) : "mcp_error");
  }
  return { result: answer.result, sessionId };
}

/**
 * One request. A 404 on a request that carried a session id means the server
 * has forgotten the session; the transport spec has the client start a new one
 * with a fresh `initialize` (no old id) and send the request again. Once, and
 * inside the caller's own deadline: a server that keeps forgetting is failing.
 */
async function rpc(
  session: Session,
  method: string,
  params: Record<string, unknown> | undefined,
  id: number,
  signal?: AbortSignal,
): Promise<{ result: unknown; sessionId: string | null }> {
  try {
    return await rpcOnce(session, method, params, id, signal);
  } catch (err) {
    if (!(err instanceof McpError) || err.status !== 404 || !session.headers["mcp-session-id"]) throw err;
    session.headers = (await openSession(session.url, session.base, signal)).headers;
    return rpcOnce(session, method, params, id, signal);
  }
}

/**
 * `initialize`, then `notifications/initialized`, which the lifecycle
 * requires before any other request. From here every request carries the
 * negotiated `MCP-Protocol-Version` and the server's session id.
 */
async function openSession(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<Session> {
  const init = await rpc({ url, headers, base: headers }, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "useful-bot", version: "0.0.0" },
  }, 1, signal);
  const result = asRecord(init.result);
  // A server that names no version is taken at the one that was asked for.
  const negotiated = typeof result?.protocolVersion === "string" ? result.protocolVersion : MCP_PROTOCOL_VERSION;
  if (!(MCP_PROTOCOL_VERSIONS as readonly string[]).includes(negotiated)) {
    throw new McpError("protocol", "mcp_unsupported_version");
  }
  const session: Session = {
    url,
    base: headers,
    headers: {
      ...headers,
      "mcp-protocol-version": negotiated,
      ...(init.sessionId ? { "mcp-session-id": init.sessionId } : {}),
    },
  };
  // A server that refuses the transition has not accepted the session, so the
  // refusal is the answer; a 200, 202 or 204 all pass `post`.
  const res = await post(url, { jsonrpc: "2.0", method: "notifications/initialized" }, session.headers, signal);
  try { await res.body?.cancel(); } catch { /* nothing to read */ }
  return session;
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

/**
 * How long a listing or a resource read may take, end to end. Both make two
 * round trips, so the deadline is shared across them rather than restarted
 * per call: a server that answers `initialize` and then stops still ends.
 * Without it an unresponsive server held the connect card, the widget host
 * and the turn that asked open for as long as the socket stayed up.
 */
export const MCP_READ_TIMEOUT_MS = 15_000;

const EMPTY_OBJECT_SCHEMA = { type: "object" };

export type McpListing = {
  tools: McpToolInfo[];
  /** Entries the server sent, across every page read. */
  total: number;
  /** Entries dropped as invalid: not an object, no name, a name too long or an input schema that is not an object schema. */
  dropped: number;
};

export async function listMcpToolsWithStats(
  url: string,
  headers: Record<string, string> = {},
  signal: AbortSignal = AbortSignal.timeout(MCP_READ_TIMEOUT_MS),
): Promise<McpListing> {
  const session = await openSession(url, headers, signal);
  const out: McpToolInfo[] = [];
  let total = 0;
  let dropped = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES && out.length < MAX_LISTED_TOOLS; page += 1) {
    const listed = await rpc(session, "tools/list", cursor ? { cursor } : {}, 2 + page, signal);
    const rec = asRecord(listed.result);
    // Not a listing at all, which is not the same as a listing of nothing.
    if (!rec || !Array.isArray(rec.tools)) throw new McpError("protocol", "mcp_tools_shape");
    for (const item of rec.tools) {
      total += 1;
      const row = asRecord(item);
      // Skipped rather than clipped: a clipped name is one the server never
      // published, and calling it fails at the server instead of here.
      if (!row || typeof row.name !== "string" || row.name.length > 80) {
        dropped += 1;
        continue;
      }
      // A schema that is present has to be an object schema. A server that
      // sends none at all is taken leniently, as a tool with no arguments
      // declared; one that sends a number or `{"type":"string"}` is broken.
      const schema = row.inputSchema === undefined ? EMPTY_OBJECT_SCHEMA : asRecord(row.inputSchema);
      if (!schema || (schema.type !== undefined && schema.type !== "object")) {
        dropped += 1;
        continue;
      }
      const inputSchema = toolInputSchema(schema);
      out.push({
        name: row.name,
        description: typeof row.description === "string" ? row.description.slice(0, 400) : "",
        visibility: toolVisibility(row._meta),
        appCallable: toolAppCallable(row._meta),
        resourceUri: toolResourceUri(row._meta),
        inputSchema,
        inputSchemaBytes: mountedSchemaBytes(inputSchema),
      });
      if (out.length >= MAX_LISTED_TOOLS) break;
    }
    cursor = typeof rec?.nextCursor === "string" && rec.nextCursor ? rec.nextCursor : undefined;
    if (!cursor) break;
  }
  return { tools: out, total, dropped };
}

export async function listMcpTools(
  url: string,
  headers: Record<string, string> = {},
  signal: AbortSignal = AbortSignal.timeout(MCP_READ_TIMEOUT_MS),
): Promise<McpToolInfo[]> {
  return (await listMcpToolsWithStats(url, headers, signal)).tools;
}

export function modelToolNames(tools: McpToolInfo[]): string[] {
  return tools.filter((tool) => tool.visibility.includes("model")).map((tool) => tool.name);
}

export async function readMcpResource(
  url: string,
  uri: string,
  headers: Record<string, string> = {},
  signal: AbortSignal = AbortSignal.timeout(MCP_READ_TIMEOUT_MS),
): Promise<McpResource> {
  if (!uri.startsWith("ui://") && !uri.startsWith("https://")) throw new Error("mcp_resource_uri");
  const session = await openSession(url, headers, signal);
  const read = await rpc(session, "resources/read", { uri }, 3, signal);
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
export const TOOL_CALL_TIMEOUT_MS = 25_000;

/**
 * Run one tool for an MCP App's own frame (the app's `tools/call`). The
 * caller decides which tools the app may reach; this only runs and bounds it.
 */
export async function callMcpTool(
  url: string,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
  // A server that never answers must not hold the request (and the app's
  // spinner) open. A caller with more steps passes one shared deadline.
  signal: AbortSignal = AbortSignal.timeout(TOOL_CALL_TIMEOUT_MS),
): Promise<Record<string, unknown>> {
  const session = await openSession(url, headers, signal);
  const called = await rpc(session, "tools/call", { name, arguments: args }, 4, signal);
  const rec = asRecord(called.result);
  if (!rec) throw new Error("mcp_tool_result");
  if (JSON.stringify(rec).length > TOOL_RESULT_MAX) throw new Error("mcp_tool_result_too_large");
  return rec;
}

/**
 * How big an OpenAPI connection is: its operation count and the argument
 * schema bytes eve will build from it, resolved the way eve resolves them.
 * Null when the spec could not be read or is not one.
 */
export async function measureOpenApiConnection(
  specUrl: string,
  headers: Record<string, string> = {},
): Promise<SpecSize | null> {
  const target = await assertResolvedPublic(specUrl);
  try {
    const res = await activeFetch()(target, {
      headers: { accept: "application/json", ...headers },
      // Same reason as the JSON-RPC call above.
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    // Bounded while reading: the old check ran after the whole thing was
    // already in memory, which is the part that hurts.
    const body = await boundedText(res, MAX_SPEC_BODY_BYTES);
    return measureOpenApiSpecText(body);
  } catch {
    return null;
  }
}


