import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { completeMcpOAuth, findOauthPending, OAuthRefreshError, refreshMcpOAuth, setOauthFetch, startMcpOAuth } from "../shared/mcp-oauth.ts";

function box() {
  const dir = mkdtempSync(join(tmpdir(), "ub-oauth-"));
  process.env.UB_OAUTH_PENDING_PATH = join(dir, "oauth.json");
  setConnectionLookup(async () => "8.8.8.8");
}

test.afterEach(() => {
  setOauthFetch(null);
  setConnectionLookup(null);
});

test("oauth discovery refuses a loopback authorization server", async () => {
  box();
  setOauthFetch(async (input) => {
    const url = String(input);
    if (url.includes("oauth-protected-resource")) {
      return new Response(JSON.stringify({
        authorization_servers: ["http://127.0.0.1:9"],
        resource: "https://mcp.example.com/mcp",
      }), { headers: { "content-type": "application/json" } });
    }
    return new Response("no", { status: 500 });
  });
  await assert.rejects(() => startMcpOAuth({
    mcpUrl: "https://mcp.example.com/mcp",
    name: "Example",
    proposalId: "prp_testdiscovery01",
    connectionId: "example",
    redirectUri: "http://127.0.0.1:4320/api/connections/callback",
  }), /url_http|url_host/);
});

test("oauth probe of the MCP URL refuses a host that resolves private", async () => {
  box();
  let n = 0;
  setConnectionLookup(async () => {
    n += 1;
    return n === 1 ? "8.8.8.8" : "169.254.169.254";
  });
  setOauthFetch(async () => new Response("no", { status: 404 }));
  await assert.rejects(() => startMcpOAuth({
    mcpUrl: "https://mcp.example.com/mcp",
    name: "Example",
    proposalId: "prp_testdiscovery03",
    connectionId: "example",
    redirectUri: "http://127.0.0.1:4320/api/connections/callback",
  }), /url_resolved/);
});

test("oauth discovery refuses a loopback https token host", async () => {
  box();
  setOauthFetch(async (input) => {
    const url = String(input);
    if (url.includes("oauth-protected-resource")) {
      return new Response(JSON.stringify({
        authorization_servers: ["https://auth.example.com"],
        resource: "https://mcp.example.com/mcp",
      }), { headers: { "content-type": "application/json" } });
    }
    if (url.includes("oauth-authorization-server")) {
      return new Response(JSON.stringify({
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://127.0.0.1/token",
        registration_endpoint: "https://auth.example.com/register",
      }), { headers: { "content-type": "application/json" } });
    }
    return new Response("no", { status: 500 });
  });
  await assert.rejects(() => startMcpOAuth({
    mcpUrl: "https://mcp.example.com/mcp",
    name: "Example",
    proposalId: "prp_testdiscovery02",
    connectionId: "example",
    redirectUri: "http://127.0.0.1:4320/api/connections/callback",
  }), /url_host/);
});

type Hit = { url: string; method: string; body: string };

const REDIRECT = "http://127.0.0.1:4320/api/connections/callback";

/**
 * A little OAuth world keyed by exact URL. A URL it does not list answers 404,
 * and every request is recorded in order so a test can read the discovery path.
 */
function world(routes: Record<string, () => Response>): Hit[] {
  const hits: Hit[] = [];
  setOauthFetch((async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    hits.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? "") });
    const route = routes[url];
    if (!route) return new Response("no", { status: 404 });
    return route();
  }) as typeof fetch);
  return hits;
}

// A fresh Response per request: a cloned one holds its twin open until both are read.
const jsonResponse = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  () => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });

const TELLA_AS = {
  issuer: "https://authkit.tella.tv",
  authorization_endpoint: "https://authkit.tella.tv/oauth2/authorize",
  token_endpoint: "https://authkit.tella.tv/oauth2/token",
  registration_endpoint: "https://authkit.tella.tv/oauth2/register",
};

