import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { catalogueReady, resetCatalogueMemo } from "../shared/composio-catalogue.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConnectorsStore, setConnectedToolkits, setConnectorsKey, updateConnectorsStore } from "../shared/connectors-store.ts";
import {
  authorizeConnector,
  connectorsSession,
  disconnectConnector,
  executeConnectorTool,
  forgetConnected,
  listConnectorToolkits,
  searchConnectorTools,
  isKeyRejected,
  setComposioFactory,
  toolkitOf,
  type ComposioLike,
  type ComposioSessionLike,
} from "../shared/composio.ts";

type ToolkitItem = Awaited<ReturnType<ComposioSessionLike["toolkits"]>>["items"][number];

function tmpPath(withKey = true): string {
  const dir = mkdtempSync(join(tmpdir(), "ub-composio-"));
  const path = join(dir, "connectors.json");
  // Each test gets its own catalogue cache file too, and no memo from the last one.
  process.env.UB_CATALOGUE_PATH = join(dir, "catalogue.json");
  resetCatalogueMemo();
  // Stub session ids repeat across tests, so the connected memo must not carry over.
  forgetConnected();
  if (withKey) updateConnectorsStore((store) => setConnectorsKey(store, "ak_stub_1234567890"), path);
  return path;
}

interface StubState {
  created: Array<{ userId: string; config: Record<string, unknown> }>;
  used: string[];
  useThrows: unknown;
  toolkitItems: ToolkitItem[];
  executed: Array<{ slug: string; args: Record<string, unknown> | undefined }>;
  searched: Array<{ query: string; toolkits?: string[] }>;
  listed: Array<Record<string, unknown> | undefined>;
  searchResponse: unknown;
  authorized: Array<{ toolkit: string; callbackUrl?: string }>;
  deleted: string[];
  accounts: Record<string, Array<{ id: string; toolkit?: { slug: string } }>>;
  executeThrows: unknown;
  directTools: Array<{ slug: string; description?: string; inputParameters?: Record<string, unknown>; toolkit?: { slug: string } }>;
}

function stub(overrides: Partial<StubState> = {}): { state: StubState; factory: (key: string) => ComposioLike } {
  const state: StubState = {
    created: [],
    used: [],
    useThrows: null,
    toolkitItems: [],
    executed: [],
    searched: [],
    listed: [],
    searchResponse: { results: [], toolSchemas: {}, toolkits: [] },
    authorized: [],
    deleted: [],
    accounts: {},
    executeThrows: null,
    directTools: [],
    ...overrides,
  };
  let counter = 0;
  const session = (id: string): ComposioSessionLike => ({
    sessionId: id,
    async authorize(toolkit, options) {
      state.authorized.push({ toolkit, callbackUrl: options?.callbackUrl });
      return { id: `ca_${toolkit}`, redirectUrl: `https://connect.composio.dev/${toolkit}` };
    },
    async toolkits(options) {
      state.listed.push(options);
      if ((options?.limit ?? 0) > 50) throw Object.assign(new Error("payload.limit must be <= 50"), { statusCode: 400 });
      if (options?.search !== undefined && options.search.length < 3) {
        throw Object.assign(new Error("Validation error"), { statusCode: 400 });
      }
      const items = options?.isConnected
        ? state.toolkitItems.filter((item) => item.connection?.isActive)
        : options?.toolkits
          ? state.toolkitItems.filter((item) => options.toolkits?.includes(item.slug))
          : state.toolkitItems.filter((item) => !options?.search || item.slug.includes(options.search));
      return { items, cursor: undefined };
    },
    async search(params) {
      state.searched.push(params);
      return state.searchResponse;
    },
    async execute(slug, args) {
      state.executed.push({ slug, args });
      if (state.executeThrows) {
        const err = state.executeThrows;
        state.executeThrows = null;
        throw err;
      }
      return { data: { ok: true, slug }, successful: true };
    },
  });
  const factory = (): ComposioLike => ({
    sessions: {
      async create(userId, config) {
        state.created.push({ userId, config });
        counter += 1;
        return session(`trs_${counter}`);
      },
      async use(id) {
        state.used.push(id);
        if (state.useThrows) throw state.useThrows;
        return session(id);
      },
    },
    connectedAccounts: {
      async list(query) {
        return { items: query.userIds.flatMap((userId) => state.accounts[userId] ?? []) };
      },
      async delete(id) {
        state.deleted.push(id);
        return {};
      },
    },
    tools: {
      async getRawComposioTools() {
        return state.directTools;
      },
    },
  });
  return { state, factory };
}

