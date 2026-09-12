import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, resetMemoryDir } from "../agent/lib/memory.ts";

test("upsert search read and revision conflict", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  const created = store.upsert({
    expectedRevision: null,
    title: "Writing preference",
    tags: ["writing"],
    body: "Use short sentences.",
    audience: "desktop",
    expiresAt: null,
    sessionId: "00000000-0000-4000-8000-000000000002",
  });
  const hits = store.search("short", "desktop");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, created.id);
  const read = store.read(created.id, "desktop");
  assert.match(read.body, /short sentences/);
  assert.throws(
    () => store.upsert({
      id: created.id,
      expectedRevision: 99,
      title: "Writing preference",
      tags: ["writing"],
      body: "changed",
      audience: "desktop",
      expiresAt: null,
      sessionId: "s",
    }),
    /memory_revision_conflict/,
  );
});

test("phone audience cannot read desktop notes", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  const created = store.upsert({
    expectedRevision: null,
    title: "Desktop only",
    tags: ["private"],
    body: "Stay on the Mac.",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  assert.equal(store.search("Mac", "shared-phone").length, 0);
  assert.throws(() => store.read(created.id, "shared-phone"), /memory_forbidden/);
});

test("secret-like bodies are refused", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  assert.throws(
    () => store.upsert({
      expectedRevision: null,
      title: "keys",
      tags: [],
      body: "api_key=not-a-real-secret-but-blocked",
      audience: "desktop",
      expiresAt: null,
      sessionId: "s",
    }),
    /memory_secret_refused/,
  );
});

test("rebuild index from markdown", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  store.upsert({
    expectedRevision: null,
    title: "Rebuild me",
    tags: ["index"],
    body: "Persian سلام and emoji 🙂 and code const x = 1;",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  const rebuilt = store.rebuildIndex();
  assert.equal(rebuilt.indexed, 1);
  assert.equal(store.search("سلام", "desktop").length, 1);
});