function tellaWorld(extra: Record<string, () => Response> = {}): Hit[] {
  return world({
    "https://api.tella.com/mcp": jsonResponse({}, 401, {
      "www-authenticate": 'Bearer resource_metadata="https://api.tella.com/.well-known/oauth-protected-resource"',
    }),
    "https://api.tella.com/.well-known/oauth-protected-resource": jsonResponse({
      resource: "https://api.tella.com",
      authorization_servers: ["https://authkit.tella.tv"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    }),
    "https://authkit.tella.tv/.well-known/oauth-authorization-server": jsonResponse(TELLA_AS),
    "https://authkit.tella.tv/oauth2/register": jsonResponse({ client_id: "client_1" }),
    "https://authkit.tella.tv/oauth2/token": jsonResponse({
      access_token: "at_1", refresh_token: "rt_1", expires_in: 3600,
    }),
    ...extra,
  });
}

function start(mcpUrl = "https://api.tella.com/mcp", proposalId = "prp_oauthworld0001") {
  return startMcpOAuth({ mcpUrl, name: "Tella", proposalId, connectionId: "tella", redirectUri: REDIRECT });
}

test("authorize, token and refresh all carry the resource, and authorize carries the scopes", async () => {
  box();
  const hits = tellaWorld();
  const { authorizeUrl, state } = await start();
  const authorize = new URL(authorizeUrl);
  // The PRM's own string, not a normalised one with a slash added.
  assert.equal(authorize.searchParams.get("resource"), "https://api.tella.com/");
  assert.equal(authorize.searchParams.get("scope"), "openid profile email offline_access");
  const { bundle } = await completeMcpOAuth({ code: "code_1", state });
  const exchange = new URLSearchParams(hits.find((hit) => hit.url.endsWith("/oauth2/token"))?.body);
  assert.equal(exchange.get("grant_type"), "authorization_code");
  assert.equal(exchange.get("resource"), "https://api.tella.com/");
  assert.equal(bundle.resource, "https://api.tella.com/");
  await refreshMcpOAuth(bundle);
  const refresh = new URLSearchParams(hits.filter((hit) => hit.url.endsWith("/oauth2/token")).at(-1)?.body);
  assert.equal(refresh.get("grant_type"), "refresh_token");
  assert.equal(refresh.get("resource"), "https://api.tella.com/");
});

test("a protected resource on another origin is refused", async () => {
  box();
  tellaWorld({
    "https://api.tella.com/.well-known/oauth-protected-resource": jsonResponse({
      resource: "https://evil.example.net",
      authorization_servers: ["https://authkit.tella.tv"],
    }),
  });
  await assert.rejects(() => start(), /oauth_resource/);
});

test("no scopes_supported and no scope in the 401 means no scope is asked for", async () => {
  box();
  tellaWorld({
    "https://api.tella.com/mcp": jsonResponse({}, 401),
    "https://api.tella.com/.well-known/oauth-protected-resource": jsonResponse({
      resource: "https://api.tella.com",
      authorization_servers: ["https://authkit.tella.tv"],
    }),
  });
  const { authorizeUrl } = await start();
  assert.equal(new URL(authorizeUrl).searchParams.has("scope"), false);
});

test("the scope in the 401 wins over the metadata's list", async () => {
  box();
  tellaWorld({
    "https://api.tella.com/mcp": jsonResponse({}, 401, {
      "www-authenticate": 'Bearer scope="videos:read", resource_metadata="https://api.tella.com/.well-known/oauth-protected-resource"',
    }),
  });
  const { authorizeUrl } = await start();
  assert.equal(new URL(authorizeUrl).searchParams.get("scope"), "videos:read");
});

test("discovery honours resource_metadata first, then the path-aware document, then the root", async () => {
  box();
  const prm = jsonResponse({ resource: "https://mcp.example.com/mcp", authorization_servers: ["https://auth.example.com"] });
  // The header's document first.
  let hits = world({
    "https://mcp.example.com/mcp": jsonResponse({}, 401, {
      "www-authenticate": 'Bearer resource_metadata="https://mcp.example.com/custom-prm"',
    }),
    "https://mcp.example.com/custom-prm": prm,
    "https://auth.example.com/.well-known/oauth-authorization-server": jsonResponse({ ...TELLA_AS, issuer: "https://auth.example.com" }),
    "https://authkit.tella.tv/oauth2/register": jsonResponse({ client_id: "c" }),
  });
  await start("https://mcp.example.com/mcp", "prp_oauthworld0002");
  assert.deepEqual(hits.slice(0, 2).map((hit) => hit.url), [
    "https://mcp.example.com/mcp",
    "https://mcp.example.com/custom-prm",
  ]);
  // No header: path-aware, then root.
  hits = world({
    "https://mcp.example.com/mcp": jsonResponse({}, 401),
    "https://mcp.example.com/.well-known/oauth-protected-resource": prm,
    "https://auth.example.com/.well-known/oauth-authorization-server": jsonResponse({ ...TELLA_AS, issuer: "https://auth.example.com" }),
    "https://authkit.tella.tv/oauth2/register": jsonResponse({ client_id: "c" }),
  });
  await start("https://mcp.example.com/mcp", "prp_oauthworld0003");
  assert.deepEqual(hits.slice(0, 3).map((hit) => hit.url), [
    "https://mcp.example.com/mcp",
    "https://mcp.example.com/.well-known/oauth-protected-resource/mcp",
    "https://mcp.example.com/.well-known/oauth-protected-resource",
  ]);
});

test("authorization server metadata is tried in RFC 8414 then OIDC order, with the issuer path inserted", async () => {
  box();
  const prm = jsonResponse({ resource: "https://mcp.example.com/mcp", authorization_servers: ["https://auth.example.com/tenant1"] });
  let hits = world({
    "https://mcp.example.com/mcp": jsonResponse({}, 401),
    "https://mcp.example.com/.well-known/oauth-protected-resource/mcp": prm,
    "https://auth.example.com/.well-known/openid-configuration/tenant1": () => new Response("no", { status: 404 }),
    "https://auth.example.com/tenant1/.well-known/openid-configuration": jsonResponse({ ...TELLA_AS, issuer: "https://auth.example.com/tenant1" }),
    "https://authkit.tella.tv/oauth2/register": jsonResponse({ client_id: "c" }),
  });
  await start("https://mcp.example.com/mcp", "prp_oauthworld0004");
  const asHits = hits.map((hit) => hit.url).filter((url) => url.startsWith("https://auth.example.com"));
  assert.deepEqual(asHits, [
    "https://auth.example.com/.well-known/oauth-authorization-server/tenant1",
    "https://auth.example.com/.well-known/openid-configuration/tenant1",
    "https://auth.example.com/tenant1/.well-known/openid-configuration",
  ]);
  // No issuer path: the two root documents.
  hits = world({
    "https://mcp.example.com/mcp": jsonResponse({}, 401),
    "https://mcp.example.com/.well-known/oauth-protected-resource/mcp": jsonResponse({
      resource: "https://mcp.example.com/mcp", authorization_servers: ["https://auth.example.com"],
    }),
    "https://auth.example.com/.well-known/openid-configuration": jsonResponse({ ...TELLA_AS, issuer: "https://auth.example.com" }),
    "https://authkit.tella.tv/oauth2/register": jsonResponse({ client_id: "c" }),
  });
  await start("https://mcp.example.com/mcp", "prp_oauthworld0005");
  assert.deepEqual(hits.map((hit) => hit.url).filter((url) => url.startsWith("https://auth.example.com")), [
    "https://auth.example.com/.well-known/oauth-authorization-server",
    "https://auth.example.com/.well-known/openid-configuration",
  ]);
});

// UB-003 review round 1: who the authorization server is, pinned and checked.

const PIN = {
  issuer: "https://authkit.tella.tv",
  authorizationOrigin: "https://authkit.tella.tv",
  tokenOrigin: "https://authkit.tella.tv",
  registrationOrigin: "https://authkit.tella.tv",
};

test("the metadata must name the issuer it was fetched for", async () => {
  box();
  for (const [name, doc] of [
    ["another issuer", { ...TELLA_AS, issuer: "https://evil.example.net" }],
    ["no issuer", { authorization_endpoint: TELLA_AS.authorization_endpoint, token_endpoint: TELLA_AS.token_endpoint, registration_endpoint: TELLA_AS.registration_endpoint }],
    ["an issuer that is not a string", { ...TELLA_AS, issuer: 7 }],
  ] as const) {
    const hits = tellaWorld({ "https://authkit.tella.tv/.well-known/oauth-authorization-server": jsonResponse(doc) });
    await assert.rejects(() => start(), /oauth_issuer_mismatch/, name);
    assert.equal(hits.some((hit) => hit.url.endsWith("/oauth2/register")), false, `${name}: nothing registered`);
  }
  // A trailing slash is the same issuer.
  tellaWorld({ "https://authkit.tella.tv/.well-known/oauth-authorization-server": jsonResponse({ ...TELLA_AS, issuer: "https://authkit.tella.tv/" }) });
  assert.ok((await start()).authorizeUrl);
});

test("a sign-in keeps the issuer and the origins of its three endpoints, through the exchange and every refresh", async () => {
  box();
  tellaWorld();
  const { state } = await start();
  assert.deepEqual(findOauthPending(state)?.pin, PIN);
  const { bundle } = await completeMcpOAuth({ code: "c", state });
  assert.deepEqual(bundle.pin, PIN);
  assert.deepEqual((await refreshMcpOAuth(bundle)).pin, PIN);
});

test("a refresh the server refuses carries what it said", async () => {
  box();
  tellaWorld({
    "https://authkit.tella.tv/oauth2/token": jsonResponse({ error: "invalid_grant" }, 400),
  });
  const bundle = { accessToken: "a", refreshToken: "r", expiresAt: null, clientId: "c", clientSecret: null, tokenEndpoint: "https://authkit.tella.tv/oauth2/token" };
  await assert.rejects(
    () => refreshMcpOAuth(bundle),
    (err: unknown) => err instanceof OAuthRefreshError && err.status === 400 && err.code === "invalid_grant",
  );
  tellaWorld({ "https://authkit.tella.tv/oauth2/token": () => new Response("<html>", { status: 502 }) });
  await assert.rejects(
    () => refreshMcpOAuth(bundle),
    (err: unknown) => err instanceof OAuthRefreshError && err.status === 502 && err.code === null,
  );
});

test("a reauthorize needs the issuer and all three endpoint origins to be the ones it stored", async () => {
  box();
  const again = (extra: Record<string, unknown>, as: Record<string, unknown> = {}) =>
    startMcpOAuth({
      mcpUrl: "https://api.tella.com/mcp",
      name: "Tella",
      proposalId: "reauth_tella",
      connectionId: "tella",
      redirectUri: REDIRECT,
      reauthorize: true,
      expectedTokenEndpoint: "https://authkit.tella.tv/oauth2/token",
      ...extra,
    } as Parameters<typeof startMcpOAuth>[0]);
  // The same server: fine.
  tellaWorld();
  assert.ok((await again({ expectedPin: PIN })).authorizeUrl);
  // The same token host, but a sign-in page and a registration endpoint that moved.
  for (const [name, moved] of [
    ["authorization endpoint", { authorization_endpoint: "https://login.evil.example.net/authorize" }],
    ["registration endpoint", { registration_endpoint: "https://register.evil.example.net/register" }],
  ] as const) {
    const hits = tellaWorld({
      "https://authkit.tella.tv/.well-known/oauth-authorization-server": jsonResponse({ ...TELLA_AS, ...moved }),
    });
    await assert.rejects(() => again({ expectedPin: PIN }), /authorization_server_changed/, name);
    assert.equal(hits.some((hit) => hit.method === "POST" && hit.url.endsWith("/register")), false, `${name}: nothing registered`);
  }
  // A different issuer behind the same origins.
  tellaWorld();
  await assert.rejects(
    () => again({ expectedPin: { ...PIN, issuer: "https://authkit.tella.tv/other" } }),
    /authorization_server_changed/,
  );
  // A pin that is not a pin fails closed rather than falling back to the token host.
  for (const bad of [{}, { ...PIN, registrationOrigin: undefined }, { ...PIN, tokenOrigin: "not a url" }, "pin", null]) {
    await assert.rejects(() => again({ expectedPin: bad }), /authorization_server_changed/, JSON.stringify(bad));
  }
  // An older bundle with no pin is held to its token endpoint's origin, and the issuer check above.
  assert.ok((await again({})).authorizeUrl);
  await assert.rejects(
    () => again({ expectedTokenEndpoint: "https://other.example.net/oauth2/token" }),
    /authorization_server_changed/,
  );
});

test("a pending sign-in older than fifteen minutes is gone, and the file forgets it on the next write", async () => {
  box();
  const path = process.env.UB_OAUTH_PENDING_PATH ?? "";
  const row = (state: string, ageMs: number) => ({
    state,
    verifier: "verifier-value-123456",
    proposalId: `prp_${state}`,
    connectionId: "tella",
    tokenEndpoint: "https://authkit.tella.tv/oauth2/token",
    clientId: "cid",
    clientSecret: "shh",
    redirectUri: REDIRECT,
    createdAt: new Date(Date.now() - ageMs).toISOString(),
  });
  writeFileSync(path, JSON.stringify([row("staleStateValue1", 16 * 60_000), row("freshStateValue1", 60_000), { ...row("badDateValue001", 0), createdAt: "yesterday" }]));
  assert.equal(findOauthPending("staleStateValue1"), null);
  assert.equal(findOauthPending("badDateValue001"), null);
  assert.ok(findOauthPending("freshStateValue1"));
  tellaWorld();
  await start("https://api.tella.com/mcp", "prp_somethingnew01");
  const states = (JSON.parse(readFileSync(path, "utf8")) as Array<{ state: string }>).map((item) => item.state);
  assert.equal(states.includes("staleStateValue1"), false, "the stale verifier and client secret are not left on disk");
  assert.equal(states.includes("freshStateValue1"), true);
});

test("a scope from the 401 is checked like one from the metadata, and both are capped", async () => {
  box();
  const challenge = (scope: string) => jsonResponse({}, 401, {
    "www-authenticate": `Bearer scope="${scope}", resource_metadata="https://api.tella.com/.well-known/oauth-protected-resource"`,
  });
  // A token with a character no scope may carry: the whole challenge scope is ignored, the metadata's is used.
  tellaWorld({ "https://api.tella.com/mcp": challenge("videos:read bad\\token") });
  assert.equal(new URL((await start()).authorizeUrl).searchParams.get("scope"), "openid profile email offline_access");
  // Too long.
  tellaWorld({ "https://api.tella.com/mcp": challenge("s".repeat(2000)) });
  assert.equal(new URL((await start()).authorizeUrl).searchParams.get("scope"), "openid profile email offline_access");
  // A long list in the metadata is cut, not passed on whole.
  tellaWorld({
    "https://api.tella.com/mcp": jsonResponse({}, 401),
    "https://api.tella.com/.well-known/oauth-protected-resource": jsonResponse({
      resource: "https://api.tella.com",
      authorization_servers: ["https://authkit.tella.tv"],
      scopes_supported: Array.from({ length: 500 }, (_, i) => `scope${i}`),
    }),
  });
  const scope = new URL((await start()).authorizeUrl).searchParams.get("scope") ?? "";
  assert.ok(scope.length > 0 && scope.length <= 1024, `${scope.length}`);
  assert.ok(scope.startsWith("scope0 scope1"));
});
