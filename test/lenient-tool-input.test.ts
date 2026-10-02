import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";

// GLM 5.3 Flash sent "expectedRevision":"null" and "expiresAt":"null" as strings
// (and once left expiresAt out), and every memory_upsert call failed validation.

type Parser = { safeParse: (value: unknown) => { success: boolean; data?: Record<string, unknown> } };

async function schemaOf(tool: string): Promise<Parser> {
  const mod = (await import(join(import.meta.dirname, `../agent/tools/${tool}.ts`))) as { default: { inputSchema: Parser } };
  return mod.default.inputSchema;
}

const note = { title: "t", tags: [], body: "b" };

test("memory_upsert accepts the exact inputs the model sent", async () => {
  const schema = await schemaOf("memory_upsert");
  const sent = schema.safeParse({ ...note, expectedRevision: "null", expiresAt: "null" });
  assert.equal(sent.success, true);
  assert.equal(sent.data?.expectedRevision, null);
  assert.equal(sent.data?.expiresAt, null);
  const omitted = schema.safeParse({ ...note, expectedRevision: "null" });
  assert.equal(omitted.success, true);
  assert.equal(omitted.data?.expiresAt, null);
});

test("memory_upsert reads null, empty, missing and numeric-string revisions", async () => {
  const schema = await schemaOf("memory_upsert");
  for (const value of [null, undefined, "", "null", "NULL"]) {
    const out = schema.safeParse({ ...note, expectedRevision: value, expiresAt: value });
    assert.equal(out.success, true, String(value));
    assert.equal(out.data?.expectedRevision, null);
    assert.equal(out.data?.expiresAt, null);
  }
  assert.equal(schema.safeParse({ ...note, expectedRevision: "3" }).data?.expectedRevision, 3);
  assert.equal(schema.safeParse({ ...note, expectedRevision: 3 }).data?.expectedRevision, 3);
});

test("memory_upsert still rejects a bad revision and a bad date", async () => {
  const schema = await schemaOf("memory_upsert");
  assert.equal(schema.safeParse({ ...note, expectedRevision: "abc" }).success, false);
  assert.equal(schema.safeParse({ ...note, expectedRevision: {} }).success, false);
  assert.equal(schema.safeParse({ ...note, expiresAt: "tomorrow" }).success, false);
  const good = schema.safeParse({ ...note, expiresAt: "2026-12-01T10:00:00Z" });
  assert.equal(good.success, true);
  assert.equal(good.data?.expiresAt, "2026-12-01T10:00:00Z");
});

test("memory_delete takes a numeric string revision and rejects the rest", async () => {
  const schema = await schemaOf("memory_delete");
  assert.equal(schema.safeParse({ id: "a", expectedRevision: "2" }).data?.expectedRevision, 2);
  assert.equal(schema.safeParse({ id: "a", expectedRevision: 2 }).data?.expectedRevision, 2);
  for (const bad of ["null", "", "1.5", 1.5, undefined]) {
    assert.equal(schema.safeParse({ id: "a", expectedRevision: bad }).success, false, String(bad));
  }
});

test("write_file reads a missing, empty or 'null' expectedSha256 as null", async () => {
  const schema = await schemaOf("write_file");
  for (const value of [null, undefined, "", "null"]) {
    const out = schema.safeParse({ path: "a.txt", content: "x", expectedSha256: value });
    assert.equal(out.success, true, String(value));
    assert.equal(out.data?.expectedSha256, null);
  }
  const hash = "a".repeat(64);
  assert.equal(schema.safeParse({ path: "a.txt", content: "x", expectedSha256: hash }).data?.expectedSha256, hash);
});
