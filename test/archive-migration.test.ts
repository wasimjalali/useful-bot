import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { MemoryStore } from "../agent/lib/memory.ts";
import {
  archiveMarkerPath,
  readShell,
  shellWasReseeded,
  updateShell,
  writeFixtureShell,
  writeShell,
} from "../shared/shell-io.ts";
import {
  createRoutine,
  listRoutines,
  moveRoutinesToBot,
  readRoutine,
  readRoutinesStore,
  ROUTINES_PER_BOT_MAX,
  updateRoutine,
  writeRoutinesStore,
} from "../shared/routines-store.ts";
import {
  applyShellAction,
  archiveEarlierBots,
  DEFAULT_BOT_ID,
  isPerfFixtureBot,
  PERF_FIXTURE_BOT_NAMES,
  seedStore,
  type ShellStore,
} from "../shared/shell-store.ts";
import { withBot } from "./helpers/roster.ts";

const run = promisify(execFile);

const KEYS = ["UB_SHELL_PATH", "UB_ROUTINES_PATH", "UB_MEMORY_ROOT", "UB_STACK", "UB_PROVIDERS_PATH", "UB_AGENT_STORE_PATH", "UB_HANDOFF_DIR", "UB_SESSION_OWNERS_PATH", "UB_CHANNEL_JWT_SECRET"] as const;

/** Every store in a temp dir, and the stack back to what it was afterwards. */
async function world<T>(fn: (w: { dir: string; shell: string; routines: string }) => Promise<T> | T, env: Partial<Record<(typeof KEYS)[number], string>> = {}): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ub-archive-"));
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const shell = join(dir, "shell.json");
  const routines = join(dir, "routines.json");
  process.env.UB_SHELL_PATH = shell;
  process.env.UB_ROUTINES_PATH = routines;
  process.env.UB_MEMORY_ROOT = join(dir, "memory");
  process.env.UB_PROVIDERS_PATH = join(dir, "providers.json");
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_HANDOFF_DIR = join(dir, "handoffs");
  process.env.UB_SESSION_OWNERS_PATH = join(dir, "session-owners.json");
  process.env.UB_CHANNEL_JWT_SECRET = "test-channel-secret";
  delete process.env.UB_STACK;
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    return await fn({ dir, shell, routines });
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

/** An earlier build's roster, written the way that build wrote it: raw, with no marker beside it. */
function writeOldRoster(path: string, build: (store: ShellStore) => ShellStore): ShellStore {
  const store = build(seedStore(new Date("2026-09-01T00:00:00Z")));
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  return store;
}

const routineFor = (botId: string, name: string, patch: Record<string, unknown> = {}) => createRoutine({
  botId,
  name,
  instruction: `Do ${name}.`,
  schedules: [{ kind: "daily", time: "09:00" }],
  timezone: "Europe/Berlin",
  ...patch,
});

// MARK: - The pure pass

test("the archive pass marks every bot but the default one, deletes nothing and seeds a missing default", () => {
  const at = new Date("2026-10-25T08:00:00Z");
  const a = withBot(seedStore(), "Alpha");
  const b = withBot(a.store, "Beta");
  const group = withBot(b.store, "Desk", { kind: "group" });
  const out = archiveEarlierBots({ ...group.store, selectedBotId: a.id }, at);
  assert.equal(out.changed, true);
  assert.deepEqual(out.store.bots.map((bot) => [bot.name, bot.archived]), [["Generalist", false], ["Alpha", true], ["Beta", true], ["Desk", true]]);
  assert.ok(out.store.bots.slice(1).every((bot) => bot.archivedAt === at.toISOString()));
  assert.equal(out.store.selectedBotId, DEFAULT_BOT_ID);
  assert.deepEqual(out.moved.map((bot) => bot.id), [a.id, b.id, group.id]);

  // A second pass changes nothing and keeps the first stamp.
  const again = archiveEarlierBots(out.store, new Date("2027-01-01T00:00:00Z"));
  assert.equal(again.changed, false);
  assert.deepEqual(again.store, out.store);

  // No default bot: it is seeded, in front, and the rest are archived.
  const noDefault = { ...a.store, bots: a.store.bots.filter((bot) => bot.id !== DEFAULT_BOT_ID), selectedBotId: a.id };
  const seeded = archiveEarlierBots(noDefault, at);
  assert.deepEqual(seeded.store.bots.map((bot) => [bot.id === DEFAULT_BOT_ID ? "default" : bot.name, bot.archived]), [["default", false], ["Alpha", true]]);
  assert.equal(seeded.store.selectedBotId, DEFAULT_BOT_ID);
});

test("the perf fixture names are exactly the bots of perf/fixtures.dev.lock.json", () => {
  const lock = JSON.parse(readFileSync(new URL("../perf/fixtures.dev.lock.json", import.meta.url), "utf8")) as { bots: Record<string, unknown> };
  assert.deepEqual([...PERF_FIXTURE_BOT_NAMES].sort(), Object.keys(lock.bots).sort());
});

test("perf fixtures stay unarchived in the dev stack only, and select reaches them there only", async () => {
  await world(() => {
    const fixtures = PERF_FIXTURE_BOT_NAMES.map((name) => name);
    let store = seedStore();
    const ids: string[] = [];
    for (const name of [...fixtures, "Old Helper"]) {
      const made = withBot(store, name);
      store = made.store;
      ids.push(made.id);
    }
    const fixtureIds = ids.slice(0, fixtures.length);
    const helper = ids[ids.length - 1];

    process.env.UB_STACK = "dev";
    const dev = archiveEarlierBots(store);
    assert.deepEqual(dev.store.bots.filter((bot) => !bot.archived).map((bot) => bot.name).sort(), ["Generalist", ...fixtures].sort());
    assert.equal(dev.store.bots.find((bot) => bot.id === helper)?.archived, true);
    assert.deepEqual(dev.moved.map((bot) => bot.id), [helper], "only the helper's routines move");
    // select: the harness reaches a fixture, nothing else but the default.
    assert.equal(applyShellAction(dev.store, { type: "select", botId: fixtureIds[0] }).store.selectedBotId, fixtureIds[0]);
    assert.throws(() => applyShellAction(dev.store, { type: "select", botId: helper }), /shell_bot_forbidden/);
    assert.equal(isPerfFixtureBot(dev.store.bots.find((bot) => bot.id === fixtureIds[0])!), true);

    process.env.UB_STACK = "daily";
    const daily = archiveEarlierBots(store);
    assert.deepEqual(daily.store.bots.filter((bot) => !bot.archived).map((bot) => bot.name), ["Generalist"], "the same names are ordinary bots in the daily stack");
    assert.throws(() => applyShellAction(store, { type: "select", botId: fixtureIds[0] }), /shell_bot_forbidden/);
    // A fixture-looking name on the default bot's id, or a group, is never exempt.
    process.env.UB_STACK = "dev";
    const group = withBot(seedStore(), "Perf Short A", { kind: "group" });
    assert.equal(archiveEarlierBots(group.store).store.bots.find((bot) => bot.id === group.id)?.archived, true);
  });
});

