import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearConnectorsKey,
  emptyConnectorsStore,
  isToolkitSlug,
  parseConnectorsStore,
  publicConnectors,
  readConnectorsStore,
  setConnectedToolkits,
  setConnectorsKey,
  updateConnectorsStore,
  writeConnectorsStore,
} from "../shared/connectors-store.ts";

function tmpPath(): string {
  return join(mkdtempSync(join(tmpdir(), "ub-conn-")), "connectors.json");
}

test("key persists 0600 and never reaches the public view", () => {
  const path = tmpPath();
  updateConnectorsStore((store) => setConnectorsKey(store, "ak_test_1234567890"), path);
  const loaded = readConnectorsStore(path);
  assert.equal(loaded.apiKey, "ak_test_1234567890");
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const pub = publicConnectors(loaded);
  assert.equal(pub.hasKey, true);
  assert.equal(pub.last4, "7890");
  assert.equal(JSON.stringify(pub).includes("ak_test"), false);
  assert.equal(JSON.stringify(pub).includes(loaded.userId), false);
});

test("a new key drops the old session and connected cache", () => {
  const store = emptyConnectorsStore();
  setConnectorsKey(store, "ak_first_12345");
  store.sessionId = "trs_old";
  setConnectedToolkits(store, ["gmail"]);
  setConnectorsKey(store, "ak_first_12345");
  assert.equal(store.sessionId, "trs_old");
  setConnectorsKey(store, "ak_second_12345");
  assert.equal(store.sessionId, null);
  assert.deepEqual(store.connectedToolkits, []);
  clearConnectorsKey(store);
  assert.equal(store.apiKey, null);
});

test("key validation refuses short, long and whitespace keys", () => {
  const store = emptyConnectorsStore();
  assert.throws(() => setConnectorsKey(store, "short"), /connectors_key/);
  assert.throws(() => setConnectorsKey(store, "has space in it"), /connectors_key/);
  assert.throws(() => setConnectorsKey(store, "x".repeat(513)), /connectors_key/);
  setConnectorsKey(store, "  ak_trimmed_ok  ");
  assert.equal(store.apiKey, "ak_trimmed_ok");
});

test("user id survives a locked update and stays stable across reads", () => {
  const path = tmpPath();
  const first = updateConnectorsStore((store) => store.userId, path);
  const second = readConnectorsStore(path).userId;
  assert.equal(first, second);
  assert.match(first, /^ub_[0-9a-f]{12}$/);
});

test("connected cache is deduped, sorted and slug-checked", () => {
  const store = emptyConnectorsStore();
  setConnectedToolkits(store, ["slack", "gmail", "slack", "Bad Slug", "github"]);
  assert.deepEqual(store.connectedToolkits, ["github", "gmail", "slack"]);
  assert.equal(isToolkitSlug("googlecalendar"), true);
  assert.equal(isToolkitSlug("GMAIL"), false);
  assert.equal(isToolkitSlug("a/b"), false);
});

test("parse rejects junk and heals partial records", () => {
  assert.throws(() => parseConnectorsStore(null), /connectors_format/);
  assert.throws(() => parseConnectorsStore({ schemaVersion: 2 }), /connectors_schema/);
  assert.throws(() => parseConnectorsStore({ schemaVersion: 1, userId: "nope" }), /connectors_user/);
  const healed = parseConnectorsStore({
    schemaVersion: 1,
    userId: "ub_0123456789ab",
    apiKey: "",
    sessionId: 42,
    connectedToolkits: ["gmail", 7, "x y"],
  });
  assert.equal(healed.apiKey, null);
  assert.equal(healed.sessionId, null);
  assert.deepEqual(healed.connectedToolkits, ["gmail"]);
});

test("update rewrites only when something changed", () => {
  const path = tmpPath();
  writeConnectorsStore(emptyConnectorsStore(), path);
  const before = readFileSync(path, "utf8");
  updateConnectorsStore(() => undefined, path);
  assert.equal(readFileSync(path, "utf8"), before);
  updateConnectorsStore((store) => setConnectedToolkits(store, ["gmail"]), path);
  assert.notEqual(readFileSync(path, "utf8"), before);
  assert.equal(typeof readConnectorsStore(path).updatedAt, "string");
});
