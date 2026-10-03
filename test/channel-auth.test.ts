import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { channelAuth } from "../agent/lib/channel-auth.ts";
import { authorizeChildStream, authorizeEveCall, carryOverReader, childWriteRefusal, createChildVerifier, streamHasSubagentCall, type ChildStreamDeps } from "../web/lib/eve-session-auth.ts";
import { channelJwt } from "../web/lib/agent-exec.ts";
import type { ShellStore } from "../shared/shell-store.ts";

const SECRET = "channel-auth-test-secret";
const EVE = "http://127.0.0.1:4420";

function sign(claims: Record<string, unknown>, secret = SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: "desktop-app", iss: "useful-bot", aud: "useful-bot", iat: now, exp: now + 3600, ...claims,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function call(method: string, path: string, claims?: Record<string, unknown> | null): Request {
  const headers = new Headers();
  if (claims !== null) headers.set("authorization", `Bearer ${sign(claims ?? {})}`);
  return new Request(`${EVE}${path}`, { method, headers });
}

const bindings = new Map<string, string>([["sess-a", "bot-a"]]);
const roster = { bots: [{ id: "bot-a" }, { id: "bot-b" }] } as unknown as ShellStore;
const claimed: string[] = [];
const auth = channelAuth({
  secret: SECRET,
  readBot: (id) => bindings.get(id) ?? null,
  roster: () => roster,
  owners: { claim: (id) => { claimed.push(id); return "ok"; } },
});

async function refused(request: Request, message: string): Promise<void> {
  await assert.rejects(async () => auth(request), (err: unknown) => {
    assert.match(String((err as Error).message), new RegExp(message));
    return true;
  });
}

// MARK: - eve side

test("a create needs a string claim that names a roster bot", async () => {
  await refused(call("POST", "/eve/v1/session"), "bot_claim_missing");
  await refused(call("POST", "/eve/v1/session", {}), "bot_claim_missing");
  await refused(call("POST", "/eve/v1/session", { botId: "bot-ghost" }), "bot_claim_unknown");
  assert.ok(await auth(call("POST", "/eve/v1/session", { botId: "bot-b" })));
});

test("a claim that is not a string is dropped by eve, so it reads as no claim", async () => {
  await refused(call("POST", "/eve/v1/session", { botId: 7 }), "bot_claim_missing");
  await refused(call("POST", "/eve/v1/session/sess-a", { botId: 7 }), "session_bot_mismatch");
  await refused(call("GET", "/eve/v1/session/sess-a/stream", { botId: { id: "bot-a" } }), "session_bot_mismatch");
});

test("another bot's claim is refused on a continue, a stream and a cancel; the bound bot's passes", async () => {
  await refused(call("POST", "/eve/v1/session/sess-a", { botId: "bot-b" }), "session_bot_mismatch");
  await refused(call("GET", "/eve/v1/session/sess-a/stream?startIndex=0", { botId: "bot-b" }), "session_bot_mismatch");
  await refused(call("POST", "/eve/v1/session/sess-a/cancel", { botId: "bot-b" }), "session_bot_mismatch");
  await refused(call("POST", "/eve/v1/session/sess-a"), "session_bot_mismatch");
  assert.ok(await auth(call("POST", "/eve/v1/session/sess-a", { botId: "bot-a", delivery: "owner" })));
  assert.ok(await auth(call("GET", "/eve/v1/session/sess-a/stream", { botId: "bot-a" })));
  assert.ok(await auth(call("POST", "/eve/v1/session/sess-a/cancel", { botId: "bot-a" })));
});

test("an unbound session is refused, except a cancel", async () => {
  await refused(call("POST", "/eve/v1/session/sess-nobody", { botId: "bot-a" }), "session_unbound");
  await refused(call("GET", "/eve/v1/session/sess-nobody/stream", { botId: "bot-a" }), "session_unbound");
  assert.ok(await auth(call("POST", "/eve/v1/session/sess-nobody/cancel", { botId: "bot-a" })));
  assert.ok(await auth(call("POST", "/eve/v1/session/sess-nobody/cancel", {})));
  // Only a cancel: a GET on a cancel path is a stream-shaped read, not a stop.
  await refused(call("GET", "/eve/v1/session/sess-nobody/cancel", {}), "session_unbound");
});

test("health and info need a valid token and no claim; a bad or missing token never passes", async () => {
  assert.ok(await auth(call("GET", "/eve/v1/health", {})));
  assert.ok(await auth(call("GET", "/eve/v1/info", {})));
  assert.equal(await auth(call("GET", "/eve/v1/info", null)), null);
  const forged = new Request(`${EVE}/eve/v1/session/sess-a`, {
    method: "POST",
    headers: { authorization: `Bearer ${sign({ botId: "bot-a" }, "another-secret")}` },
  });
  assert.equal(await auth(forged), null);
});

test("a binding that cannot be read, or an owner clash, is refused", async () => {
  const broken = channelAuth({
    secret: SECRET,
    readBot: () => { throw new Error("session_owners_locked"); },
    roster: () => roster,
    owners: { claim: () => "ok" },
  });
  await assert.rejects(async () => broken(call("GET", "/eve/v1/session/sess-a/stream", { botId: "bot-a" })), /session_binding_unavailable/);
  const clash = channelAuth({
    secret: SECRET,
    readBot: (id) => bindings.get(id) ?? null,
    roster: () => roster,
    owners: { claim: () => "forbidden" },
  });
  await assert.rejects(async () => clash(call("GET", "/eve/v1/session/sess-a/stream", { botId: "bot-a" })), /session_ownership/);
  const noSecret = channelAuth({ secret: "" });
  await assert.rejects(async () => noSecret(call("GET", "/eve/v1/health", {})), /channel_auth_unconfigured/);
});

// MARK: - proxy side

function claimsOf(jwt: string | null): Record<string, unknown> {
  assert.ok(jwt);
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

async function withSecret<T>(fn: () => T | Promise<T>): Promise<T> {
  const saved = { secret: process.env.UB_CHANNEL_JWT_SECRET, env: process.env.UB_CHANNEL_JWT };
  process.env.UB_CHANNEL_JWT_SECRET = SECRET;
  delete process.env.UB_CHANNEL_JWT;
  try {
    return await fn();
  } finally {
    if (saved.secret === undefined) delete process.env.UB_CHANNEL_JWT_SECRET; else process.env.UB_CHANNEL_JWT_SECRET = saved.secret;
    if (saved.env !== undefined) process.env.UB_CHANNEL_JWT = saved.env;
  }
}

test("the proxy mints a stream read with the bound bot's claim, whatever the caller says", async () => {
  await withSecret(() => {
    const made = authorizeEveCall("GET", "session/sess-a/stream", null, (id) => bindings.get(id) ?? null);
    assert.ok(made.ok);
    assert.equal(claimsOf(made.jwt).botId, "bot-a");
    assert.equal(made.bound, "bot-a");
    const stop = authorizeEveCall("POST", "session/sess-a/cancel", "", (id) => bindings.get(id) ?? null);
    assert.ok(stop.ok);
    assert.equal(claimsOf(stop.jwt).botId, "bot-a");
  });
});

test("a continue naming another bot is refused before any eve call, and the bound bot is pinned", async () => {
  await withSecret(async () => {
    const real = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => { fetched += 1; return new Response("{}"); }) as typeof fetch;
    try {
      const refusal = authorizeEveCall("POST", "session/sess-a", JSON.stringify({ botId: "bot-b", message: "hi" }), (id) => bindings.get(id) ?? null);
      assert.deepEqual(refusal, { ok: false, status: 400, error: "session_bot_mismatch" });
      assert.equal(fetched, 0);
      const ok = authorizeEveCall("POST", "session/sess-a", JSON.stringify({ message: "hi" }), (id) => bindings.get(id) ?? null);
      assert.ok(ok.ok);
      assert.equal((JSON.parse(ok.body ?? "") as { botId?: string }).botId, "bot-a");
      assert.equal(claimsOf(ok.jwt).botId, "bot-a");
    } finally {
      globalThis.fetch = real;
    }
  });
});

test("an unbound session is a 400 on a continue and a stream, and a claimless cancel; a create is minted later", async () => {
  await withSecret(() => {
    const none = () => null;
    assert.deepEqual(authorizeEveCall("POST", "session/x", JSON.stringify({ botId: "bot-a" }), none), { ok: false, status: 400, error: "session_unbound" });
    assert.deepEqual(authorizeEveCall("GET", "session/x/stream", null, none), { ok: false, status: 400, error: "session_unbound" });
    const stop = authorizeEveCall("POST", "session/x/cancel", "", none);
    assert.ok(stop.ok);
    assert.equal("botId" in claimsOf(stop.jwt), false);
    const create = authorizeEveCall("POST", "session", JSON.stringify({ botId: "bot-a" }), () => { throw new Error("never read"); });
    assert.ok(create.ok);
    assert.equal(create.jwt, null);
    const health = authorizeEveCall("GET", "health", null, none);
    assert.ok(health.ok);
    assert.equal("botId" in claimsOf(health.jwt), false);
  });
});

test("a token needs the channel secret: the baked env token is no fallback, and delivery rides along", async () => {
  await withSecret(() => {
    assert.equal(claimsOf(channelJwt("bot-a", "handoff")).delivery, "handoff");
    assert.equal(claimsOf(channelJwt("bot-a", "routine")).delivery, "routine");
    assert.equal(claimsOf(channelJwt("bot-b")).botId, "bot-b");
    assert.equal(channelJwt("bot-a", "routine"), channelJwt("bot-a", "routine"), "cached per bot and delivery");
    assert.notEqual(channelJwt("bot-a", "routine"), channelJwt("bot-a", "handoff"));
    delete process.env.UB_CHANNEL_JWT_SECRET;
    process.env.UB_CHANNEL_JWT = "baked-env-token";
    try {
      assert.throws(() => channelJwt("bot-a"), /channel_credential_missing/);
    } finally {
      delete process.env.UB_CHANNEL_JWT;
    }
  });
});

test("a carry-over reads the old session only as the bot that owns it", async () => {
  await withSecret(() => {
    const resolve = (id: string) => (id === "sess-a" ? "bot-a" : id === "sess-b" ? "bot-b" : null);
    const refused = { ok: false, status: 400, error: "continue_from_refused" };
    // No owner bot for the continuing chat: no token is minted.
    assert.deepEqual(carryOverReader("sess-a", null, resolve), refused);
    assert.deepEqual(carryOverReader("sess-a", "", resolve), refused);
    // The old session is bound to another bot, or to nobody.
    assert.deepEqual(carryOverReader("sess-b", "bot-a", resolve), refused);
    assert.deepEqual(carryOverReader("sess-nobody", "bot-a", resolve), refused);
    const ok = carryOverReader("sess-a", "bot-a", resolve);
    assert.ok(ok.ok);
    assert.equal(claimsOf(ok.jwt).botId, "bot-a");
    // A bot id is never empty, so a null subject cannot reach the signer.
    assert.throws(() => channelJwt(""), /channel_bot_missing/);
  });
});

// MARK: - child session streams
//
// Failure modes, written before the code: the parent is unbound, bound to
// another bot, or itself a child (a nested read); the child is the parent, is
// a root session of this or another bot, is already bound as a child of a
// different parent, or is claimed by another bot; the parent's stream does not
// list the child, lists it under a different parent session (the event's own
// sessionId), is cut off or cannot be read (fail closed, not open); a cache
// hit must not skip the parent checks; a verified child is bound as the
// parent's bot so eve answers, and only then is a token minted.

function childDeps(over: Partial<ChildStreamDeps> = {}): ChildStreamDeps & { binds: string[]; state: { verifies: number } } {
  const owners = new Map<string, string>([["p1", "bot-a"], ["p2", "bot-b"], ["root-a", "bot-a"], ["kid-old", "bot-a"]]);
  const parents = new Map<string, string>([["kid-old", "p1"], ["nested", "kid-old"], ["nested-b", "kid-old"]]);
  owners.set("nested", "bot-a");
  const state = { binds: [] as string[], verifies: 0 };
  const deps: ChildStreamDeps = {
    resolveBot: (id) => owners.get(id) ?? null,
    readParent: (id) => parents.get(id) ?? null,
    verify: async (parent, child) => { state.verifies += 1; return parent === "p1" && (child === "kid-1" || child === "kid-old"); },
    bind: (child, parent, bot) => { state.binds.push(`${child}<${parent}:${bot}`); owners.set(child, bot); parents.set(child, parent); },
    cache: new Map(),
    ...over,
  };
  return Object.assign(deps, { binds: state.binds, state });
}

test("a child stream is read only when it is a verified child of a session bound to the bot", async () => {
  await withSecret(async () => {
    const deps = childDeps();
    const ok = await authorizeChildStream("p1", "kid-1", deps);
    assert.ok(ok.ok);
    assert.equal(claimsOf(ok.jwt).botId, "bot-a");
    assert.equal(ok.bound, "bot-a");
    assert.deepEqual(deps.binds, ["kid-1<p1:bot-a"]);
    assert.equal(deps.state.verifies, 1);
    // A second read is served from the cache, with the same binding check.
    const again = await authorizeChildStream("p1", "kid-1", deps);
    assert.ok(again.ok);
    assert.equal(deps.state.verifies, 1);
    assert.equal(deps.binds.length, 1);
  });
});

test("a child stream is refused for an unbound, foreign or nested parent, and a bad child", async () => {
  await withSecret(async () => {
    const refused = { ok: false, status: 403, error: "child_session_unverified" };
    const deps = childDeps();
    // The parent is unbound: the same 400 a normal stream read gets.
    assert.deepEqual(await authorizeChildStream("ghost", "kid-1", deps), { ok: false, status: 400, error: "session_unbound" });
    // Parent bound to another bot while the child is bot-a's: the child is not under a bot-a session.
    assert.deepEqual(await authorizeChildStream("p2", "kid-1", deps), refused);
    // Nested: the parent is itself a child.
    assert.deepEqual(await authorizeChildStream("kid-old", "nested", deps), refused);
    // A child under a different parent than the one named.
    assert.deepEqual(await authorizeChildStream("p1", "nested-b", deps), refused);
    // Not in the parent's stream.
    assert.deepEqual(await authorizeChildStream("p1", "kid-9", deps), refused);
    // The parent as its own child, and a root session as a child.
    assert.deepEqual(await authorizeChildStream("p1", "p1", deps), refused);
    assert.deepEqual(await authorizeChildStream("p1", "root-a", deps), refused);
    assert.deepEqual(await authorizeChildStream("p1", "p2", deps), refused);
    assert.deepEqual(deps.binds, []);
  });
});

test("an unreadable parent stream refuses the child; a cache hit still checks the parent", async () => {
  await withSecret(async () => {
    const down = childDeps({ verify: async () => { throw new Error("eve_stream_500"); } });
    await assert.rejects(authorizeChildStream("p1", "kid-1", down), /eve_stream_500/);
    assert.deepEqual(down.binds, []);
    // Verified once, then the parent's binding changes under the cache: refused again.
    const deps = childDeps();
    assert.ok((await authorizeChildStream("p1", "kid-1", deps)).ok);
    const moved = { ...deps, resolveBot: (id: string) => (id === "p1" ? "bot-b" : deps.resolveBot(id)) };
    assert.deepEqual(await authorizeChildStream("p1", "kid-1", moved), { ok: false, status: 403, error: "child_session_unverified" });
    // The cache is bounded.
    const small = childDeps({ verify: async () => true, cache: new Map() });
    for (let i = 0; i < 700; i++) await authorizeChildStream("p1", `kid-${i}`, small);
    assert.ok(small.cache.size <= 512);
  });
});

function ndjson(events: unknown[], tail?: number): Response {
  const headers = new Headers({ "content-type": "application/x-ndjson" });
  if (tail !== undefined) headers.set("x-eve-stream-tail-index", String(tail));
  return new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", { headers });
}
const called = (sessionId: string, childSessionId: string) => ({ type: "subagent.called", data: { sessionId, childSessionId, callId: "c" } });

test("the parent's stream is scanned for a subagent.called naming this parent and child", async () => {
  const events = [
    { type: "turn.started", data: {} },
    called("p1", "kid-1"),
    { type: "message.completed", data: {} },
  ];
  const fetching = (response: () => Response) => (async () => response()) as unknown as typeof fetch;
  assert.equal(await streamHasSubagentCall("p1", "kid-1", "jwt", fetching(() => ndjson(events, 2))), true);
  // Same child under a different parent's event: not a match.
  assert.equal(await streamHasSubagentCall("p1", "kid-1", "jwt", fetching(() => ndjson([called("p9", "kid-1")], 0))), false);
  // A grandchild call re-emitted on the parent stream names the child as its session.
  assert.equal(await streamHasSubagentCall("p1", "kid-2", "jwt", fetching(() => ndjson([called("kid-1", "kid-2")], 0))), false);
  // Another event type carrying the same fields is not a delegation.
  assert.equal(await streamHasSubagentCall("p1", "kid-1", "jwt", fetching(() => ndjson([{ type: "subagent.completed", data: { sessionId: "p1", childSessionId: "kid-1" } }], 0))), false);
  // A line that does not parse is skipped, not fatal; the match after it counts.
  const noisy = new Response(`not json\n${JSON.stringify(called("p1", "kid-1"))}\n`, { headers: { "x-eve-stream-tail-index": "1" } });
  assert.equal(await streamHasSubagentCall("p1", "kid-1", "jwt", fetching(() => noisy)), true);
  // An error status is loud, never read as "not a child".
  await assert.rejects(streamHasSubagentCall("p1", "kid-1", "jwt", fetching(() => new Response("no", { status: 500 }))), /eve_stream_500/);
  // The read is as the bot, from the start of the parent stream.
  let seen = "";
  let auth = "";
  await streamHasSubagentCall("p1", "kid-1", "jwt-x", (async (url: string, init: RequestInit) => {
    seen = String(url);
    auth = String((init.headers as Record<string, string>).authorization);
    return ndjson(events, 2);
  }) as unknown as typeof fetch);
  assert.match(seen, /\/eve\/v1\/session\/p1\/stream\?startIndex=0&includeTailIndex=1$/);
  assert.equal(auth, "Bearer jwt-x");
});

// MARK: - review round 1
//
// Failure modes: (1) a send into a child that was unbound when the request
// arrived but is recorded by the time it is authorised, and a cancel into a
// child, must be refused by the authorisation itself, in whatever order the
// requests land; (2) a long parent must still verify a new child (a window
// from the tail, then only new events), and only an exact subagent.called
// raised by the parent may add to its record; (3) many concurrent checks
// share one scan, scans are bounded globally, a miss is remembered briefly,
// and a client that went away stops the read.

test("a send or cancel into a recorded child is refused by the authorisation, whatever the order", async () => {
  await withSecret(() => {
    const resolve = (id: string) => (id === "kid" || id === "sess-a" ? "bot-a" : null);
    let recorded = false;
    const isChild = (id: string) => id === "kid" && recorded;
    const body = JSON.stringify({ message: "hi" });
    // The send arrives while the child is unbound-as-child (passes the early guard) ...
    assert.equal(childWriteRefusal("POST", "session/kid", isChild), null);
    // ... a GET records it, and the authorisation that follows the slow body read refuses.
    recorded = true;
    const late = authorizeEveCall("POST", "session/kid", body, resolve, isChild);
    assert.deepEqual(late, { ok: false, status: 403, error: "child_session_readonly" });
    assert.deepEqual(authorizeEveCall("POST", "session/kid/cancel", "", resolve, isChild), { ok: false, status: 403, error: "child_session_readonly" });
    assert.deepEqual(authorizeEveCall("POST", "session/kid", JSON.stringify({ inputResponses: [{ requestId: "r", optionId: "stop" }] }), resolve, isChild), { ok: false, status: 403, error: "child_session_readonly" });
    // The same check just before forwarding.
    assert.deepEqual(childWriteRefusal("POST", "session/kid/cancel", isChild), { status: 403, error: "child_session_readonly" });
    // A root session and a read are not affected.
    assert.ok(authorizeEveCall("POST", "session/sess-a", body, resolve, isChild).ok);
    assert.equal(childWriteRefusal("GET", "session/kid/stream", isChild), null);
    assert.equal(childWriteRefusal("POST", "session", isChild), null);
    // A store that cannot be read is loud, not "not a child".
    assert.throws(() => authorizeEveCall("POST", "session/sess-a", body, resolve, () => { throw new Error("session_owners_locked"); }), /session_owners_locked/);
  });
});

type Stream = { events: unknown[] };
function streams(table: Record<string, Stream>) {
  const log: Array<{ parent: string; start: number; signal: AbortSignal | null | undefined }> = [];
  let live = 0;
  let peak = 0;
  const impl = (async (url: string, init: RequestInit) => {
    const m = /session\/([^/]+)\/stream\?startIndex=(-?\d+)&includeTailIndex=1$/.exec(String(url));
    assert.ok(m, String(url));
    const parent = m[1];
    const start = Number(m[2]);
    log.push({ parent, start, signal: init.signal });
    const events = table[parent]?.events ?? [];
    const from = start < 0 ? Math.max(0, events.length + start) : start;
    live += 1;
    peak = Math.max(peak, live);
    await new Promise((resolve) => setTimeout(resolve, 5));
    live -= 1;
    const lines = events.slice(from).map((event) => JSON.stringify(event)).join("\n");
    return new Response(lines ? `${lines}\n` : "", { headers: { "x-eve-stream-tail-index": String(events.length - 1) } });
  }) as unknown as typeof fetch;
  return { impl, log, peak: () => peak };
}
const filler = (n: number) => Array.from({ length: n }, () => ({ type: "message.appended", data: {} }));

test("a long parent verifies from a tail window, then only the new events, and widens once", async () => {
  const table: Record<string, Stream> = { p: { events: [called("p", "kid-old"), ...filler(30), called("p", "kid-1"), ...filler(5)] } };
  const feed = streams(table);
  const verify = createChildVerifier({ fetch: feed.impl, windowEvents: 10, negativeTtlMs: 0 });
  assert.equal(await verify("p", "kid-1", "jwt"), true);
  // kid-1 sits 6 events from the tail: the window found it, no widening.
  assert.equal(feed.log.length, 1);
  assert.equal(feed.log[0].start, -10);
  // A known child needs no read at all.
  assert.equal(await verify("p", "kid-1", "jwt"), true);
  assert.equal(feed.log.length, 1);
  // A child older than the window: widen to the start once.
  assert.equal(await verify("p", "kid-old", "jwt"), true);
  // (an incremental look past the window's end first, then the widening)
  assert.deepEqual(feed.log.map((entry) => entry.start), [-10, 37, 0]);
  // After a full read, a new child is looked for only past what was read.
  table.p.events.push(called("p", "kid-2"));
  const before = feed.log.length;
  assert.equal(await verify("p", "kid-2", "jwt"), true);
  assert.equal(feed.log.length, before + 1);
  assert.equal(feed.log[before].start, table.p.events.length - 1);
  // An unknown child costs one incremental read and is a refusal, not a widening.
  assert.equal(await verify("p", "kid-ghost", "jwt"), false);
  assert.equal(feed.log.length, before + 2);
  assert.equal(feed.log[before + 1].start, table.p.events.length);
});

test("only an exact subagent.called raised by the parent adds to its record", async () => {
  const table: Record<string, Stream> = {
    p: {
      events: [
        called("kid-1", "grand"),
        { type: "subagent.completed", data: { sessionId: "p", childSessionId: "fake-1" } },
        { type: "message.completed", data: { sessionId: "p", childSessionId: "fake-2" } },
        { type: "subagent.called", data: { childSessionId: "fake-3" } },
        { type: "subagent.called", data: { sessionId: "p" } },
        { type: "subagent.called", data: { sessionId: "p", childSessionId: 7 } },
        called("other", "fake-4"),
        called("p", "real"),
      ],
    },
  };
  const verify = createChildVerifier({ fetch: streams(table).impl, windowEvents: 100, negativeTtlMs: 0 });
  for (const id of ["grand", "fake-1", "fake-2", "fake-3", "fake-4", "7"]) assert.equal(await verify("p", id, "jwt"), false, id);
  assert.equal(await verify("p", "real", "jwt"), true);
});

test("concurrent checks of one parent share a scan, scans are bounded, a miss is remembered and an abort stops the read", async () => {
  const table: Record<string, Stream> = {};
  for (let i = 0; i < 8; i++) table[`p${i}`] = { events: [called(`p${i}`, `k${i}`), ...filler(3)] };
  const feed = streams(table);
  const verify = createChildVerifier({ fetch: feed.impl, windowEvents: 100, maxConcurrent: 2, negativeTtlMs: 0 });
  // Many children asked of one parent at once: one read.
  table.p0.events.push(...Array.from({ length: 5 }, (_, i) => called("p0", `extra${i}`)));
  const same = await Promise.all(["k0", "extra0", "extra1", "extra2", "extra3", "extra4"].map((id) => verify("p0", id, "jwt")));
  assert.deepEqual(same, [true, true, true, true, true, true]);
  assert.equal(feed.log.length, 1);
  // Eight parents at once: never more than two reads in flight.
  const many = await Promise.all(Array.from({ length: 8 }, (_, i) => verify(`p${i}`, `k${i}`, "jwt")));
  assert.deepEqual(many, Array(8).fill(true));
  assert.ok(feed.peak() <= 2, `peak ${feed.peak()}`);

  // A miss is remembered for the TTL, then looked up again.
  let clock = 1000;
  const miss = streams({ q: { events: filler(2) } });
  const timed = createChildVerifier({ fetch: miss.impl, windowEvents: 100, negativeTtlMs: 10_000, now: () => clock });
  assert.equal(await timed("q", "nope", "jwt"), false);
  assert.equal(await timed("q", "nope", "jwt"), false);
  assert.equal(miss.log.length, 1);
  clock += 10_001;
  assert.equal(await timed("q", "nope", "jwt"), false);
  assert.equal(miss.log.length, 2);

  // A failed read is loud, and is remembered for the TTL too.
  let calls = 0;
  const broken = createChildVerifier({
    fetch: (async () => { calls += 1; return new Response("no", { status: 500 }); }) as unknown as typeof fetch,
    negativeTtlMs: 10_000,
    now: () => clock,
  });
  await assert.rejects(broken("q", "x", "jwt"), /eve_stream_500/);
  await assert.rejects(broken("q", "x", "jwt"), /eve_stream_500/);
  assert.equal(calls, 1);

  // The caller went away: its wait ends and, with nobody left, the eve read is aborted.
  const slow = streams({ z: { events: filler(2) } });
  const aborting = createChildVerifier({ fetch: slow.impl, negativeTtlMs: 0 });
  const gone = new AbortController();
  const pending = aborting("z", "k", "jwt", gone.signal);
  await new Promise((resolve) => setTimeout(resolve, 1));
  gone.abort();
  await assert.rejects(pending, /aborted/);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(slow.log[0]?.signal?.aborted, true);
  // An already-aborted caller never starts a read.
  const before = slow.log.length;
  await assert.rejects(aborting("z", "k2", "jwt", gone.signal), /aborted/);
  assert.equal(slow.log.length, before);
});