test.afterEach(() => setComposioFactory(null));

test("no key means no session and no network", async () => {
  const { factory } = stub();
  setComposioFactory(factory);
  await assert.rejects(() => connectorsSession(tmpPath(false)), /connectors_no_key/);
});

test("session is created once, persisted, and resumed by id", async () => {
  const { state, factory } = stub();
  setComposioFactory(factory);
  const path = tmpPath();
  const first = await connectorsSession(path);
  assert.equal(state.created.length, 1);
  assert.equal(state.created[0]?.userId, readConnectorsStore(path).userId);
  assert.deepEqual(state.created[0]?.config, { manageConnections: { enable: false }, sandbox: { enable: false } });
  assert.equal(readConnectorsStore(path).sessionId, first.sessionId);
  // Same process: cached, no use() call.
  await connectorsSession(path);
  assert.equal(state.used.length, 0);
  // Fresh process: use() with the stored id.
  setComposioFactory(factory);
  await connectorsSession(path);
  assert.deepEqual(state.used, [first.sessionId]);
  assert.equal(state.created.length, 1);
});

test("a session Composio no longer knows is replaced", async () => {
  const { state, factory } = stub({ useThrows: Object.assign(new Error("gone"), { statusCode: 404 }) });
  setComposioFactory(factory);
  const path = tmpPath();
  updateConnectorsStore((store) => {
    store.sessionId = "trs_stale";
  }, path);
  const session = await connectorsSession(path);
  assert.deepEqual(state.used, ["trs_stale"]);
  assert.equal(state.created.length, 1);
  assert.equal(readConnectorsStore(path).sessionId, session.sessionId);
});

test("other session errors are surfaced, not swallowed", async () => {
  const { factory } = stub({ useThrows: Object.assign(new Error("unauthorized"), { statusCode: 401 }) });
  setComposioFactory(factory);
  const path = tmpPath();
  updateConnectorsStore((store) => {
    store.sessionId = "trs_x";
  }, path);
  await assert.rejects(() => connectorsSession(path), /unauthorized/);
});

const GMAIL: ToolkitItem = {
  slug: "gmail",
  name: "Gmail",
  isNoAuth: false,
  logo: "https://logos/gmail.png",
  connection: { isActive: true, connectedAccount: { status: "ACTIVE", id: "ca_gmail" } },
};
const SLACK: ToolkitItem = { slug: "slack", name: "Slack", isNoAuth: false, logo: undefined };
const NOAUTH: ToolkitItem = { slug: "composio_search", name: "Composio Search", isNoAuth: true, logo: undefined };
const PENDING: ToolkitItem = {
  slug: "notion",
  name: "Notion",
  isNoAuth: false,
  connection: { isActive: false, connectedAccount: { status: "INITIATED", id: "ca_notion" } },
};

const AIRTABLE: ToolkitItem = { slug: "airtable", name: "Airtable", isNoAuth: false, logo: undefined };
const ZULIP: ToolkitItem = { slug: "zulip", name: "Zulip", isNoAuth: false, logo: undefined };
const NOTION_MCP: ToolkitItem = { slug: "notion_mcp", name: "Notion MCP", isNoAuth: false, logo: undefined };

