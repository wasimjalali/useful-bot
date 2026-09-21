import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { mcpToolGate, mcpToolRisk } from "../agent/lib/connector-risk.ts";
import {
  activateSessionTools,
  connectionIndex,
  mountedToolName,
  putConnectionIndex,
  putConnectionOperations,
  readConnectionToolsStore,
  sessionTools,
} from "../shared/connection-tools-store.ts";
import {
  eagerConnections,
  ensureMeasured,
  isEagerConnection,
  mountedToolBytes,
  mountedToolCount,
  onDemandConnections,
  scoreTool,
  searchConnectionTools,
  splitMountedName,
} from "../shared/connection-tools.ts";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { connectionSecretService, keychainSet, memoryKeychain, setKeychainDriver } from "../shared/keychain.ts";
import { upsertConnection, type ConnectionEntry } from "../shared/connections-store.ts";
import { toolInputSchema, rawSchemaHint } from "../shared/json-schema-zod.ts";
import { setMcpFetch } from "../shared/mcp-http.ts";
import { MAX_SESSION_TOOLS, MOUNTED_TOOL_BUDGET, MOUNTED_TOOL_BYTE_BUDGET } from "../shared/policy.ts";

function paths(): void {
  const dir = mkdtempSync(join(tmpdir(), "ub-ctools-"));
  process.env.UB_CONNECTIONS_PATH = join(dir, "connections.json");
  process.env.UB_CONNECTION_TOOLS_PATH = join(dir, "connection-tools.json");
  setConnectionLookup(async () => "8.8.8.8");
}

