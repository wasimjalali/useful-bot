import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  cancelChatGptSignIn,
  completeChatGptSignIn,
  pollChatGptSignIn,
  refreshChatGptCredential,
  revokeChatGptCredential,
  startChatGptSignIn,
} from "../shared/chatgpt-signin.ts";
import { accessTokenFor } from "../shared/provider-oauth.ts";
import { publicProviders, setOAuthCredential, emptyProviderStore, type Credential } from "../shared/providers.ts";

/*
 * Failure list, written before the module (global rule). Every line is a way
 * the official Sign in with ChatGPT flow can go wrong, and each has a case below:
 *  1  callback state does not match: refused, attempt stays pending, no network call
 *  2  access_denied: settles denied, no code exchange
 *  3  new registration whose callback has no client_id: chatgpt_registration_incomplete
 *  4  reauth callback with another client_id: chatgpt_client_mismatch
 *  5  token endpoint answers 400 invalid_grant: chatgpt_token_exchange
 *  6  ID token with a bad signature, wrong iss, wrong aud, expired, wrong nonce
 *     or unknown kid: chatgpt_id_token_invalid, nothing stored
 *  7  chatgpt.tokens.use.direct not granted: chatgpt_plan_not_enabled, needsConsent
 *     saved, next authorize URL carries prompt=consent and the saved client_id
 *  8  another subject on reauth: chatgpt_account_mismatch, registration cleared,
 *     next start registers fresh
 *  9  expired attempt: expired, a late callback is refused
 * 10  cancel, then callback: refused
 * 11  second start supersedes the first, the first callback is refused
 * 12  replayed callback after completion: refused
 * 13  authorize URL: every parameter present and encoded, agent_name_hint only on first
 *     registration, id_token_hint only with a live credential, login_hint from the
 *     saved email, loopback redirect_uri exactly, host id stable
 * 14  refresh: issued client_id + resource as a form, rotating refresh token, failure
 *     throws oauth_refresh
 * 15  revoke: 200 confirmed, 500 then 200 confirmed, 400 not confirmed
 * 16  a Codex-era credential without clientId reports expired
 */

const ISSUER = "https://auth.openai.com";
const TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token";
const REVOKE_URL = "https://auth.openai.com/api/accounts/oauth/revoke";
const JWKS_URL = "https://auth.openai.com/.well-known/jwks.json";
const PORT = 4777;
const REDIRECT = `http://127.0.0.1:${PORT}/auth/callback`;
const ALL_SCOPES = "chatgpt.tokens.use.direct email offline_access openid profile resource.invoke";

const KID = "test-kid-1";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

function box(): string {
  const dir = mkdtempSync(join(tmpdir(), "ub-chatgpt-"));
  const path = join(dir, "chatgpt-signin.json");
  process.env.UB_CHATGPT_SIGNIN_PATH = path;
  process.env.UB_WEB_PORT = String(PORT);
  return path;
}

test.afterEach(() => {
  delete process.env.UB_CHATGPT_SIGNIN_PATH;
  delete process.env.UB_WEB_PORT;
});