test("listing puts connected first, then featured in order, then the rest, and refreshes the cache", async () => {
  const { factory } = stub({ toolkitItems: [ZULIP, SLACK, PENDING, AIRTABLE, GMAIL, NOAUTH] });
  setComposioFactory(factory);
  const path = tmpPath();
  // A cold open shows the connected and popular apps; the catalogue walk
  // runs behind it and the next listing has everything.
  const cold = await listConnectorToolkits({}, path);
  assert.deepEqual(cold.rows.map((row) => row.slug), ["gmail", "slack", "notion", "airtable"]);
  await catalogueReady();
  const { rows, total, nextOffset } = await listConnectorToolkits({}, path);
  assert.equal(total, 5);
  assert.equal(nextOffset, null);
  assert.deepEqual(
    rows.map((row) => [row.slug, row.connected, row.accountId, row.status]),
    [
      ["gmail", true, "ca_gmail", "ACTIVE"],
      ["slack", false, null, null],
      // A half-finished connection is not connected; the dialog tracks its
      // own pending state, so the row carries no account.
      ["notion", false, null, null],
      ["airtable", false, null, null],
      ["zulip", false, null, null],
    ],
  );
  assert.deepEqual(readConnectorsStore(path).connectedToolkits, ["gmail"]);
});

test("listing with a search filters by slug or name, lowercased", async () => {
  const { state, factory } = stub({ toolkitItems: [SLACK, GMAIL] });
  setComposioFactory(factory);
  const { rows } = await listConnectorToolkits({ search: "Sla" }, tmpPath());
  assert.deepEqual(rows.map((row) => row.slug), ["slack"]);
  const remote = state.listed.filter((options) => options?.search !== undefined).map((options) => options?.search);
  assert.deepEqual(remote, ["sla"]);
});

test("an MCP variant is listed after its plain app and hides only when no-auth", async () => {
  const { factory } = stub({ toolkitItems: [NOTION_MCP, PENDING, NOAUTH] });
  setComposioFactory(factory);
  const path = tmpPath();
  await listConnectorToolkits({}, path);
  await catalogueReady();
  const { rows } = await listConnectorToolkits({ search: "notion" }, path);
  assert.deepEqual(rows.map((row) => row.slug), ["notion", "notion_mcp"]);
  const all = await listConnectorToolkits({}, path);
  assert.ok(!all.rows.some((row) => row.noAuth));
});

test("paging walks the list and the catalogue cache makes the second open local", async () => {
  const many: ToolkitItem[] = Array.from({ length: 70 }, (_, index) => ({
    slug: `app${String(index).padStart(2, "0")}`,
    name: `App ${String(index).padStart(2, "0")}`,
    isNoAuth: false,
    logo: undefined,
  }));
  const { state, factory } = stub({ toolkitItems: [GMAIL, ...many] });
  setComposioFactory(factory);
  const path = tmpPath();
  const first = await listConnectorToolkits({ limit: 30 }, path);
  assert.equal(first.rows[0]?.slug, "gmail");
  await catalogueReady();
  const second = await listConnectorToolkits({ limit: 30 }, path);
  assert.equal(second.total, 71);
  assert.equal(second.nextOffset, 30);
  const third = await listConnectorToolkits({ offset: 60, limit: 30 }, path);
  assert.equal(third.rows.length, 11);
  assert.equal(third.nextOffset, null);
  // With the cache in place, a search touches nothing but the connected page.
  const before = state.listed.length;
  const found = await listConnectorToolkits({ search: "app 6" }, path);
  assert.equal(found.rows[0]?.slug, "app60");
  assert.equal(state.listed.slice(before).every((options) => options?.isConnected === true), true);
});

test("a one or two character search never reaches Composio", async () => {
  const { state, factory } = stub({ toolkitItems: [SLACK, GMAIL, PENDING] });
  setComposioFactory(factory);
  const { rows } = await listConnectorToolkits({ search: "sl" }, tmpPath());
  assert.deepEqual(rows.map((row) => row.slug), ["slack"]);
  assert.equal(state.listed.some((options) => options?.search !== undefined), false);
});

test("an empty connected page clears the cache, and a search never rewrites it", async () => {
  const { state, factory } = stub({ toolkitItems: [SLACK, GMAIL] });
  setComposioFactory(factory);
  const path = tmpPath();
  updateConnectorsStore((store) => setConnectedToolkits(store, ["gmail", "github"]), path);
  // github is no longer reported connected by Composio: the cache follows.
  await listConnectorToolkits({ search: "sla" }, path);
  assert.deepEqual(readConnectorsStore(path).connectedToolkits, ["gmail"]);
  // Nothing connected at all: the cache empties, the agent tools refuse.
  state.toolkitItems = [SLACK];
  forgetConnected();
  await listConnectorToolkits({}, path);
  assert.deepEqual(readConnectorsStore(path).connectedToolkits, []);
});