function entry(overrides: Partial<ConnectionEntry> = {}): ConnectionEntry {
  return {
    id: "example",
    kind: "mcp",
    name: "Example",
    url: "https://mcp.example.com/mcp",
    description: "Example MCP server for tests",
    authKind: "none",
    authHeader: null,
    toolsAllow: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test.afterEach(() => {
  setMcpFetch(null);
  setConnectionLookup(null);
});

test("a big server waits to be asked for; a pinned one and an OpenAPI spec do not", () => {
  paths();
  const big = upsertConnection(entry()).entry;
  const pinned = upsertConnection(entry({
    id: "excalidraw",
    name: "Excalidraw",
    url: "https://mcp.excalidraw.com/mcp",
    toolsAllow: ["read_me", "create_view"],
  })).entry;
  const spec = upsertConnection(entry({
    id: "weather",
    kind: "openapi",
    name: "Weather",
    url: "https://api.example.com/openapi.json",
  })).entry;
  assert.equal(isEagerConnection(big), false);
  assert.equal(isEagerConnection(pinned), true);
  assert.equal(isEagerConnection(spec), true);
  // A spec nobody has counted is not mounted: eve builds its tools from the
  // spec and a size nobody knows is not a small one.
  assert.deepEqual(eagerConnections().map((item) => item.id), ["excalidraw"]);
  putConnectionOperations("weather", 12);
  assert.deepEqual(eagerConnections().map((item) => item.id).sort(), ["excalidraw", "weather"]);
  assert.deepEqual(onDemandConnections().map((item) => item.id), ["example"]);
  // An allow-list is exact; a listing is exact; a row nobody has measured
  // gets a modest figure rather than the worst case, because unmounting a
  // working connection over a missing measurement is the worse mistake.
  assert.equal(mountedToolCount(pinned), 2);
  assert.equal(mountedToolCount(big), null);
  putConnectionIndex("example", [{ name: "one", description: "", inputSchema: null }]);
  assert.equal(mountedToolCount(big), 1);
  // eve builds an OpenAPI connection's tools from the spec and never hands
  // them back, so the count taken at connect time is what weighs it.
  assert.equal(mountedToolCount(spec), 12);
});

test("a spec that predates the count is measured once and mountable after", async () => {
  paths();
  const spec = upsertConnection(entry({
    id: "weather",
    kind: "openapi",
    name: "Weather",
    url: "https://api.example.com/openapi.json",
  })).entry;
  assert.equal(mountedToolCount(spec), null);
  assert.deepEqual(eagerConnections().map((item) => item.id), []);
  let fetched = 0;
  setMcpFetch((async () => {
    fetched += 1;
    return new Response(JSON.stringify({ paths: { "/a": { get: {} }, "/b": { get: {}, post: {} } } }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch);
  await ensureMeasured([spec]);
  assert.equal(mountedToolCount(spec), 3);
  assert.deepEqual(eagerConnections().map((item) => item.id), ["weather"]);
  // Measured once, not on every turn.
  await ensureMeasured([spec]);
  assert.equal(fetched, 1);
});

test("a spec that cannot be read is not refetched at every turn boundary", async () => {
  paths();
  const spec = upsertConnection(entry({
    id: "weather",
    kind: "openapi",
    name: "Weather",
    url: "https://api.example.com/openapi.json",
  })).entry;
  let fetched = 0;
  setMcpFetch((async () => {
    fetched += 1;
    return new Response("nope", { status: 502 });
  }) as typeof fetch);
  await ensureMeasured([spec]);
  await ensureMeasured([spec]);
  await ensureMeasured([spec]);
  // Eight seconds at every turn boundary, forever, for a row that stays
  // unmounted either way, is the thing the attempt record prevents.
  assert.equal(fetched, 1);
  assert.equal(mountedToolCount(spec), null);
  assert.deepEqual(eagerConnections().map((item) => item.id), []);
});

test("a spec behind a key is counted with the key", async () => {
  paths();
  setKeychainDriver(memoryKeychain());
  keychainSet(connectionSecretService("weather"), "sk_spec_secret_value");
  const spec = upsertConnection(entry({
    id: "weather",
    kind: "openapi",
    name: "Weather",
    url: "https://api.example.com/openapi.json",
    authKind: "bearer",
  })).entry;
  let seen = "";
  setMcpFetch((async (_input: unknown, init?: RequestInit) => {
    seen = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({ paths: { "/a": { get: {} } } }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch);
  await ensureMeasured([spec]);
  assert.equal(seen, "Bearer sk_spec_secret_value");
  assert.equal(mountedToolCount(spec), 1);
  setKeychainDriver(null);
});

test("the mounted set is clamped at the budget, whatever is in the store", () => {
  paths();
  // Rows can be over budget for reasons the connect check never saw: they
  // were connected before it existed, or written by another path.
  for (let i = 0; i < 6; i++) {
    upsertConnection(entry({
      id: `spec-${i}`,
      kind: "openapi",
      name: `Spec ${i}`,
      url: `https://api${i}.example.com/openapi.json`,
    }));
    putConnectionOperations(`spec-${i}`, 25);
  }
  const mounted = eagerConnections();
  const total = mounted.reduce((sum, item) => sum + (mountedToolCount(item) ?? 0), 0);
  assert.ok(total <= MOUNTED_TOOL_BUDGET, `mounted ${total} tools, past ${MOUNTED_TOOL_BUDGET}`);
  assert.equal(mounted.length, 2);
  // In the order they were connected, so the set is stable turn to turn.
  assert.deepEqual(mounted.map((item) => item.id), ["spec-0", "spec-1"]);
});

test("the byte budget clamps a roster the count alone would admit", () => {
  paths();
  const fat = { type: "object", properties: Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [`field_${i}`, { type: "string", description: "x".repeat(200) }]),
  ) };
  for (let i = 0; i < 6; i++) {
    upsertConnection(entry({
      id: `fat-${i}`,
      name: `Fat ${i}`,
      url: `https://fat${i}.example.com/mcp`,
      toolsAllow: ["one", "two"],
    }));
    putConnectionIndex(`fat-${i}`, [
      { name: "one", description: "", inputSchema: fat },
      { name: "two", description: "", inputSchema: fat },
    ]);
  }
  const mounted = eagerConnections();
  // Twelve tools is well inside the count budget; their schemas are not.
  assert.ok(mounted.length < 6, `mounted all ${mounted.length}`);
  const bytes = mounted.reduce((sum, item) => sum + (mountedToolBytes(item) ?? 0), 0);
  assert.ok(bytes <= MOUNTED_TOOL_BYTE_BUDGET, `mounted ${bytes} bytes`);
});

test("find_tools' search ranks a name match over prose and reads the cached listing", async () => {
  paths();
  upsertConnection(entry());
  let listings = 0;
  setMcpFetch((async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        headers: { "content-type": "application/json" },
      });
    }
    listings += 1;
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: [
          { name: "send_message", description: "Post to a channel", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
          { name: "list_channels", description: "Every channel, and who can send a message in it" },
          { name: "delete_file", description: "Remove a file" },
        ],
      },
    }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch);

  const hits = await searchConnectionTools("send a message", 3);
  assert.equal(hits[0].name, "example__send_message");
  assert.equal(hits[0].tool, "send_message");
  assert.equal(hits[0].connectionName, "Example");
  assert.equal(listings, 1);
  // The listing is on disk now, so the next search does not go back out.
  const again = await searchConnectionTools("delete a file", 3);
  assert.equal(again[0].name, "example__delete_file");
  assert.equal(listings, 1);
  assert.equal(connectionIndex("example")?.tools.length, 3);
  // The schema came with it, so a mounted tool can present a real contract.
  const schema = connectionIndex("example")?.tools.find((tool) => tool.name === "send_message")?.inputSchema;
  assert.deepEqual(schema, { type: "object", properties: { text: { type: "string" } }, required: ["text"] });
});

test("an allow-list still applies to what a search may hand over", async () => {
  paths();
  upsertConnection(entry({ toolsAllow: ["read_me"] }));
  // Pinned, so it is mounted for every turn and never searched.
  assert.deepEqual(onDemandConnections().map((item) => item.id), []);
  assert.deepEqual(await searchConnectionTools("read", 3), []);
});

test("a session picks up tools up to its limit and is told when it is holding them", () => {
  paths();
  const names = Array.from({ length: MAX_SESSION_TOOLS + 3 }, (_, i) => mountedToolName("example", `tool_${i}`));
  const first = activateSessionTools("s1", names.slice(0, 2));
  assert.deepEqual(first.tools, names.slice(0, 2));
  assert.deepEqual(first.refused, []);
  // Asking again for one it already holds is not a second slot.
  assert.deepEqual(activateSessionTools("s1", [names[0]]).tools, names.slice(0, 2));
  const rest = activateSessionTools("s1", names);
  assert.equal(rest.tools.length, MAX_SESSION_TOOLS);
  assert.equal(rest.refused.length, 3);
  assert.equal(sessionTools("s1").length, MAX_SESSION_TOOLS);
  // Another session starts from nothing.
  assert.deepEqual(sessionTools("s2"), []);
  assert.equal(Object.keys(readConnectionToolsStore().sessions).length, 1);
});

test("a mounted name splits back into the connection and the tool", () => {
  assert.deepEqual(splitMountedName("example__send_message"), { connectionId: "example", tool: "send_message" });
  // A tool whose own name carries the separator still belongs to the first part.
  assert.deepEqual(splitMountedName("example__a__b"), { connectionId: "example", tool: "a__b" });
  assert.equal(splitMountedName("example"), null);
  assert.equal(splitMountedName("__x"), null);
  assert.equal(splitMountedName("x__"), null);
});

test("scoring puts a whole-word name match first", () => {
  const send = { name: "send_message", description: "", inputSchema: null };
  const prose = { name: "post_note", description: "send a message somewhere", inputSchema: null };
  assert.ok(scoreTool("send message", send, "Example") > scoreTool("send message", prose, "Example"));
  assert.equal(scoreTool("nothing alike", send, "Example"), 0);
});

test("an MCP tool's risk comes from its own name, with no toolkit to strip", () => {
  assert.equal(mcpToolRisk("list_channels"), "read");
  assert.equal(mcpToolRisk("get_page"), "read");
  assert.equal(mcpToolRisk("send_message"), "write");
  assert.equal(mcpToolRisk("create_view"), "write");
  assert.equal(mcpToolRisk("delete_file"), "destructive");
  assert.equal(mcpToolRisk("list_and_purge"), "destructive");
  assert.equal(mcpToolRisk(""), "write");
});

test("no name a server chose decides whether the owner is asked", () => {
  // A Composio slug is Composio's; an MCP server writes its own tool names,
  // so `list_items` might delete. The posture decides, not the name.
  assert.equal(mcpToolGate("read_only"), "refuse");
  assert.equal(mcpToolGate("auto"), "ask");
  assert.equal(mcpToolGate("full_access"), "run");
  // No grant at all behaves as auto, the way every other gate here does.
  assert.equal(mcpToolGate(null), "ask");
  // The name still labels the card.
  assert.equal(mcpToolRisk("delete_file"), "destructive");
});

test("a server's schema becomes the tool's contract, or a passthrough with the raw one", () => {
  const converted = toolInputSchema({
    type: "object",
    properties: {
      text: { type: "string", description: "What to say" },
      count: { type: "integer" },
      urgent: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      mode: { enum: ["fast", "slow"] },
      note: { type: ["string", "null"] },
      nested: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    required: ["text", "nested"],
  });
  assert.equal(converted.passthrough, false);
  const parsed = converted.schema.parse({ text: "hi", nested: { id: "1" }, tags: ["a"], mode: "fast", note: null });
  assert.deepEqual(parsed, { text: "hi", nested: { id: "1" }, tags: ["a"], mode: "fast", note: null });
  assert.throws(() => converted.schema.parse({ nested: { id: "1" } }));
  assert.throws(() => converted.schema.parse({ text: "hi", nested: {} }));

  // A shape outside the subset still gives a callable tool: the server
  // validates the arguments either way.
  const odd = toolInputSchema({ type: "object", properties: { when: { $ref: "#/definitions/date" } } });
  assert.equal(odd.passthrough, true);
  assert.deepEqual(odd.schema.parse({ when: "today" }), { when: "today" });
  assert.ok(rawSchemaHint({ type: "object" }).includes("JSON Schema"));
  assert.equal(rawSchemaHint(null), "");

  // No schema at all is a passthrough too, not a refusal.
  assert.equal(toolInputSchema(null).passthrough, true);
  // A schema that is not an argument list cannot be one whatever it validates.
  assert.equal(toolInputSchema({ type: "string" }).passthrough, true);
  // A free-form object stays free-form rather than becoming an empty one.
  const free = toolInputSchema({ type: "object" });
  assert.equal(free.passthrough, false);
  assert.deepEqual(free.schema.parse({ anything: 1 }), { anything: 1 });
  // The converted schema is a zod schema, the same kind `defineTool` takes.
  assert.ok(converted.schema instanceof z.ZodType);
});
