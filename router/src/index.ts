import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { BODY_LIMIT_BYTES, POLICY_NODE_MAJOR, ROUTER_HOST, ROUTER_PORT } from "../../shared/policy.ts";
import { AuthTable } from "./auth.ts";
import { RouterError, errorBody } from "./errors.ts";
import { LimitStore } from "./limits.ts";
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

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      reject(new RouterError({
        status: 400,
        type: "invalid_request_error",
        code: "invalid_request",
        message: "body timeout",
      }));
    }, 10_000);
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        clearTimeout(timer);
        reject(new RouterError({
          status: 413,
          type: "invalid_request_error",
          code: "body_too_large",
          message: "body_too_large",
        }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
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

function validateCompletion(body: unknown): { model: string; stream: boolean; max_tokens?: number } {
  if (!body || typeof body !== "object") {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "invalid_request",
      message: "invalid_request",
    });
  }
  const rec = body as Record<string, unknown>;
  if (rec.n !== undefined && rec.n !== 1) {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "unsupported_parameter",
      message: "unsupported_parameter",
    });
  }
  if (typeof rec.model !== "string") {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "unknown_alias",
      message: "unknown_alias",
    });
  }
  if (!Array.isArray(rec.messages)) {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "invalid_request",
      message: "messages required",
    });
  }
  const stream = rec.stream === true;
  const maxTokens = rec.max_tokens;
  if (maxTokens !== undefined && (typeof maxTokens !== "number" || maxTokens < 1 || maxTokens > 4096)) {
    throw new RouterError({
      status: 400,
      type: "invalid_request_error",
      code: "invalid_request",
      message: "max_tokens",
    });
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
        send(res, 200, {
          object: "list",
          data: registry
            .filter((entry) => caller.aliases.includes(entry.alias))
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
        const body = JSON.parse(raw.toString("utf8") || "null");
        const result = await search(caller, body);
        send(res, 200, result, { "x-useful-request-id": requestId });
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
        const body = JSON.parse(raw.toString("utf8") || "null");
        const parsed = validateCompletion(body);
        const alias = auth.assertAlias(caller, parsed.model);
        limits.rememberRequest(stepId, caller.callerId, Date.now());
        limits.hit(caller, Date.now());
        const entry = entryFor(registry, alias);
        const upstream = await completeUpstream({
          entry,
          body,
          sessionId,
          callerId: caller.callerId,
          signal: AbortSignal.timeout(180_000),
        });
        const outHeaders: Record<string, string> = {
          "x-useful-request-id": stepId,
          "x-useful-upstream-model": upstream.model,
        };
        void turnId;
        const record = (usage: { inputTokens: number; outputTokens: number } | null) => {
          if (!usage || upstream.response.status >= 400) return;
          limits.recordUsage({
            callerId: caller.callerId,
            provider: upstream.providerId,
            model: upstream.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            at: Date.now(),
          });
        };
        if (parsed.stream) {
          res.writeHead(upstream.response.status, {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            ...outHeaders,
          });
          if (!upstream.response.body) {
            res.end();
            return;
          }
          const reader = upstream.response.body.getReader();
          const decoder = new TextDecoder();
          let leftover = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
            leftover += decoder.decode(value, { stream: true });
            const parts = leftover.split("\n\n");
            leftover = parts.pop() ?? "";
            for (const part of parts) {
              const usage = usageFromSseBlock(part);
              if (usage) record(usage);
            }
          }
          res.end();
          return;
        }
        const text = await upstream.response.text();
        let json: unknown = text;
        try { json = JSON.parse(text); } catch { /* keep */ }
        if (json && typeof json === "object" && json !== null && "model" in json) {
          (json as { model: string }).model = parsed.model;
        }
        record(usageFromPayload(json));
        send(res, upstream.response.status, json, outHeaders);
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/usage") {
        send(res, 200, limits.summarize(caller.callerId));
        return;
      }
      res.setHeader("allow", "GET, POST");
      throw new RouterError({ status: 404, type: "invalid_request_error", code: "invalid_request", message: "not found" });
    } catch (error) {
      if (error instanceof RouterError) {
        log({ request_id: requestId, status: error.status, code: error.code });
        send(res, error.status, errorBody(error, requestId), { "x-useful-request-id": requestId });
        return;
      }
      log({ request_id: requestId, status: 500, code: "internal_error" });
      send(res, 500, {
        error: {
          type: "internal_error",
          code: "internal_error",
          message: "internal_error",
          request_id: requestId,
          retryable: false,
        },
      });
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