test("a session that died after caching is dropped; reads are retried, executes are not", async () => {
  const { state, factory } = stub({ executeThrows: Object.assign(new Error("gone"), { statusCode: 410 }) });
  setComposioFactory(factory);
  const path = tmpPath();
  updateConnectorsStore((store) => setConnectedToolkits(store, ["gmail"]), path);
  const first = await connectorsSession(path);
  await assert.rejects(() => executeConnectorTool("GMAIL_SEND_EMAIL", {}, path), /session_expired/);
  assert.equal(state.executed.length, 1);
  assert.equal(readConnectorsStore(path).sessionId, null);
  // The next call gets a fresh session and runs once.
  const out = await executeConnectorTool("GMAIL_SEND_EMAIL", {}, path);
  assert.deepEqual(out, { data: { ok: true, slug: "GMAIL_SEND_EMAIL" }, successful: true });
  assert.equal(state.executed.length, 2);
  assert.equal(state.created.length, 2);
  assert.notEqual(readConnectorsStore(path).sessionId, first.sessionId);
});

test("authorize returns the redirect and refuses a bad slug", async () => {
  const { state, factory } = stub();
  setComposioFactory(factory);
  const path = tmpPath();
  const result = await authorizeConnector("gmail", "http://127.0.0.1:4320/api/connectors/callback", path);
  assert.equal(result.redirectUrl, "https://connect.composio.dev/gmail");
  assert.equal(result.accountId, "ca_gmail");
  assert.equal(state.authorized[0]?.callbackUrl, "http://127.0.0.1:4320/api/connectors/callback");
  await assert.rejects(() => authorizeConnector("Gmail!", "http://x", path), /toolkit_invalid/);
});

test("disconnect proves ownership by listing, deletes, and drops the cache entry", async () => {
  const path = tmpPath();
  const userId = readConnectorsStore(path).userId;
  const { state, factory } = stub({
    accounts: {
      [userId]: [{ id: "ca_mine", toolkit: { slug: "gmail" } }],
      ub_someoneelse00: [{ id: "ca_other", toolkit: { slug: "slack" } }],
    },
  });
  setComposioFactory(factory);
  updateConnectorsStore((store) => setConnectedToolkits(store, ["gmail", "slack"]), path);
  await disconnectConnector("ca_mine", path);
  assert.deepEqual(state.deleted, ["ca_mine"]);
  assert.deepEqual(readConnectorsStore(path).connectedToolkits, ["slack"]);
  await assert.rejects(() => disconnectConnector("ca_other", path), /account_foreign/);
  await assert.rejects(() => disconnectConnector("ca_missing", path), /account_foreign/);
  await assert.rejects(() => disconnectConnector("../x", path), /account_invalid/);
  assert.deepEqual(state.deleted, ["ca_mine"]);
});

test("search is restricted to connected toolkits and trimmed", async () => {
  const { state, factory } = stub({
    searchResponse: {
      results: [
        {
          primaryToolSlugs: ["GMAIL_FETCH_EMAILS"],
          relatedToolSlugs: ["SLACK_SEND_MESSAGE"],
          executionGuidance: "Use max_results.",
          knownPitfalls: ["Labels are case sensitive."],
        },
      ],
      toolSchemas: {
        GMAIL_FETCH_EMAILS: {
          toolkit: "GMAIL",
          toolSlug: "GMAIL_FETCH_EMAILS",
          description: "Fetch emails",
          inputSchema: { type: "object", properties: { max_results: { type: "integer" } } },
        },
        SLACK_SEND_MESSAGE: { toolkit: "SLACK", toolSlug: "SLACK_SEND_MESSAGE", description: "Send" },
      },
      toolkitConnectionStatuses: [
        { toolkit: "GMAIL", hasActiveConnection: true },
        { toolkit: "SLACK", hasActiveConnection: false },
      ],
    },
    directTools: [{ slug: "GMAIL_LIST_LABELS", description: "List labels", toolkit: { slug: "gmail" } }],
  });
  setComposioFactory(factory);
  const path = tmpPath();
  await assert.rejects(() => searchConnectorTools("mail", path), /no_connectors/);
  updateConnectorsStore((store) => setConnectedToolkits(store, ["gmail"]), path);
  const result = await searchConnectorTools("unread mail", path);
  assert.deepEqual(state.searched, [{ query: "unread mail", toolkits: ["gmail"] }]);
  assert.deepEqual(result.tools.map((hit) => hit.tool), ["GMAIL_FETCH_EMAILS", "GMAIL_LIST_LABELS"]);
  assert.equal(result.tools[0]?.toolkit, "gmail");
  assert.deepEqual(result.guidance, ["Use max_results.", "Labels are case sensitive."]);
  assert.deepEqual(result.notConnected, ["slack"]);
});

