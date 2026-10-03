import { bindTurnBody, isEveSessionPost } from "../../shared/eve-proxy.ts";
import { readSessionParent, resolveSessionBot } from "../../shared/session-bindings.ts";
import { channelJwt, channelJwtNoBot } from "./agent-exec.ts";
import { readShell } from "../../shared/shell-io.ts";

export type EveCallAuth =
  | {
    ok: true;
    /** The token for this call. Null only for a session create: the route mints it once the bot is validated. */
    jwt: string | null;
    /** The bot the session path is bound to, or null for a create, health, info or an unbound cancel. */
    bound: string | null;
    /** The turn body to forward: the original, with `botId` pinned to the bound bot, for a continuation. */
    body: string | null;
  }
  | { ok: false; status: number; error: string };

/**
 * Which bot an eve call is made as. For every `session/<id>` path (continue,
 * stream, cancel) the bot comes from the durable binding for that path id,
 * never from the request body, and the token carries that bot's claim, so eve
 * can hold the call to the same binding. A session nobody bound is refused
 * before eve sees it, except a cancel (stopping a session is always safe). A
 * body that names another bot is refused. Throws when the binding cannot be
 * read or the channel secret is missing; the caller maps that to a 503.
 */
export function authorizeEveCall(
  method: string,
  suffix: string,
  rawBody: string | null,
  resolveBot: (sessionId: string) => string | null,
  /** Whether a session is a recorded sub-agent child, which is never written to. */
  isChild: (sessionId: string) => boolean = (sessionId) => readSessionParent(sessionId) !== null,
): EveCallAuth {
  const match = /^session\/([^/]+)(\/|$)/.exec(suffix);
  if (!match) {
    // A create is minted after the route validates its bot. Health and info
    // need a verified token and no claim.
    return { ok: true, jwt: suffix === "session" ? null : channelJwtNoBot(), bound: null, body: rawBody };
  }
  const readOnly = childWriteRefusal(method, suffix, isChild);
  if (readOnly) return { ok: false, ...readOnly };
  const bound = resolveBot(match[1]);
  const cancel = method === "POST" && suffix === `session/${match[1]}/cancel`;
  if (bound === null) {
    if (!cancel) return { ok: false, status: 400, error: "session_unbound" };
    return { ok: true, jwt: channelJwtNoBot(), bound: null, body: rawBody };
  }
  if (method === "POST" && isEveSessionPost(suffix) && rawBody !== null) {
    const turn = bindTurnBody(rawBody, bound);
    if (!turn.ok) return { ok: false, status: 400, error: turn.error };
    return { ok: true, jwt: channelJwt(bound), bound, body: turn.body };
  }
  return { ok: true, jwt: channelJwt(bound), bound, body: rawBody };
}

/**
 * The token a carry-over reads the old session with. The old session must be
 * bound to the bot whose chat is continuing: no owner, or another bot's
 * session, is refused and no token is minted for it.
 */
export function carryOverReader(
  carriedFrom: string,
  ownerId: string | null,
  resolveBot: (sessionId: string) => string | null,
): { ok: true; jwt: string } | { ok: false; status: number; error: string } {
  if (!ownerId || resolveBot(carriedFrom) !== ownerId) {
    return { ok: false, status: 400, error: "continue_from_refused" };
  }
  return { ok: true, jwt: channelJwt(ownerId) };
}

export type ChildStreamDeps = {
  resolveBot: (sessionId: string) => string | null;
  /** The root a session was recorded as a child of, or null. */
  readParent: (sessionId: string) => string | null;
};

export function childStreamDeps(): ChildStreamDeps {
  return {
    resolveBot: (id) => resolveSessionBot(id, readShell()),
    readParent: (id) => readSessionParent(id),
  };
}

/**
 * The refusal for a write into a sub-agent's child session, or null. A send, a
 * cancel or a reset into a recorded child is never allowed: the child's work
 * is read only. Called by the authorisation itself and again right before the
 * call is forwarded, because a child can be recorded while a request is in
 * flight. Throws when the binding store cannot be read.
 */
export function childWriteRefusal(
  method: string,
  suffix: string,
  isChild: (sessionId: string) => boolean,
): { status: 403; error: "child_session_readonly" } | null {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return null;
  // Any path under the session, not only the shapes the POST allowlist admits
  // today, so a later route cannot write past this.
  const match = /^session\/([^/]+)(?:\/|$)/.exec(suffix);
  if (!match || !isChild(match[1])) return null;
  return { status: 403, error: "child_session_readonly" };
}

/**
 * May a read of `child`'s stream go through, as a sub-agent of `parent`? Only
 * when the durable binding says so: `parent` is bound to a bot and is not
 * itself a child, and `child` is recorded (by the agent's hook, when eve
 * reported the delegation) as a child of that parent for that same bot. No
 * stream is read. A child with no row yet is `child_session_pending` (409), a
 * retryable answer: the hook can land a moment after the app sees the event.
 * Anything else (the parent itself, a root session, another parent or bot) is
 * refused. Read-only, GET streams only.
 */
export function authorizeChildStream(
  parent: string,
  child: string,
  deps: ChildStreamDeps,
): EveCallAuth {
  const bot = deps.resolveBot(parent);
  if (bot === null) return { ok: false, status: 400, error: "session_unbound" };
  const refused: EveCallAuth = { ok: false, status: 403, error: "child_session_unverified" };
  if (child === parent || deps.readParent(parent) !== null) return refused;
  const childParent = deps.readParent(child);
  const childBot = deps.resolveBot(child);
  if (childParent === null) {
    // No row at all is a child the hook has not recorded yet; a root is not a child.
    return childBot === null ? { ok: false, status: 409, error: "child_session_pending" } : refused;
  }
  if (childParent !== parent || childBot !== bot) return refused;
  return { ok: true, jwt: channelJwt(bot), bound: bot, body: null };
}
