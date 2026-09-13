import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("refuses deleting the last bot and unknown keys", () => {
  const store = seedStore();
  assert.throws(() => applyShellAction(store, { type: "deleteBot", botId: DEFAULT_BOT_ID }), /shell_last_bot/);
  assert.throws(() => parseShell({ ...store, extra: true }), /shell_unknown_key/);
});

test("group members and persist roundtrip", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-shell-"));
  const path = join(dir, "shell.json");
  let store = seedStore();
  const bot = applyShellAction(store, { type: "createBot", name: "Reviewer", label: "Rev" });
  store = bot.store;
  const group = applyShellAction(store, {
    type: "createGroup",
    name: "Desk",
    memberIds: [DEFAULT_BOT_ID, bot.createdId!],
  });
  store = group.store;
  assert.equal(selectedBot(store).kind, "group");
  assert.equal(selectedBot(store).memberIds.length, 2);
  writeShell(store, path);
  const loaded = readShell(path);
  assert.equal(loaded.bots.length, 3);
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
});

test("parseShell accepts bots without lastPreview from older files", () => {
  const seeded = seedStore(new Date("2026-09-12T00:00:00Z"));
  const raw = JSON.parse(JSON.stringify(seeded)) as {
    bots: Array<Record<string, unknown>>;
    recents?: unknown;
  };
  delete raw.bots[0].lastPreview;
  delete raw.bots[0].lastAt;
  delete raw.recents;
  const parsed = parseShell(raw);
  assert.equal(parsed.bots[0].lastPreview, "");
  assert.equal(parsed.bots[0].lastAt, null);
  assert.equal(parsed.recents.length, 0);
});