// MARK: - The migration on disk

test("the first read archives the earlier bots, moves their routines paused, writes the marker last and deletes nothing", async () => {
  await world(({ shell }) => {
    let ids = { a: "", b: "" };
    const old = writeOldRoster(shell, (store) => {
      const a = withBot(store, "Alpha", { description: "Alpha does research.", lastPreview: "hello", sessionId: "sess-a" });
      const b = withBot(a.store, "Beta");
      ids = { a: a.id, b: b.id };
      return { ...b.store, selectedBotId: a.id, recents: [{ id: "rec-1", botId: a.id, title: "hello", sessionId: "sess-a", preview: "hello", updatedAt: "2026-09-02T00:00:00.000Z" }] };
    });
    routineFor(ids.a, "Weekly report", { active: true });
    routineFor(ids.b, "Backup");
    routineFor(DEFAULT_BOT_ID, "Mine");
    const reportBefore = readRoutinesStore().routines.find((item) => item.name === "Weekly report")!;
    updateRoutineRaw(reportBefore.id, { manualRunRequested: true, lastRunAt: "2026-10-01T09:00:00.000Z" });
    assert.equal(existsSync(archiveMarkerPath(shell)), false);

    const store = readShell();
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
    assert.deepEqual(store.bots.map((bot) => [bot.name, bot.archived]), [["Generalist", false], ["Alpha", true], ["Beta", true]]);
    assert.equal(store.selectedBotId, DEFAULT_BOT_ID);
    // Nothing is deleted: the records, the chats, the recents and the instructions are still there.
    const alpha = store.bots.find((bot) => bot.id === ids.a)!;
    assert.equal(alpha.description, "Alpha does research.");
    assert.equal(alpha.sessionId, "sess-a");
    assert.equal(alpha.lastPreview, "hello");
    assert.equal(typeof alpha.archivedAt, "string");
    assert.deepEqual(store.recents.map((item) => item.id), old.recents.map((item) => item.id));
    // It is on disk, not only in the answer.
    const onDisk = JSON.parse(readFileSync(shell, "utf8")) as { bots: Array<{ id: string; archived: boolean }> };
    assert.deepEqual(onDisk.bots.map((bot) => bot.archived), [false, true, true]);

    // The routines: all three are the default bot's now, the moved ones paused and remembered.
    const all = readRoutinesStore().routines;
    assert.equal(all.length, 3);
    assert.ok(all.every((item) => item.botId === DEFAULT_BOT_ID));
    const report = all.find((item) => item.name === "Weekly report")!;
    assert.equal(report.id, reportBefore.id);
    assert.equal(report.active, false);
    assert.equal(report.movedFrom, ids.a);
    assert.equal(report.manualRunRequested, false, "a pending Test run request must not wake a paused routine");
    assert.equal(report.lastRunAt, "2026-10-01T09:00:00.000Z");
    assert.equal(report.instruction, "Do Weekly report.");
    assert.equal(all.find((item) => item.name === "Backup")?.movedFrom, ids.b);
    const mine = all.find((item) => item.name === "Mine")!;
    assert.equal(mine.movedFrom, null);
    assert.equal(mine.active, true);
  });
});

/** Set raw fields on a stored routine, the way an older build's file held them. */
function updateRoutineRaw(id: string, fields: Record<string, unknown>): void {
  const path = process.env.UB_ROUTINES_PATH as string;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { routines: Array<Record<string, unknown>> };
  for (const routine of raw.routines) if (routine.id === id) Object.assign(routine, fields);
  writeFileSync(path, JSON.stringify(raw), "utf8");
}

test("a bot an older build adds after the marker is archived by the next read, with its routines; one this build wrote is left", async () => {
  await world(({ shell }) => {
    writeOldRoster(shell, (store) => withBot(store, "Alpha").store);
    assert.equal(readShell().bots.find((bot) => bot.name === "Alpha")?.archived, true);
    // An older build runs again (a downgrade, a restored file) and adds a bot and a routine.
    const raw = JSON.parse(readFileSync(shell, "utf8")) as ShellStore;
    const extra = withBot(raw, "Gamma");
    writeFileSync(shell, JSON.stringify(extra.store), "utf8");
    routineFor(extra.id, "Gamma job");
    const later = readShell();
    assert.equal(later.bots.find((bot) => bot.name === "Gamma")?.archived, true);
    assert.equal(later.bots.find((bot) => bot.name === "Alpha")?.archived, true);
    assert.equal(later.selectedBotId, DEFAULT_BOT_ID);
    const job = readRoutinesStore().routines.find((item) => item.name === "Gamma job");
    assert.equal(job?.botId, DEFAULT_BOT_ID);
    assert.equal(job?.active, false);
    assert.equal(job?.movedFrom, extra.id);
    // A bot this build itself wrote (a fixture roster) is not archived on the next read.
    const mine = withBot(later, "Fixture bot");
    writeFixtureShell(mine.store);
    assert.equal(readShell().bots.find((bot) => bot.id === mine.id)?.archived, false);
  });
});

