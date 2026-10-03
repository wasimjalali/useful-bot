import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { channelAuth } from "../agent/lib/channel-auth.ts";
import { authorizeChildStream, authorizeEveCall, carryOverReader, childWriteRefusal, type ChildStreamDeps } from "../web/lib/eve-session-auth.ts";
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
// a root session of this or another bot, is recorded under a different parent,
// or is recorded for another bot; the child has no row yet (the agent hook has
// not landed): a retryable answer, never a read, never a bind by the proxy;
// a store that cannot be read is loud.

function childDeps(over: Partial<ChildStreamDeps> = {}): ChildStreamDeps {
  const owners = new Map<string, string>([
    ["p1", "bot-a"], ["p2", "bot-b"], ["root-a", "bot-a"],
    ["kid-1", "bot-a"], ["kid-b", "bot-b"], ["kid-other", "bot-a"], ["kid-old", "bot-a"], ["nested", "bot-a"],
  ]);
  const parents = new Map<string, string>([["kid-1", "p1"], ["kid-b", "p2"], ["kid-other", "p9"], ["kid-old", "p1"], ["nested", "kid-old"]]);
  return {
    resolveBot: (id) => owners.get(id) ?? null,
    readParent: (id) => parents.get(id) ?? null,
    ...over,
  };
}

test("a child stream is read only when the durable binding makes it a child of a session the bot owns", async () => {
  await withSecret(() => {
    const ok = authorizeChildStream("p1", "kid-1", childDeps());
    assert.ok(ok.ok);
    assert.equal(claimsOf(ok.jwt).botId, "bot-a");
    assert.equal(ok.bound, "bot-a");
    assert.equal(ok.body, null);
  });
});

test("a child stream is refused for an unbound, foreign or nested parent and for a wrong child", async () => {
  await withSecret(() => {
    const refused = { ok: false, status: 403, error: "child_session_unverified" };
    const deps = childDeps();
    assert.deepEqual(authorizeChildStream("ghost", "kid-1", deps), { ok: false, status: 400, error: "session_unbound" });
    // The parent is bot-b's while the child is recorded for bot-a under p1.
    assert.deepEqual(authorizeChildStream("p2", "kid-1", deps), refused);
    // Nested: the parent is itself a child.
    assert.deepEqual(authorizeChildStream("kid-old", "nested", deps), refused);
    // Recorded under a different parent than the one named.
    assert.deepEqual(authorizeChildStream("p1", "kid-other", deps), refused);
    // The parent as its own child, a root session as a child, another bot's child.
    assert.deepEqual(authorizeChildStream("p1", "p1", deps), refused);
    assert.deepEqual(authorizeChildStream("p1", "root-a", deps), refused);
    assert.deepEqual(authorizeChildStream("p1", "p2", deps), refused);
    assert.deepEqual(authorizeChildStream("p1", "kid-b", deps), refused);
    // Same parent id, but the child's row names another bot than the parent's.
    const crossed = childDeps({ resolveBot: (id) => (id === "kid-1" ? "bot-b" : childDeps().resolveBot(id)) });
    assert.deepEqual(authorizeChildStream("p1", "kid-1", crossed), refused);
  });
});

test("a child with no row yet is a retryable 409, and the proxy never binds it", async () => {
  await withSecret(() => {
    let wrote = 0;
    const deps = childDeps({ resolveBot: (id) => (id === "kid-new" ? null : childDeps().resolveBot(id)) });
    Object.assign(deps, { bind: () => { wrote += 1; } });
    assert.deepEqual(authorizeChildStream("p1", "kid-new", deps), { ok: false, status: 409, error: "child_session_pending" });
    assert.equal(wrote, 0);
    // A store that cannot be read is loud, not "pending" or "refused".
    assert.throws(() => authorizeChildStream("p1", "kid-1", childDeps({ readParent: () => { throw new Error("session_owners_locked"); } })), /session_owners_locked/);
  });
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

