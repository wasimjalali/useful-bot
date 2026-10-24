import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultFaceFor, isAvatarColor, isAvatarShape } from "../shared/bot-face.ts";
import {
  applyShellAction,
  checkDescription,
  DEFAULT_BOT_ID,
  DESCRIPTION_MAX,
  isShellActionType,
  parseShell,
  searchBots,
  searchShell,
  seedStore,
  selectedBot,
  staleSessionIds,
} from "../shared/shell-store.ts";
import { readShell, writeShell } from "../shared/shell-io.ts";

test("setWorkspace attaches, updates and detaches a conversation folder", () => {
  let store = seedStore();
  store = applyShellAction(store, {
    type: "setWorkspace",
    botId: DEFAULT_BOT_ID,
    workspace: { path: "/tmp/project", permission: "auto" },
  }).store;
  const attached = store.bots[0].workspace;
  assert.equal(attached?.path, "/tmp/project");
  assert.equal(attached?.permission, "auto");
  store = applyShellAction(store, {
    type: "setWorkspace",
    botId: DEFAULT_BOT_ID,
    workspace: { path: "/tmp/project", permission: "full_access" },
  }).store;
  assert.equal(store.bots[0].workspace?.permission, "full_access");
  store = applyShellAction(store, { type: "setWorkspace", botId: DEFAULT_BOT_ID, workspace: null }).store;
  assert.equal(store.bots[0].workspace, null);
});

test("setWorkspace rejects an unknown bot and a malformed grant", () => {
  const store = seedStore();
  assert.throws(
    () => applyShellAction(store, { type: "setWorkspace", botId: "nope", workspace: null }),
    /shell_bot_missing/,
  );
  // A relative path is not a folder the desktop picker could have returned.
  assert.throws(
    () =>
      applyShellAction(store, {
        type: "setWorkspace",
        botId: DEFAULT_BOT_ID,
        workspace: { path: "relative/path", permission: "auto" },
      }),
    /workspace_path_invalid/,
  );
  // An unknown permission word fails the write instead of becoming Auto.
  assert.throws(
    () =>
      applyShellAction(store, {
        type: "setWorkspace",
        botId: DEFAULT_BOT_ID,
        workspace: { path: "/tmp/project", permission: "admin" as never },
      }),
    /workspace_permission_invalid/,
  );
});

test("seed store has the Generalist and none of the removed rail fields", () => {
  const store = seedStore(new Date("2026-09-12T00:00:00Z"));
  assert.equal(store.bots.length, 1);
  assert.equal(store.bots[0].id, DEFAULT_BOT_ID);
  assert.equal(selectedBot(store).name, "Generalist");
  const wire = JSON.parse(JSON.stringify(store)) as Record<string, unknown> & { bots: Array<Record<string, unknown>> };
  for (const key of ["sections", "collapsedUnassigned", "collapsedHidden"]) assert.equal(key in wire, false, key);
  for (const key of ["pinned", "hidden", "sectionId", "memberIds"]) assert.equal(key in wire.bots[0], false, key);
});

function createNamed(store: ReturnType<typeof seedStore>, name: string) {
  return applyShellAction(store, { type: "createBot", name });
}

test("a new bot lands behind the Generalist, and the Generalist stays first after a restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-shell-"));
  const path = join(dir, "shell.json");
  let store = readShell(path);
  const made = createNamed(store, "Alpha");
  assert.deepEqual(made.store.bots.map((bot) => bot.name), ["Generalist", "Alpha"]);
  store = made.store;
  writeShell(store, path);
  const loaded = readShell(path);
  assert.deepEqual(loaded.bots.map((bot) => bot.name), ["Generalist", "Alpha"]);
  assert.equal(existsSync(`${path}.reseeded`), false);
  // Without the Generalist first, a new bot simply prepends.
  const swapped = { ...store, bots: [store.bots[1], store.bots[0]] };
  assert.equal(createNamed(swapped, "Beta").store.bots[0].name, "Beta");
});