test("a backup restored over a reseeded roster is migrated: old bots come back archived and their routines paused", async () => {
  await world(({ shell }) => {
    let alpha = "";
    const old = writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha", { sessionId: "sess-a" });
      alpha = made.id;
      return made.store;
    });
    routineFor(alpha, "Weekly report", { active: true });
    const backup = JSON.stringify(old);
    // The file goes bad; the app reseeds it and works on the stub for a while.
    writeFileSync(shell, "not json", "utf8");
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      assert.deepEqual(readShell().bots.map((bot) => bot.id), [DEFAULT_BOT_ID]);
    } finally {
      console.warn = warn;
    }
    assert.equal(shellWasReseeded(shell), true);
    // The owner copies the backup back over it.
    writeFileSync(shell, backup, "utf8");
    const restored = readShell();
    assert.equal(restored.bots.find((bot) => bot.id === alpha)?.archived, true);
    assert.equal(restored.selectedBotId, DEFAULT_BOT_ID);
    const job = readRoutinesStore().routines[0];
    assert.equal(job.botId, DEFAULT_BOT_ID);
    assert.equal(job.active, false);
    assert.equal(job.movedFrom, alpha);
  });
});

test("while the reseed mark is set the sweep keeps archived bots' threads and routines, however long ago the reseed was, and still sweeps drawings", async () => {
  const { sweepOrphanState, resetSweepClock } = await import("../web/lib/agent-exec.ts");
  const { appendAgentEvent, listThreadEvents } = await import("../shared/agent-store.ts");
  const { writeWidget, WIDGET_ORPHAN_GRACE_MS } = await import("../shared/widgets-store.ts");
  await world(({ dir, shell }) => {
    process.env.UB_WIDGETS_DIR = join(dir, "widgets");
    process.env.UB_MEDIA_INDEX_PATH = join(dir, "media.json");
    const alpha = withBot(seedStore(), "Alpha");
    writeShell(archiveEarlierBots(alpha.store).store);
    appendAgentEvent(alpha.id, { kind: "widget", text: "drawing", widgetId: "keptwidget1" });
    const widget = (id: string) => ({
      id, connectionId: "excalidraw", toolName: "excalidraw__create_view", resourceUri: "ui://excalidraw/mcp-app.html",
      arguments: { elements: "[]" }, result: null, createdAt: new Date(0).toISOString(),
    });
    const old = new Date(Date.now() - WIDGET_ORPHAN_GRACE_MS * 2);
    for (const id of ["keptwidget1", "orphanwidget"]) {
      writeWidget(widget(id), process.env.UB_WIDGETS_DIR);
      utimesSync(join(process.env.UB_WIDGETS_DIR, `${id}.json`), old, old);
    }
    const stray = routineFor(alpha.id, "Left under the earlier bot");
    // The file goes bad and is reseeded: the roster is now the stub, and the earlier bots are only on the backup.
    writeFileSync(shell, "not json", "utf8");
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      readShell();
    } finally {
      console.warn = warn;
    }
    // A reseed from long ago: no age ends the protection.
    const markPath = `${shell}.reseeded`;
    const mark = JSON.parse(readFileSync(markPath, "utf8")) as { at: string; bots: string[] };
    writeFileSync(markPath, JSON.stringify({ ...mark, at: new Date(Date.now() - 60 * 24 * 3600_000).toISOString() }), "utf8");
    assert.equal(shellWasReseeded(shell), true);
    resetSweepClock();
    sweepOrphanState();
    assert.equal(listThreadEvents(alpha.id).length, 1, "the earlier bot's thread is still in the agent store");
    assert.equal(readRoutine(stray.id)?.botId, alpha.id, "and its routine");
    assert.deepEqual(readdirSync(process.env.UB_WIDGETS_DIR), ["keptwidget1.json"], "the drawing nothing names is gone, the one the thread names stays");
    // A mark nobody can read protects the same way.
    writeFileSync(markPath, "{", "utf8");
    assert.equal(shellWasReseeded(shell), true);
    sweepOrphanState();
    assert.equal(listThreadEvents(alpha.id).length, 1);
  }, {});
  delete process.env.UB_WIDGETS_DIR;
  delete process.env.UB_MEDIA_INDEX_PATH;
});

