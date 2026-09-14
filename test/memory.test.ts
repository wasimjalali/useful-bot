import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, botTag, resetMemoryDir, tagsForBot } from "../agent/lib/memory.ts";

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

test("list returns desktop notes and hides phone audience", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  store.upsert({
    expectedRevision: null,
    title: "Desktop note",
    tags: ["pref"],
    body: "Short sentences.",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  store.upsert({
    expectedRevision: null,
    title: "Phone note",
    tags: ["phone"],
    body: "Not for the Mac list.",
    audience: "shared-phone",
    expiresAt: null,
    sessionId: "s",
  });
  const listed = store.list("desktop");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, "Desktop note");
  assert.equal(listed[0].tags[0], "pref");
  assert.equal(store.list("shared-phone").length, 1);
});

test("fts operator characters in a query do not throw", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  store.upsert({
    expectedRevision: null,
    title: "Pricing",
    tags: ["pricing"],
    body: "Short sentences about pricing.",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  for (const query of ['"', "OR", "*", "(", "pricing AND"]) {
    assert.doesNotThrow(() => store.search(query, "desktop"), `query ${query}`);
  }
  assert.equal(store.search("pricing", "desktop").length, 1);
  assert.equal(store.search("*", "desktop").length, 0);
});

test("note ids cannot traverse out of the notes directory", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  assert.throws(() => store.read("../outside", "desktop"), /memory_id_invalid/);
  assert.throws(
    () => store.upsert({
      id: "../outside",
      expectedRevision: null,
      title: "t",
      tags: [],
      body: "x",
      audience: "desktop",
      expiresAt: null,
      sessionId: "s",
    }),
    /memory_id_invalid/,
  );
});

test("an update cannot move a note across the audience boundary", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  const created = store.upsert({
    expectedRevision: null,
    title: "Private",
    tags: [],
    body: "desktop only",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  assert.throws(
    () => store.upsert({
      id: created.id,
      expectedRevision: 1,
      title: "Private",
      tags: [],
      body: "desktop only",
      audience: "shared-phone",
      expiresAt: null,
      sessionId: "s",
    }),
    /memory_audience_change/,
  );
});

test("revision is enforced across two stores on the same directory", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const first = new MemoryStore(root);
  const second = new MemoryStore(root);
  const created = first.upsert({
    expectedRevision: null,
    title: "Shared",
    tags: [],
    body: "one",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  second.upsert({
    id: created.id,
    expectedRevision: 1,
    title: "Shared",
    tags: [],
    body: "two",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  assert.throws(
    () => first.upsert({
      id: created.id,
      expectedRevision: 1,
      title: "Shared",
      tags: [],
      body: "three",
      audience: "desktop",
      expiresAt: null,
      sessionId: "s",
    }),
    /memory_revision_conflict/,
  );
  assert.equal(first.read(created.id, "desktop").body, "two");
});

test("list can isolate notes to one bot tag", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-mem-"));
  resetMemoryDir(root);
  const store = new MemoryStore(root);
  store.upsert({
    expectedRevision: null,
    title: "CEO pref",
    tags: tagsForBot(["writing"], "ceo"),
    body: "Short sentences.",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  store.upsert({
    expectedRevision: null,
    title: "SEO pref",
    tags: tagsForBot(["seo"], "seo"),
    body: "Keyword notes.",
    audience: "desktop",
    expiresAt: null,
    sessionId: "s",
  });
  const ceo = store.list("desktop", 100, "ceo");
  const seo = store.list("desktop", 100, "seo");
  assert.equal(ceo.length, 1);
  assert.equal(ceo[0].title, "CEO pref");
  assert.equal(ceo[0].tags.includes(botTag("ceo")), true);
  assert.equal(seo.length, 1);
  assert.equal(seo[0].title, "SEO pref");
  assert.equal(store.list("desktop", 100, "missing").length, 0);
});