test("a store written with the rail's pins, sections and groups still reads, and drops those fields", () => {
  const seed = seedStore();
  const alpha = createNamed(seed, "Alpha").store.bots.find((bot) => bot.name === "Alpha")!;
  const legacyBot = (bot: typeof alpha, extra: Record<string, unknown>) => ({
    ...bot,
    pinned: true,
    hidden: false,
    sectionId: "sec-1",
    memberIds: [],
    ...extra,
  });
  const legacy = {
    ...seed,
    collapsedUnassigned: true,
    collapsedHidden: false,
    sections: [{ id: "sec-1", name: "Work", collapsed: false, order: 0 }],
    bots: [
      legacyBot(seed.bots[0], {}),
      legacyBot(alpha, { hidden: true, sectionId: null }),
      legacyBot({ ...alpha, id: "group-1", name: "Desk", kind: "group" }, { memberIds: [seed.bots[0].id, alpha.id] }),
    ],
  };
  const parsed = parseShell(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(parsed.bots.map((bot) => [bot.name, bot.kind]), [["Generalist", "bot"], ["Alpha", "bot"], ["Desk", "group"]]);
  const wire = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown> & { bots: Array<Record<string, unknown>> };
  for (const key of ["sections", "collapsedUnassigned", "collapsedHidden"]) assert.equal(key in wire, false, key);
  for (const bot of wire.bots) {
    for (const key of ["pinned", "hidden", "sectionId", "memberIds"]) assert.equal(key in bot, false, key);
  }
});

test("the actions of the removed rail, groups and hand-offs are not actions any more", () => {
  const store = seedStore();
  const removed = [
    { type: "createGroup", name: "Desk", memberIds: [] },
    { type: "createSection", name: "Work" },
    { type: "renameSection", sectionId: "x", name: "Y" },
    { type: "deleteSection", sectionId: "x" },
    { type: "pin", botId: DEFAULT_BOT_ID },
    { type: "hide", botId: DEFAULT_BOT_ID },
    { type: "move", botId: DEFAULT_BOT_ID, sectionId: null },
    { type: "sendToBot", botId: DEFAULT_BOT_ID, message: "hi" },
    { type: "toggleSection", sectionId: "unassigned" },
  ];
  for (const action of removed) {
    assert.equal(isShellActionType(action.type), false, action.type);
    assert.throws(() => applyShellAction(store, action as never), /shell_action_unknown/, action.type);
  }
  for (const type of ["select", "createBot", "renameBot", "nameBot", "updateBot", "deleteBot", "setSession", "setWorkspace", "setPermission", "touchChat", "newChat", "clearThread", "openRecent", "connectApp", "connectServer"]) {
    assert.equal(isShellActionType(type), true, type);
  }
  assert.equal(isShellActionType(undefined), false);
  assert.equal(isShellActionType("constructor"), false);
});

test("create, select, delete and new chat", () => {
  let store = seedStore();
  const created = applyShellAction(store, {
    type: "createBot",
    name: "Researcher",
    label: "R",
    description: "Looks things up.",
  });
  store = created.store;
  assert.equal(selectedBot(store).name, "Researcher");
  assert.equal(selectedBot(store).avatarCustom, true);
  assert.equal(isAvatarShape(selectedBot(store).avatarShape), true);
  assert.equal(isAvatarColor(selectedBot(store).avatarColor), true);
  assert.equal(selectedBot(store).avatarShape, defaultFaceFor(created.createdId!).shape);
  assert.equal(selectedBot(store).avatarColor, defaultFaceFor(created.createdId!).color);
  store = applyShellAction(store, { type: "select", botId: DEFAULT_BOT_ID }).store;
  assert.equal(store.selectedBotId, DEFAULT_BOT_ID);
  assert.throws(() => applyShellAction(store, { type: "select", botId: "nope" }), /shell_bot_missing/);
  // Deleting the selected bot falls back to the first one left.
  store = applyShellAction(store, { type: "select", botId: created.createdId! }).store;
  store = applyShellAction(store, { type: "deleteBot", botId: created.createdId! }).store;
  assert.equal(store.bots.length, 1);
  assert.equal(store.selectedBotId, DEFAULT_BOT_ID);
  store = applyShellAction(store, { type: "setSession", botId: DEFAULT_BOT_ID, sessionId: "sess-old" }).store;
  store = applyShellAction(store, { type: "touchChat", botId: DEFAULT_BOT_ID, preview: "hello there" }).store;
  const chat = applyShellAction(store, { type: "newChat" });
  store = chat.store;
  assert.equal(store.bots.length, 1);
  assert.equal(selectedBot(store).id, DEFAULT_BOT_ID);
  assert.equal(selectedBot(store).sessionId, null);
  assert.equal(selectedBot(store).lastPreview, "");
  assert.equal(store.recents.length, 1);
  assert.equal(store.recents[0].sessionId, "sess-old");
  assert.equal(store.recents[0].preview, "hello there");
  store = applyShellAction(store, { type: "openRecent", recentId: store.recents[0].id }).store;
  assert.equal(selectedBot(store).sessionId, "sess-old");
});

test("refuses deleting the last bot and tolerates unknown keys", () => {
  const store = seedStore();
  assert.throws(() => applyShellAction(store, { type: "deleteBot", botId: DEFAULT_BOT_ID }), /shell_last_bot/);
  // Forward compatibility: a newer build's extra field must not wipe the store.
  const parsed = parseShell({ ...store, extra: true, bots: store.bots.map((bot) => ({ ...bot, extra: 1 })) });
  assert.equal(parsed.bots.length, store.bots.length);
});

test("persist roundtrip, and a createBot that asks for a group makes a plain bot", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-shell-"));
  const path = join(dir, "shell.json");
  let store = seedStore();
  // Groups are gone. A client that still sends kind "group" gets a plain bot,
  // never a group with no members.
  const bot = applyShellAction(store, { type: "createBot", name: "Reviewer", label: "Rev", kind: "group" } as never);
  store = bot.store;
  assert.equal(store.bots.find((item) => item.id === bot.createdId)?.kind, "bot");
  writeShell(store, path);
  const loaded = readShell(path);
  assert.equal(loaded.bots.length, 2);
  assert.equal(searchBots(loaded, "rev").some((item) => item.label === "Rev"), true);
  store = applyShellAction(loaded, { type: "setSession", botId: bot.createdId!, sessionId: "sess-1" }).store;
  assert.equal(store.bots.find((item) => item.id === bot.createdId)?.sessionId, "sess-1");
});