test("the shell lock is not held while the routine move waits for the routines lock", async () => {
  await world(async ({ shell, routines }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    routineFor(alpha, "Weekly report");
    // Another process holds the routines lock (fresh, so it is not reclaimed).
    mkdirSync(`${routines}.lock`);
    const script = `
      import { readShell } from ${JSON.stringify(new URL("../shared/shell-io.ts", import.meta.url).href)};
      readShell();
      process.stdout.write("done");
    `;
    const child = run(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    // Wait for the shell half to land (a slow machine takes longer to start the child), then look at the lock: the
    // move is stuck behind the routines lock, well inside the shell lock's stale window (3 s), so it is simply not held.
    const archived = () => (JSON.parse(readFileSync(shell, "utf8")) as ShellStore).bots.find((bot) => bot.id === alpha)?.archived === true;
    for (let waited = 0; !archived() && waited < 2500; waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(archived(), true, "the archived roster is on disk");
    assert.equal(existsSync(`${shell}.lock`), false, "a waiting migration must not sit on the shell lock");
    rmSync(`${routines}.lock`, { recursive: true, force: true });
    assert.equal((await child).stdout, "done");
    assert.equal(readRoutinesStore().routines[0].botId, DEFAULT_BOT_ID);
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
  });
});

test("re-running the pass after the marker was lost changes nothing: the stamp and the moved routines stay", async () => {
  await world(({ shell }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    routineFor(alpha, "Weekly report");
    readShell();
    const firstShell = readFileSync(shell, "utf8");
    const firstRoutines = readFileSync(process.env.UB_ROUTINES_PATH as string, "utf8");
    unlinkSync(archiveMarkerPath(shell));
    const again = readShell();
    assert.equal(readFileSync(shell, "utf8"), firstShell, "the shell file is byte for byte what the first run wrote");
    assert.equal(readFileSync(process.env.UB_ROUTINES_PATH as string, "utf8"), firstRoutines, "no routine is renamed or moved twice");
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
    assert.equal(again.bots.find((bot) => bot.id === alpha)?.archived, true);
  });
});

test("an interrupted run leaves no marker, and the next read finishes the routine move", async () => {
  await world(({ dir, shell }) => {
    let alpha = "";
    // The routines store sits in a folder of its own, so it can be made unwritable alone.
    const folder = join(dir, "routines-folder");
    mkdirSync(folder);
    process.env.UB_ROUTINES_PATH = join(folder, "routines.json");
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    routineFor(alpha, "Weekly report");
    chmodSync(folder, 0o500);
    try {
      assert.throws(() => readShell(), /routines_locked|EACCES|EPERM/i, "the routine move fails loudly");
    } finally {
      chmodSync(folder, 0o700);
    }
    assert.equal(existsSync(archiveMarkerPath(shell)), false, "no marker after a failed move");
    // The shell half did land: Alpha is already archived on disk.
    assert.equal((JSON.parse(readFileSync(shell, "utf8")) as ShellStore).bots.find((bot) => bot.id === alpha)?.archived, true);
    assert.equal(readRoutinesStore().routines[0].botId, alpha, "the routine has not moved yet");
    // Writable again: the next read finishes the job and writes the marker.
    const store = readShell();
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
    assert.equal(store.bots.find((bot) => bot.id === alpha)?.archived, true);
    const moved = readRoutinesStore().routines;
    assert.equal(moved.length, 1);
    assert.equal(moved[0].botId, DEFAULT_BOT_ID);
    assert.equal(moved[0].movedFrom, alpha);
    assert.equal(moved[0].active, false);
  });
});

test("a run cut short after the shell write is picked up by the next read: bots already archived, routines still under the old bot", async () => {
  await world(({ shell }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    routineFor(alpha, "Weekly report");
    routineFor(alpha, "Backup");
    routineFor(DEFAULT_BOT_ID, "Weekly report");
    // The state a crash between the two writes leaves: archived on disk, nothing moved, no marker.
    const archived = archiveEarlierBots(JSON.parse(readFileSync(shell, "utf8")) as ShellStore, new Date("2026-10-25T08:00:00Z"));
    writeFileSync(shell, JSON.stringify(archived.store), "utf8");
    assert.equal(existsSync(archiveMarkerPath(shell)), false);
    const store = readShell();
    assert.equal(store.bots.find((bot) => bot.id === alpha)?.archivedAt, "2026-10-25T08:00:00.000Z", "the first stamp is kept");
    const routines = readRoutinesStore().routines;
    assert.deepEqual(routines.map((item) => item.botId), [DEFAULT_BOT_ID, DEFAULT_BOT_ID, DEFAULT_BOT_ID]);
    assert.deepEqual(routines.map((item) => item.name).sort(), ["Backup", "Weekly report", "Weekly report (from Alpha)"]);
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
  });
});

test("a write from a stale roster never makes an earlier bot permanent: the marker is not widened", async () => {
  await world(({ shell }) => {
    writeOldRoster(shell, (store) => store);
    readShell();
    assert.equal(JSON.parse(readFileSync(archiveMarkerPath(shell), "utf8")).allowed.length, 0);
    // A roster with an active earlier bot lands in a write (updateShell's change carries it,
    // the way a stale read from an older build would).
    const stale = withBot(readShell(), "Alpha");
    updateShell((current) => ({ ...current, bots: [...current.bots, stale.store.bots[1]] }));
    assert.deepEqual(JSON.parse(readFileSync(archiveMarkerPath(shell), "utf8")).allowed, [], "still allows nothing");
    assert.equal(readShell().bots.find((bot) => bot.id === stale.id)?.archived, true, "the next read archives it");
    // The same for a plain write.
    const again = withBot(readShell(), "Beta");
    writeShell(again.store);
    assert.deepEqual(JSON.parse(readFileSync(archiveMarkerPath(shell), "utf8")).allowed, []);
    assert.equal(readShell().bots.find((bot) => bot.id === again.id)?.archived, true);
  });
});

test("an ordinary write cannot recreate a dropped marker, so a routine is never left under an archived bot", async () => {
  await world(({ shell }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    const job = routineFor(alpha, "Weekly report", { active: true });
    // The state mid-migration: the archived roster is on disk, the marker is dropped, the routines have not moved.
    const archived = archiveEarlierBots(JSON.parse(readFileSync(shell, "utf8")) as ShellStore).store;
    writeFileSync(shell, JSON.stringify(archived), "utf8");
    assert.equal(existsSync(archiveMarkerPath(shell)), false);
    // Another writer gets in before the move finishes.
    writeShell(archived);
    assert.equal(existsSync(archiveMarkerPath(shell)), false, "writeShell does not create the marker");
    // An updateShell in that window finishes the migration first, then makes its change.
    const next = updateShell((current) => applyShellAction(current, { type: "renameBot", botId: DEFAULT_BOT_ID, name: "Helper" }).store);
    assert.equal(next.bots[0].name, "Helper");
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
    const moved = readRoutine(job.id);
    assert.equal(moved?.botId, DEFAULT_BOT_ID);
    assert.equal(moved?.active, false);
    assert.equal(moved?.movedFrom, alpha);
  });
});

test("a read checks the marker before it reads the roster", async () => {
  await world(({ shell }) => {
    readShell();
    const reads: string[] = [];
    const real = fs.readFileSync;
    // Named imports of a built-in follow the exports object once it is synced.
    (fs as { readFileSync: unknown }).readFileSync = (...args: Parameters<typeof real>) => {
      reads.push(String(args[0]));
      return real(...args);
    };
    syncBuiltinESMExports();
    try {
      readShell();
    } finally {
      (fs as { readFileSync: unknown }).readFileSync = real;
      syncBuiltinESMExports();
    }
    const marker = reads.indexOf(archiveMarkerPath(shell));
    const roster = reads.indexOf(shell);
    assert.ok(marker >= 0 && roster >= 0, `both files are read: ${JSON.stringify(reads)}`);
    // A marker seen first means the roster read next is already migrated: a
    // migration finishing in another process cannot hand back an old one.
    assert.ok(marker < roster, `marker at ${marker}, roster at ${roster}`);
  });
});

test("a fresh install and a reseed both end with a marker, once read", async () => {
  await world(({ shell }) => {
    readShell();
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
    unlinkSync(archiveMarkerPath(shell));
    writeFileSync(shell, "not json", "utf8");
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      readShell();
    } finally {
      console.warn = warn;
    }
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
    // Written but never read: the first read adds it, with nothing to archive or move.
    unlinkSync(archiveMarkerPath(shell));
    updateShell((current) => current);
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
  });
});

test("a store with nothing to archive only gets its marker: the shell file is not rewritten", async () => {
  await world(({ shell }) => {
    writeOldRoster(shell, (store) => store);
    const before = readFileSync(shell, "utf8");
    const mtime = statSync(shell).mtimeMs;
    const store = readShell();
    assert.equal(store.bots.length, 1);
    assert.equal(readFileSync(shell, "utf8"), before);
    assert.equal(statSync(shell).mtimeMs, mtime);
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
  });
});

test("a fresh install seeds the roster and marks it done; no bot is archived", async () => {
  await world(({ shell }) => {
    assert.equal(existsSync(shell), false);
    const store = readShell();
    assert.deepEqual(store.bots.map((bot) => [bot.id, bot.archived]), [[DEFAULT_BOT_ID, false]]);
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
  });
});

test("an old roster with no default bot gets one seeded, and the rest are archived", async () => {
  await world(({ shell }) => {
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      return { ...made.store, selectedBotId: made.id, bots: made.store.bots.filter((bot) => bot.id !== DEFAULT_BOT_ID) };
    });
    const store = readShell();
    assert.deepEqual(store.bots.map((bot) => [bot.id === DEFAULT_BOT_ID ? "default" : bot.name, bot.archived]), [["default", false], ["Alpha", true]]);
    assert.equal(store.selectedBotId, DEFAULT_BOT_ID);
  });
});

