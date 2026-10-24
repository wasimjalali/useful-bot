import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../agent/lib/memory.ts";
import { createRoutine, listRoutines, moveRoutinesToBot, readRoutinesStore, updateRoutine } from "../shared/routines-store.ts";
import { writeFixtureShell } from "../shared/shell-io.ts";
import { archiveEarlierBots, DEFAULT_BOT_ID, seedStore } from "../shared/shell-store.ts";
import { archivedBotRefusal, routineCreateRefusal, routineRunRefusal } from "../web/lib/archived-bots.ts";
import { memoryListing } from "../web/lib/memory-listing.ts";
import { applyProvidersPut } from "../web/lib/providers-write.ts";
import { withBot } from "./helpers/roster.ts";

// The Next route handlers cannot be imported by node (they sit behind the cookie
// gate and extensionless imports), so the rules they apply live in web/lib and
// are tested here; the source checks below hold the routes to calling them.

const roster = [
  { id: DEFAULT_BOT_ID, archived: false },
  { id: "bot-old", archived: true },
];

test("an archived bot is refused with 409 shell_bot_archived; the default bot, an unknown bot and no bot are not", () => {
  assert.deepEqual(archivedBotRefusal(roster, "bot-old"), { error: "shell_bot_archived", status: 409 });
  assert.equal(archivedBotRefusal(roster, DEFAULT_BOT_ID), null);
  assert.equal(archivedBotRefusal(roster, "bot-ghost"), null, "an unknown bot is the caller's other error, not this one");
  assert.equal(archivedBotRefusal(roster, null), null);
  assert.equal(archivedBotRefusal(roster, undefined), null);
});

test("POST /api/routines refuses an unknown bot (400) and an archived one (409), and takes the default bot", () => {
  assert.deepEqual(routineCreateRefusal(roster, "bot-ghost"), { error: "bot_missing", status: 400 });
  assert.deepEqual(routineCreateRefusal(roster, "bot-old"), { error: "shell_bot_archived", status: 409 });
  assert.equal(routineCreateRefusal(roster, DEFAULT_BOT_ID), null);
});

test("POST /api/routines/:id/run refuses a routine whose bot is archived, and runs the default bot's", () => {
  assert.deepEqual(routineRunRefusal(roster, { botId: "bot-old" }), { error: "shell_bot_archived", status: 409 });
  assert.equal(routineRunRefusal(roster, { botId: DEFAULT_BOT_ID }), null);
});

test("each route calls its rule, and the eve proxy checks the sender, the routed bot and an input answer before it resumes anything", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const eve = read("web/app/eve/v1/[...path]/route.ts");
  assert.equal((eve.match(/archivedBotRefusal\(/g) ?? []).length, 3);
  assert.ok(eve.indexOf("archivedBotRefusal(readShell().bots, auth.bound)") !== -1, "the input answer path uses the bot the session is bound to");
  assert.ok(
    eve.indexOf("archivedBotRefusal(readShell().bots, auth.bound)") < eve.indexOf("inputAnswer = true"),
    "the answer is refused before it is marked as forwarded",
  );
  assert.ok(eve.indexOf("archivedBotRefusal(readShell().bots, sender?.id)") !== -1);
  assert.ok(eve.indexOf("archivedBotRefusal(shell.bots, bot.id)") !== -1);
  assert.match(read("web/app/api/routines/route.ts"), /routineCreateRefusal\(readShell\(\)\.bots, body\.botId\)/);
  assert.match(read("web/app/api/routines/[id]/run/route.ts"), /routineRunRefusal\(readShell\(\)\.bots, routine\)/);
  assert.match(read("web/app/api/memory/route.ts"), /memoryListing\(memoryStore\(\), botId\)/);
});

test("PUT /api/providers refuses a per-bot model pick for an archived bot and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-route-"));
  const saved = { shell: process.env.UB_SHELL_PATH, providers: process.env.UB_PROVIDERS_PATH };
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_PROVIDERS_PATH = join(dir, "providers.json");
  try {
    const made = withBot(seedStore(), "Alpha");
    writeFixtureShell(archiveEarlierBots(made.store).store);
    for (const pick of [{ modelId: "glm-5" }, { effort: "high" }, { speed: "fast" }]) {
      assert.throws(() => applyProvidersPut({ botId: made.id, ...pick }), /^Error: shell_bot_archived$/, JSON.stringify(pick));
    }
    assert.equal(existsSync(process.env.UB_PROVIDERS_PATH), false, "nothing was written");
    assert.throws(() => applyProvidersPut({ botId: "bot-ghost", modelId: "glm-5" }), /^Error: shell_bot_missing$/);
  } finally {
    for (const [key, value] of [["UB_SHELL_PATH", saved.shell], ["UB_PROVIDERS_PATH", saved.providers]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("GET /api/memory answers a page of 100 and the real total, and nothing for no bot", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-route-"));
  const store = new MemoryStore(join(dir, "memory"));
  try {
    for (let index = 0; index < 130; index += 1) {
      store.upsert({ expectedRevision: null, title: `Note ${index}`, tags: [], body: "b", botId: "bot-old", source: "owner", expiresAt: null, sessionId: "s1" });
    }
    const listing = memoryListing(store, "bot-old");
    assert.equal(listing.notes.length, 100);
    assert.equal(listing.total, 130);
    assert.deepEqual(memoryListing(store, "bot-nobody"), { notes: [], total: 0 });
    assert.deepEqual(memoryListing(store, ""), { notes: [], total: 0 });
    assert.deepEqual(memoryListing(null, "bot-old"), { notes: [], total: 0 });
  } finally {
    store.close();
  }
});

test("on the wire a moved routine carries movedFrom, and an empty PATCH (Dismiss) or an activation clears it", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-route-"));
  const saved = process.env.UB_ROUTINES_PATH;
  process.env.UB_ROUTINES_PATH = join(dir, "routines.json");
  try {
    const wire = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    const plain = createRoutine({ botId: DEFAULT_BOT_ID, name: "Mine", instruction: "x", schedules: [] });
    const a = createRoutine({ botId: "bot-old", name: "One", instruction: "x", schedules: [] });
    const b = createRoutine({ botId: "bot-old", name: "Two", instruction: "x", schedules: [] });
    moveRoutinesToBot([{ id: "bot-old", name: "Old" }], DEFAULT_BOT_ID);
    // GET /api/routines?botId= returns the stored routines as they are.
    const listed = listRoutines(DEFAULT_BOT_ID).map(wire);
    assert.deepEqual(listed.map((item) => [item.name, item.movedFrom]).sort(), [["Mine", null], ["One", "bot-old"], ["Two", "bot-old"]]);
    assert.equal(listed.find((item) => item.id === a.id)?.active, false);
    // PATCH /api/routines/:id returns the updated routine.
    assert.equal(wire(updateRoutine(a.id, {})).movedFrom, null, "Dismiss is an empty PATCH");
    assert.equal(wire(updateRoutine(b.id, { active: true })).movedFrom, null);
    assert.equal(wire(updateRoutine(plain.id, { name: "Still mine" })).movedFrom, null);
    assert.ok(readRoutinesStore().routines.every((item) => item.movedFrom === null));
  } finally {
    if (saved === undefined) delete process.env.UB_ROUTINES_PATH;
    else process.env.UB_ROUTINES_PATH = saved;
  }
});