test("readShell reseeds an incompatible file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-shell-"));
  const path = join(dir, "shell.json");
  writeFileSync(path, `${JSON.stringify({ schemaVersion: 1, operatorName: "x", bots: [], sections: [] })}\n`);
  const loaded = readShell(path);
  assert.equal(loaded.bots[0].id, DEFAULT_BOT_ID);
  assert.equal(loaded.schemaVersion, 1);
  assert.equal(loaded.recents.length, 0);
});

test("search finds bots and recents", () => {
  let store = seedStore();
  const created = applyShellAction(store, {
    type: "createBot",
    name: "First Frame",
    label: "Video",
    description: "Short form scripts",
  });
  store = created.store;
  store = applyShellAction(store, { type: "touchChat", botId: created.createdId!, preview: "write a script" }).store;
  store = applyShellAction(store, { type: "setSession", botId: created.createdId!, sessionId: "sess-ff" }).store;
  store = applyShellAction(store, { type: "newChat", botId: created.createdId! }).store;
  assert.equal(searchBots(store, "first").some((bot) => bot.id === created.createdId), true);
  assert.equal(searchBots(store, "").length, store.bots.length);
  const hits = searchShell(store, "script");
  assert.equal(hits.some((hit) => hit.kind === "new-chat"), true);
  assert.equal(hits.some((hit) => hit.kind === "recent" && hit.recent.preview.includes("write a script")), true);
  assert.equal(hits.some((hit) => hit.kind === "bot" && hit.bot.name === "First Frame"), true);
  const empty = searchShell(store, "");
  assert.equal(empty.some((hit) => hit.kind === "recent"), true);
  const messages = searchShell(store, "script", "messages");
  assert.equal(messages.every((hit) => hit.kind === "recent"), true);
  const botsOnly = searchShell(store, "first", "bots");
  assert.equal(botsOnly.every((hit) => hit.kind === "bot"), true);
  assert.equal(searchShell(store, "script", "files").length, 0);
  assert.equal(searchShell(store, "script", "routines").length, 0);
});

test("parseShell accepts bots without lastPreview from older files", () => {
  const seeded = seedStore(new Date("2026-09-12T00:00:00Z"));
  const raw = JSON.parse(JSON.stringify(seeded)) as {
    bots: Array<Record<string, unknown>>;
    recents?: unknown;
  };
  delete raw.bots[0].lastPreview;
  delete raw.bots[0].lastAt;
  delete raw.bots[0].avatarShape;
  delete raw.bots[0].avatarColor;
  delete raw.bots[0].avatarImage;
  delete raw.bots[0].avatarCustom;
  delete raw.recents;
  const parsed = parseShell(raw);
  assert.equal(parsed.bots[0].lastPreview, "");
  assert.equal(parsed.bots[0].lastAt, null);
  assert.equal(parsed.recents.length, 0);
  assert.equal(parsed.bots[0].avatarCustom, false);
  assert.equal(isAvatarShape(parsed.bots[0].avatarShape), true);
  assert.equal(isAvatarColor(parsed.bots[0].avatarColor), true);
});