function b64(value: unknown): string {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function mint(claims: Record<string, unknown>, opts: { kid?: string; key?: typeof pair.privateKey } = {}): string {
  const head = b64({ alg: "RS256", typ: "JWT", kid: opts.kid ?? KID });
  const body = b64(claims);
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(opts.key ?? pair.privateKey).toString("base64url")}`;
}

interface Server {
  calls: Array<{ url: string; form: URLSearchParams | null }>;
  /** The nonce of the attempt being answered, set by signIn(). */
  nonce: string;
  sub: string;
  email: string | null;
  scope: string;
  clientId: string;
  idTokenOverrides: Record<string, unknown>;
  idTokenKid: string;
  idTokenKey: typeof pair.privateKey;
  tokenStatus: number;
  refreshToken: string;
  revokeStatuses: number[];
  fetch: typeof fetch;
}

function authServer(): Server {
  const server: Server = {
    calls: [],
    nonce: "",
    sub: "sub-alice",
    email: "alice@example.com",
    scope: ALL_SCOPES,
    clientId: "oaiapp_alice",
    idTokenOverrides: {},
    idTokenKid: KID,
    idTokenKey: pair.privateKey,
    tokenStatus: 200,
    refreshToken: "refresh-1",
    revokeStatuses: [200],
    fetch: async (input, init) => {
      const url = String(input);
      const body = init?.body;
      const form = typeof body === "string" ? new URLSearchParams(body) : body instanceof URLSearchParams ? body : null;
      server.calls.push({ url, form });
      const headers = { "content-type": "application/json" };
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers });
      if (url === REVOKE_URL) {
        const status = server.revokeStatuses.length > 1 ? server.revokeStatuses.shift()! : server.revokeStatuses[0]!;
        return new Response("", { status });
      }
      if (url === TOKEN_URL) {
        if (server.tokenStatus !== 200) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), { status: server.tokenStatus, headers });
        }
        const now = Math.floor(Date.now() / 1000);
        if (form?.get("grant_type") === "refresh_token") {
          return new Response(JSON.stringify({
            access_token: `access-after-${form.get("refresh_token")}`,
            refresh_token: `${form.get("refresh_token")}-next`,
            token_type: "Bearer",
            expires_in: 3600,
            scope: server.scope,
          }), { status: 200, headers });
        }
        const idToken = mint({
          iss: ISSUER,
          aud: server.clientId,
          sub: server.sub,
          email: server.email,
          nonce: server.nonce,
          iat: now,
          exp: now + 3600,
          ...server.idTokenOverrides,
        }, { kid: server.idTokenKid, key: server.idTokenKey });
        return new Response(JSON.stringify({
          access_token: "access-1",
          refresh_token: server.refreshToken,
          id_token: idToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: server.scope,
        }), { status: 200, headers });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  };
  return server;
}

function parse(authorizeUrl: string): { url: URL; q: URLSearchParams } {
  const url = new URL(authorizeUrl);
  return { url, q: url.searchParams };
}

/** Start an attempt and learn its state and nonce the way the browser would hand them back. */
function signIn(server: Server, opts: Parameters<typeof startChatGptSignIn>[0] = {}) {
  const started = startChatGptSignIn(opts);
  const { q } = parse(started.authorizeUrl);
  server.nonce = q.get("nonce") ?? "";
  return { started, q, state: q.get("state") ?? "" };
}

function stateFile(path: string): { hostId: string; registration: Record<string, unknown> | null; pending: Record<string, unknown> | null } {
  return JSON.parse(readFileSync(path, "utf8"));
}

function oauthOf(credential: Credential | undefined) {
  assert.ok(credential && credential.kind === "oauth");
  return credential;
}

test("end to end: register, poll, sign in again, refresh and revoke", async () => {
  const path = box();
  const server = authServer();

  // 13 first registration: every parameter, encoded, no returning-user hints.
  const first = signIn(server);
  assert.equal(first.started.intervalMs, 1000);
  assert.ok(first.started.expiresAt > Date.now() + 9 * 60_000 && first.started.expiresAt <= Date.now() + 10 * 60_000);
  const { url, q } = parse(first.started.authorizeUrl);
  assert.equal(`${url.origin}${url.pathname}`, "https://auth.openai.com/api/accounts/authorize");
  assert.equal(q.get("response_type"), "code");
  assert.equal(q.get("client_id"), "dynamic_agent_client");
  assert.equal(q.get("agent_name_hint"), "Useful Bot");
  assert.match(q.get("ext_agent_host_id") ?? "", /^urn:uuid:[0-9a-f-]{36}$/);
  assert.equal(q.get("redirect_uri"), REDIRECT);
  assert.equal(q.get("scope"), "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
  assert.equal(q.get("resource"), "https://api.openai.com/v1");
  assert.equal(q.get("code_challenge_method"), "S256");
  assert.match(q.get("state") ?? "", /^[A-Za-z0-9_-]{40,}$/);
  assert.match(q.get("nonce") ?? "", /^[A-Za-z0-9_-]{40,}$/);
  assert.match(q.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
  for (const absent of ["id_token_hint", "login_hint", "prompt"]) assert.equal(q.get(absent), null);
  // Encoded: the redirect URI and the host id never appear raw in the query string.
  assert.ok(url.search.includes("redirect_uri=http%3A%2F%2F127.0.0.1%3A4777%2Fauth%2Fcallback"));
  assert.ok(url.search.includes("agent_name_hint=Useful+Bot") || url.search.includes("agent_name_hint=Useful%20Bot"));
  const hostId = q.get("ext_agent_host_id");
  assert.equal(stateFile(path).hostId, hostId);
  assert.equal(statSync(path).mode & 0o777, 0o600);

  // Pending until the callback lands.
  assert.deepEqual(pollChatGptSignIn(first.started.pollId), { status: "pending" });

  // Callback: new registration carries the issued client_id.
  const done = await completeChatGptSignIn(
    { state: first.state, code: "code-1", error: null, clientId: "oaiapp_alice" },
    server.fetch,
  );
  assert.equal(done.status, "complete");
  const credential = oauthOf(done.status === "complete" ? done.credential : undefined);
  assert.equal(credential.accessToken, "access-1");
  assert.equal(credential.refreshToken, "refresh-1");
  assert.equal(credential.accountId, null);
  assert.equal(credential.clientId, "oaiapp_alice");
  assert.equal(credential.subject, "sub-alice");
  assert.equal(credential.email, "alice@example.com");
  assert.deepEqual(credential.scopes, ALL_SCOPES.split(" "));
  assert.ok(typeof credential.idToken === "string" && credential.idToken.split(".").length === 3);
  assert.ok((credential.expiresAt ?? 0) > Date.now() + 3_000_000);

  // The exchange: a form with the issued id, the same redirect, the PKCE verifier and no secret.
  const exchange = server.calls.find((call) => call.url === TOKEN_URL)!.form!;
  assert.equal(exchange.get("grant_type"), "authorization_code");
  assert.equal(exchange.get("client_id"), "oaiapp_alice");
  assert.equal(exchange.get("code"), "code-1");
  assert.equal(exchange.get("redirect_uri"), REDIRECT);
  assert.equal(exchange.get("resource"), "https://api.openai.com/v1");
  assert.equal(exchange.get("client_secret"), null);
  assert.equal(createHash("sha256").update(exchange.get("code_verifier") ?? "").digest("base64url"), q.get("code_challenge"));

  // Poll reports complete once, then the row is gone.
  assert.deepEqual(pollChatGptSignIn(first.started.pollId), { status: "complete" });
  assert.throws(() => pollChatGptSignIn(first.started.pollId), /oauth_poll_unknown/);

  // The registration survives; the connection is ok in the providers payload.
  assert.deepEqual(stateFile(path).registration, {
    clientId: "oaiapp_alice",
    subject: "sub-alice",
    email: "alice@example.com",
    needsConsent: false,
  });
  const store = setOAuthCredential(emptyProviderStore(), "openai", credential);
  const row = publicProviders(store).connections.find((c) => c.id === "openai:oauth")!;
  assert.equal(row.status, "ok");
  assert.equal(row.accountLabel, "alice@example.com");

  // 13 returning sign-in: saved client id, login hint, no agent name, same host id.
  const again = signIn(server);
  assert.equal(again.q.get("client_id"), "oaiapp_alice");
  assert.equal(again.q.get("login_hint"), "alice@example.com");
  assert.equal(again.q.get("agent_name_hint"), null);
  assert.equal(again.q.get("id_token_hint"), null);
  assert.equal(again.q.get("prompt"), null);
  assert.equal(again.q.get("ext_agent_host_id"), hostId);
  // id_token_hint only with a live credential for the same client id.
  const hinted = signIn(server, { storedCredential: credential });
  assert.equal(hinted.q.get("id_token_hint"), credential.idToken);
  const foreign = signIn(server, { storedCredential: { ...credential, clientId: "oaiapp_other" } });
  assert.equal(foreign.q.get("id_token_hint"), null);
  const legacy = signIn(server, { storedCredential: { ...credential, idToken: undefined } });
  assert.equal(legacy.q.get("id_token_hint"), null);

  // 14 refresh: issued client id + resource as a form, rotating tokens.
  const refreshed = oauthOf(await refreshChatGptCredential(credential, server.fetch));
  const refreshForm = server.calls.filter((call) => call.url === TOKEN_URL).at(-1)!.form!;
  assert.equal(refreshForm.get("grant_type"), "refresh_token");
  assert.equal(refreshForm.get("client_id"), "oaiapp_alice");
  assert.equal(refreshForm.get("refresh_token"), "refresh-1");
  assert.equal(refreshForm.get("resource"), "https://api.openai.com/v1");
  assert.equal(refreshForm.get("scope"), null);
  assert.equal(refreshed.accessToken, "access-after-refresh-1");
  assert.equal(refreshed.refreshToken, "refresh-1-next");
  assert.equal(refreshed.clientId, "oaiapp_alice");
  assert.equal(refreshed.subject, "sub-alice");
  assert.equal(refreshed.idToken, credential.idToken);
  assert.deepEqual(refreshed.scopes, ALL_SCOPES.split(" "));
  assert.ok((refreshed.expiresAt ?? 0) > Date.now() + 3_000_000);
  server.tokenStatus = 400;
  await assert.rejects(() => refreshChatGptCredential(refreshed, server.fetch), /oauth_refresh/);
  await assert.rejects(() => refreshChatGptCredential({ ...refreshed, refreshToken: null }, server.fetch), /oauth_refresh/);
  server.tokenStatus = 200;

  // 15 revoke: a form with the token, the hint and the client id.
  assert.equal(await revokeChatGptCredential(refreshed, server.fetch, 5), true);
  const revokeForm = server.calls.filter((call) => call.url === REVOKE_URL).at(-1)!.form!;
  assert.equal(revokeForm.get("token"), "refresh-1-next");
  assert.equal(revokeForm.get("token_type_hint"), "refresh_token");
  assert.equal(revokeForm.get("client_id"), "oaiapp_alice");
});

test("1 state mismatch is refused, leaves the attempt pending and makes no network call", async () => {
  box();
  const server = authServer();
  const { started } = signIn(server);
  const out = await completeChatGptSignIn({ state: "not-the-state", code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.deepEqual(out, { status: "refused", error: "chatgpt_state_mismatch" });
  assert.equal(server.calls.length, 0);
  assert.deepEqual(pollChatGptSignIn(started.pollId), { status: "pending" });
  // No pending attempt at all is refused the same way.
  cancelChatGptSignIn(started.pollId);
  const none = await completeChatGptSignIn({ state: "x", code: "c", error: null, clientId: null }, server.fetch);
  assert.deepEqual(none, { status: "refused", error: "chatgpt_state_mismatch" });
});

test("2 access_denied settles denied without an exchange; other errors settle chatgpt_signin_refused", async () => {
  box();
  const server = authServer();
  const a = signIn(server);
  const denied = await completeChatGptSignIn({ state: a.state, code: null, error: "access_denied", clientId: null }, server.fetch);
  assert.deepEqual(denied, { status: "denied" });
  assert.deepEqual(pollChatGptSignIn(a.started.pollId), { status: "denied" });
  const b = signIn(server);
  const other = await completeChatGptSignIn({ state: b.state, code: null, error: "server_error", clientId: null }, server.fetch);
  assert.deepEqual(other, { status: "error", error: "chatgpt_signin_refused" });
  assert.deepEqual(pollChatGptSignIn(b.started.pollId), { status: "error", error: "chatgpt_signin_refused" });
  assert.equal(server.calls.length, 0);
});

test("3 a new registration without client_id is incomplete and never saves dynamic_agent_client", async () => {
  const path = box();
  const server = authServer();
  const a = signIn(server);
  const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: null }, server.fetch);
  assert.deepEqual(out, { status: "error", error: "chatgpt_registration_incomplete" });
  assert.equal(server.calls.length, 0);
  assert.equal(stateFile(path).registration, null);
  assert.ok(!readFileSync(path, "utf8").includes('"clientId":"dynamic_agent_client"'));
});

async function register(server: Server): Promise<void> {
  const a = signIn(server);
  const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: server.clientId }, server.fetch);
  assert.equal(out.status, "complete");
  pollChatGptSignIn(a.started.pollId);
  server.calls.length = 0;
}

test("4 reauth with a different client_id is a client mismatch", async () => {
  box();
  const server = authServer();
  await register(server);
  const a = signIn(server);
  const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_mallory" }, server.fetch);
  assert.deepEqual(out, { status: "error", error: "chatgpt_client_mismatch" });
  assert.equal(server.calls.length, 0);
  // The callback may also omit client_id on reauth: the saved one is used.
  const b = signIn(server);
  const ok = await completeChatGptSignIn({ state: b.state, code: "c", error: null, clientId: null }, server.fetch);
  assert.equal(ok.status, "complete");
});

test("5 a 400 invalid_grant from the token endpoint is chatgpt_token_exchange", async () => {
  const path = box();
  const server = authServer();
  server.tokenStatus = 400;
  const a = signIn(server);
  const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.deepEqual(out, { status: "error", error: "chatgpt_token_exchange" });
  assert.equal(stateFile(path).registration, null);
  assert.deepEqual(pollChatGptSignIn(a.started.pollId), { status: "error", error: "chatgpt_token_exchange" });
});

test("6 a bad ID token is rejected for each broken field and nothing is stored", async () => {
  const past = Math.floor(Date.now() / 1000) - 3600;
  const cases: Array<[string, (s: Server) => void]> = [
    ["bad signature", (s) => { s.idTokenKey = otherPair.privateKey; }],
    ["wrong iss", (s) => { s.idTokenOverrides = { iss: "https://evil.example" }; }],
    ["wrong aud", (s) => { s.idTokenOverrides = { aud: "oaiapp_someone_else" }; }],
    ["aud array without the client", (s) => { s.idTokenOverrides = { aud: ["a", "b"] }; }],
    ["expired", (s) => { s.idTokenOverrides = { exp: past }; }],
    ["wrong nonce", (s) => { s.idTokenOverrides = { nonce: "not-mine" }; }],
    ["unknown kid", (s) => { s.idTokenKid = "kid-nobody-published"; }],
    ["missing sub", (s) => { s.idTokenOverrides = { sub: "" }; }],
    ["issued in the future", (s) => { s.idTokenOverrides = { iat: Math.floor(Date.now() / 1000) + 3600 }; }],
  ];
  for (const [name, mutate] of cases) {
    const path = box();
    const server = authServer();
    mutate(server);
    const a = signIn(server);
    const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
    assert.deepEqual(out, { status: "error", error: "chatgpt_id_token_invalid" }, name);
    assert.equal(stateFile(path).registration, null, name);
    assert.deepEqual(pollChatGptSignIn(a.started.pollId), { status: "error", error: "chatgpt_id_token_invalid" }, name);
  }
  // An aud array that does contain the client id is fine.
  box();
  const server = authServer();
  server.idTokenOverrides = { aud: ["something", "oaiapp_alice"] };
  const a = signIn(server);
  const ok = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.equal(ok.status, "complete");
});

test("7 a missing chatgpt.tokens.use.direct scope stores no credential and asks for consent next time", async () => {
  const path = box();
  const server = authServer();
  server.scope = "email offline_access openid profile resource.invoke";
  const a = signIn(server);
  const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.deepEqual(out, { status: "error", error: "chatgpt_plan_not_enabled" });
  assert.deepEqual(stateFile(path).registration, {
    clientId: "oaiapp_alice",
    subject: "sub-alice",
    email: "alice@example.com",
    needsConsent: true,
  });
  const next = signIn(server);
  assert.equal(next.q.get("prompt"), "consent");
  assert.equal(next.q.get("client_id"), "oaiapp_alice");
  // Granting it clears the flag.
  server.scope = ALL_SCOPES;
  const done = await completeChatGptSignIn({ state: next.state, code: "c", error: null, clientId: null }, server.fetch);
  assert.equal(done.status, "complete");
  assert.equal(stateFile(path).registration?.needsConsent, false);
  assert.equal(signIn(server).q.get("prompt"), null);
});

test("8 another subject on reauth is an account mismatch, clears the registration and registers fresh", async () => {
  const path = box();
  const server = authServer();
  await register(server);
  server.sub = "sub-bob";
  const a = signIn(server);
  const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: null }, server.fetch);
  assert.deepEqual(out, { status: "error", error: "chatgpt_account_mismatch" });
  assert.equal(stateFile(path).registration, null);
  const fresh = signIn(server);
  assert.equal(fresh.q.get("client_id"), "dynamic_agent_client");
  assert.equal(fresh.q.get("agent_name_hint"), "Useful Bot");
  assert.equal(fresh.q.get("login_hint"), null);
});

test("9 an expired attempt reports expired and a late callback is refused", async () => {
  const path = box();
  const server = authServer();
  const a = signIn(server);
  const file = stateFile(path);
  file.pending = { ...file.pending!, expiresAt: Date.now() - 1000 };
  writeFileSync(path, JSON.stringify(file));
  const late = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.equal(late.status, "expired");
  assert.equal(server.calls.length, 0);
  assert.deepEqual(pollChatGptSignIn(a.started.pollId), { status: "expired" });
  const after = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.notEqual(after.status, "complete");
  assert.equal(server.calls.length, 0);
});

test("10 cancel, then a callback is refused", async () => {
  box();
  const server = authServer();
  const a = signIn(server);
  cancelChatGptSignIn(a.started.pollId);
  const out = await completeChatGptSignIn({ state: a.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.deepEqual(out, { status: "refused", error: "chatgpt_state_mismatch" });
  assert.equal(server.calls.length, 0);
  assert.throws(() => pollChatGptSignIn(a.started.pollId), /oauth_poll_unknown/);
});

test("11 a second start supersedes the first and the first callback is refused", async () => {
  box();
  const server = authServer();
  const first = signIn(server);
  const second = signIn(server);
  assert.notEqual(first.state, second.state);
  const stale = await completeChatGptSignIn({ state: first.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.deepEqual(stale, { status: "refused", error: "chatgpt_state_mismatch" });
  assert.equal(server.calls.length, 0);
  assert.throws(() => pollChatGptSignIn(first.started.pollId), /oauth_poll_unknown/);
  const ok = await completeChatGptSignIn({ state: second.state, code: "c", error: null, clientId: "oaiapp_alice" }, server.fetch);
  assert.equal(ok.status, "complete");
});

test("12 a replayed callback after completion is refused, also while the first is still in flight", async () => {
  box();
  const server = authServer();
  const a = signIn(server);
  const params = { state: a.state, code: "c", error: null, clientId: "oaiapp_alice" };
  const [one, two] = await Promise.all([
    completeChatGptSignIn(params, server.fetch),
    completeChatGptSignIn(params, server.fetch),
  ]);
  assert.deepEqual([one.status, two.status].sort(), ["complete", "refused"]);
  const replay = await completeChatGptSignIn(params, server.fetch);
  assert.deepEqual(replay, { status: "refused", error: "chatgpt_state_mismatch" });
  assert.equal(server.calls.filter((call) => call.url === TOKEN_URL).length, 1);
});

test("15 revoke: 200 confirmed, 500 then 200 confirmed after a retry, 400 not confirmed, network error twice not confirmed", async () => {
  box();
  const server = authServer();
  const credential = oauthOf({
    kind: "oauth",
    accessToken: "a",
    refreshToken: "r",
    expiresAt: null,
    accountId: null,
    clientId: "oaiapp_alice",
  });
  server.revokeStatuses = [200];
  assert.equal(await revokeChatGptCredential(credential, server.fetch, 1), true);
  server.calls.length = 0;
  server.revokeStatuses = [500, 200];
  assert.equal(await revokeChatGptCredential(credential, server.fetch, 1), true);
  assert.equal(server.calls.filter((call) => call.url === REVOKE_URL).length, 2);
  server.calls.length = 0;
  server.revokeStatuses = [400];
  assert.equal(await revokeChatGptCredential(credential, server.fetch, 1), false);
  assert.equal(server.calls.filter((call) => call.url === REVOKE_URL).length, 1);
  let tries = 0;
  const down: typeof fetch = async () => {
    tries += 1;
    throw new Error("network down");
  };
  assert.equal(await revokeChatGptCredential(credential, down, 1), false);
  assert.equal(tries, 2);
  assert.equal(await revokeChatGptCredential({ ...credential, refreshToken: null }, server.fetch, 1), false);
});

test("16 a Codex-era credential without clientId reports expired and gives no usable token", () => {
  const legacy: Credential = {
    kind: "oauth",
    accessToken: "codex-access",
    refreshToken: "codex-refresh",
    expiresAt: Date.now() + 3_600_000,
    accountId: "acct_codex",
  };
  const info = accessTokenFor("openai", legacy);
  assert.equal(info.expired, true);
  assert.deepEqual(info.headers, {});
  const store = setOAuthCredential(emptyProviderStore(), "openai", legacy);
  const row = publicProviders(store).connections.find((c) => c.id === "openai:oauth")!;
  assert.equal(row.status, "expired");
  assert.equal(row.accountLabel, null);
  // A current one is fine.
  const current: Credential = { ...legacy, clientId: "oaiapp_alice", email: "alice@example.com", accountId: null };
  assert.equal(accessTokenFor("openai", current).expired, false);
});
