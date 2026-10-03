import { bindChildSession, readSessionParent, resolveSessionBot } from "../../shared/session-bindings.ts";

/** The part of a hook context and event this needs; the real ones are wider. */
type Ctx = { session?: { id?: string; parent?: unknown } };
type Event = { type?: string; data?: { sessionId?: unknown; childSessionId?: unknown } };

/**
 * Record a sub-agent's child session in the durable binding store when its
 * parent delegates it: the child is bound to the parent's bot, with the parent
 * named, so the proxy can serve its stream read only (web/lib/eve-session-auth.ts).
 * eve's own `subagent.called` event, raised by the root session, is the only
 * evidence used; nothing is read from a stream. A no-op for any other event, a
 * child session's own call, a context that is not the event's session, a parent
 * nobody bound or one that is itself a child. Never throws: a hook that throws
 * fails the turn, so a conflict or store failure is logged and left alone.
 */
export function bindSubagentChild(
  event: Event,
  ctx: Ctx,
  deps: { log?: (message: string) => void } = {},
): "bound" | "ignored" | "failed" {
  const log = deps.log ?? ((message: string) => console.error(message));
  if (event.type !== "subagent.called") return "ignored";
  const parent = ctx.session?.id;
  const child = event.data?.childSessionId;
  if (ctx.session?.parent || !parent || event.data?.sessionId !== parent) return "ignored";
  if (typeof child !== "string" || child === parent) return "ignored";
  try {
    const bot = resolveSessionBot(parent);
    if (!bot || readSessionParent(parent) !== null) return "ignored";
    bindChildSession(child, parent, bot);
    return "bound";
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // An id outside the store's alphabet is not a child this build can record.
    if (reason === "session_owners_session_id") return "ignored";
    log(`[subagent-binding] child session not recorded (${reason})`);
    return "failed";
  }
}