test("updateShell migrates first, then applies its change to the migrated roster", async () => {
  await world(({ shell }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return { ...made.store, selectedBotId: made.id };
    });
    const next = updateShell((current) => applyShellAction(current, { type: "renameBot", botId: DEFAULT_BOT_ID, name: "Helper" }).store);
    assert.equal(next.bots.find((bot) => bot.id === DEFAULT_BOT_ID)?.name, "Helper");
    assert.equal(next.bots.find((bot) => bot.id === alpha)?.archived, true);
    assert.equal(next.selectedBotId, DEFAULT_BOT_ID);
    assert.equal(existsSync(archiveMarkerPath(shell)), true);
  });
});

test("two processes reading an old roster at the same moment migrate it once", async () => {
  await world(async ({ shell, routines }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    for (let index = 0; index < 5; index += 1) routineFor(alpha, `Job ${index}`);
    const script = `
      import { readShell } from ${JSON.stringify(new URL("../shared/shell-io.ts", import.meta.url).href)};
      const store = readShell();
      process.stdout.write(JSON.stringify(store.bots.map((bot) => [bot.name, bot.archived])));
    `;
    const spawn = () => run(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    const [first, second] = await Promise.all([spawn(), spawn(), spawn()]);
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(JSON.parse(first.stdout), [["Generalist", false], ["Alpha", true]]);
    const moved = readRoutinesStore().routines;
    assert.equal(moved.length, 5);
    assert.deepEqual(moved.map((item) => item.name).sort(), ["Job 0", "Job 1", "Job 2", "Job 3", "Job 4"], "no name got a suffix from a second run");
    assert.ok(moved.every((item) => item.botId === DEFAULT_BOT_ID && item.movedFrom === alpha && item.active === false));
    assert.equal(existsSync(routines), true);
  });
});

// MARK: - Moving routines

test("moved routines keep their names unless they clash, then say where they came from; a suffixed name that clashes too gets a number", async () => {
  await world(({ routines }) => {
    routineFor(DEFAULT_BOT_ID, "Daily digest");
    routineFor(DEFAULT_BOT_ID, "Daily digest (from Old Bot)");
    routineFor(DEFAULT_BOT_ID, "daily digest (from old bot) 2");
    routineFor("bot-old", "Daily digest");
    routineFor("bot-old", "Unique job");
    routineFor("bot-other", "Daily digest");
    routineFor("bot-other", "Unique job");
    const moved = moveRoutinesToBot([{ id: "bot-old", name: "Old Bot" }, { id: "bot-other", name: "Other" }], DEFAULT_BOT_ID);
    assert.equal(moved, 4);
    const names = readRoutinesStore().routines.map((item) => item.name).sort();
    assert.deepEqual(names, [
      "Daily digest",
      "Daily digest (from Old Bot)",
      "Daily digest (from Old Bot) 3",
      "Daily digest (from Other)",
      "Unique job",
      "Unique job (from Other)",
      "daily digest (from old bot) 2",
    ].sort());
    assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length, "every name is unique");
    assert.equal(existsSync(routines), true);
    // Nothing of the receiver's own was touched.
    assert.equal(readRoutinesStore().routines.filter((item) => item.movedFrom === null).length, 3);
    // A second move finds nothing.
    assert.equal(moveRoutinesToBot([{ id: "bot-old", name: "Old Bot" }, { id: "bot-other", name: "Other" }], DEFAULT_BOT_ID), 0);
  });
});

test("a long old bot name or routine name is clipped without losing the tag's closing parenthesis", async () => {
  await world(() => {
    const long = "L".repeat(120);
    routineFor(DEFAULT_BOT_ID, "J".repeat(80));
    routineFor("bot-old", "J".repeat(80));
    routineFor("bot-two", "J".repeat(80));
    routineFor(DEFAULT_BOT_ID, "Short");
    routineFor("bot-old", "Short");
    moveRoutinesToBot([{ id: "bot-old", name: long }, { id: "bot-two", name: long }], DEFAULT_BOT_ID);
    const names = listRoutines(DEFAULT_BOT_ID).map((item) => item.name);
    assert.equal(names.length, 5);
    assert.equal(new Set(names.map((name) => name.toLowerCase())).size, 5, "every name is unique");
    for (const name of names) assert.ok(name.length <= 80, `${name.length} characters`);
    const tagged = names.filter((name) => name.includes(" (from "));
    assert.equal(tagged.length, 3);
    for (const name of tagged) assert.match(name, /\(from [^)]*\)( \d+)?$/, `the tag closes in "${name}"`);
    assert.ok(tagged.some((name) => /\) \d+$/.test(name)), "the second clash got a number after the tag");
  });
});

