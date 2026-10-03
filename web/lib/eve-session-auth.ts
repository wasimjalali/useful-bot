import { bindTurnBody, isEveSessionPost } from "../../shared/eve-proxy.ts";
import { eveStreamPayload } from "../../shared/eve-stream.ts";
import { bindChildSession, readSessionParent, resolveSessionBot } from "../../shared/session-bindings.ts";
import { eveOrigin } from "../../shared/stack.ts";
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

/** The most (parent, child) pairs remembered as verified; the oldest goes first. */
const CHILD_CACHE_MAX = 512;
/** How long, and how much, one read of a parent's stream may take to find a child. */
const VERIFY_HARD_MS = 15_000;
const VERIFY_MAX_BYTES = 64 * 1024 * 1024;

export type ChildStreamDeps = {
  resolveBot: (sessionId: string) => string | null;
  /** The root a session was recorded as a child of, or null. */
  readParent: (sessionId: string) => string | null;
  /** Whether `parent`'s own stream says it delegated `child`. Throws when the stream cannot be read. */
  verify: (parent: string, child: string, jwt: string) => Promise<boolean>;
  bind: (child: string, parent: string, botId: string) => void;
  cache: Map<string, true>;
};

const verifiedChildren = new Map<string, true>();

export function childStreamDeps(): ChildStreamDeps {
  return {
    resolveBot: (id) => resolveSessionBot(id, readShell()),
    readParent: (id) => readSessionParent(id),
    verify: (parent, child, jwt) => streamHasSubagentCall(parent, child, jwt),
    bind: (child, parent, botId) => { bindChildSession(child, parent, botId); },
    cache: verifiedChildren,
  };
}

/**
 * Whether `parent`'s stream carries a `subagent.called` event, raised by that
 * very parent session, that names `child`. The one place a child session id is
 * believed: the parent's own record of what it delegated, read from eve as the
 * bot. A stream that cannot be read, or is cut off before the end, throws or
 * answers false; it never answers true on a guess.
 */
export async function streamHasSubagentCall(
  parent: string,
  child: string,
  jwt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const hard = setTimeout(() => controller.abort(), VERIFY_HARD_MS);
  try {
    const url = `${eveOrigin()}/eve/v1/session/${encodeURIComponent(parent)}/stream?startIndex=0&includeTailIndex=1`;
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${jwt}` }, signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`eve_stream_${res.status}`);
    const header = Number(res.headers.get("x-eve-stream-tail-index"));
    const total = res.headers.has("x-eve-stream-tail-index") && Number.isInteger(header) ? header + 1 : null;
    if (total === 0) {
      await res.body.cancel().catch(() => undefined);
      return false;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let bytes = 0;
    let consumed = 0;
    const scan = (line: string): boolean => {
      const payload = eveStreamPayload(line);
      if (payload === null) return false;
      consumed += 1;
      try {
        const event = JSON.parse(payload) as { type?: unknown; data?: { sessionId?: unknown; childSessionId?: unknown } };
        return event.type === "subagent.called" && event.data?.sessionId === parent && event.data?.childSessionId === child;
      } catch {
        return false;
      }
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > VERIFY_MAX_BYTES) throw new Error("eve_stream_too_large");
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) if (scan(line)) return true;
        if (total !== null && consumed >= total) return false;
      }
      buf += decoder.decode();
      return scan(buf);
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } finally {
    clearTimeout(hard);
  }
}

/**
 * May a read of `child`'s stream go through, as a sub-agent of `parent`? Only
 * when `parent` is bound to a bot and is not itself a child (no nesting), the
 * child is not the parent, a root session or another bot's, and the parent's
 * own stream lists the child. A verified child is bound as the parent's bot,
 * with the parent recorded, because eve holds every session call to a binding;
 * the proxy refuses any send into a recorded child. Read-only, GET streams only.
 */
export async function authorizeChildStream(
  parent: string,
  child: string,
  deps: ChildStreamDeps,
): Promise<EveCallAuth> {
  const refused: EveCallAuth = { ok: false, status: 403, error: "child_session_unverified" };
  const bot = deps.resolveBot(parent);
  if (bot === null) return { ok: false, status: 400, error: "session_unbound" };
  if (deps.readParent(parent) !== null || child === parent) return refused;
  const childBot = deps.resolveBot(child);
  const childParent = deps.readParent(child);
  if (childParent !== null && childParent !== parent) return refused;
  if (childBot !== null && (childBot !== bot || childParent === null)) return refused;
  const key = `${parent}\u0000${child}`;
  if (!deps.cache.has(key)) {
    if (!(await deps.verify(parent, child, channelJwt(bot)))) return refused;
    if (deps.cache.size >= CHILD_CACHE_MAX) {
      const oldest = deps.cache.keys().next().value;
      if (oldest !== undefined) deps.cache.delete(oldest);
    }
    deps.cache.set(key, true);
  }
  if (childBot === null) deps.bind(child, parent, bot);
  return { ok: true, jwt: channelJwt(bot), bound: bot, body: null };
}
