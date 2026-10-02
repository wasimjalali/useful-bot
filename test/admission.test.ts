import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  admission,
  briefBudgetChars,
  CONTEXT_TOO_LARGE_TEXT,
  DESCRIPTION_TOO_LONG_TEXT,
  envelopeFor,
  OUTPUT_RESERVE_TOKENS,
  SHARED_PROMPT_CHARS,
  TOOL_SCHEMA_CHARS,
} from "../shared/admission.ts";
import { estimateTokens } from "../shared/context-blocks.ts";
import { readProviderStore } from "../shared/providers.ts";
import { readShell, updateShell, writeShell } from "../shared/shell-io.ts";
import { applyShellAction, DEFAULT_BOT_ID, DESCRIPTION_MAX, GENERALIST_SEED_V2 } from "../shared/shell-store.ts";
import { createRoutine, readRoutinesStore } from "../shared/routines-store.ts";
import { queueHandoff, readHandoff } from "../shared/handoffs.ts";
import { listThreadEvents } from "../shared/agent-store.ts";
import { MemoryStore } from "../agent/lib/memory.ts";
import {
  admissionRefusal,
  botContextReport,
  notesCharsFor,
  pumpHandoffs,
  startRoutineNow,
} from "../web/lib/agent-exec.ts";

const GO = "opencode-go:plan";
const WINDOW = 20_000;

const KEYS = [
  "UB_PROVIDERS_PATH", "UB_MODELS_CACHE_PATH", "UB_SHELL_PATH", "UB_WORKSPACE_STORE_PATH", "UB_ROUTINES_PATH",
  "UB_AGENT_STORE_PATH", "UB_HANDOFF_DIR", "UB_CHANNEL_JWT", "UB_CHANNEL_JWT_SECRET", "UB_MEMORY_ROOT",
] as const;

function row(id: string, contextTokens: number) {
  return { id, label: `Label ${id}`, efforts: ["low"], defaultEffort: "low", speeds: ["standard"], defaultSpeed: "standard", contextTokens };
}

/** Every store in a temp dir; one connection with a 20k-window model and a 1M one. */
async function withWorld<T>(fn: (world: { shell: string; dir: string }) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ub-admission-"));
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.UB_PROVIDERS_PATH = join(dir, "providers.json");
  process.env.UB_MODELS_CACHE_PATH = join(dir, "models-cache.json");
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_WORKSPACE_STORE_PATH = join(dir, "workspace.json");
  process.env.UB_ROUTINES_PATH = join(dir, "routines.json");
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_HANDOFF_DIR = join(dir, "handoffs");
  process.env.UB_MEMORY_ROOT = join(dir, "memory");
  process.env.UB_CHANNEL_JWT_SECRET = "test-channel-secret";
  delete process.env.UB_CHANNEL_JWT;
  writeFileSync(process.env.UB_PROVIDERS_PATH, JSON.stringify({
    schemaVersion: 2,
    connections: {
      [GO]: {
        id: GO, providerId: "opencode-go", mode: "plan", credential: { kind: "key", key: "go-key-12345678" },
        fields: {}, updatedAt: new Date().toISOString(), lastError: null,
      },
    },
    activeConnectionId: GO,
    selectedModel: "small",
    effort: null,
    speed: "standard",
    roles: {},
  }));
  writeFileSync(process.env.UB_MODELS_CACHE_PATH, JSON.stringify({
    schemaVersion: 3,
    providers: { [GO]: { fetchedAt: Date.now(), models: [row("small", WINDOW), row("big", 1_000_000)] } },
  }));
  try {
    return await fn({ shell: process.env.UB_SHELL_PATH, dir });
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

const pick = (modelId: string) => ({ connectionId: GO, modelId, effort: null, speed: "standard" as const });

/** A teammate with the given description and model, returned with the fresh roster. */
function teammate(shell: string, description: string, modelId = "small") {
  const made = applyShellAction(readShell(shell), { type: "createBot", name: "Alpha", description: description.slice(0, 100) });
  const id = made.createdId as string;
  // The description goes in verbatim, as the owner's editor saves it.
  writeShell({
    ...made.store,
    bots: made.store.bots.map((bot) => (bot.id === id ? { ...bot, description, model: pick(modelId) } : bot)),
  }, shell);
  return id;
}

function eveFetchCounter() {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response("{}", { status: 200 }); }) as typeof globalThis.fetch;
  return { calls: () => calls, restore: () => { globalThis.fetch = original; } };
}

test("SHARED_PROMPT_CHARS is at least the size of agent/instructions.md", () => {
  const bytes = readFileSync(new URL("../agent/instructions.md", import.meta.url)).length;
  assert.ok(SHARED_PROMPT_CHARS >= bytes, `instructions.md is ${bytes} bytes, the constant says ${SHARED_PROMPT_CHARS}`);
  assert.equal(TOOL_SCHEMA_CHARS, 30_483);
  assert.equal(OUTPUT_RESERVE_TOKENS, 4096);
});

