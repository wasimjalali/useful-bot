import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GRANTS_MAX,
  parseWorkspacePermission,
  parseWorkspaceStore,
  readSessionGrant,
  readWorkspaceStore,
  removeProject,
  upsertProject,
  upsertSessionGrant,
} from "../shared/workspace-store.ts";

function tempStore(): string {
  const dir = mkdtempSync(join(tmpdir(), "ub-workspace-"));
  return join(dir, "workspace.json");
}

test("permission parsing accepts only the three modes", () => {
  assert.equal(parseWorkspacePermission("read_only"), "read_only");
  assert.equal(parseWorkspacePermission("guard"), "guard");
  assert.equal(parseWorkspacePermission("full_access"), "full_access");
  assert.equal(parseWorkspacePermission("owner"), null);
  assert.equal(parseWorkspacePermission(undefined), null);
});

test("grant upsert round-trips and a newer write wins per session", () => {
  const path = tempStore();
  upsertSessionGrant(
    { sessionId: "s1", path: "/tmp/a", permission: "guard", finalConfirm: false },
    new Date("2026-09-14T10:00:00Z"),
    path,
  );
  upsertSessionGrant(
    { sessionId: "s1", path: "/tmp/b", permission: "full_access", finalConfirm: true },
    new Date("2026-09-14T11:00:00Z"),
    path,
  );
  upsertSessionGrant(
    { sessionId: "s2", path: "/tmp/c", permission: "read_only", finalConfirm: false },
    new Date("2026-09-14T09:00:00Z"),
    path,
  );
  const store = readWorkspaceStore(path);
  assert.equal(store.grants.length, 2);
  const s1 = store.grants.find((grant) => grant.sessionId === "s1");
  assert.equal(s1?.path, "/tmp/b");
  assert.equal(s1?.permission, "full_access");
  assert.equal(s1?.finalConfirm, true);
  const grant = readSessionGrant("s1", path);
  assert.equal(grant?.permission, "full_access");
  assert.equal(readSessionGrant("missing", path), null);
  assert.equal(readSessionGrant("", path), null);
});

test("grant pruning keeps the newest window", () => {
  const path = tempStore();
  for (let i = 0; i < GRANTS_MAX + 10; i++) {
    upsertSessionGrant(
      { sessionId: `s${i}`, path: `/tmp/${i}`, permission: "guard", finalConfirm: false },
      new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      path,
    );
  }
  const store = readWorkspaceStore(path);
  assert.equal(store.grants.length, GRANTS_MAX);
  // Oldest sessions fall out; the newest stays.
  assert.equal(store.grants.some((grant) => grant.sessionId === "s0"), false);
  assert.equal(store.grants.some((grant) => grant.sessionId === `s${GRANTS_MAX + 9}`), true);
});

test("projects dedupe by path, and remove by id", () => {
  const path = tempStore();
  upsertProject({ path: "/tmp/proj", name: "proj" }, new Date("2026-09-14T10:00:00Z"), path);
  upsertProject({ path: "/tmp/proj", name: "proj renamed" }, new Date("2026-09-14T11:00:00Z"), path);
  upsertProject({ path: "/tmp/other", name: "other" }, new Date("2026-09-14T11:00:00Z"), path);
  const store = readWorkspaceStore(path);
  assert.equal(store.projects.length, 2);
  const proj = store.projects.find((item) => item.path === "/tmp/proj");
  assert.equal(proj?.name, "proj renamed");
  removeProject(proj!.id, path);
  assert.equal(readWorkspaceStore(path).projects.some((item) => item.path === "/tmp/proj"), false);
});

test("a corrupt store reads as empty instead of blocking a turn", () => {
  const path = tempStore();
  writeFileSync(path, "{not json", { encoding: "utf8" });
  assert.deepEqual(readWorkspaceStore(path), { schemaVersion: 1, grants: [], projects: [] });
});

test("parse tolerates unknown and malformed records", () => {
  const parsed = parseWorkspaceStore({
    schemaVersion: 1,
    grants: [
      { sessionId: "ok", path: "/tmp/x", permission: "guard", finalConfirm: false, extra: "kept" },
      { sessionId: "", path: "/tmp/y", permission: "guard" },
      { sessionId: "badpath", path: "not-absolute", permission: "guard" },
      { sessionId: "badmode", path: "/tmp/z", permission: "admin" },
      "junk",
    ],
    projects: [{ id: "p", path: "/tmp/p", name: "p", extra: true }, null],
    someday: true,
  });
  assert.equal(parsed.grants.length, 1);
  assert.equal(parsed.projects.length, 1);
  assert.equal(parsed.schemaVersion, 1);
});
