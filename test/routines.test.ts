import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRoutineRun,
  claimDueRoutine,
  createRoutine,
  deleteRoutine,
  deleteRoutinesForBot,
  dueRoutines,
  listRoutines,
  nextOccurrence,
  parseRoutinesStore,
  parseSchedules,
  readRoutine,
  readRoutinesStore,
  routineDueAt,
  routineNextRun,
  RUN_HISTORY_MAX,
  updateRoutine,
  zonedWallToUtc,
  type Routine,
} from "../shared/routines-store.ts";

function sandbox(): { path: string; restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ub-routines-"));
  const previous = process.env.UB_ROUTINES_PATH;
  const path = join(dir, "routines.json");
  process.env.UB_ROUTINES_PATH = path;
  return {
    path,
    restore() {
      if (previous === undefined) delete process.env.UB_ROUTINES_PATH;
      else process.env.UB_ROUTINES_PATH = previous;
    },
  };
}

function weekly(days: number[], time: string) {
  return { kind: "weekly" as const, days, time };
}

// MARK: - Schedule math

test("zonedWallToUtc keeps the wall clock across a DST change", () => {
  // Berlin is UTC+1 in winter and UTC+2 in summer; 09:00 local stays 09:00.
  const winter = zonedWallToUtc(2026, 1, 12, 9, 0, "Europe/Berlin");
  assert.equal(winter.toISOString(), "2026-01-12T08:00:00.000Z");
  const summer = zonedWallToUtc(2026, 7, 13, 9, 0, "Europe/Berlin");
  assert.equal(summer.toISOString(), "2026-07-13T07:00:00.000Z");
});

test("zonedWallToUtc takes the first instant of an ambiguous fall-back hour", () => {
  // 2026-10-25 02:30 happens twice in Berlin: 00:30Z (CEST) and 01:30Z (CET).
  const at = zonedWallToUtc(2026, 10, 25, 2, 30, "Europe/Berlin");
  assert.equal(at.toISOString(), "2026-10-25T00:30:00.000Z");
});

