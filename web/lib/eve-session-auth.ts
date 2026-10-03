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

/** The most (parent, child) pairs remembered as verified; the oldest goes first. */
const CHILD_CACHE_MAX = 512;
/** How long, and how much, one read of a parent's stream may take. */
const VERIFY_HARD_MS = 15_000;
const VERIFY_MAX_BYTES = 64 * 1024 * 1024;
/** Events of a parent's tail read first: a new child is among the newest. */
const VERIFY_WINDOW_EVENTS = 5000;
const VERIFY_CONCURRENCY = 4;
const VERIFY_MISS_TTL_MS = 10_000;
const RECORD_MAX_PARENTS = 64;
const RECORD_MAX_CHILDREN = 4096;

export type ChildStreamDeps = {
  resolveBot: (sessionId: string) => string | null;
  /** The root a session was recorded as a child of, or null. */
  readParent: (sessionId: string) => string | null;
  /** Whether `parent`'s own stream says it delegated `child`. Throws when the stream cannot be read. */
  verify: (parent: string, child: string, jwt: string, signal?: AbortSignal) => Promise<boolean>;
  bind: (child: string, parent: string, botId: string) => void;
  cache: Map<string, true>;
};

const verifiedChildren = new Map<string, true>();
let sharedVerifier: ReturnType<typeof createChildVerifier> | null = null;

export function childStreamDeps(): ChildStreamDeps {
  sharedVerifier ??= createChildVerifier();
  return {
    resolveBot: (id) => resolveSessionBot(id, readShell()),
    readParent: (id) => readSessionParent(id),
    verify: sharedVerifier,
    bind: (child, parent, botId) => { bindChildSession(child, parent, botId); },
    cache: verifiedChildren,
  };
}

/** What a scan has learned of one parent's stream: where it has read to, and which children it delegated. */
type ParentRecord = { next: number; complete: boolean; children: Set<string> };

export type ChildVerifierOptions = {
  fetch?: typeof fetch;
  /** Tail events read first for a parent not seen before; 0 reads from the start. */
  windowEvents?: number;
  maxConcurrent?: number;
  negativeTtlMs?: number;
  now?: () => number;
};

/**
 * Whether a parent's own stream says it delegated a child, found cheaply. The
 * stream is read as the bot: a parent not seen before is read from a window at
 * its tail (a negative `startIndex`), widened to the start once only if the
 * child is not in it; after that only the events past the last index read are
 * scanned. The record holds only children named by an exact `subagent.called`
 * event whose own `sessionId` is the parent, so nothing a child or a message
 * says can add one. Scans of one parent are shared, scans overall are bounded,
 * a miss or a failure is remembered briefly, and a caller that goes away stops
 * the read once nobody is waiting on it. A stream that cannot be read throws;
 * it never answers true on a guess.
 */
