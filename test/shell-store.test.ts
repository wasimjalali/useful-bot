import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultFaceFor, isAvatarColor, isAvatarShape } from "../shared/bot-face.ts";
import {
  applyShellAction,
  DEFAULT_BOT_ID,
  parseShell,
  pinnedBots,
  searchBots,
  searchShell,
  sectionBots,
  seedStore,
  selectedBot,
} from "../shared/shell-store.ts";
import { readShell, writeShell } from "../shared/shell-io.ts";

test("setWorkspace attaches, updates and detaches a conversation folder", () => {
  let store = seedStore();
  store = applyShellAction(store, {
    type: "setWorkspace",
    botId: DEFAULT_BOT_ID,
    workspace: { path: "/tmp/project", permission: "guard", finalConfirm: false },
  }).store;
  const attached = store.bots[0].workspace;
  assert.equal(attached?.path, "/tmp/project");
  assert.equal(attached?.permission, "guard");
  store = applyShellAction(store, {
    type: "setWorkspace",
    botId: DEFAULT_BOT_ID,
    workspace: { path: "/tmp/project", permission: "full_access", finalConfirm: true },
  }).store;
  assert.equal(store.bots[0].workspace?.permission, "full_access");
  assert.equal(store.bots[0].workspace?.finalConfirm, true);
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
        workspace: { path: "relative/path", permission: "guard", finalConfirm: false },
      }),
    /workspace_path_invalid/,
  );
});

test("seed store has compact Useful Bot in Unassigned", () => {
  const store = seedStore(new Date("2026-09-12T00:00:00Z"));
  assert.equal(store.bots.length, 1);
  assert.equal(store.bots[0].id, DEFAULT_BOT_ID);
  assert.equal(store.bots[0].pinned, false);
  assert.equal(store.bots[0].sectionId, null);
  assert.equal(selectedBot(store).name, "Useful Bot");
});

test("create section pin move hide delete and new chat", () => {
  let store = seedStore();
  const section = applyShellAction(store, { type: "createSection", name: "Work" });
  store = section.store;
  const created = applyShellAction(store, {
    type: "createBot",
    name: "Researcher",
    label: "R",
    description: "Looks things up.",
    sectionId: section.createdId,
  });
  store = created.store;
  assert.equal(selectedBot(store).name, "Researcher");
  assert.equal(selectedBot(store).avatarCustom, true);
  assert.equal(isAvatarShape(selectedBot(store).avatarShape), true);
  assert.equal(isAvatarColor(selectedBot(store).avatarColor), true);
  assert.equal(selectedBot(store).avatarShape, defaultFaceFor(created.createdId!).shape);
  assert.equal(selectedBot(store).avatarColor, defaultFaceFor(created.createdId!).color);
  store = applyShellAction(store, { type: "pin", botId: created.createdId! }).store;
  assert.equal(pinnedBots(store).length, 1);
  assert.equal(sectionBots(store, section.createdId!).length, 0);
  store = applyShellAction(store, { type: "pin", botId: created.createdId!, pinned: false }).store;
  store = applyShellAction(store, { type: "move", botId: created.createdId!, sectionId: null }).store;
  assert.equal(sectionBots(store, null).some((bot) => bot.id === created.createdId), true);
  store = applyShellAction(store, { type: "hide", botId: created.createdId! }).store;
  assert.equal(store.bots.find((bot) => bot.id === created.createdId)?.hidden, true);
  assert.equal(store.selectedBotId, DEFAULT_BOT_ID);
  store = applyShellAction(store, { type: "hide", botId: created.createdId!, hidden: false }).store;
  store = applyShellAction(store, { type: "deleteBot", botId: created.createdId! }).store;
  assert.equal(store.bots.length, 1);
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

test("group members and persist roundtrip", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-shell-"));
  const path = join(dir, "shell.json");
  let store = seedStore();
  const bot = applyShellAction(store, { type: "createBot", name: "Reviewer", label: "Rev" });
  store = bot.store;
  // The default Useful Bot answers untargeted group turns, so it is never a
  // member. A group needs two real bots.
  assert.throws(
    () => applyShellAction(store, {
      type: "createGroup",
      name: "Desk",
      memberIds: [DEFAULT_BOT_ID, bot.createdId!],
    }),
    /shell_group_members/,
  );
  const second = applyShellAction(store, { type: "createBot", name: "Writer" });
  store = second.store;
  const group = applyShellAction(store, {
    type: "createGroup",
    name: "Desk",
    memberIds: [bot.createdId!, second.createdId!],
  });
  store = group.store;
  assert.equal(selectedBot(store).kind, "group");
  assert.equal(selectedBot(store).memberIds.length, 2);
  writeShell(store, path);
  const loaded = readShell(path);
  assert.equal(loaded.bots.length, 4);
  assert.equal(searchBots(loaded, "rev").some((item) => item.label === "Rev"), true);
  store = applyShellAction(loaded, { type: "setSession", botId: group.createdId!, sessionId: "sess-1" }).store;
  assert.equal(store.bots.find((item) => item.id === group.createdId)?.sessionId, "sess-1");
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

test("search palette finds hidden bots and recents", () => {
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
  store = applyShellAction(store, { type: "hide", botId: created.createdId! }).store;
  assert.equal(searchBots(store, "first").some((bot) => bot.id === created.createdId), true);
  assert.equal(searchBots(store, "").some((bot) => bot.id === created.createdId), false);
  const hits = searchShell(store, "script");
  assert.equal(hits.some((hit) => hit.kind === "new-chat"), true);
  assert.equal(hits.some((hit) => hit.kind === "recent" && hit.recent.preview.includes("write a script")), true);
  assert.equal(hits.some((hit) => hit.kind === "bot" && hit.bot.hidden && hit.bot.name === "First Frame"), true);
  const empty = searchShell(store, "");
  assert.equal(empty.some((hit) => hit.kind === "bot" && hit.bot.hidden), false);
  assert.equal(empty.some((hit) => hit.kind === "recent"), true);
  const messages = searchShell(store, "script", "messages");
  assert.equal(messages.every((hit) => hit.kind === "recent"), true);
  const botsOnly = searchShell(store, "first", "bots");
  assert.equal(botsOnly.every((hit) => hit.kind === "bot"), true);
  assert.equal(searchShell(store, "", "groups").length, 0);
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