test("clipping never splits an emoji or leaves a space before the tag", async () => {
  await world(() => {
    const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
    // The routine name's clip lands inside an emoji: 62 letters, then a pair at units 62-63 (budget 63 for " (from Old)").
    routineFor(DEFAULT_BOT_ID, `${"x".repeat(62)}\u{1F600}${"y".repeat(10)}`);
    routineFor("bot-a", `${"x".repeat(62)}\u{1F600}${"y".repeat(10)}`);
    // A space sits at the clip boundary.
    routineFor(DEFAULT_BOT_ID, `${"z".repeat(62)} ${"w".repeat(17)}`);
    routineFor("bot-b", `${"z".repeat(62)} ${"w".repeat(17)}`);
    // The old bot's name is clipped to 30 units with an emoji straddling the cut.
    routineFor(DEFAULT_BOT_ID, "Short");
    routineFor("bot-c", "Short");
    moveRoutinesToBot([
      { id: "bot-a", name: "Old" },
      { id: "bot-b", name: "Old" },
      { id: "bot-c", name: `${"n".repeat(29)}\u{1F600}tail` },
    ], DEFAULT_BOT_ID);
    const names = listRoutines(DEFAULT_BOT_ID).map((item) => item.name);
    for (const name of names) {
      assert.ok(!lone.test(name), `a lone surrogate in ${JSON.stringify(name)}`);
      assert.ok(name.length <= 80);
    }
    const tagged = names.filter((name) => name.includes(" (from "));
    assert.equal(tagged.length, 3);
    for (const name of tagged) assert.doesNotMatch(name, /\s\s\(from /, `a space before the tag in ${JSON.stringify(name)}`);
    assert.ok(tagged.some((name) => name.endsWith(`${"n".repeat(29)})`)), "the tag name stops before the emoji it cannot fit");
  });
});

test("clipping never leaves half a grapheme: a joined emoji, a flag, a letter without its accent", async () => {
  await world(() => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    const flag = "\u{1F1E6}\u{1F1EB}";
    const accented = "e\u0301";
    const cases: Array<[string, string]> = [
      [`${"n".repeat(26)}${family}`, "n".repeat(26)],
      [`${"m".repeat(28)}${flag}`, "m".repeat(28)],
      [`${"k".repeat(29)}${accented}`, "k".repeat(29)],
    ];
    cases.forEach(([, ], index) => {
      routineFor(DEFAULT_BOT_ID, "Short");
      routineFor(`bot-${index}`, "Short");
    });
    moveRoutinesToBot(cases.map(([name], index) => ({ id: `bot-${index}`, name })), DEFAULT_BOT_ID);
    const tags = listRoutines(DEFAULT_BOT_ID).map((item) => item.name).filter((name) => name.includes(" (from "));
    assert.equal(tags.length, 3);
    for (const [, kept] of cases) {
      assert.ok(tags.includes(`Short (from ${kept})`), `a tag naming exactly ${kept.length} letters, got ${JSON.stringify(tags)}`);
    }
  });
});

test("more routines than the per-bot cap move, and the cap still holds for a new one", async () => {
  await world(() => {
    const store = readRoutinesStore();
    const now = new Date().toISOString();
    const make = (botId: string, index: number) => ({
      id: `rtn_${botId}_${index}`.replace(/-/g, "_"),
      botId,
      name: `Job ${botId} ${index}`,
      instruction: "x",
      schedules: [],
      timezone: "Europe/Berlin",
      active: true,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      runHistory: [],
      manualRunRequested: false,
      movedFrom: null,
    });
    store.routines = [
      ...Array.from({ length: ROUTINES_PER_BOT_MAX - 2 }, (_, index) => make(DEFAULT_BOT_ID, index)),
      ...Array.from({ length: ROUTINES_PER_BOT_MAX }, (_, index) => make("bot-old", index)),
      ...Array.from({ length: 10 }, (_, index) => make("bot-two", index)),
    ];
    writeRoutinesStore(store);
    assert.equal(moveRoutinesToBot([{ id: "bot-old", name: "Old" }, { id: "bot-two", name: "Two" }], DEFAULT_BOT_ID), ROUTINES_PER_BOT_MAX + 10);
    assert.equal(listRoutines(DEFAULT_BOT_ID).length, ROUTINES_PER_BOT_MAX - 2 + ROUTINES_PER_BOT_MAX + 10);
    assert.ok(listRoutines(DEFAULT_BOT_ID).length > ROUTINES_PER_BOT_MAX);
    assert.throws(() => routineFor(DEFAULT_BOT_ID, "One more"), /routine_limit/);
    // Other bots' caps are their own.
    assert.equal(routineFor("bot-fresh", "Fine").botId, "bot-fresh");
  });
});

test("movedFrom is cleared by any edit and by turning the routine on, and a file nothing moved never carries the key", async () => {
  await world(({ routines }) => {
    const plain = routineFor(DEFAULT_BOT_ID, "Plain");
    assert.equal(JSON.parse(readFileSync(routines, "utf8")).routines[0].movedFrom, undefined, "no key for an ordinary routine");
    routineFor("bot-old", "Old one");
    routineFor("bot-old", "Old two");
    routineFor("bot-old", "Old three");
    moveRoutinesToBot([{ id: "bot-old", name: "Old" }], DEFAULT_BOT_ID);
    const moved = readRoutinesStore().routines.filter((item) => item.movedFrom !== null);
    assert.equal(moved.length, 3);
    const [one, two, three] = moved;
    // A reader sees it come back out of the file.
    assert.equal(readRoutine(one.id)?.movedFrom, "bot-old");
    assert.equal(JSON.parse(readFileSync(routines, "utf8")).routines.filter((item: { movedFrom?: string }) => item.movedFrom === "bot-old").length, 3);
    // The Dismiss button's PATCH has an empty body; that is an edit too.
    assert.equal(updateRoutine(one.id, {}).movedFrom, null);
    assert.equal(updateRoutine(two.id, { active: true }).movedFrom, null);
    assert.equal(updateRoutine(three.id, { name: "Renamed" }).movedFrom, null);
    assert.ok(readRoutinesStore().routines.every((item) => item.movedFrom === null));
    assert.equal(plain.movedFrom, null);
    assert.equal(JSON.parse(readFileSync(routines, "utf8")).routines.some((item: { movedFrom?: string }) => "movedFrom" in item), false);
  });
});

// MARK: - Earlier bots: archived bots take no writes

