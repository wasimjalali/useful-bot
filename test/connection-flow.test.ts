import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProposal, listThreadEvents, readProposal, updateProposal } from "../shared/agent-store.ts";
import {
  completeConnectionOAuth,
  pumpConnections,
  resetConnectionMemo,
  SERVER_LINGER_MS,
  SERVER_WAIT_MS,
  startConnectionConfirm,
} from "../shared/connection-flow.ts";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { EXCALIDRAW_CONNECTION, findConnectionById, readConnectionsStore, upsertConnection } from "../shared/connections-store.ts";
import { listHandoffs, queueHandoff } from "../shared/handoffs.ts";
import { memoryKeychain, setKeychainDriver, connectionSecretService, keychainGet } from "../shared/keychain.ts";
import { setMcpFetch } from "../shared/mcp-http.ts";
import { setOauthFetch } from "../shared/mcp-oauth.ts";
import { writeShell } from "../shared/shell-io.ts";
import { seedStore } from "../shared/shell-store.ts";

const CALLBACK = "http://127.0.0.1:4320/api/connections/callback";

function paths() {
  const dir = mkdtempSync(join(tmpdir(), "ub-server-"));
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_CONNECTIONS_PATH = join(dir, "connections.json");
  process.env.UB_HANDOFF_DIR = join(dir, "handoffs");
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_OAUTH_PENDING_PATH = join(dir, "oauth.json");
  resetConnectionMemo();
  setConnectionLookup(async () => "8.8.8.8");
  const shell = seedStore();
  shell.bots.push({ ...shell.bots[0], id: "b1", name: "Drawer" });
  shell.selectedBotId = "b1";
  writeShell(shell);
  return { storePath: process.env.UB_AGENT_STORE_PATH, dir };
}

function seedCard(overrides: Record<string, unknown> = {}) {
  return createProposal({
    kind: "connectServer",
    connectionKind: "mcp",
    connectionId: "example",
    name: "Example",
    description: "Example MCP server for tests",
    url: "https://mcp.example.com/mcp",
    urlHost: "mcp.example.com",
    purpose: "List the widgets",
    authKind: "none",
    authHeader: null,
    sourceBotId: "b1",
    threadId: "b1",
    phase: "proposed",
    redirectHost: null,
    waitingSince: null,
    toolCount: null,
    handoffId: null,
    ...overrides,
  });
}

function stubTools(count = 2) {
  setMcpFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        headers: { "content-type": "application/json" },
      });
    }
    const tools = Array.from({ length: count }, (_, i) => ({
      name: i === 0 ? "read_me" : "create_view",
      _meta: { ui: { visibility: ["model", "app"] } },
    }));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools } }), {
      headers: { "content-type": "application/json" },
    });
  });
}

test.afterEach(() => {
  setMcpFetch(null);
  setOauthFetch(null);
  setKeychainDriver(null);
  setConnectionLookup(null);
  resetConnectionMemo();
});

test("none-auth confirm writes the registry, counts tools and queues one resume", async () => {
  const { storePath } = paths();
  stubTools(2);
  const proposal = seedCard();
  const out = await startConnectionConfirm(proposal.id, { callbackUrl: CALLBACK });
  assert.equal(out.redirectUrl, undefined);
  const stored = readProposal(proposal.id, storePath);
  assert.equal(stored?.kind === "connectServer" && stored.phase, "connected");
  assert.equal(stored?.kind === "connectServer" && stored.toolCount, 2);
  assert.equal(stored?.status, "confirmed");
  assert.equal(findConnectionById("example")?.url, "https://mcp.example.com/mcp");
  assert.equal(listHandoffs().length, 1);
  assert.equal(listHandoffs()[0].message.includes("example"), true);
  assert.equal(listHandoffs()[0].message.includes("mcp.example.com"), false);
  assert.ok(listThreadEvents("b1", storePath).some((e) => e.kind === "note" && e.text === "Example connected"));
  assert.equal(listHandoffs()[0].message.includes("BEGIN-UNTRUSTED(connect-purpose)"), true);
});

test("apiKey confirm stores the secret in Keychain, not in JSON", async () => {
  const mem = memoryKeychain();
  setKeychainDriver(mem);
  const { storePath } = paths();
  stubTools(1);
  const proposal = seedCard({ authKind: "apiKey", authHeader: "X-Api-Key" });
  await startConnectionConfirm(proposal.id, { callbackUrl: CALLBACK, secret: "sk_test_secret_1" });
  assert.equal(keychainGet(connectionSecretService("example")), "sk_test_secret_1");
  const disk = readFileSync(process.env.UB_CONNECTIONS_PATH ?? "", "utf8");
  assert.equal(disk.includes("sk_test"), false);
  const stored = JSON.stringify(readProposal(proposal.id, storePath));
  assert.equal(stored.includes("sk_test"), false);
  await assert.rejects(
    startConnectionConfirm(seedCard({
      connectionId: "other",
      url: "https://other.example.com/mcp",
      urlHost: "other.example.com",
      authKind: "apiKey",
    }).id, {
      callbackUrl: CALLBACK,
      secret: "short",
    }),
    /secret_invalid/,
  );
});

