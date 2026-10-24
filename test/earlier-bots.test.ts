import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, sharedMemoryStore } from "../agent/lib/memory.ts";
import { appendAgentEvent, listThreadEvents } from "../shared/agent-store.ts";
import { readShell, writeShell } from "../shared/shell-io.ts";
import { archiveEarlierBots, DEFAULT_BOT_ID, seedStore, type ShellStore } from "../shared/shell-store.ts";
import { bindSession, readSessionBot } from "../shared/session-bindings.ts";
import { readSessionGrant, upsertSessionGrant } from "../shared/workspace-store.ts";
import { moveEarlierBotNotes, removeEarlierBot } from "../web/lib/earlier-bots.ts";
import { withBot } from "./helpers/roster.ts";

const KEYS = [
  "UB_SHELL_PATH", "UB_ROUTINES_PATH", "UB_MEMORY_ROOT", "UB_AGENT_STORE_PATH", "UB_SESSION_OWNERS_PATH",
  "UB_WORKSPACE_STORE_PATH", "UB_HANDOFF_DIR", "UB_STACK",
] as const;

/** A roster with the default bot and one archived earlier bot, and every store in a temp dir. */
async function world<T>(fn: (w: { dir: string; alpha: string; memory: string }) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ub-earlier-"));
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_ROUTINES_PATH = join(dir, "routines.json");
  process.env.UB_MEMORY_ROOT = join(dir, "memory");
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_SESSION_OWNERS_PATH = join(dir, "session-owners.json");
  process.env.UB_WORKSPACE_STORE_PATH = join(dir, "workspace.json");
  process.env.UB_HANDOFF_DIR = join(dir, "handoffs");
  delete process.env.UB_STACK;
  const made = withBot(seedStore(), "Alpha", { sessionId: "sess-alpha" });
  writeShell(archiveEarlierBots(made.store).store);
  try {
    return await fn({ dir, alpha: made.id, memory: process.env.UB_MEMORY_ROOT });
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function note(store: MemoryStore, botId: string, title: string) {
  return store.upsert({ expectedRevision: null, title, tags: [], body: `Body of ${title}`, botId, source: "owner", expiresAt: null, sessionId: "s1" });
}

test("moveEarlierBotNotes moves the notes, answers how many, and refuses a bot that is not an archived earlier one", async () => {
  await world(({ alpha }) => {
    const memory = sharedMemoryStore();
    note(memory, alpha, "One");
    note(memory, alpha, "Two");
    note(memory, DEFAULT_BOT_ID, "Mine");
    const out = moveEarlierBotNotes(alpha);
    assert.equal(out.moved, 2);
    assert.equal(out.store.bots.find((bot) => bot.id === alpha)?.archived, true, "the record stays");
    assert.equal(memory.countLive(DEFAULT_BOT_ID), 3);
    assert.equal(memory.countLive(alpha), 0);
    assert.equal(moveEarlierBotNotes(alpha).moved, 0, "a second call finds nothing");
    // Refusals change nothing.
    assert.throws(() => moveEarlierBotNotes(DEFAULT_BOT_ID), /shell_bot_forbidden/);
    assert.throws(() => moveEarlierBotNotes("bot-ghost"), /shell_bot_missing/);
    const active = withBot(readShell(), "Beta");
    writeShell(active.store);
    note(memory, active.id, "Beta's");
    assert.throws(() => moveEarlierBotNotes(active.id), /shell_bot_not_archived/);
    assert.equal(memory.countLive(active.id), 1);
  });
});

test("removeEarlierBot drops the record and cleans up after it: thread, session binding, grant, notes archived as files", async () => {
  await world(({ alpha }) => {
    const memory = sharedMemoryStore();
    note(memory, alpha, "One");
    note(memory, alpha, "Two");
    appendAgentEvent(alpha, { kind: "note", text: "hello" });
    bindSession("sess-alpha", alpha);
    upsertSessionGrant({ sessionId: "sess-alpha", path: null, permission: "auto" });
    appendAgentEvent(DEFAULT_BOT_ID, { kind: "note", text: "mine" });
    const out = removeEarlierBot(alpha);
    assert.equal(out.detachError, null);
    assert.deepEqual(out.store.bots.map((bot) => bot.id), [DEFAULT_BOT_ID]);
    assert.deepEqual(listThreadEvents(alpha), []);
    assert.equal(readSessionBot("sess-alpha"), null);
    assert.ok(!readSessionGrant("sess-alpha"), "the dropped session's folder grant is revoked");
    assert.equal(memory.countLive(alpha), 0);
    assert.equal(readdirSync(memory.notesDir).filter((name) => name.endsWith(".md")).length, 2, "archived, not deleted");
    assert.equal(listThreadEvents(DEFAULT_BOT_ID).length, 1, "the default bot's chat is untouched");
  });
});

test("removeEarlierBot refuses the default bot, an active bot and a missing one, and touches nothing", async () => {
  await world(({ alpha }) => {
    const memory = sharedMemoryStore();
    const active = withBot(readShell(), "Beta");
    writeShell(active.store);
    note(memory, active.id, "Beta's");
    note(memory, DEFAULT_BOT_ID, "Mine");
    bindSession("sess-beta", active.id);
    assert.throws(() => removeEarlierBot(DEFAULT_BOT_ID), /shell_bot_forbidden/);
    assert.throws(() => removeEarlierBot(active.id), /shell_bot_not_archived/);
    assert.throws(() => removeEarlierBot("bot-ghost"), /shell_bot_missing/);
    assert.equal(memory.countLive(active.id), 1, "a refused remove archived no notes");
    assert.equal(memory.countLive(DEFAULT_BOT_ID), 1);
    assert.equal(readSessionBot("sess-beta"), active.id);
    assert.equal(readShell().bots.length, 3);
    assert.ok(alpha);
  });
});

test("a remove that cannot archive the notes fails before the roster changes, so it can be retried", async () => {
  await world(({ alpha, memory: root }) => {
    const store = sharedMemoryStore();
    note(store, alpha, "One");
    const notes = join(root, "notes");
    // The notes folder turns read-only: archiving a note cannot write its file.
    chmodSync(notes, 0o500);
    try {
      assert.throws(() => removeEarlierBot(alpha), /EACCES|EPERM/i);
    } finally {
      chmodSync(notes, 0o700);
    }
    assert.ok(readShell().bots.some((bot) => bot.id === alpha), "the record is still there");
    assert.equal(store.countLive(alpha), 1, "the note is still live");
    // Writable again: the retry goes through.
    const out = removeEarlierBot(alpha);
    assert.equal(out.detachError, null);
    assert.equal(out.store.bots.some((bot) => bot.id === alpha), false);
    assert.equal(store.countLive(alpha), 0);
    assert.ok(existsSync(notes));
  });
});

test("a remove whose roster commit fails after the notes were archived is a retry that still succeeds", async () => {
  await world(({ alpha }) => {
    const store = sharedMemoryStore();
    note(store, alpha, "One");
    store.archiveBotNotes(alpha);
    // The notes are already archived (an earlier attempt got that far); the retry has nothing left to archive.
    const out = removeEarlierBot(alpha);
    assert.equal(out.detachError, null);
    assert.equal(out.store.bots.some((bot) => bot.id === alpha), false);
    const again: ShellStore = readShell();
    assert.equal(again.bots.length, 1);
  });
});