test("a bot with a normal description fits, and the Generalist and a teammate measure about the same fixed cost", async () => {
  await withWorld(({ shell }) => {
    const store = readProviderStore();
    const id = teammate(shell, "Watch rankings.");
    const roster = readShell(shell);
    const mate = admission({ bot: roster.bots.find((bot) => bot.id === id)!, shell: roster, store, notesChars: 0 });
    const generalist = admission({ bot: roster.bots.find((bot) => bot.id === DEFAULT_BOT_ID)!, shell: roster, store, notesChars: 0 });
    assert.ok(mate.ok && generalist.ok);
    console.log(`envelope tokens: Generalist ${generalist.tokens}, teammate ${mate.tokens}, window ${mate.windowTokens}`);
    // The Generalist carries "Running the team" and the long shipped text; the teammate does not.
    assert.ok(generalist.tokens > mate.tokens);
    assert.equal(mate.windowTokens, WINDOW);
    assert.equal(mate.modelLabel, "Label small");
    const floor = estimateTokens(SHARED_PROMPT_CHARS) + estimateTokens(TOOL_SCHEMA_CHARS) + OUTPUT_RESERVE_TOKENS;
    assert.ok(mate.tokens > floor, "the context block counts on top of the fixed parts");
  });
});

test("an 8,000-character description is refused on a small window and fits on a large one", async () => {
  await withWorld(({ shell }) => {
    const store = readProviderStore();
    const small = teammate(shell, "x".repeat(DESCRIPTION_MAX), "small");
    const roster = readShell(shell);
    const refused = admission({ bot: roster.bots.find((bot) => bot.id === small)!, shell: roster, store, notesChars: 0 });
    assert.equal(refused.ok, false);
    if (refused.ok) return;
    assert.equal(refused.code, "context_too_large");
    assert.equal(refused.message, CONTEXT_TOO_LARGE_TEXT);
    assert.match(refused.message, /Shorten its instructions/);
    assert.equal(refused.descriptionChars, DESCRIPTION_MAX);
    const big = teammate(shell, "x".repeat(DESCRIPTION_MAX), "big");
    const roster2 = readShell(shell);
    assert.equal(admission({ bot: roster2.bots.find((bot) => bot.id === big)!, shell: roster2, store, notesChars: 0 }).ok, true);
  });
});

test("the carry-over brief and the notes tip a fitting bot over, and the brief budget shrinks to what is left", async () => {
  await withWorld(({ shell }) => {
    const store = readProviderStore();
    const id = teammate(shell, "Watch rankings.");
    const roster = readShell(shell);
    const bot = roster.bots.find((item) => item.id === id)!;
    const base = admission({ bot, shell: roster, store, notesChars: 0 });
    assert.ok(base.ok);
    const room = base.windowTokens - base.tokens;
    const tooBig = Math.ceil(room * 3.5) + 100;
    assert.equal(admission({ bot, shell: roster, store, notesChars: 0, briefChars: tooBig }).ok, false);
    assert.equal(admission({ bot, shell: roster, store, notesChars: tooBig }).ok, false);
    assert.equal(admission({ bot, shell: roster, store, notesChars: 0, briefChars: 1000 }).ok, true);
    const budget = briefBudgetChars({ bot, shell: roster, store, notesChars: 0 }, 32_000);
    assert.ok(budget > 0 && budget <= Math.floor((room * 3.5) / 2), `budget ${budget}`);
    // A bot whose fixed envelope already fills the window has no room for a brief.
    const full = teammate(shell, "x".repeat(DESCRIPTION_MAX));
    const roster3 = readShell(shell);
    assert.equal(briefBudgetChars({ bot: roster3.bots.find((item) => item.id === full)!, shell: roster3, store, notesChars: 0 }, 32_000), 0);
  });
});

test("the notes block is read from the memory store, read only, and counted", async () => {
  await withWorld(({ shell }) => {
    const id = teammate(shell, "Watch rankings.");
    assert.ok(notesCharsFor(id) > 0, "an empty store still carries the sentinel block");
    const empty = notesCharsFor(id);
    const memory = new MemoryStore();
    memory.upsert({
      expectedRevision: null, title: "Plan", tags: [], body: "y".repeat(900), botId: id, source: "owner", expiresAt: null, sessionId: "s1",
    });
    const after = notesCharsFor(id);
    assert.ok(after > empty + 800, `empty ${empty}, with a note ${after}`);
    assert.equal(notesCharsFor("bot-someone-else"), empty, "another bot's notes are not counted");
    memory.close();
  });
});