test("a connected card whose resume cannot queue is retried, then leaves after the linger cap", async () => {
  const { storePath } = paths();
  stubTools(1);
  const proposal = seedCard();
  writeFileSync(process.env.UB_HANDOFF_DIR ?? "", "not a directory");
  await startConnectionConfirm(proposal.id, { callbackUrl: CALLBACK });
  const stored = readProposal(proposal.id, storePath);
  assert.equal(stored?.kind === "connectServer" && stored.phase, "connected");
  assert.equal(stored?.status, "pending");
  await pumpConnections();
  assert.equal(readProposal(proposal.id, storePath)?.status, "pending");
  await pumpConnections({ now: Date.now() + SERVER_LINGER_MS + 1000 });
  assert.equal(readProposal(proposal.id, storePath)?.status, "confirmed");
});

test("a waiting oauth card expires after ten minutes", async () => {
  const { storePath } = paths();
  const t0 = Date.now();
  const proposal = seedCard({ authKind: "oauth", phase: "waiting", waitingSince: new Date(t0).toISOString(), redirectHost: "auth.example.com" });
  const out = await pumpConnections({ now: t0 + SERVER_WAIT_MS + 1000 });
  assert.deepEqual(out.expired, [proposal.id]);
  assert.equal((readProposal(proposal.id, storePath) as { phase: string }).phase, "expired");
});

test("overlapping pumps do not double-confirm a connected card", async () => {
  const { storePath } = paths();
  stubTools(1);
  const proposal = seedCard();
  await startConnectionConfirm(proposal.id, { callbackUrl: CALLBACK });
  const results = await Promise.all([pumpConnections(), pumpConnections(), pumpConnections()]);
  assert.equal(listHandoffs().length, 1);
  assert.equal(readProposal(proposal.id, storePath)?.status, "confirmed");
  assert.ok(results.every((r) => Array.isArray(r.connected)));
});

test("an older resume of the same server is not adopted", async () => {
  paths();
  stubTools(1);
  const stale = queueHandoff({
    sourceBotId: "bot-useful",
    sourceName: "Useful Bot",
    targetBotId: "b1",
    targetName: "Drawer",
    message: "The owner connected the server example. Continue the task: List the widgets",
  });
  const earlier = new Date(Date.now() - 60_000).toISOString();
  writeFileSync(join(process.env.UB_HANDOFF_DIR ?? "", `${stale.id}.json`), JSON.stringify({
    ...stale,
    status: "delivered",
    createdAt: earlier,
    updatedAt: earlier,
  }));
  const proposal = seedCard();
  await startConnectionConfirm(proposal.id, { callbackUrl: CALLBACK });
  const id = (readProposal(proposal.id) as { handoffId: string }).handoffId;
  assert.notEqual(id, stale.id);
  assert.equal(listHandoffs().length, 2);
});

test("oauth complete refuses a card that is not waiting and does not fetch", async () => {
  const { storePath } = paths();
  const proposal = seedCard({ authKind: "oauth", phase: "proposed" });
  writeFileSync(process.env.UB_OAUTH_PENDING_PATH ?? "", JSON.stringify([{
    state: "statevalue123456",
    verifier: "verifier-value-123456",
    proposalId: proposal.id,
    connectionId: "example",
    tokenEndpoint: "https://auth.example.com/token",
    clientId: "cid",
    clientSecret: null,
    redirectUri: CALLBACK,
    createdAt: new Date().toISOString(),
  }]));
  let fetched = false;
  setMcpFetch(async () => {
    fetched = true;
    return new Response("{}");
  });
  setOauthFetch(async () => {
    fetched = true;
    return new Response("{}");
  });
  await assert.rejects(() => completeConnectionOAuth("code-1", "statevalue123456", { storePath }), /proposal_phase/);
  assert.equal(fetched, false);
});

test("seeded Excalidraw is not a secret-bearing row", () => {
  paths();
  upsertConnection(EXCALIDRAW_CONNECTION);
  const row = findConnectionById("excalidraw");
  assert.equal(row?.authKind, "none");
  assert.deepEqual(row?.toolsAllow, ["read_me", "create_view"]);
  assert.equal(JSON.stringify(readConnectionsStore()).includes("token"), false);
});

test("two cards for the same server end up as one row, not two", async () => {
  // propose_connection refuses a URL that is already connected, and allows one
  // pending card per thread. Two bots can still each hold a card for the same
  // server, and the owner can authorize both. Two rows would mount the server
  // twice, so the model would see every one of its tools twice and both copies
  // would count against the tool cap.
  const { storePath } = paths();
  stubTools(2);
  const first = seedCard();
  await startConnectionConfirm(first.id, { callbackUrl: CALLBACK });
  assert.equal(readConnectionsStore().connections.length, 1);

  const second = seedCard({ connectionId: "example-2", name: "Example Two", threadId: "b1" });
  await startConnectionConfirm(second.id, { callbackUrl: CALLBACK });

  const rows = readConnectionsStore().connections;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "example");
  // The card is pointed at the row it joined, so its confirm and any later
  // OAuth completion read the same id.
  const card = readProposal(second.id, storePath);
  assert.equal(card && "connectionId" in card ? card.connectionId : null, "example");
});

test("a second authorize on the same card keeps its own row", async () => {
  paths();
  stubTools(2);
  const card = seedCard();
  await startConnectionConfirm(card.id, { callbackUrl: CALLBACK });
  updateProposal(card.id, (item) => {
    if (item.kind === "connectServer") {
      item.status = "pending";
      item.phase = "proposed";
    }
  });
  await startConnectionConfirm(card.id, { callbackUrl: CALLBACK });
  const rows = readConnectionsStore().connections;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "example");
});
