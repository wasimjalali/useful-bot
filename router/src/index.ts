import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { BODY_LIMIT_BYTES, MAX_MESSAGE_COUNT, MAX_TOOL_SCHEMAS, MAX_TOOL_SCHEMA_BYTES, POLICY_NODE_MAJOR, ROUTER_HOST, ROUTER_PORT } from "../../shared/policy.ts";
import { AuthTable } from "./auth.ts";
import { AliasCircuit } from "./circuit.ts";
import { ConcurrencyGate } from "./concurrency.ts";
import { RouterError, errorBody } from "./errors.ts";
import { LimitStore, estimateInputUnits } from "./limits.ts";
import { entryFor, loadRegistry } from "./registry.ts";
import { search } from "./search.ts";
import { completeUpstream } from "./upstreams/opencode.ts";
import { usageFromPayload, usageFromSseBlock } from "../../shared/usage-parse.ts";

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
if (NODE_MAJOR !== POLICY_NODE_MAJOR) {
  process.stderr.write(`router refuses to start: Node 24 required, got ${process.versions.node}\n`);
  process.exit(2);
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function log(fields: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), component: "router", ...fields })}\n`);
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...extra,
  });
  res.end(payload);
}

const UPSTREAM_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const REQUEST_TOTAL_MS = 180_000;
const FIRST_EVENT_MS = 60_000;
const IDLE_EVENT_MS = 45_000;
const MAX_EVENT_BYTES = 256 * 1024;

const ALLOWED_COMPLETION_KEYS = new Set([
  "model",
  "messages",
  "stream",
  "max_tokens",
  "n",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "stream_options",
]);

const ROUTE_METHODS: Record<string, string[]> = {
  "/health/live": ["GET"],
  "/health/ready": ["GET"],
  "/v1/models": ["GET"],
  "/v1/search": ["POST"],
  "/v1/chat/completions": ["POST"],
  "/v1/usage": ["GET"],
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    let timer: NodeJS.Timeout;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    timer = setTimeout(() => {
      finish(() => reject(new RouterError({
        status: 400,
        type: "invalid_request_error",
        code: "invalid_request",
        message: "body timeout",
      })));
    }, 10_000);
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        finish(() => reject(new RouterError({
          status: 413,
          type: "invalid_request_error",
          code: "body_too_large",
          message: "body_too_large",
        })));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(() => resolve(Buffer.concat(chunks))));
    req.on("error", (error) => finish(() => reject(error)));
  });
}

function parseJsonBody(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString("utf8") || "null");
  } catch {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "invalid_request",
      message: "invalid_request",
    });
  }
}

async function readCapped(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RouterError({
        status: 502,
        type: "upstream_error",
        code: "upstream_protocol_error",
        message: "upstream body too large",
      });
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function waitForDrain(res: ServerResponse, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      res.off("drain", onDrain);
      signal.removeEventListener("abort", onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      if (!res.writableEnded) res.destroy();
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    res.once("drain", onDrain);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function abortKind(signal: AbortSignal): "client" | "idle" | "total" | "other" {
  if (!signal.aborted) return "other";
  const reason = signal.reason;
  if (reason instanceof Error) {
    if (reason.message === "client_disconnect") return "client";
    if (reason.message === "idle_timeout") return "idle";
  }
  if (reason && typeof reason === "object" && (reason as { name?: string }).name === "TimeoutError") {
    return "total";
  }
  return "other";
}

function timeoutError(headersSent: boolean): RouterError {
  return new RouterError({
    status: headersSent ? 502 : 504,
    type: "upstream_error",
    code: "upstream_timeout",
    message: "upstream_timeout",
    retryable: false,
  });
}

function assertHost(req: IncomingMessage, port: number): void {
  const host = req.headers.host ?? "";
  const allowed = new Set([
    `${ROUTER_HOST}:${port}`,
    ROUTER_HOST,
  ]);
  if (!allowed.has(host)) {
    throw new RouterError({
      status: 403,
      type: "permission_error",
      code: "origin_forbidden",
      message: "origin_forbidden",
    });
  }
  if (req.headers.origin) {
    throw new RouterError({
      status: 403,
      type: "permission_error",
      code: "origin_forbidden",
      message: "origin_forbidden",
    });
  }
}

function headerUuid(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "invalid_request",
      message: `invalid ${name}`,
    });
  }
  return value;
}

/**
 * `reason` names the check that refused, in the log only. The wire code stays
 * the coarse one the spec defines, but a rejection nobody can diagnose is how
 * a dead chat turns into "the turn failed" with no way to find out why.
 */
function validationError(code: string, reason?: string): RouterError {
  log({ event: "rejected", code, reason: reason ?? code });
  return new RouterError({
    status: 400,
    type: "invalid_request_error",
    code,
    message: code,
  });
}

const ALLOWED_MESSAGE_ROLES = new Set(["system", "user", "assistant", "tool"]);

function validateTools(tools: unknown): void {
  if (tools === undefined) return;
  if (!Array.isArray(tools)) throw validationError("unsupported_parameter", "tools_not_array");
  if (tools.length > MAX_TOOL_SCHEMAS) {
    throw validationError("unsupported_parameter", `tools_count:${tools.length}>${MAX_TOOL_SCHEMAS}`);
  }
  const toolBytes = Buffer.byteLength(JSON.stringify(tools), "utf8");
  if (toolBytes > MAX_TOOL_SCHEMA_BYTES) {
    throw validationError("unsupported_parameter", `tools_bytes:${toolBytes}>${MAX_TOOL_SCHEMA_BYTES}`);
  }
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") throw validationError("unsupported_parameter", "tool_shape");
    const rec = tool as Record<string, unknown>;
    const fn = rec.function;
    if (rec.type !== "function" || !fn || typeof fn !== "object") {
      throw validationError("unsupported_parameter", "tool_not_function");
    }
    if (typeof (fn as Record<string, unknown>).name !== "string") {
      throw validationError("unsupported_parameter", "tool_name");
    }
  }
}

function validateToolChoice(choice: unknown): void {
  if (choice === undefined) return;
  if (choice === "auto" || choice === "none" || choice === "required") return;
  if (choice && typeof choice === "object") {
    const rec = choice as Record<string, unknown>;
    const fn = rec.function;
    if (rec.type === "function" && fn && typeof fn === "object" && typeof (fn as Record<string, unknown>).name === "string") {
      return;
    }
  }
  throw validationError("unsupported_parameter", "tool_choice");
}

/**
 * Text-only message history per SPEC.md:151. Rejects multimodal content and
 * validates tool-call identity and outstanding-call references before any
 * dispatch so a malformed history never reaches the upstream.
 */
function validateMessages(messages: unknown[]): void {
  if (messages.length > MAX_MESSAGE_COUNT) {
    throw validationError("unsupported_parameter", `messages_count:${messages.length}>${MAX_MESSAGE_COUNT}`);
  }
  const outstanding = new Set<string>();
  for (const item of messages) {
    if (!item || typeof item !== "object") throw validationError("invalid_request");
    const message = item as Record<string, unknown>;
    const role = message.role;
    if (typeof role !== "string" || !ALLOWED_MESSAGE_ROLES.has(role)) {
      throw validationError("invalid_request");
    }
    if (Array.isArray(message.content)) throw validationError("unsupported_parameter", "message_content_array");
    if (message.content !== undefined && message.content !== null && typeof message.content !== "string") {
      throw validationError("invalid_request");
    }
    if (message.reasoning_content !== undefined && typeof message.reasoning_content !== "string") {
      throw validationError("invalid_request");
    }
    if (role === "assistant" && message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls)) throw validationError("invalid_request");
      for (const call of message.tool_calls) {
        if (!call || typeof call !== "object") throw validationError("invalid_tool_history");
        const entry = call as Record<string, unknown>;
        if (typeof entry.id !== "string" || entry.id.length === 0 || outstanding.has(entry.id)) {
          throw validationError("invalid_tool_history");
        }
        const fn = entry.function;
        if (!fn || typeof fn !== "object" || typeof (fn as Record<string, unknown>).name !== "string") {
          throw validationError("invalid_request");
        }
        outstanding.add(entry.id);
      }
    }
    if (role === "tool") {
      const toolCallId = message.tool_call_id;
      if (typeof toolCallId !== "string" || toolCallId.length === 0 || !outstanding.has(toolCallId)) {
        throw validationError("invalid_tool_history");
      }
      outstanding.delete(toolCallId);
    }
  }
}

function validateCompletion(body: unknown): { model: string; stream: boolean; max_tokens?: number } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError("invalid_request");
  }
  const rec = body as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!ALLOWED_COMPLETION_KEYS.has(key)) {
      // The key is caller input; only a safe alphabet reaches the log line.
      throw validationError("unsupported_parameter", `unknown_key:${key.replace(/[^\w.-]/g, "?").slice(0, 40)}`);
    }
  }
  if (rec.n !== undefined && rec.n !== 1) {
    throw validationError("unsupported_parameter", "n_not_one");
  }
  if (typeof rec.model !== "string") {
    throw validationError("unknown_alias");
  }
  if (!Array.isArray(rec.messages)) {
    throw validationError("invalid_request");
  }
  validateMessages(rec.messages);
  validateTools(rec.tools);
  validateToolChoice(rec.tool_choice);
  if (rec.parallel_tool_calls !== undefined && rec.parallel_tool_calls !== false) {
    throw validationError("unsupported_parameter", `parallel_tool_calls:${String(rec.parallel_tool_calls)}`);
  }
  if (rec.stream_options !== undefined) {
    const options = rec.stream_options;
    if (!options || typeof options !== "object" || (options as Record<string, unknown>).include_usage !== true) {
      throw validationError("unsupported_parameter", "stream_options");
    }
  }
  const stream = rec.stream === true;
  const maxTokens = rec.max_tokens;
  if (maxTokens !== undefined && (typeof maxTokens !== "number" || maxTokens < 1 || maxTokens > 4096)) {
    throw validationError("invalid_request");
  }
  return { model: rec.model, stream, max_tokens: typeof maxTokens === "number" ? maxTokens : undefined };
}

export function startRouter(options?: { port?: number; configPath?: string; lockPath?: string; dbPath?: string }) {
  const port = options?.port ?? Number(process.env.UB_ROUTER_PORT || ROUTER_PORT);
  const configPath = options?.configPath ?? process.env.UB_ROUTER_CONFIG;
  const lockPath = options?.lockPath ?? join(process.cwd(), "package-lock.json");
  const dbPath = options?.dbPath ?? process.env.UB_ROUTER_DB ?? join(process.env.HOME ?? "/tmp", ".useful-bot/router/usage.sqlite");
  if (!configPath) {
    throw new Error("UB_ROUTER_CONFIG is required");
  }
  const auth = AuthTable.fromConfigPath(configPath);
  const registry = loadRegistry(lockPath);
  const limits = new LimitStore(dbPath);
  const circuit = new AliasCircuit();
  const concurrency = new ConcurrencyGate();

  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    try {
      if (!req.url || !req.method) {
        throw new RouterError({ status: 400, type: "invalid_request_error", code: "invalid_request", message: "invalid_request" });
      }
      const url = new URL(req.url, `http://${ROUTER_HOST}`);
      if (req.method === "GET" && url.pathname === "/health/live") {
        send(res, 200, { ok: true });
        return;
      }
      assertHost(req, (server.address() as { port: number }).port);
      const allowedMethods = ROUTE_METHODS[url.pathname];
      if (allowedMethods && !allowedMethods.includes(req.method)) {
        res.setHeader("allow", allowedMethods.join(", "));
        throw new RouterError({
          status: 405,
          type: "invalid_request_error",
          code: "invalid_request",
          message: "method_not_allowed",
        });
      }
      if (req.method === "GET" && url.pathname === "/health/ready") {
        const caller = auth.authenticate(req.headers.authorization ?? null);
        if (caller.profile !== "ops") {
          throw new RouterError({ status: 403, type: "permission_error", code: "capability_forbidden", message: "capability_forbidden" });
        }
        send(res, 200, { ok: true, registryVersion: 1, upstream: process.env.UB_OPENCODE_GO_KEY ? "unknown" : "limited" });
        return;
      }
      const caller = auth.authenticate(req.headers.authorization ?? null);
      if (req.method === "GET" && url.pathname === "/v1/models") {
        const visible = caller.profile === "ops"
          ? registry
          : registry.filter((entry) => caller.aliases.includes(entry.alias));
        send(res, 200, {
          object: "list",
          data: visible
            .map((entry) => ({
              id: entry.alias,
              object: "model",
              owned_by: "useful-bot",
              context_window: entry.modelContextWindowTokens,
              max_output_tokens: entry.maxOutputTokens,
              upstream_model_id: entry.upstreamModelId,
              status: "available",
            })),
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/search") {
        if ((req.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") {
          throw new RouterError({ status: 415, type: "invalid_request_error", code: "unsupported_media_type", message: "unsupported_media_type" });
        }
        const raw = await readBody(req);
        const body = parseJsonBody(raw);
        concurrency.acquire(caller.callerId);
        try {
          limits.checkSearchLimit(caller, Date.now());
          const result = await search(caller, body);
          send(res, 200, result, { "x-useful-request-id": requestId });
        } finally {
          concurrency.release(caller.callerId);
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        if ((req.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") {
          throw new RouterError({ status: 415, type: "invalid_request_error", code: "unsupported_media_type", message: "unsupported_media_type" });
        }
        const sessionId = headerUuid(req, "x-useful-session-id");
        const turnId = headerUuid(req, "x-useful-turn-id");
        const stepId = headerUuid(req, "x-useful-request-id");
        const raw = await readBody(req);
        const body = parseJsonBody(raw);
        const parsed = validateCompletion(body);
        const alias = auth.assertAlias(caller, parsed.model);
        const entry = entryFor(registry, alias);
        circuit.assertClosed(entry.alias);
        concurrency.acquire(caller.callerId);
        try {
          limits.rememberRequest(stepId, caller.callerId, Date.now());
          const reservationId = limits.reserve({
            caller,
            alias: entry.alias,
            inputUnits: estimateInputUnits(body),
            outputUnits: parsed.max_tokens ?? entry.maxOutputTokens,
            now: Date.now(),
          });
          const controller = new AbortController();
          res.on("close", () => {
            if (!res.writableEnded) {
              controller.abort(new Error("client_disconnect"));
              res.destroy();
            }
          });
          const signal = AbortSignal.any([AbortSignal.timeout(REQUEST_TOTAL_MS), controller.signal]);
          let upstream: Awaited<ReturnType<typeof completeUpstream>>;
          try {
            upstream = await completeUpstream({
              entry,
              body,
              sessionId,
              callerId: caller.callerId,
              signal,
            });
          } catch (error) {
            if (error instanceof RouterError) {
              circuit.recordFailure(entry.alias, error);
              throw error;
            }
            // A header-phase abort is not a RouterError: a client disconnect
            // ends quietly, an idle or total timeout maps the way the
            // streaming paths do, anything else keeps its current shape.
            const kind = abortKind(signal);
            if (kind === "client") return;
            if (kind === "idle" || kind === "total") {
              const timeout = timeoutError(false);
              circuit.recordFailure(entry.alias, timeout);
              throw timeout;
            }
            throw error;
          }
          // Success is recorded once the exchange completes, not when the
          // headers arrive: clearing the failure window here let every
          // mid-stream failure start from zero, so three in a minute could
          // never open the alias.
          const outHeaders: Record<string, string> = {
            "x-useful-request-id": stepId,
            "x-useful-upstream-model": upstream.model,
            "x-useful-upstream-provider": upstream.providerId,
          };
          if (upstream.fallback) {
            outHeaders["x-useful-upstream-fallback"] = upstream.providerId;
            log({ request_id: requestId, event: "upstream_fallback", alias: entry.alias, provider: upstream.providerId });
          }
          void turnId;
          const record = (usage: { inputTokens: number; outputTokens: number } | null) => {
            if (!usage || upstream.response.status >= 400) return;
            const reconciled = limits.reconcile(
              reservationId,
              usage,
              { provider: upstream.providerId, model: upstream.model },
              Date.now(),
            );
            if (reconciled.overrun) {
              circuit.disable(entry.alias);
              log({ request_id: requestId, event: "reservation_overrun", alias: entry.alias });
            }
          };
          if (parsed.stream) {
            const writeHeaders = () => {
              res.writeHead(upstream.response.status, {
                "content-type": "text/event-stream",
                "cache-control": "no-store",
                ...outHeaders,
              });
            };
            if (!upstream.response.body) {
              writeHeaders();
              res.end();
              circuit.recordSuccess(entry.alias);
              return;
            }
            const reader = upstream.response.body.getReader();
            const decoder = new TextDecoder();
            let leftover = "";
            let firstEvent = false;
            let idleTimer: NodeJS.Timeout | undefined;
            const armIdle = (ms: number) => {
              clearTimeout(idleTimer);
              idleTimer = setTimeout(() => controller.abort(new Error("idle_timeout")), ms);
            };
            armIdle(FIRST_EVENT_MS);
            try {
              while (true) {
                let chunk: Uint8Array;
                try {
                  const result = await reader.read();
                  if (result.done) break;
                  chunk = result.value;
                } catch (error) {
                  const kind = abortKind(signal);
                  if (kind === "client") return;
                  if (kind === "idle") throw timeoutError(firstEvent);
                  if (kind === "total") throw timeoutError(false);
                  throw error;
                }
                clearTimeout(idleTimer);
                leftover += decoder.decode(chunk, { stream: true });
                const parts = leftover.split(/\r?\n\r?\n/);
                leftover = parts.pop() ?? "";
                if (Buffer.byteLength(leftover, "utf8") > MAX_EVENT_BYTES) {
                  throw new RouterError({
                    status: 502,
                    type: "upstream_error",
                    code: "upstream_protocol_error",
                    message: "upstream event too large",
                  });
                }
                for (const part of parts) {
                  if (Buffer.byteLength(part, "utf8") > MAX_EVENT_BYTES) {
                    throw new RouterError({
                      status: 502,
                      type: "upstream_error",
                      code: "upstream_protocol_error",
                      message: "upstream event too large",
                    });
                  }
                  const usage = usageFromSseBlock(part);
                  if (usage) record(usage);
                }
                if (!firstEvent) {
                  firstEvent = true;
                  writeHeaders();
                }
                if (!res.write(Buffer.from(chunk))) {
                  try {
                    await waitForDrain(res, signal);
                  } catch (error) {
                    if (error instanceof RouterError) throw error;
                    const kind = abortKind(signal);
                    if (kind === "client") return;
                    if (kind === "idle") throw timeoutError(true);
                    if (kind === "total") throw timeoutError(false);
                    throw error;
                  }
                }
                armIdle(IDLE_EVENT_MS);
              }
            } catch (error) {
              // Mid-stream protocol and timeout failures feed the circuit the
              // way header-phase ones do, so three in a minute open the alias.
              if (error instanceof RouterError) circuit.recordFailure(entry.alias, error);
              throw error;
            } finally {
              clearTimeout(idleTimer);
            }
            if (!firstEvent) writeHeaders();
            res.end();
            circuit.recordSuccess(entry.alias);
            return;
          }
          const firstByteTimer = setTimeout(() => controller.abort(new Error("idle_timeout")), FIRST_EVENT_MS);
          let text: string;
          try {
            text = await readCapped(upstream.response, UPSTREAM_BODY_LIMIT_BYTES);
          } catch (error) {
            const kind = abortKind(signal);
            if (kind === "client") return;
            // A capped-body protocol failure and a first-byte timeout both
            // feed the circuit before they propagate.
            if (kind === "idle" || kind === "total") {
              const timeout = timeoutError(false);
              circuit.recordFailure(entry.alias, timeout);
              throw timeout;
            }
            if (error instanceof RouterError) circuit.recordFailure(entry.alias, error);
            throw error;
          } finally {
            clearTimeout(firstByteTimer);
          }
          let json: unknown = text;
          try { json = JSON.parse(text); } catch { /* keep */ }
          if (json && typeof json === "object" && json !== null && "model" in json) {
            (json as { model: string }).model = parsed.model;
          }
          record(usageFromPayload(json));
          send(res, upstream.response.status, json, outHeaders);
          if (upstream.response.status < 500) circuit.recordSuccess(entry.alias);
          return;
        } finally {
          concurrency.release(caller.callerId);
        }
      }
      if (req.method === "GET" && url.pathname === "/v1/usage") {
        send(res, 200, caller.profile === "ops" ? limits.summarize() : limits.summarize(caller.callerId));
        return;
      }
      throw new RouterError({ status: 404, type: "invalid_request_error", code: "invalid_request", message: "not found" });
    } catch (error) {
      const body = error instanceof RouterError
        ? errorBody(error, requestId)
        : {
          error: {
            type: "internal_error",
            code: "internal_error",
            message: "internal_error",
            request_id: requestId,
            retryable: false,
          },
        };
      const status = error instanceof RouterError ? error.status : 500;
      log({ request_id: requestId, status, code: error instanceof RouterError ? error.code : "internal_error" });
      if (res.headersSent) {
        try {
          res.write(`data: ${JSON.stringify(body)}\n\n`);
          res.end();
        } catch {
          res.destroy();
        }
        return;
      }
      send(res, status, body, { "x-useful-request-id": requestId });
    }
  });

  server.listen(port, ROUTER_HOST, () => {
    log({ event: "listen", host: ROUTER_HOST, port: (server.address() as { port: number }).port });
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startRouter();
}