test("the proxy refuses an over-cap description and a too-large envelope with a 409 before any eve call", async () => {
  await withWorld(async ({ shell }) => {
    const eve = eveFetchCounter();
    try {
      const over = teammate(shell, "x".repeat(DESCRIPTION_MAX + 1), "big");
      const roster = readShell(shell);
      const store = readProviderStore();
      const first = admissionRefusal(roster.bots.find((bot) => bot.id === over)!, roster, store);
      assert.equal(first?.status, 409);
      assert.deepEqual(await first!.json(), { ok: false, error: "description_too_long", message: DESCRIPTION_TOO_LONG_TEXT });
      const full = teammate(shell, "x".repeat(DESCRIPTION_MAX));
      const roster2 = readShell(shell);
      const second = admissionRefusal(roster2.bots.find((bot) => bot.id === full)!, roster2, store);
      assert.equal(second?.status, 409);
      assert.deepEqual(await second!.json(), { ok: false, error: "context_too_large", message: CONTEXT_TOO_LARGE_TEXT });
      const fine = teammate(shell, "Watch rankings.");
      const roster3 = readShell(shell);
      assert.equal(admissionRefusal(roster3.bots.find((bot) => bot.id === fine)!, roster3, store), null);
      // A brief that pushes a fitting bot over is refused too.
      assert.equal(admissionRefusal(roster3.bots.find((bot) => bot.id === fine)!, roster3, store, 500_000)?.status, 409);
      assert.equal(eve.calls(), 0);
    } finally {
      eve.restore();
    }
  });
});

test("a routine and a handoff for a bot that does not fit fail in plain words and never reach eve", async () => {
  await withWorld(async ({ shell }) => {
    const eve = eveFetchCounter();
    try {
      const full = teammate(shell, "x".repeat(DESCRIPTION_MAX));
      const over = teammate(shell, "x".repeat(DESCRIPTION_MAX + 1), "big");
      const sender = teammate(shell, "Sends work.", "big");
      const routine = createRoutine({ botId: full, name: "Daily", instruction: "do it", schedules: [] });
      await assert.rejects(startRoutineNow(routine.id), /context_too_large/);
      assert.match(readRoutinesStore().routines[0].runHistory[0].error ?? "", /context_too_large/);
      const notes = listThreadEvents(full).map((event) => ("text" in event ? String(event.text) : ""));
      assert.ok(notes.some((text) => text.includes(CONTEXT_TOO_LARGE_TEXT)), "the transcript note says it in plain words");
      assert.ok(!notes.some((text) => text.includes("context_too_large")), "the note never shows the code");

      const overRoutine = createRoutine({ botId: over, name: "Nightly", instruction: "do it", schedules: [] });
      await assert.rejects(startRoutineNow(overRoutine.id), /description_too_long/);
      const overNotes = listThreadEvents(over).map((event) => ("text" in event ? String(event.text) : ""));
      assert.ok(overNotes.some((text) => text.includes(DESCRIPTION_TOO_LONG_TEXT)));

      const handoff = queueHandoff({ sourceBotId: sender, sourceName: "Sender", targetBotId: full, targetName: "Alpha", message: "hello" });
      const result = await pumpHandoffs(1);
      assert.equal(result.failed.length, 1);
      assert.equal(result.failed[0].error, CONTEXT_TOO_LARGE_TEXT);
      assert.equal(readHandoff(handoff.id)?.status, "failed");
      assert.equal(readHandoff(handoff.id)?.attempts, 1, "terminal on the first attempt");
      assert.equal(eve.calls(), 0, "nothing was sent to eve");
    } finally {
      eve.restore();
    }
  });
});

test("the counter report: numbers for any bot, the seed only for the Generalist", async () => {
  await withWorld(({ shell }) => {
    const id = teammate(shell, "Watch rankings.");
    const mate = botContextReport(id)!;
    assert.equal(mate.max, DESCRIPTION_MAX);
    assert.equal(mate.descriptionChars, "Watch rankings.".length);
    assert.equal(mate.windowTokens, WINDOW);
    assert.equal(mate.modelLabel, "Label small");
    assert.equal(mate.fits, true);
    assert.equal(mate.seed, null);
    assert.equal(botContextReport("bot-ghost"), null);

    const generalist = botContextReport(DEFAULT_BOT_ID)!;
    assert.deepEqual(generalist.seed, { differs: false, text: GENERALIST_SEED_V2 });
    updateShell((current) => ({
      ...current,
      bots: current.bots.map((bot) => (bot.id === DEFAULT_BOT_ID ? { ...bot, description: `${GENERALIST_SEED_V2}\n\nAlways answer in Spanish.` } : bot)),
    }), shell);
    assert.equal(botContextReport(DEFAULT_BOT_ID)!.seed?.differs, true);
    // Whitespace alone is not a difference.
    updateShell((current) => ({
      ...current,
      bots: current.bots.map((bot) => (bot.id === DEFAULT_BOT_ID ? { ...bot, description: `  ${GENERALIST_SEED_V2.replace(/\n/g, "\n\n")}  ` } : bot)),
    }), shell);
    assert.equal(botContextReport(DEFAULT_BOT_ID)!.seed?.differs, false);

    // Over the cap: the report says it does not fit.
    const over = teammate(shell, "x".repeat(DESCRIPTION_MAX + 1), "big");
    assert.equal(botContextReport(over)!.fits, false);
    assert.equal(envelopeFor({ bot: readShell(shell).bots.find((bot) => bot.id === over)!, shell: readShell(shell), store: readProviderStore(), notesChars: 0 }).descriptionChars, DESCRIPTION_MAX + 1);
  });
});
