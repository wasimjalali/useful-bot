import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteConnection,
  listPublicConnections,
  reauthorizeConnection,
  refreshConnection,
} from "../shared/connections-admin.ts";
import { connectionIndex, connectionStatus, putConnectionDiscovery } from "../shared/connection-tools-store.ts";
import { setDiscoveryLogger } from "../shared/connection-tools.ts";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { EXCALIDRAW_CONNECTION, findConnectionById, seedDefaultConnections, upsertConnection, type ConnectionEntry } from "../shared/connections-store.ts";
import { connectionSecretService, keychainGet, keychainSet, memoryKeychain, setKeychainDriver } from "../shared/keychain.ts";
import { setMcpFetch } from "../shared/mcp-http.ts";
import { findOauthPending, setOauthFetch } from "../shared/mcp-oauth.ts";

const CALLBACK = "http://127.0.0.1:4320/api/connections/callback";

function paths(): void {
  const dir = mkdtempSync(join(tmpdir(), "ub-admin-"));
  process.env.UB_CONNECTIONS_PATH = join(dir, "connections.json");
  process.env.UB_CONNECTION_TOOLS_PATH = join(dir, "connection-tools.json");
  process.env.UB_OAUTH_PENDING_PATH = join(dir, "oauth.json");
  setConnectionLookup(async () => "8.8.8.8");
  setKeychainDriver(memoryKeychain());
  setDiscoveryLogger(() => {});
}

function row(overrides: Partial<ConnectionEntry> = {}): ConnectionEntry {
  return {
    id: "tella",
    kind: "mcp",
    name: "Tella",
    url: "https://api.tella.com/mcp",
    description: "Tella MCP server",
    authKind: "apiKey",
    authHeader: "X-Api-Key",
    toolsAllow: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function server(mode: () => "down" | "ok") {
  setMcpFetch((async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; id?: number };
    const json = (id: number | undefined, result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "content-type": "application/json" } });
    if (body.method === "initialize") return json(1, { protocolVersion: "2025-06-18" });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (mode() === "down") return new Response("down", { status: 503 });
    return json(body.id, { tools: [
      { name: "list_videos", description: "List\nthe owner's videos" },
      { name: "create_video", description: "Create a video" },
    ] });
  }) as typeof fetch);
}

test.afterEach(() => {
  setMcpFetch(null);
  setOauthFetch(null);
  setKeychainDriver(null);
  setDiscoveryLogger(null);
  setConnectionLookup(null);
});

test("the list carries state and tools and never a credential", async () => {
  paths();
  upsertConnection(row());
  keychainSet(connectionSecretService("tella"), "sk_live_super_secret_value");
  server(() => "ok");
  const refreshed = await refreshConnection("tella");
  assert.equal(refreshed.state, "ready");
  const listed = listPublicConnections();
  assert.deepEqual(Object.keys(listed[0]).sort(), [
    "authKind", "builtin", "checkedAt", "id", "kind", "lastError", "name", "state", "toolCount", "tools", "url",
  ]);
  assert.equal(listed[0].toolCount, 2);
  assert.deepEqual(listed[0].tools, [
    { name: "list_videos", description: "List the owner's videos" },
    { name: "create_video", description: "Create a video" },
  ]);
  const wire = JSON.stringify(listed);
  for (const forbidden of ["sk_live", "authorization", "X-Api-Key", "Bearer", "accessToken", "refreshToken"]) {
    assert.equal(wire.includes(forbidden), false, forbidden);
  }
});

test("a refresh lists again now and reports the new state, failure included", async () => {
  paths();
  upsertConnection(row({ authKind: "none", authHeader: null }));
  let mode: "down" | "ok" = "down";
  server(() => mode);
  const down = await refreshConnection("tella");
  assert.equal(down.state, "unreachable");
  assert.equal(down.lastError?.code, "http_503");
  // Inside the two-minute window, which a refresh ignores.
  mode = "ok";
  const up = await refreshConnection("tella");
  assert.equal(up.state, "ready");
  assert.equal(up.lastError, null);
  await assert.rejects(() => refreshConnection("nope"), /connection_missing/);
});

