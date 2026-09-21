import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { connectionHeaders } from "../../shared/connection-auth.ts";
import {
  activateSessionTools,
  connectionIndex,
  mountedToolName,
  sessionTools,
} from "../../shared/connection-tools-store.ts";
import {
  onDemandConnections,
  searchConnectionTools,
  splitMountedName,
} from "../../shared/connection-tools.ts";
import { findConnectionById } from "../../shared/connections-store.ts";
import { toolInputSchema, rawSchemaHint } from "../../shared/json-schema-zod.ts";
import { callMcpTool } from "../../shared/mcp-http.ts";
import { MAX_SESSION_TOOLS } from "../../shared/policy.ts";
import { wrapUntrusted } from "../../shared/untrusted.ts";
import { connectorGate, mcpToolRisk } from "../lib/connector-risk.ts";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";
import { sessionPermission } from "../lib/permission.ts";

/**
 * The tools of connected MCP servers, mounted only once a bot has asked for
 * them.
 *
 * Every connection used to be handed to eve on `turn.started`, so every one
 * of its tools sat in context on every turn. A server may publish two hundred;
 * three medium ones took a bot past the router's tool cap, which answers a
 * non-retryable `unsupported_parameter`, and eve retires a session that gets
 * one. The chat was dead for good, and nothing checked the total on the way
 * in.
 *
 * So the big servers wait. `find_tools` searches their listings and records
 * what it handed over; this resolver runs before each model call, so the tools
 * it named are mounted for the next one, inside the same turn. The names stay
 * `<connectionId>__<toolName>`, which is both what eve would have called them
 * and what the macOS app parses to put a drawing on screen.
 */

const RESULT_MAX_BYTES = 24 * 1024;
const MAX_HITS = 8;
/**
 * The card shows every argument the hash binds, so there is no clipped
 * preview: a call whose arguments would not fit is refused and the model
 * asked to shorten it. Reads never reach the card.
 */
const CARD_ARGS_MAX = 4000;

export default defineDynamic({
  events: {
    "step.started": async (_event, ctx) => {
      const sessionId = ctx.session?.id ?? "";
      // Nothing to look through: no `find_tools` either, rather than a tool
      // that can only ever answer "no connections".
      if (onDemandConnections().length === 0) return null;
      // `unknown` because eve's own resolver signature is: each `defineTool`
      // call below is checked on its own, and one Record cannot hold two
      // tools whose input schemas differ.
      const tools: Record<string, unknown> = {
        find_tools: defineTool({
          description:
            "Find tools in the owner's connected MCP servers and make them callable. " +
            "Search by what you want to do, not by tool name. The tools it returns are " +
            "available on your next step, not in this one.",
          inputSchema: z.object({
            query: z.string().min(2).max(200)
              .describe("What you want to do, in a few words: \"send a slack message\"."),
          }),
          async execute(input, toolCtx) {
            const id = toolCtx.session?.id ?? "";
            const hits = await searchConnectionTools(input.query, MAX_HITS);
            if (hits.length === 0) {
              return { status: "ok", found: 0, tools: [], note: "No connected server has a tool like that." };
            }
            const outcome = activateSessionTools(id, hits.map((hit) => hit.name));
            const held = outcome.tools.length;
            return {
              status: "ok",
              found: hits.length,
              // Named so the model can call them by name on its next step.
              tools: hits
                .filter((hit) => !outcome.refused.includes(hit.name))
                .map((hit) => ({
                  name: hit.name,
                  app: hit.connectionName,
                  description: hit.description,
                })),
              ...(outcome.refused.length
                ? {
                  refused: outcome.refused,
                  note: `This chat is holding ${held} of ${MAX_SESSION_TOOLS} tools. Work with those, or start a fresh chat.`,
                }
                : {}),
            };
          },
        }),
      };
      for (const name of sessionTools(sessionId)) {
        const split = splitMountedName(name);
        if (!split) continue;
        const entry = findConnectionById(split.connectionId);
        if (!entry || entry.kind !== "mcp") continue;
        const indexed = connectionIndex(split.connectionId)?.tools.find((tool) => tool.name === split.tool);
        if (!indexed) continue;
        const { schema, passthrough } = toolInputSchema(indexed.inputSchema);
        const connectionId = entry.id;
        const connectionName = entry.name;
        const url = entry.url;
        const toolName = split.tool;
        tools[mountedToolName(connectionId, toolName)] = defineTool({
          description: `${connectionName}: ${indexed.description || toolName}`
            + (passthrough ? rawSchemaHint(indexed.inputSchema) : ""),
          inputSchema: schema,
          async execute(input: unknown, toolCtx) {
            const entry = findConnectionById(connectionId);
            // The owner can disconnect a server mid-turn; the tool goes with it.
            if (!entry || entry.url !== url) {
              return { status: "blocked", error: "connection_gone", connection: connectionId };
            }
            // Someone else's tool doing something on the owner's behalf is
            // gated like a connector call, not like a read: this app runs it
            // itself, so the card is this app's to show. The risk comes from
            // the tool's own name, which is all any of us has to go on.
            const permission = sessionPermission(toolCtx);
            const risk = mcpToolRisk(toolName);
            const gate = connectorGate(risk, permission);
            if (gate === "refuse") return { status: "blocked", error: "workspace_read_only", risk };
            const args = input && typeof input === "object" && !Array.isArray(input)
              ? input as Record<string, unknown>
              : {};
            const argsText = JSON.stringify(args, null, 1);
            if (gate === "ask" && argsText.length > CARD_ARGS_MAX) {
              return { status: "blocked", error: "arguments_too_long_for_approval", max: CARD_ARGS_MAX };
            }
            const hash = actionSha256({
              tool: "connection",
              canonicalArgs: JSON.stringify({ connection: connectionId, tool: toolName, arguments: args }),
              cwd: "",
              targetRevision: null,
              backend: "mcp",
              toolVersion: "1",
            });
            const approvals = getApprovalStore();
            const rec = approvals.request({
              ...approvalActor(toolCtx),
              tool: "connection",
              actionSha256: hash,
              preview: `${connectionName} · ${toolName}${risk === "destructive" ? " (destructive)" : ""}`
                + (argsText === "{}" ? "" : `\n${argsText}`),
            });
            if (gate === "run") {
              approvals.decide(rec.id, "approve", hash);
            } else {
              await waitUntilNotPending(approvals, rec.id);
              // A read-only switch while the card sat open refuses; a widened
              // one is not spent on this call.
              if (sessionPermission(toolCtx) !== permission) {
                return { status: "blocked", error: "permission_changed" };
              }
            }
            return executeIfApproved(approvals, rec.id, hash, async () => {
            try {
              const headers = await connectionHeaders(entry);
              const raw = await callMcpTool(url, toolName, args, headers);
              let text = JSON.stringify(raw);
              let truncated = false;
              if (text.length > RESULT_MAX_BYTES) {
                text = text.slice(0, RESULT_MAX_BYTES);
                truncated = true;
              }
              return {
                status: "ok",
                tool: toolName,
                truncated,
                result: wrapUntrusted(`connection:${connectionId}/${toolName}`, text),
              };
            } catch (err) {
              // The server's words, never the headers that reached it.
              const message = err instanceof Error ? err.message.slice(0, 300) : "failed";
              return {
                status: "error",
                tool: toolName,
                error: wrapUntrusted(`connection:${connectionId}/${toolName} error`, message),
              };
            }
            });
          },
        });
      }
      return tools;
    },
  },
});