test("an archived bot refuses every per-bot write, and a read-only action still sees it", () => {
  const made = withBot(seedStore(), "Alpha", { sessionId: "sess-a", lastPreview: "hi" });
  const store = archiveEarlierBots({
    ...made.store,
    recents: [{ id: "rec-a", botId: made.id, title: "hi", sessionId: "sess-a", preview: "hi", updatedAt: "2026-09-02T00:00:00.000Z" }],
  }).store;
  const botId = made.id;
  const refused: Array<Parameters<typeof applyShellAction>[1]> = [
    { type: "renameBot", botId, name: "New" },
    { type: "nameBot", botId, name: "New" },
    { type: "updateBot", botId, patch: { description: "x" } },
    { type: "setSession", botId, sessionId: "sess-z" },
    { type: "setWorkspace", botId, workspace: { path: "/tmp/project", permission: "auto" } },
    { type: "setPermission", botId, permission: "read_only" },
    { type: "touchChat", botId, preview: "x" },
    { type: "newChat", botId },
    { type: "clearThread", botId },
    { type: "openRecent", recentId: "rec-a" },
  ];
  for (const action of refused) assert.throws(() => applyShellAction(store, action), /shell_bot_archived/, action.type);
  // select is a different refusal: nothing but the default bot is selectable.
  assert.throws(() => applyShellAction(store, { type: "select", botId }), /shell_bot_forbidden/);
  // The default bot is untouched by all of this.
  assert.equal(applyShellAction(store, { type: "renameBot", botId: DEFAULT_BOT_ID, name: "Helper" }).store.bots[0].name, "Helper");
  // An unknown bot still reads as missing, not archived.
  assert.throws(() => applyShellAction(store, { type: "setWorkspace", botId: "nope", workspace: null }), /shell_bot_missing/);
});

test("a selectedBotId on disk that names an archived bot reads as the default bot", () => {
  const made = withBot(seedStore(), "Alpha");
  const archived = archiveEarlierBots(made.store).store;
  const raw = JSON.parse(JSON.stringify({ ...archived, selectedBotId: made.id }));
  const parsed = applyShellAction(readBack(raw), { type: "touchChat", botId: DEFAULT_BOT_ID, preview: "x" }).store;
  assert.equal(parsed.selectedBotId, DEFAULT_BOT_ID);
});

function readBack(raw: unknown): ShellStore {
  const dir = mkdtempSync(join(tmpdir(), "ub-archive-read-"));
  const path = join(dir, "shell.json");
  writeShell(raw as ShellStore, path);
  return readShell(path);
}

// MARK: - moveNotes and removeArchivedBot

test("moveNotes and removeArchivedBot say yes only to an archived bot that is not the default or a fixture", () => {
  const made = withBot(seedStore(), "Alpha");
  const live = made.store;
  const archived = archiveEarlierBots(live).store;
  for (const type of ["moveNotes", "removeArchivedBot"] as const) {
    const act = (store: ShellStore, id: string) => applyShellAction(store, type === "moveNotes" ? { type, fromBotId: id } : { type, botId: id });
    assert.throws(() => act(live, made.id), /shell_bot_not_archived/, `${type} on a bot that is still active`);
    assert.throws(() => act(archived, DEFAULT_BOT_ID), /shell_bot_forbidden/, `${type} on the default bot`);
    assert.throws(() => act(archived, "bot-ghost"), /shell_bot_missing/, `${type} on a bot that is not there`);
    assert.doesNotThrow(() => act(archived, made.id), `${type} on an archived bot`);
  }
  // Dev stack: a perf fixture is neither archived nor removable.
  const previous = process.env.UB_STACK;
  process.env.UB_STACK = "dev";
  try {
    const fixture = withBot(seedStore(), "Perf Short A");
    assert.throws(() => applyShellAction(fixture.store, { type: "removeArchivedBot", botId: fixture.id }), /shell_bot_forbidden/);
    assert.throws(() => applyShellAction(fixture.store, { type: "moveNotes", fromBotId: fixture.id }), /shell_bot_forbidden/);
  } finally {
    if (previous === undefined) delete process.env.UB_STACK;
    else process.env.UB_STACK = previous;
  }
});

test("removeArchivedBot drops the record and its recents, and touches no other bot", () => {
  const a = withBot(seedStore(), "Alpha");
  const b = withBot(a.store, "Beta");
  const store = archiveEarlierBots({
    ...b.store,
    recents: [
      { id: "rec-a", botId: a.id, title: "a", sessionId: "s-a", preview: "a", updatedAt: "2026-09-02T00:00:00.000Z" },
      { id: "rec-b", botId: b.id, title: "b", sessionId: "s-b", preview: "b", updatedAt: "2026-09-02T00:00:00.000Z" },
    ],
  }).store;
  const out = applyShellAction(store, { type: "removeArchivedBot", botId: a.id }).store;
  assert.deepEqual(out.bots.map((bot) => bot.name), ["Generalist", "Beta"]);
  assert.deepEqual(out.recents.map((item) => item.id), ["rec-b"]);
  assert.equal(out.selectedBotId, DEFAULT_BOT_ID);
});

function note(store: MemoryStore, botId: string, title: string, patch: { expiresAt?: string | null; body?: string; source?: "owner" | "model" | "model-after-outside-content" } = {}) {
  return store.upsert({
    expectedRevision: null,
    title,
    tags: ["t"],
    body: patch.body ?? `Body of ${title}`,
    botId,
    source: patch.source ?? "owner",
    expiresAt: patch.expiresAt ?? null,
    sessionId: "s1",
  });
}