test("zonedWallToUtc shifts a spring-forward gap instead of skipping it", () => {
  // 2026-03-29 02:30 does not exist in Berlin; the clock jumps 02:00 to 03:00.
  const at = zonedWallToUtc(2026, 3, 29, 2, 30, "Europe/Berlin");
  assert.equal(at.toISOString(), "2026-03-29T01:30:00.000Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  assert.equal(parts, "03:30");
});

test("nextOccurrence walks weekly, daily and one-shot schedules", () => {
  const zone = "Europe/Berlin";
  // 2026-09-14 is a Monday.
  const monday = new Date("2026-09-14T06:00:00.000Z");
  const nextMonday = nextOccurrence(weekly([1], "09:00"), zone, monday);
  assert.equal(nextMonday?.toISOString(), "2026-09-14T07:00:00.000Z");

  // Strictly after: the same instant does not match itself again.
  const after = nextOccurrence(weekly([1], "09:00"), zone, new Date("2026-09-14T07:00:00.000Z"));
  assert.equal(after?.toISOString(), "2026-09-21T07:00:00.000Z");

  const daily = nextOccurrence({ kind: "daily", time: "23:30" }, zone, monday);
  assert.equal(daily?.toISOString(), "2026-09-14T21:30:00.000Z");

  const once = nextOccurrence({ kind: "once", date: "2026-12-24", time: "18:00" }, zone, monday);
  assert.equal(once?.toISOString(), "2026-12-24T17:00:00.000Z");
  // A one-shot in the past never fires again.
  assert.equal(nextOccurrence({ kind: "once", date: "2020-01-01", time: "18:00" }, zone, monday), null);
});

test("weekly 09:00 stays 09:00 local across the spring change", () => {
  const zone = "Europe/Berlin";
  // The Sunday before the 2026-03-29 transition, looking for the next Monday.
  const before = new Date("2026-03-23T08:00:00.000Z");
  const nextRun = nextOccurrence(weekly([1], "09:00"), zone, before);
  assert.equal(nextRun?.toISOString(), "2026-03-30T07:00:00.000Z");
});

test("routineNextRun takes the earliest schedule and routineDueAt anchors on the last run", () => {
  const routine: Routine = {
    id: "rtn_x",
    botId: "bot-a",
    name: "Check",
    instruction: "Run the check.",
    schedules: [weekly([1], "09:00"), { kind: "daily", time: "07:00" }],
    timezone: "Europe/Berlin",
    active: true,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    lastRunAt: null,
    runHistory: [],
  };
  // Daily 07:00 Berlin beats weekly Monday 09:00 Berlin on the same day.
  const next = routineNextRun(routine, new Date("2026-09-14T00:00:00.000Z"));
  assert.equal(next?.toISOString(), "2026-09-14T05:00:00.000Z");

  // Nothing is due before the occurrence.
  assert.equal(routineDueAt(routine, new Date("2026-09-14T04:00:00.000Z")), null);
  assert.equal(routineDueAt(routine, new Date("2026-09-14T05:30:00.000Z"))?.toISOString(), "2026-09-14T05:00:00.000Z");
  // The anchor moves with the last run, and the day's second schedule still
  // gets its own occurrence.
  const ranDaily = { ...routine, lastRunAt: "2026-09-14T05:30:00.000Z" };
  assert.equal(routineDueAt(ranDaily, new Date("2026-09-14T08:00:00.000Z"))?.toISOString(), "2026-09-14T07:00:00.000Z");
  const ranBoth = { ...routine, lastRunAt: "2026-09-14T07:30:00.000Z" };
  assert.equal(routineDueAt(ranBoth, new Date("2026-09-14T22:00:00.000Z")), null);
  assert.equal(routineDueAt(ranBoth, new Date("2026-09-15T06:00:00.000Z"))?.toISOString(), "2026-09-15T05:00:00.000Z");

  // Inactive routines never come due.
  assert.equal(routineDueAt({ ...routine, active: false }, new Date("2026-09-14T05:30:00.000Z")), null);
  // Neither does a routine with no schedule.
  assert.equal(routineDueAt({ ...routine, schedules: [] }, new Date("2026-09-14T05:30:00.000Z")), null);
});

test("parseSchedules keeps the supported kinds and drops the rest", () => {
  const parsed = parseSchedules([
    { kind: "weekly", days: [1, 1, 9, 3], time: "09:00" },
    { kind: "daily", time: "24:00" },
    { kind: "daily", time: "07:30" },
    { kind: "once", date: "2026-13-01", time: "07:30" },
    { kind: "once", date: "2026-12-01", time: "07:30" },
    { kind: "monthly", time: "07:30" },
    { kind: "weekly", days: [1, 3], time: "09:00" },
  ]);
  assert.deepEqual(parsed, [
    { kind: "weekly", days: [1, 3], time: "09:00" },
    { kind: "daily", time: "07:30" },
    { kind: "once", date: "2026-12-01", time: "07:30" },
  ]);
});

// MARK: - Store

test("routine CRUD round-trips through the locked store", () => {
  const box = sandbox();
  try {
    const created = createRoutine({
      botId: "bot-a",
      name: "  Weekly SEO check  ",
      instruction: "  Check rankings and draft a post.  ",
      schedules: [weekly([1], "09:00")],
      timezone: "Europe/Berlin",
    });
    assert.equal(created.name, "Weekly SEO check");
    assert.equal(created.instruction, "Check rankings and draft a post.");
    assert.equal(created.active, true);
    assert.equal(created.lastRunAt, null);

    assert.equal(listRoutines("bot-a").length, 1);
    assert.equal(listRoutines("bot-b").length, 0);
    assert.equal(readRoutine(created.id)?.id, created.id);

    const toggled = updateRoutine(created.id, { active: false });
    assert.equal(toggled.active, false);
    assert.equal(readRoutine(created.id)?.active, false);

    const renamed = updateRoutine(created.id, { name: "SEO", schedules: [{ kind: "daily", time: "08:15" }] });
    assert.equal(renamed.name, "SEO");
    assert.deepEqual(renamed.schedules, [{ kind: "daily", time: "08:15" }]);

    assert.throws(() => updateRoutine(created.id, { name: "   " }), /routine_name_required/);
    assert.throws(() => updateRoutine(created.id, { timezone: "Mars/Olympus" }), /routine_timezone_invalid/);
    assert.throws(() => updateRoutine("rtn_nope", { name: "x" }), /routine_missing/);
    assert.throws(
      () => createRoutine({ botId: "bot-a", name: "", instruction: "do it" }),
      /routine_name_required/,
    );
    assert.throws(
      () => createRoutine({ botId: "bot-a", name: "x", instruction: "  " }),
      /routine_instruction_required/,
    );

    assert.equal(deleteRoutine(created.id), true);
    assert.equal(deleteRoutine(created.id), false);
    assert.equal(listRoutines("bot-a").length, 0);
  } finally {
    box.restore();
  }
});

test("run history is bounded and deleting a bot takes its routines", () => {
  const box = sandbox();
  try {
    const routine = createRoutine({
      botId: "bot-a",
      name: "Daily",
      instruction: "Do the thing.",
      schedules: [{ kind: "daily", time: "09:00" }],
    });
    for (let index = 0; index < RUN_HISTORY_MAX + 5; index += 1) {
      appendRoutineRun(routine.id, { status: index % 2 === 0 ? "ok" : "failed", sessionId: `ses_${index}` });
    }
    const stored = readRoutine(routine.id);
    assert.equal(stored?.runHistory.length, RUN_HISTORY_MAX);
    assert.equal(stored?.runHistory.at(-1)?.sessionId, `ses_${RUN_HISTORY_MAX + 4}`);
    assert.equal(appendRoutineRun("rtn_nope", { status: "ok" }), null);

    createRoutine({ botId: "bot-b", name: "Other", instruction: "Do it.", schedules: [] });
    assert.equal(deleteRoutinesForBot("bot-a"), 1);
    assert.equal(listRoutines("bot-a").length, 0);
    assert.equal(listRoutines("bot-b").length, 1);
  } finally {
    box.restore();
  }
});

test("a due routine fires once when two ticks race", () => {
  const box = sandbox();
  try {
    const routine = createRoutine({
      botId: "bot-a",
      name: "Weekly",
      instruction: "Draft the report.",
      schedules: [weekly([1], "09:00")],
      timezone: "Europe/Berlin",
    }, undefined, new Date("2026-09-13T00:00:00.000Z"));

    const now = new Date("2026-09-14T07:00:30.000Z");
    assert.equal(dueRoutines(now).map((item) => item.id).join(), routine.id);

    const first = claimDueRoutine(routine.id, now);
    assert.equal(first?.dueAt, "2026-09-14T07:00:00.000Z");
    // The racing tick sees the moved anchor and finds nothing to run.
    assert.equal(claimDueRoutine(routine.id, now), null);
    assert.deepEqual(dueRoutines(now), []);
    assert.equal(readRoutine(routine.id)?.lastRunAt, now.toISOString());

    // The following Monday is due again.
    const nextWeek = new Date("2026-09-21T07:00:05.000Z");
    assert.equal(claimDueRoutine(routine.id, nextWeek)?.dueAt, "2026-09-21T07:00:00.000Z");
  } finally {
    box.restore();
  }
});

test("a long sleep catches up with exactly one run", () => {
  const box = sandbox();
  try {
    const routine = createRoutine({
      botId: "bot-a",
      name: "Daily",
      instruction: "Do the thing.",
      schedules: [{ kind: "daily", time: "09:00" }],
      timezone: "Europe/Berlin",
    }, undefined, new Date("2026-09-01T00:00:00.000Z"));
    // Two weeks of missed windows collapse into one claim.
    const wake = new Date("2026-09-14T12:00:00.000Z");
    assert.ok(claimDueRoutine(routine.id, wake));
    assert.equal(claimDueRoutine(routine.id, wake), null);
  } finally {
    box.restore();
  }
});

test("an unreadable or future-schema file reads as empty and is moved aside on write", () => {
  const box = sandbox();
  try {
    writeFileSync(box.path, "{not json", "utf8");
    assert.deepEqual(readRoutinesStore(), { schemaVersion: 1, routines: [] });
    writeFileSync(box.path, JSON.stringify({ schemaVersion: 99, routines: [] }), "utf8");
    assert.deepEqual(readRoutinesStore(), { schemaVersion: 1, routines: [] });
    const created = createRoutine({ botId: "bot-a", name: "A", instruction: "b", schedules: [] });
    assert.equal(readRoutine(created.id)?.name, "A");
  } finally {
    box.restore();
  }
});

test("parseRoutinesStore drops malformed rows and duplicate ids", () => {
  const store = parseRoutinesStore({
    schemaVersion: 1,
    routines: [
      { id: "rtn_a", botId: "bot-a", name: "A", instruction: "x", createdAt: "t", updatedAt: "t", nextField: 1 },
      { id: "rtn_a", botId: "bot-a", name: "dupe", instruction: "x", createdAt: "t", updatedAt: "t" },
      { id: "rtn_b", name: "no bot", instruction: "x", createdAt: "t", updatedAt: "t" },
      null,
    ],
  });
  assert.equal(store.routines.length, 1);
  assert.equal(store.routines[0].name, "A");
  assert.equal(store.routines[0].active, true);
});

// MARK: - API guards
//
// Route modules import `next/server`, which only resolves under the bundler, so
// they cannot be invoked from the node test runner. This asserts the source
// contract instead: every routines route has to carry the same desktop gate,
// CSRF check and rate limit as its neighbours, and the read path must not be
// reachable without a session.

const ROUTE_ROOT = join(import.meta.dirname, "..", "web", "app", "api", "routines");

function routeSource(...parts: string[]): string {
  return readFileSync(join(ROUTE_ROOT, ...parts), "utf8");
}

test("every routines route is behind the desktop gate", () => {
  for (const parts of [["route.ts"], ["[id]", "route.ts"], ["[id]", "run", "route.ts"]]) {
    const source = routeSource(...parts);
    const where = parts.join("/");
    // requireDesktop rejects a missing or non-desktop session and any origin
    // that is not this loopback server.
    assert.match(source, /requireDesktop\(request\)/, `${where} misses requireDesktop`);
    assert.match(source, /isGateError\(gate\)\)\s*return gate\.error/, `${where} ignores the gate result`);
  }
});

test("routines writes require the CSRF token and a rate-limit bucket", () => {
  for (const parts of [["route.ts"], ["[id]", "route.ts"], ["[id]", "run", "route.ts"]]) {
    const source = routeSource(...parts);
    const where = parts.join("/");
    assert.match(source, /x-ub-csrf/, `${where} misses the CSRF header read`);
    assert.match(source, /csrf !== gate\.session\.csrf/, `${where} misses the CSRF comparison`);
    assert.match(source, /rateLimited\(/, `${where} misses the rate limit`);
  }
  // The read path is a GET on the collection only; no other route exposes one.
  assert.match(routeSource("route.ts"), /export async function GET/);
  assert.doesNotMatch(routeSource("[id]", "route.ts"), /export async function GET/);
  assert.doesNotMatch(routeSource("[id]", "run", "route.ts"), /export async function GET/);
});

test("the manual run route refuses to start without the agent credential", () => {
  const source = routeSource("[id]", "run", "route.ts");
  assert.match(source, /if \(!agentsEnabled\(\)\)/);
  assert.match(source, /agent_credential_missing/);
  // The gate runs before anything reads or starts a routine.
  assert.ok(source.indexOf("requireDesktop") < source.indexOf("runRoutineNow"));
});
