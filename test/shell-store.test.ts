import assert from "node:assert/strict";
import test from "node:test";
import {
  createBot,
  createGroup,
  createSection,
  deleteBot,
  hideBot,
  matchesQuery,
  moveBot,
  newChatForActive,
  parseShellState,
  pinBot,
  renameBot,
  seedShell,
  setActive,
  setActiveSession,
  unassignedBots,
  updateBotSettings,
  visibleBots,
} from "../shared/shell-store.ts";

const NOW = "2026-09-13T00:00:00.000Z";

test("seed has pinned default bot and unassigned plus work section", () => {
  const state = seedShell(NOW);
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.activeId, "bot-useful");
  assert.equal(state.bots[0]?.pinned, true);
  assert.equal(unassignedBots(state).length, 0);
  assert.equal(state.sections[0]?.id, "sec-work");
  const roundTrip = parseShellState(JSON.parse(JSON.stringify(state)));
  assert.equal(roundTrip.bots.length, 2);
});

test("pin move rename hide and last-bot protection", () => {
  let state = seedShell(NOW);
  state = pinBot(state, "bot-reviewer", NOW);
  assert.equal(state.bots.find((bot) => bot.id === "bot-reviewer")?.pinned, true);
  state = moveBot(state, "bot-reviewer", null, NOW);
  assert.equal(state.bots.find((bot) => bot.id === "bot-reviewer")?.sectionId, null);
  state = renameBot(state, "bot-reviewer", "Counsel", NOW);
  assert.equal(state.bots.find((bot) => bot.id === "bot-reviewer")?.name, "Counsel");
  state = hideBot(state, "bot-reviewer", NOW);
  assert.equal(visibleBots(state).length, 1);
  assert.throws(() => hideBot(state, "bot-useful", NOW), /shell_last_bot/);
  assert.throws(() => deleteBot(state, "bot-useful"), /shell_last_bot/);
});

test("create bot group section and new chat clears session", () => {
  let state = seedShell(NOW);
  state = createSection(state, "Home", "sec-home", NOW);
  state = createBot(state, { name: "Notes", sectionId: "sec-home", label: "Capture" }, "bot-notes", NOW);
  assert.equal(state.activeId, "bot-notes");
  state = setActiveSession(state, "sess-1", NOW);
  state = newChatForActive(state, NOW);
  assert.equal(state.bots.find((bot) => bot.id === "bot-notes")?.sessionId, null);
  state = createGroup(state, { name: "Standup", botIds: ["bot-useful", "bot-notes"] }, "grp-1", NOW);
  assert.equal(state.activeKind, "group");
  assert.equal(state.groups[0]?.botIds.length, 2);
  state = setActive(state, "bot", "bot-useful");
  assert.equal(state.activeKind, "bot");
});

test("settings update and query filter", () => {
  let state = seedShell(NOW);
  state = updateBotSettings(state, "bot-useful", {
    name: "Useful Bot",
    label: "Mac",
    description: "Local only.",
    notify: false,
  }, NOW);
  const bot = state.bots.find((item) => item.id === "bot-useful");
  assert.equal(bot?.label, "Mac");
  assert.equal(bot?.notify, false);
  assert.equal(matchesQuery(bot!, "local"), true);
  assert.equal(matchesQuery(bot!, "missing"), false);
});

test("parse rejects empty bots and unknown section", () => {
  const state = seedShell(NOW);
  assert.throws(() => parseShellState({ ...state, bots: [] }), /shell_bots/);
  assert.throws(
    () => parseShellState({
      ...state,
      bots: [{ ...state.bots[0], sectionId: "nope" }],
    }),
    /shell_section_missing/,
  );
});