test("moveBotNotes moves live notes only, bumps the revision, and is the one path that changes a note's bot", async () => {
  await world(() => {
    const store = new MemoryStore();
    try {
      const keep = note(store, "bot-old", "Plan", { source: "model-after-outside-content", body: "The plan." });
      const second = note(store, "bot-old", "Plan two");
      const gone = note(store, "bot-old", "Archived one");
      store.archive(gone.id, "bot-old", gone.revision);
      note(store, "bot-old", "Expired", { expiresAt: new Date(Date.now() - 60_000).toISOString() });
      const theirs = note(store, "bot-other", "Not mine");
      const mine = note(store, DEFAULT_BOT_ID, "Already mine");
      const before = store.readCard(keep.id, "bot-old");

      assert.equal(store.moveBotNotes("bot-old", DEFAULT_BOT_ID), 2);

      // A reader of the new owner sees the note, one revision on, body and source intact.
      const after = store.readCard(keep.id, DEFAULT_BOT_ID);
      assert.equal(after.revision, before.revision + 1);
      assert.equal(after.body, "The plan.");
      assert.equal(after.title, "Plan");
      assert.deepEqual(after.tags, ["t"]);
      assert.equal(after.source, "model-after-outside-content", "the outside-content mark travels with the note");
      assert.ok(after.updatedAt >= before.updatedAt);
      assert.equal(store.countLive(DEFAULT_BOT_ID), 3);
      assert.equal(store.countLive("bot-old"), 0);
      assert.deepEqual(store.list(DEFAULT_BOT_ID).map((card) => card.id).sort(), [keep.id, second.id, mine.id].sort());
      assert.deepEqual(store.search("plan", DEFAULT_BOT_ID).map((card) => card.id).sort(), [keep.id, second.id].sort());
      // The old owner no longer sees it; others are untouched.
      assert.throws(() => store.readCard(keep.id, "bot-old"), /memory_forbidden/);
      assert.equal(store.read(theirs.id, "bot-other").revision, theirs.revision);
      // A stale writer holding the old revision cannot clobber the moved note.
      assert.throws(
        () => store.upsert({ id: keep.id, expectedRevision: before.revision, title: "x", tags: [], body: "x", botId: DEFAULT_BOT_ID, source: "model", expiresAt: null, sessionId: "s2" }),
        /memory_revision_conflict/,
      );
      // The immutable-owner guard of upsert is still in force: the old bot cannot write it back.
      assert.throws(
        () => store.upsert({ id: keep.id, expectedRevision: after.revision, title: "x", tags: [], body: "x", botId: "bot-old", source: "model", expiresAt: null, sessionId: "s2" }),
        /memory_forbidden/,
      );
      // A second run finds nothing, and the index agrees with the files after a rebuild.
      assert.equal(store.moveBotNotes("bot-old", DEFAULT_BOT_ID), 0);
      store.rebuildIndex();
      assert.equal(store.countLive(DEFAULT_BOT_ID), 3);
      assert.equal(store.countLive("bot-old"), 0);
      // The archived and the expired note stayed where they were, as files.
      const files = readdirSync(store.notesDir).filter((name) => name.endsWith(".md"));
      assert.equal(files.length, 6);
      assert.equal(store.moveBotNotes(DEFAULT_BOT_ID, DEFAULT_BOT_ID), 0, "moving to itself is a no-op");
    } finally {
      store.close();
    }
  });
});

test("moveBotNotes with nothing to move, or no bot named, is a no-op or a refusal", async () => {
  await world(() => {
    const store = new MemoryStore();
    try {
      assert.equal(store.moveBotNotes("bot-nobody", DEFAULT_BOT_ID), 0);
      assert.throws(() => store.moveBotNotes("", DEFAULT_BOT_ID), /memory_bot_required/);
      assert.throws(() => store.moveBotNotes("bot-old", ""), /memory_bot_required/);
    } finally {
      store.close();
    }
  });
});

test("archiveBotNotes archives a bot's live notes as files, not deletes, and leaves other bots alone", async () => {
  await world(() => {
    const store = new MemoryStore();
    try {
      for (let index = 0; index < 130; index += 1) note(store, "bot-old", `Old ${index}`);
      const expired = note(store, "bot-old", "Expired", { expiresAt: new Date(Date.now() - 60_000).toISOString() });
      const other = note(store, DEFAULT_BOT_ID, "Mine");
      assert.equal(store.countLive("bot-old"), 130);
      assert.equal(store.archiveBotNotes("bot-old"), 130, "more than one page of 100");
      assert.equal(store.countLive("bot-old"), 0);
      assert.deepEqual(store.list("bot-old"), []);
      assert.equal(store.countLive(DEFAULT_BOT_ID), 1);
      assert.equal(store.read(other.id, DEFAULT_BOT_ID).revision, other.revision);
      assert.equal(readdirSync(store.notesDir).filter((name) => name.endsWith(".md")).length, 132, "every note is still a file");
      assert.match(readFileSync(join(store.notesDir, `${expired.id}.md`), "utf8"), /"status":"active"/, "an expired note was never live and is left alone");
      assert.equal(store.archiveBotNotes("bot-old"), 0, "a second run has nothing left");
      assert.throws(() => store.archiveBotNotes(""), /memory_bot_required/);
    } finally {
      store.close();
    }
  });
});

// MARK: - Nothing runs for an archived bot

test("a routine of an archived bot fails without reaching eve", async () => {
  const { startRoutineNow } = await import("../web/lib/agent-exec.ts");
  await world(async ({ shell }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    // Archive without the routine move, as if the routine were created in the gap.
    writeShell(archiveEarlierBots(readShell()).store);
    const routine = routineFor(alpha, "Stuck");
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response("{}", { status: 200 }); }) as typeof globalThis.fetch;
    const log = console.log;
    console.log = () => undefined;
    try {
      await assert.rejects(startRoutineNow(routine.id), /shell_bot_archived/);
    } finally {
      globalThis.fetch = original;
      console.log = log;
    }
    assert.equal(calls, 0);
    assert.match(readRoutine(routine.id)?.runHistory[0]?.error ?? "", /shell_bot_archived/);
  });
});

test("a handoff to an archived bot fails on the first try, with no turn", async () => {
  const { pumpHandoffs } = await import("../web/lib/agent-exec.ts");
  const { queueHandoff, readHandoff } = await import("../shared/handoffs.ts");
  await world(async ({ shell }) => {
    let alpha = "";
    writeOldRoster(shell, (store) => {
      const made = withBot(store, "Alpha");
      alpha = made.id;
      return made.store;
    });
    readShell();
    const record = queueHandoff({ sourceBotId: DEFAULT_BOT_ID, sourceName: "Generalist", targetBotId: alpha, targetName: "Alpha", message: "hello" });
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response("{}", { status: 200 }); }) as typeof globalThis.fetch;
    try {
      const result = await pumpHandoffs(1);
      assert.equal(result.delivered.length, 0);
      assert.equal(result.failed[0]?.id, record.id);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(calls, 0);
    assert.equal(readHandoff(record.id)?.status, "failed");
    assert.equal(readHandoff(record.id)?.attempts, 1, "terminal on the first attempt");
  });
});
