import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { completeMcpOAuth, refreshMcpOAuth, setOauthFetch, startMcpOAuth } from "../shared/mcp-oauth.ts";

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
  assert.equal(authorize.searchParams.get("resource"), "https://api.tella.com");
  assert.equal(authorize.searchParams.get("scope"), "openid profile email offline_access");
  const { bundle } = await completeMcpOAuth({ code: "code_1", state });
  const exchange = new URLSearchParams(hits.find((hit) => hit.url.endsWith("/oauth2/token"))?.body);
  assert.equal(exchange.get("grant_type"), "authorization_code");
  assert.equal(exchange.get("resource"), "https://api.tella.com");
  assert.equal(bundle.resource, "https://api.tella.com");
  await refreshMcpOAuth(bundle);
  const refresh = new URLSearchParams(hits.filter((hit) => hit.url.endsWith("/oauth2/token")).at(-1)?.body);
  assert.equal(refresh.get("grant_type"), "refresh_token");
  assert.equal(refresh.get("resource"), "https://api.tella.com");
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
    "https://auth.example.com/.well-known/oauth-authorization-server": jsonResponse(TELLA_AS),
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
    "https://auth.example.com/.well-known/oauth-authorization-server": jsonResponse(TELLA_AS),
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
    "https://auth.example.com/tenant1/.well-known/openid-configuration": jsonResponse(TELLA_AS),
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
    "https://auth.example.com/.well-known/openid-configuration": jsonResponse(TELLA_AS),
    "https://authkit.tella.tv/oauth2/register": jsonResponse({ client_id: "c" }),
  });
  await start("https://mcp.example.com/mcp", "prp_oauthworld0005");
  assert.deepEqual(hits.map((hit) => hit.url).filter((url) => url.startsWith("https://auth.example.com")), [
    "https://auth.example.com/.well-known/oauth-authorization-server",
    "https://auth.example.com/.well-known/openid-configuration",
  ]);
});