test("remove drops the row, its Keychain item, its listing and its status", async () => {
  paths();
  upsertConnection(row());
  keychainSet(connectionSecretService("tella"), "sk_live_super_secret_value");
  server(() => "ok");
  await refreshConnection("tella");
  assert.ok(connectionIndex("tella"));
  deleteConnection("tella");
  assert.equal(findConnectionById("tella"), null);
  assert.equal(keychainGet(connectionSecretService("tella")), null);
  assert.equal(connectionIndex("tella"), null);
  assert.equal(connectionStatus("tella"), null);
  assert.deepEqual(listPublicConnections(), []);
  assert.throws(() => deleteConnection("tella"), /connection_missing/);
});

test("the built-in Excalidraw connection cannot be removed", () => {
  paths();
  seedDefaultConnections();
  assert.throws(() => deleteConnection(EXCALIDRAW_CONNECTION.id), /connection_builtin/);
  assert.ok(findConnectionById("excalidraw"));
  assert.equal(listPublicConnections().find((item) => item.id === "excalidraw")?.builtin, true);
});

test("a row from before status was kept is described by its listing", () => {
  paths();
  upsertConnection(row());
  assert.equal(listPublicConnections()[0].state, "pending");
  putConnectionDiscovery("tella", {
    tools: [{ name: "a_tool", description: "d", inputSchema: null, inputSchemaBytes: 2 }],
    status: { state: "ready", lastError: null, checkedAt: new Date().toISOString(), toolCount: 1 },
  });
  assert.equal(listPublicConnections()[0].state, "ready");
});

test("reauthorize starts a sign-in for the same connection, and only for an OAuth one", async () => {
  paths();
  upsertConnection(row({ authKind: "oauth", authHeader: null }));
  const json = (value: unknown, headers: Record<string, string> = {}) => () =>
    new Response(JSON.stringify(value), { headers: { "content-type": "application/json", ...headers } });
  const routes: Record<string, () => Response> = {
    "https://api.tella.com/mcp": () => new Response("{}", { status: 401 }),
    "https://api.tella.com/.well-known/oauth-protected-resource/mcp": () => new Response("no", { status: 404 }),
    "https://api.tella.com/.well-known/oauth-protected-resource": json({
      resource: "https://api.tella.com",
      authorization_servers: ["https://authkit.tella.tv"],
      scopes_supported: ["openid", "offline_access"],
    }),
    "https://authkit.tella.tv/.well-known/oauth-authorization-server": json({
      authorization_endpoint: "https://authkit.tella.tv/oauth2/authorize",
      token_endpoint: "https://authkit.tella.tv/oauth2/token",
      registration_endpoint: "https://authkit.tella.tv/oauth2/register",
    }),
    "https://authkit.tella.tv/oauth2/register": json({ client_id: "client_1" }),
  };
  setOauthFetch((async (input: unknown) => (routes[String(input)] ?? (() => new Response("no", { status: 404 })))()) as typeof fetch);
  const first = await reauthorizeConnection("tella", CALLBACK);
  const url = new URL(first.authorizeUrl);
  assert.equal(first.redirectHost, "authkit.tella.tv");
  assert.equal(url.searchParams.get("resource"), "https://api.tella.com");
  assert.equal(url.searchParams.get("scope"), "openid offline_access");
  const pending = findOauthPending(url.searchParams.get("state") ?? "");
  assert.equal(pending?.connectionId, "tella");
  assert.equal(pending?.proposalId, "reauth_tella");
  // A second attempt replaces the first: one pending sign-in per connection.
  const second = await reauthorizeConnection("tella", CALLBACK);
  assert.equal(findOauthPending(url.searchParams.get("state") ?? ""), null);
  assert.ok(findOauthPending(new URL(second.authorizeUrl).searchParams.get("state") ?? ""));
  upsertConnection(row({ id: "keyed", url: "https://keyed.example.com/mcp", authKind: "bearer", authHeader: null }));
  await assert.rejects(() => reauthorizeConnection("keyed", CALLBACK), /not_oauth/);
  await assert.rejects(() => reauthorizeConnection("nope", CALLBACK), /connection_missing/);
});
