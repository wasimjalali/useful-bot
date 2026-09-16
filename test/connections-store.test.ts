import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EXCALIDRAW_CONNECTION,
  allocateConnectionId,
  findConnectionByUrl,
  parseConnectionsStore,
  readConnectionsStore,
  seedDefaultConnections,
  slugifyConnectionId,
  updateConnectionsStore,
  upsertConnection,
} from "../shared/connections-store.ts";
import { keychainGet, keychainSet, memoryKeychain, setKeychainDriver, connectionSecretService } from "../shared/keychain.ts";

function tmpPath(): string {
  return join(mkdtempSync(join(tmpdir(), "ub-conns-")), "connections.json");
}

test("a row persists 0600 and unknown keys do not appear on the typed shape", () => {
  const path = tmpPath();
  upsertConnection({ ...EXCALIDRAW_CONNECTION, createdAt: new Date().toISOString() }, path);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const loaded = readConnectionsStore(path);
  assert.equal(loaded.connections.length, 1);
  assert.equal(loaded.connections[0].id, "excalidraw");
  assert.equal(loaded.connections[0].url, "https://mcp.excalidraw.com/mcp");
  assert.equal(JSON.stringify(loaded).includes("apiKey"), false);
  assert.equal(JSON.stringify(loaded).includes("token"), false);
  const raw = JSON.parse(readFileSync(path, "utf8")) as { extra?: string; connections: Array<Record<string, unknown>> };
  raw.extra = "keep-on-disk-but-ignore";
  raw.connections[0].futureField = "x";
  writeFileSync(path, JSON.stringify(raw));
  const again = readConnectionsStore(path);
  assert.equal("extra" in again, false);
  assert.equal("futureField" in again.connections[0], false);
  assert.equal(again.connections[0].id, "excalidraw");
});

test("seed is idempotent and does not overwrite an owner row", () => {
  const path = tmpPath();
  const first = seedDefaultConnections(path);
  const second = seedDefaultConnections(path);
  assert.equal(first.id, "excalidraw");
  assert.equal(second.id, "excalidraw");
  assert.equal(readConnectionsStore(path).connections.length, 1);
  updateConnectionsStore((store) => {
    store.connections[0].name = "My Excalidraw";
  }, path);
  seedDefaultConnections(path);
  assert.equal(readConnectionsStore(path).connections[0].name, "My Excalidraw");
});

test("a corrupt file is moved aside and a missing file is empty", () => {
  const path = tmpPath();
  writeFileSync(path, "{not json");
  const empty = readConnectionsStore(path);
  assert.deepEqual(empty.connections, []);
  assert.equal(existsSync(path), false);
  assert.equal(readConnectionsStore(join(path, "nope.json")).connections.length, 0);
});

test("bad urls and ids are dropped on parse", () => {
  const store = parseConnectionsStore({
    schemaVersion: 1,
    connections: [
      { ...EXCALIDRAW_CONNECTION },
      { id: "bad", kind: "mcp", name: "X", url: "http://example.com", description: "nope", authKind: "none" },
      { id: "Nope", kind: "mcp", name: "X", url: "https://ok.example.com/mcp", description: "ok enough", authKind: "none" },
      { id: "dup", kind: "mcp", name: "A", url: "https://a.example.com/mcp", description: "aaa", authKind: "none" },
      { id: "dup", kind: "mcp", name: "B", url: "https://b.example.com/mcp", description: "bbb", authKind: "none" },
    ],
  });
  assert.deepEqual(store.connections.map((row) => row.id), ["excalidraw", "dup"]);
});

test("ids slugify and collide with a suffix", () => {
  const path = tmpPath();
  assert.equal(slugifyConnectionId("Excalidraw"), "excalidraw");
  upsertConnection({ ...EXCALIDRAW_CONNECTION }, path);
  assert.equal(allocateConnectionId("Excalidraw", path), "excalidraw-2");
  assert.equal(findConnectionByUrl("https://mcp.excalidraw.com/mcp", path)?.id, "excalidraw");
});

test("Keychain values round-trip and never land in the registry JSON", () => {
  const mem = memoryKeychain();
  setKeychainDriver(mem);
  try {
    const path = tmpPath();
    upsertConnection({ ...EXCALIDRAW_CONNECTION }, path);
    keychainSet(connectionSecretService("mail"), "sk_live_secret_value");
    assert.equal(keychainGet(connectionSecretService("mail")), "sk_live_secret_value");
    assert.equal(readFileSync(path, "utf8").includes("sk_live"), false);
    assert.ok([...mem.store.values()].every((value) => !value.includes("sk_live_secret_value")));
  } finally {
    setKeychainDriver(null);
  }
});