export function createChildVerifier(options: ChildVerifierOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const window = options.windowEvents ?? VERIFY_WINDOW_EVENTS;
  const maxConcurrent = options.maxConcurrent ?? VERIFY_CONCURRENCY;
  const ttl = options.negativeTtlMs ?? VERIFY_MISS_TTL_MS;
  const now = options.now ?? Date.now;
  const records = new Map<string, ParentRecord>();
  const misses = new Map<string, { until: number; error?: Error }>();
  type Scan = { seq: number; controller: AbortController; waiters: number; promise: Promise<void> };
  const inflight = new Map<string, Scan>();
  let seq = 0;
  let running = 0;
  const queue: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (running < maxConcurrent) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => queue.push(() => { running += 1; resolve(); }));
  };
  const release = () => {
    running -= 1;
    queue.shift()?.();
  };
  const remember = (parent: string): ParentRecord => {
    let rec = records.get(parent);
    if (rec) {
      records.delete(parent);
    } else {
      rec = { next: 0, complete: false, children: new Set() };
      if (records.size >= RECORD_MAX_PARENTS) {
        const oldest = records.keys().next().value;
        if (oldest !== undefined) records.delete(oldest);
      }
    }
    records.set(parent, rec);
    return rec;
  };

  /** One read of the parent's stream from `start` to its tail; merges what it found only once it has read to the end. */
  const readFrom = async (parent: string, jwt: string, start: number, signal: AbortSignal): Promise<void> => {
    const url = `${eveOrigin()}/eve/v1/session/${encodeURIComponent(parent)}/stream?startIndex=${start}&includeTailIndex=1`;
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${jwt}` }, signal });
    if (!res.ok || !res.body) throw new Error(`eve_stream_${res.status}`);
    const header = Number(res.headers.get("x-eve-stream-tail-index"));
    if (!res.headers.has("x-eve-stream-tail-index") || !Number.isInteger(header)) {
      await res.body.cancel().catch(() => undefined);
      throw new Error("eve_stream_tail_unknown");
    }
    const first = start < 0 ? Math.max(0, header + 1 + start) : start;
    const total = Math.max(0, header + 1 - first);
    const found: string[] = [];
    if (total > 0) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let bytes = 0;
      let consumed = 0;
      const scan = (line: string) => {
        const payload = eveStreamPayload(line);
        if (payload === null) return;
        consumed += 1;
        try {
          const event = JSON.parse(payload) as { type?: unknown; data?: { sessionId?: unknown; childSessionId?: unknown } };
          if (event.type === "subagent.called" && event.data?.sessionId === parent && typeof event.data.childSessionId === "string") {
            found.push(event.data.childSessionId);
          }
        } catch {
          /* a line that does not parse names no child */
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
          for (const line of lines) scan(line);
          if (consumed >= total) break;
        }
        if (consumed < total) {
          buf += decoder.decode();
          scan(buf);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    } else {
      await res.body.cancel().catch(() => undefined);
    }
    const rec = remember(parent);
    if (first === 0) rec.complete = true;
    for (const id of found) {
      if (rec.children.size >= RECORD_MAX_CHILDREN) {
        const oldest = rec.children.values().next().value;
        if (oldest !== undefined) rec.children.delete(oldest);
      }
      rec.children.add(id);
    }
    rec.next = Math.max(rec.next, header + 1);
  };

  const runScan = async (parent: string, jwt: string, full: boolean, signal: AbortSignal): Promise<void> => {
    await acquire();
    try {
      if (signal.aborted) throw new Error("aborted");
      const known = records.get(parent);
      const start = full ? 0 : known ? known.next : window > 0 ? -window : 0;
      await readFrom(parent, jwt, start, signal);
    } finally {
      release();
    }
  };

  /** Join the scan of this parent in flight (unless it began at or before `minSeq`), or start one. */
  const attempt = async (
    parent: string,
    jwt: string,
    full: boolean,
    minSeq: number,
    signal: AbortSignal | undefined,
  ): Promise<{ started: boolean }> => {
    const key = `${parent}\u0000${full ? "full" : "next"}`;
    let entry = inflight.get(key);
    let started = false;
    if (!entry || entry.seq <= minSeq) {
      const controller = new AbortController();
      const hard = setTimeout(() => controller.abort(), VERIFY_HARD_MS);
      const scan: Scan = { seq: ++seq, controller, waiters: 0, promise: Promise.resolve() };
      scan.promise = runScan(parent, jwt, full, controller.signal).finally(() => {
        clearTimeout(hard);
        if (inflight.get(key) === scan) inflight.delete(key);
      });
      scan.promise.catch(() => undefined);
      inflight.set(key, scan);
      entry = scan;
      started = true;
    }
    const scan = entry;
    scan.waiters += 1;
    let settled = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(new Error("aborted"));
        if (signal?.aborted) return onAbort();
        signal?.addEventListener("abort", onAbort, { once: true });
        scan.promise.then(resolve, reject).finally(() => signal?.removeEventListener("abort", onAbort));
      });
      settled = true;
    } finally {
      scan.waiters -= 1;
      if (scan.waiters === 0 && !settled) scan.controller.abort();
    }
    return { started };
  };

  return async (parent: string, child: string, jwt: string, signal?: AbortSignal): Promise<boolean> => {
    if (signal?.aborted) throw new Error("aborted");
    const has = () => records.get(parent)?.children.has(child) === true;
    if (has()) return true;
    const key = `${parent}\u0000${child}`;
    const miss = misses.get(key);
    if (miss && miss.until > now()) {
      if (miss.error) throw miss.error;
      return false;
    }
    const noteMiss = (entry: { until: number; error?: Error }) => {
      if (ttl <= 0) return;
      if (misses.size >= CHILD_CACHE_MAX) {
        const oldest = misses.keys().next().value;
        if (oldest !== undefined) misses.delete(oldest);
      }
      misses.set(key, entry);
    };
    try {
      const arrival = seq;
      const first = await attempt(parent, jwt, false, -1, signal);
      if (has()) return true;
      // A scan already running when this call came in may have read to a tail
      // that predates the child: one more, begun after the call arrived.
      if (!first.started) {
        await attempt(parent, jwt, false, arrival, signal);
        if (has()) return true;
      }
      if (window > 0 && records.get(parent)?.complete !== true) {
        await attempt(parent, jwt, true, -1, signal);
        if (has()) return true;
      }
      noteMiss({ until: now() + ttl });
      return false;
    } catch (err) {
      if (!signal?.aborted && err instanceof Error) noteMiss({ until: now() + ttl, error: err });
      throw err;
    }
  };
}

/** A one-shot check of `parent`'s whole stream from the start, with nothing remembered. */
export async function streamHasSubagentCall(
  parent: string,
  child: string,
  jwt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return createChildVerifier({ fetch: fetchImpl, windowEvents: 0, negativeTtlMs: 0 })(parent, child, jwt);
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
  if (method === "GET") return null;
  const match = /^session\/([^/]+)(?:\/[^/]+)?$/.exec(suffix);
  if (!match || !isChild(match[1])) return null;
  return { status: 403, error: "child_session_readonly" };
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
  signal?: AbortSignal,
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
    if (!(await deps.verify(parent, child, channelJwt(bot), signal))) return refused;
    if (deps.cache.size >= CHILD_CACHE_MAX) {
      const oldest = deps.cache.keys().next().value;
      if (oldest !== undefined) deps.cache.delete(oldest);
    }
    deps.cache.set(key, true);
  }
  if (childBot === null) deps.bind(child, parent, bot);
  return { ok: true, jwt: channelJwt(bot), bound: bot, body: null };
}