test("updateBot writes a custom face", () => {
  let store = seedStore();
  const created = applyShellAction(store, { type: "createBot", name: "SEO" });
  store = applyShellAction(created.store, {
    type: "updateBot",
    botId: created.createdId!,
    patch: { avatarShape: "drop", avatarColor: "gold", avatarCustom: true },
  }).store;
  const bot = store.bots.find((item) => item.id === created.createdId);
  assert.equal(bot?.avatarShape, "drop");
  assert.equal(bot?.avatarColor, "gold");
});

test("a roster naming an ungrantable folder reads back with no workspace", () => {
  const store = parseShell({
    ...seedStore(),
    bots: [{
      ...seedStore().bots[0],
      workspace: { path: "/", permission: "full_access" },
    }],
  });
  // Tolerant, not fatal: the bot keeps working, it just has no folder.
  assert.equal(store.bots[0].workspace, null);
});

test("setWorkspace refuses a root the grants store would reject", () => {
  const base = seedStore();
  const botId = base.bots[0].id;
  for (const bad of ["/", "/Users/someone/.ssh", "/Users/someone/Library/Keychains"]) {
    assert.throws(
      () => applyShellAction(base, {
        type: "setWorkspace",
        botId,
        workspace: { path: bad, permission: "auto" },
      }),
      /workspace_path_invalid/,
      bad,
    );
  }
});

test("staleSessionIds revokes a session nobody holds after the commit", () => {
  const base = seedStore();
  const botId = base.bots[0].id;
  const before = applyShellAction(base, { type: "setSession", botId, sessionId: "sess-old" }).store;
  const after = applyShellAction(before, { type: "setSession", botId, sessionId: "sess-new" }).store;
  const action = { type: "setSession", botId, sessionId: "sess-new" } as const;
  assert.deepEqual(staleSessionIds(action, before, after), ["sess-old"]);
});

test("staleSessionIds leaves a session that only moved between bots", () => {
  const base = applyShellAction(seedStore(), { type: "createBot", name: "Scout" }).store;
  const [first, second] = base.bots;
  const before = applyShellAction(base, { type: "setSession", botId: first.id, sessionId: "sess-1" }).store;
  // The same session is now held by the other bot. Nobody lost the capability,
  // so the diff must not revoke it.
  const moved = applyShellAction(before, { type: "setSession", botId: first.id, sessionId: null }).store;
  const after = applyShellAction(moved, { type: "setSession", botId: second.id, sessionId: "sess-1" }).store;
  const action = { type: "setSession", botId: second.id, sessionId: "sess-1" } as const;
  assert.deepEqual(staleSessionIds(action, before, after), []);
});

test("staleSessionIds catches a detach, where the session id never changes", () => {
  const base = seedStore();
  const botId = base.bots[0].id;
  const withSession = applyShellAction(base, { type: "setSession", botId, sessionId: "sess-1" }).store;
  const before = applyShellAction(withSession, {
    type: "setWorkspace",
    botId,
    workspace: { path: "/tmp", permission: "auto" },
  }).store;
  const action = { type: "setWorkspace", botId, workspace: null } as const;
  const after = applyShellAction(before, action).store;
  assert.deepEqual(staleSessionIds(action, before, after), ["sess-1"]);
});

test("staleSessionIds revokes the deleted bot's session and nobody else's", () => {
  const base = applyShellAction(seedStore(), { type: "createBot", name: "Scout" }).store;
  const [keep, drop] = base.bots;
  const a = applyShellAction(base, { type: "setSession", botId: keep.id, sessionId: "sess-keep" }).store;
  const before = applyShellAction(a, { type: "setSession", botId: drop.id, sessionId: "sess-drop" }).store;
  const action = { type: "deleteBot", botId: drop.id } as const;
  const after = applyShellAction(before, action).store;
  assert.deepEqual(staleSessionIds(action, before, after), ["sess-drop"]);
});

test("staleSessionIds revokes nothing when there is no action", () => {
  const base = applyShellAction(seedStore(), {
    type: "setSession",
    botId: seedStore().bots[0].id,
    sessionId: "sess-1",
  }).store;
  assert.deepEqual(staleSessionIds(undefined, base, base), []);
});

