import { bindTurnBody, isEveSessionPost } from "../../shared/eve-proxy.ts";
import { channelJwt, channelJwtNoBot } from "./agent-exec.ts";

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
): EveCallAuth {
  const match = /^session\/([^/]+)(\/|$)/.exec(suffix);
  if (!match) {
    // A create is minted after the route validates its bot. Health and info
    // need a verified token and no claim.
    return { ok: true, jwt: suffix === "session" ? null : channelJwtNoBot(), bound: null, body: rawBody };
  }
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
