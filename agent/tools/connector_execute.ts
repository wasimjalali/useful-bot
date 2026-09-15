import { defineTool } from "eve/tools";
import { z } from "zod";
import { executeConnectorTool, toolkitOf } from "../../shared/composio.ts";
import { readConnectorsStore } from "../../shared/connectors-store.ts";
import { readSessionGrant } from "../../shared/workspace-store.ts";
import { wrapUntrusted } from "../../shared/untrusted.ts";
import { connectorGate, connectorRisk } from "../lib/connector-risk.ts";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";

const RESULT_MAX_BYTES = 24 * 1024;
/**
 * The card must show every argument the hash binds, so there is no clipped
 * preview: a write whose arguments would not fit on a card is refused and
 * the model asked to shorten it. Reads never reach the card.
 */
const CARD_ARGS_MAX = 4000;
const SLUG = /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/;

/**
 * Runs one tool in a connected app. A read runs at once. A write shows a card
 * in auto and runs in full access; a destructive action always shows a card;
 * read only refuses both. The card carries the app, the tool and the
 * arguments, hashed the same way a shell line is, so what the owner approved
 * is exactly what runs.
 */
export default defineTool({
  description:
    "Run one tool in a connected app by its slug from connector_search, with arguments matching its input schema. Writes may need the owner's approval.",
  inputSchema: z.object({
    tool: z.string().min(3).max(120),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
  async execute(input, ctx) {
    const tool = input.tool.trim();
    if (!SLUG.test(tool)) return { status: "blocked", error: "tool_slug_invalid" };
    const store = readConnectorsStore();
    if (!store.apiKey) return { status: "blocked", error: "connectors_not_set_up" };
    const toolkit = toolkitOf(tool, store.connectedToolkits);
    if (!toolkit) {
      return { status: "blocked", error: "not_connected", toolkit: tool.split("_")[0]?.toLowerCase() ?? "unknown" };
    }
    const grant = ctx?.session?.id ? readSessionGrant(ctx.session.id) : null;
    const permission = grant?.permission ?? null;
    const risk = connectorRisk(tool, toolkit);
    const gate = connectorGate(risk, permission);
    if (gate === "refuse") return { status: "blocked", error: "workspace_read_only", risk };

    const canonicalArgs = JSON.stringify({ tool, arguments: input.arguments });
    const argsText = JSON.stringify(input.arguments, null, 1);
    if (gate === "ask" && argsText.length > CARD_ARGS_MAX) {
      return { status: "blocked", error: "arguments_too_long_for_approval", max: CARD_ARGS_MAX };
    }
    const hash = actionSha256({
      tool: "connector",
      canonicalArgs,
      cwd: "",
      targetRevision: null,
      backend: "composio",
      toolVersion: "1",
    });
    const approvals = getApprovalStore();
    const rec = approvals.request({
      ...approvalActor(ctx),
      tool: "connector",
      actionSha256: hash,
      preview: preview(toolkit, tool, argsText, risk),
    });
    if (gate === "run") {
      approvals.decide(rec.id, "approve", hash);
    } else {
      await waitUntilNotPending(approvals, rec.id);
      // The posture may have changed while the card sat open. A read-only
      // switch mid-wait refuses; a widened one is not spent on this call.
      const now = ctx?.session?.id ? readSessionGrant(ctx.session.id)?.permission ?? null : null;
      if (now !== permission) return { status: "blocked", error: "permission_changed" };
    }
    return executeIfApproved(approvals, rec.id, hash, async () => {
      try {
        const raw = await executeConnectorTool(tool, input.arguments);
        return shape(tool, raw);
      } catch (err) {
        const rec = err as Error & { toolkit?: string };
        if (rec.message === "not_connected") return { status: "blocked", error: "not_connected", toolkit: rec.toolkit };
        return { status: "error", error: wrapUntrusted(`connector:${tool} error`, String(rec.message ?? "failed")) };
      }
    });
  },
});

function preview(toolkit: string, tool: string, argsText: string, risk: string): string {
  const head = `${toolkit} · ${tool}${risk === "destructive" ? " (destructive)" : ""}`;
  return argsText === "{}" ? head : `${head}\n${argsText}`;
}

function shape(tool: string, raw: unknown): Record<string, unknown> {
  const rec = (raw && typeof raw === "object" ? raw : { data: raw }) as {
    successful?: unknown;
    error?: unknown;
    data?: unknown;
  };
  if (rec.successful === false || (typeof rec.error === "string" && rec.error)) {
    return { status: "error", tool, error: wrapUntrusted(`connector:${tool} error`, String(rec.error ?? "failed")) };
  }
  let text = JSON.stringify(rec.data ?? raw ?? null);
  let truncated = false;
  if (text.length > RESULT_MAX_BYTES) {
    text = text.slice(0, RESULT_MAX_BYTES);
    truncated = true;
  }
  return {
    status: "ok",
    tool,
    truncated,
    result: wrapUntrusted(`connector:${tool}`, text),
  };
}