test("an MCP variant's own tools are found and its plain app is not reported missing", async () => {
  const { factory } = stub({
    searchResponse: {
      results: [{ primaryToolSlugs: ["NOTION_SEARCH_NOTION_PAGE"] }],
      toolSchemas: {
        NOTION_SEARCH_NOTION_PAGE: { toolkit: "NOTION", toolSlug: "NOTION_SEARCH_NOTION_PAGE", description: "Search" },
      },
      toolkitConnectionStatuses: [{ toolkit: "notion", hasActiveConnection: false }],
    },
    directTools: [
      { slug: "NOTION_MCP_NOTION_AI_SEARCH", description: "AI search", toolkit: { slug: "notion_mcp" } },
      { slug: "GMAIL_FETCH_EMAILS", description: "not connected here", toolkit: { slug: "gmail" } },
    ],
  });
  setComposioFactory(factory);
  const path = tmpPath();
  updateConnectorsStore((store) => setConnectedToolkits(store, ["notion_mcp"]), path);
  const result = await searchConnectorTools("search notion pages", path);
  assert.deepEqual(result.tools.map((hit) => [hit.tool, hit.toolkit]), [["NOTION_MCP_NOTION_AI_SEARCH", "notion_mcp"]]);
  assert.deepEqual(result.notConnected, []);
});

test("execute refuses toolkits that are not connected before touching the network", async () => {
  const { state, factory } = stub();
  setComposioFactory(factory);
  const path = tmpPath();
  await assert.rejects(() => executeConnectorTool("GMAIL_FETCH_EMAILS", {}, path), /no_connectors/);
  updateConnectorsStore((store) => setConnectedToolkits(store, ["gmail"]), path);
  await assert.rejects(
    () => executeConnectorTool("SLACK_SEND_MESSAGE", {}, path),
    (err: Error & { toolkit?: string }) => err.message === "not_connected" && err.toolkit === "slack",
  );
  assert.equal(state.executed.length, 0);
  const out = await executeConnectorTool("GMAIL_FETCH_EMAILS", { max_results: 2 }, path);
  assert.deepEqual(state.executed, [{ slug: "GMAIL_FETCH_EMAILS", args: { max_results: 2 } }]);
  assert.deepEqual(out, { data: { ok: true, slug: "GMAIL_FETCH_EMAILS" }, successful: true });
});

test("isKeyRejected recognises Composio's 401 only", () => {
  assert.equal(isKeyRejected(Object.assign(new Error("x"), { statusCode: 401 })), true);
  assert.equal(isKeyRejected(Object.assign(new Error("x"), { status: 401 })), true);
  assert.equal(isKeyRejected(Object.assign(new Error("x"), { statusCode: 404 })), false);
  assert.equal(isKeyRejected(new Error("x")), false);
  assert.equal(isKeyRejected(null), false);
});

test("toolkitOf matches a whole connected toolkit segment, longest first", () => {
  const known = ["gmail", "microsoft_teams", "microsoft"];
  assert.equal(toolkitOf("GMAIL_FETCH_EMAILS", known), "gmail");
  assert.equal(toolkitOf("MICROSOFT_TEAMS_SEND_MESSAGE", known), "microsoft_teams");
  assert.equal(toolkitOf("MICROSOFT_GRAPH_LIST", known), "microsoft");
  assert.equal(toolkitOf("GMAILX_FETCH", known), null);
  assert.equal(toolkitOf("GOOGLECALENDAR_CREATE_EVENT", known), null);
  assert.equal(toolkitOf("weird", known), null);
});