test("setPermission is the bot's own setting, mirrored onto an attached folder", () => {
  let store = seedStore();
  assert.equal(store.bots[0].permission, "auto");
  store = applyShellAction(store, { type: "setPermission", botId: DEFAULT_BOT_ID, permission: "read_only" }).store;
  assert.equal(store.bots[0].permission, "read_only");
  assert.equal(store.bots[0].workspace, null);
  store = applyShellAction(store, {
    type: "setWorkspace",
    botId: DEFAULT_BOT_ID,
    workspace: { path: "/tmp/project", permission: "auto" },
  }).store;
  // Attaching a folder with a permission sets the bot's, so the two never disagree.
  assert.equal(store.bots[0].permission, "auto");
  store = applyShellAction(store, { type: "setPermission", botId: DEFAULT_BOT_ID, permission: "full_access" }).store;
  assert.equal(store.bots[0].permission, "full_access");
  assert.equal(store.bots[0].workspace?.permission, "full_access");
  assert.throws(
    () => applyShellAction(store, { type: "setPermission", botId: "nope", permission: "auto" }),
    /shell_bot_missing/,
  );
  assert.throws(
    () => applyShellAction(store, { type: "setPermission", botId: DEFAULT_BOT_ID, permission: "root" as never }),
    /workspace_permission_invalid/,
  );
  // A roster from before the bot-level field keeps the folder's value.
  const legacy = parseShell({
    ...seedStore(),
    bots: seedStore().bots.map((bot) => ({ ...bot, permission: undefined, workspace: { path: "/tmp/p", permission: "read_only" } })),
  });
  assert.equal(legacy.bots[0].permission, "read_only");
});

// UB-009: a description is kept to 8,000 characters by refusing, never by clipping.

test("the description cap is 8,000", () => {
  assert.equal(DESCRIPTION_MAX, 8000);
});

test("checkDescription trims, keeps 8,000 and refuses 8,001 without slicing", () => {
  assert.equal(checkDescription(`  ${"a".repeat(8000)}\n`), "a".repeat(8000));
  assert.throws(() => checkDescription("a".repeat(8001)), /shell_description_too_long/);
  assert.throws(() => checkDescription("a".repeat(2001), 2000), /shell_description_too_long/);
});

test("every write path keeps 8,000 characters and refuses 8,001", () => {
  const ok = "d".repeat(8000);
  const over = "d".repeat(8001);
  const base = seedStore();
  const store = applyShellAction(base, { type: "createBot", name: "A" }).store;
  const a = store.bots.find((bot) => bot.id !== DEFAULT_BOT_ID)!.id;

  assert.equal(applyShellAction(base, { type: "createBot", name: "X", description: ok }).store.bots[1].description, ok);
  assert.throws(() => applyShellAction(base, { type: "createBot", name: "X", description: over }), /shell_description_too_long/);

  assert.equal(applyShellAction(store, { type: "nameBot", botId: a, name: "A", description: ok }).store.bots.find((bot) => bot.id === a)?.description, ok);
  assert.throws(() => applyShellAction(store, { type: "nameBot", botId: a, name: "A", description: over }), /shell_description_too_long/);

  assert.equal(applyShellAction(store, { type: "updateBot", botId: a, patch: { description: ok } }).store.bots.find((bot) => bot.id === a)?.description, ok);
  assert.throws(() => applyShellAction(store, { type: "updateBot", botId: a, patch: { description: over } }), /shell_description_too_long/);
});

test("a refused update leaves the stored description and revision as they were", () => {
  const created = applyShellAction(seedStore(), { type: "createBot", name: "A", description: "keep me" });
  const id = created.createdId ?? "";
  assert.throws(
    () => applyShellAction(created.store, { type: "updateBot", botId: id, patch: { name: "Renamed", description: "z".repeat(8001) } }),
    /shell_description_too_long/,
  );
  const bot = created.store.bots.find((item) => item.id === id);
  assert.equal(bot?.description, "keep me");
  assert.equal(bot?.name, "A");
});

test("a 9,000-character description in the file is read verbatim and the store is not reseeded", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-shell-"));
  const path = join(dir, "shell.json");
  const long = "w".repeat(9000);
  const stored = applyShellAction(seedStore(), { type: "createBot", name: "Long", description: "short" }).store;
  stored.bots = stored.bots.map((bot) => (bot.name === "Long" ? { ...bot, description: long } : bot));
  writeFileSync(path, JSON.stringify(stored), "utf8");
  const loaded = readShell(path);
  assert.equal(loaded.bots.length, 2);
  assert.equal(loaded.bots.find((bot) => bot.name === "Long")?.description, long);
  assert.equal(existsSync(`${path}.reseeded`), false);
  assert.equal(parseShell(JSON.parse(JSON.stringify(stored))).bots[1].description.length, 9000);
});
