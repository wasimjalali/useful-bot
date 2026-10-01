import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backfillSessionOwners,
  bindSession,
  parseSessionOwners,
  readSessionBot,
  readSessionOwners,
  resolveSessionBot,
  unbindBot,
} from "../shared/session-bindings.ts";
import { bindTurnBody } from "../shared/eve-proxy.ts";
import { applyShellAction, DEFAULT_BOT_ID, type ShellStore } from "../shared/shell-store.ts";
import { readShell, writeShell } from "../shared/shell-io.ts";
import { upsertSessionGrant } from "../shared/workspace-store.ts";
import { createRoutine, readRoutinesStore } from "../shared/routines-store.ts";
import { queueHandoff, readHandoff } from "../shared/handoffs.ts";
import { activeBotId, awaitActiveBotId, BotContextMissingError } from "../agent/lib/active-bot.ts";
import { ApprovalStore } from "../agent/lib/approvals.ts";
import { setApprovalStore } from "../agent/lib/write.ts";
import { pumpHandoffs, startRoutineNow } from "../web/lib/agent-exec.ts";
import clearHistory from "../agent/tools/clear_history.ts";
import createRoutineTool from "../agent/tools/create_routine.ts";
import deleteBot from "../agent/tools/delete_bot.ts";
import deleteRoutine from "../agent/tools/delete_routine.ts";
import listBots from "../agent/tools/list_bots.ts";
import listRoutines from "../agent/tools/list_routines.ts";
import memoryRead from "../agent/tools/memory_read.ts";
import memorySearch from "../agent/tools/memory_search.ts";
import memoryUpsert from "../agent/tools/memory_upsert.ts";
import postToGroup from "../agent/tools/post_to_group.ts";
import proposeBot from "../agent/tools/propose_bot.ts";
import proposeGroup from "../agent/tools/propose_group.ts";
import railAction from "../agent/tools/rail_action.ts";
import runRoutine from "../agent/tools/run_routine.ts";
import sendToBot from "../agent/tools/send_to_bot.ts";
import updateBotProfile from "../agent/tools/update_bot_profile.ts";
import updateRoutine from "../agent/tools/update_routine.ts";

type Tool = { execute: (input: never, context: never) => unknown };
async function run<T>(tool: Tool, input: Record<string, unknown>, context: Record<string, unknown> = {}): Promise<T> {
  return await tool.execute(input as never, context as never) as T;
}

const GO = "opencode-go:plan";
const KEYS = [
  "UB_SESSION_OWNERS_PATH",
  "UB_BINDING_WAIT_MS",
  "UB_SHELL_PATH",
  "UB_WORKSPACE_STORE_PATH",
  "UB_ROUTINES_PATH",
  "UB_AGENT_STORE_PATH",
  "UB_HANDOFF_DIR",
  "UB_HANDOFF_WAIT_MS",
  "UB_PROVIDERS_PATH",
  "UB_MODELS_CACHE_PATH",
  "UB_MEMORY_ROOT",
  "UB_CHANNEL_JWT",
  "UB_CHANNEL_JWT_SECRET",
  "UB_ACTIVE_BOT_ID",
] as const;

/** Every store in a temp dir, one connection and a roster of two bots. */
async function withWorld<T>(fn: (world: { dir: string; alpha: string; beta: string; owners: string }) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ub-bind-"));
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const owners = join(dir, "session-owners.json");
  process.env.UB_SESSION_OWNERS_PATH = owners;
  process.env.UB_BINDING_WAIT_MS = "150";
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_WORKSPACE_STORE_PATH = join(dir, "workspace.json");
  process.env.UB_ROUTINES_PATH = join(dir, "routines.json");
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_HANDOFF_DIR = join(dir, "handoffs");
  process.env.UB_HANDOFF_WAIT_MS = "0";
  process.env.UB_PROVIDERS_PATH = join(dir, "providers.json");
  process.env.UB_MODELS_CACHE_PATH = join(dir, "models-cache.json");
  process.env.UB_MEMORY_ROOT = join(dir, "memory");
  process.env.UB_CHANNEL_JWT = "test-jwt";
  delete process.env.UB_CHANNEL_JWT_SECRET;
  delete process.env.UB_ACTIVE_BOT_ID;
  writeFileSync(process.env.UB_PROVIDERS_PATH, JSON.stringify({
    schemaVersion: 2,
    connections: {
      [GO]: {
        id: GO,
        providerId: "opencode-go",
        mode: "plan",
        credential: { kind: "key", key: "go-key-12345678" },
        fields: {},
        updatedAt: new Date().toISOString(),
        lastError: null,
      },
    },
    activeConnectionId: GO,
    selectedModel: "glm-5.3-flash",
    effort: null,
    speed: "standard",
    roles: {},
  }));
  writeFileSync(process.env.UB_MODELS_CACHE_PATH, JSON.stringify({
    schemaVersion: 3,
    providers: {
      [GO]: {
        fetchedAt: Date.now(),
        models: [{
          id: "glm-5.3-flash",
          label: "glm-5.3-flash",
          efforts: ["low"],
          defaultEffort: "low",
          speeds: ["standard"],
          defaultSpeed: "standard",
          contextTokens: 200_000,
        }],
      },
    },
  }));
  let store: ShellStore = readShell();
  const alpha = applyShellAction(store, { type: "createBot", name: "Alpha" });
  store = alpha.store;
  const beta = applyShellAction(store, { type: "createBot", name: "Beta" });
  writeShell(beta.store);
  try {
    return await fn({ dir, alpha: alpha.createdId as string, beta: beta.createdId as string, owners });
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function point(botId: string, sessionId: string): void {
  writeShell(applyShellAction(readShell(), { type: "touchChat", botId, preview: "hi", sessionId }).store);
}

// MARK: - The store

test("a session binds once; the same bot again is a no-op and another bot is refused", async () => {
  await withWorld(({ alpha, beta, owners }) => {
    assert.equal(bindSession("sess-1", alpha), "created");
    assert.equal(bindSession("sess-1", alpha), "exists");
    assert.throws(() => bindSession("sess-1", beta), /session_owner_conflict/);
    assert.equal(readSessionBot("sess-1"), alpha, "the refused write changed nothing");
    assert.equal(readSessionBot("sess-unknown"), null);
    // Ids that are not eve session ids never reach the file.
    assert.throws(() => bindSession("../x", alpha), /session_owners_session_id/);
    assert.throws(() => bindSession("a b", alpha), /session_owners_session_id/);
    assert.deepEqual(Object.keys(readSessionOwners(owners).sessions), ["sess-1"]);
  });
});

test("there is no eviction: a hundred sessions all stay bound", async () => {
  await withWorld(({ alpha }) => {
    for (let i = 0; i < 100; i += 1) bindSession(`sess-many-${i}`, alpha);
    assert.equal(Object.keys(readSessionOwners().sessions).length, 100);
    assert.equal(readSessionBot("sess-many-0"), alpha);
  });
});

test("the parse refuses bad shapes instead of repairing them", () => {
  const good = { schemaVersion: 1, sessions: { s1: { botId: "b", createdAt: "2026-01-01T00:00:00.000Z" } } };
  assert.deepEqual(parseSessionOwners(good).sessions.s1.botId, "b");
  assert.throws(() => parseSessionOwners(null), /session_owners_invalid/);
  assert.throws(() => parseSessionOwners([]), /session_owners_invalid/);
  assert.throws(() => parseSessionOwners({ ...good, schemaVersion: 2 }), /session_owners_schema/);
  assert.throws(() => parseSessionOwners({ schemaVersion: 1, sessions: [] }), /session_owners_sessions/);
  assert.throws(() => parseSessionOwners({ schemaVersion: 1, sessions: { "../x": good.sessions.s1 } }), /session_owners_session_id/);
  assert.throws(() => parseSessionOwners({ schemaVersion: 1, sessions: { s1: { botId: "", createdAt: "2026-01-01T00:00:00.000Z" } } }), /session_owners_bot_id/);
  assert.throws(() => parseSessionOwners({ schemaVersion: 1, sessions: { s1: { botId: "b", createdAt: "nope" } } }), /session_owners_created_at/);
  assert.throws(() => parseSessionOwners({ schemaVersion: 1, sessions: { s1: "b" } }), /session_owners_row/);
});

test("an unreadable file reads as unbound, and the next write backs it up", async () => {
  await withWorld(({ alpha, dir, owners }) => {
    writeFileSync(owners, "{ not json");
    assert.equal(readSessionBot("sess-1"), null);
    assert.equal(bindSession("sess-1", alpha), "created");
    assert.equal(readSessionBot("sess-1"), alpha);
    assert.equal(readdirSync(dir).some((name) => name.startsWith("session-owners.json.invalid.")), true);
  });
});

test("unbindBot drops one bot's rows and nobody else's", async () => {
  await withWorld(({ alpha, beta }) => {
    bindSession("sess-a1", alpha);
    bindSession("sess-a2", alpha);
    bindSession("sess-b1", beta);
    assert.equal(unbindBot(alpha), 2);
    assert.equal(readSessionBot("sess-a1"), null);
    assert.equal(readSessionBot("sess-b1"), beta);
    assert.equal(unbindBot(alpha), 0);
  });
});

test("backfill binds the roster's pointers and skips a pointer another bot already owns", async () => {
  await withWorld(({ alpha, beta }) => {
    point(alpha, "sess-live-a");
    bindSession("sess-contested", alpha);
    // Beta's live pointer names Alpha's session (a hand edit or a bug), and
    // its continued pointer is an ordinary one.
    const shell = readShell();
    const roster: ShellStore = {
      ...shell,
      bots: shell.bots.map((bot) => (
        bot.id === beta ? { ...bot, sessionId: "sess-contested", continuedSessionId: "sess-cont-b" } : bot
      )),
    };
    assert.equal(backfillSessionOwners(roster), 2);
    assert.equal(readSessionBot("sess-live-a"), alpha);
    assert.equal(readSessionBot("sess-cont-b"), beta);
    assert.equal(readSessionBot("sess-contested"), alpha, "the contested pointer was skipped");
    // Running it again adds nothing.
    assert.equal(backfillSessionOwners(roster), 0);
  });
});

test("resolving an unbound session backfills it from the roster, and the binding wins over a pointer", async () => {
  await withWorld(({ alpha, beta }) => {
    point(alpha, "sess-pointer-a");
    assert.equal(readSessionBot("sess-pointer-a"), null, "nothing wrote it yet");
    assert.equal(resolveSessionBot("sess-pointer-a"), alpha);
    assert.equal(readSessionBot("sess-pointer-a"), alpha, "the backfill persisted it");

    // Beta's pointer now claims Alpha's session: the stored binding stands.
    const shell = readShell();
    writeShell({ ...shell, bots: shell.bots.map((bot) => (bot.id === beta ? { ...bot, sessionId: "sess-pointer-a" } : bot)) });
    assert.equal(resolveSessionBot("sess-pointer-a"), alpha);
    // A session no pointer names stays unbound.
    assert.equal(resolveSessionBot("sess-nobody"), null);
  });
});

// MARK: - Who is acting

test("the acting bot is the session's bound bot, not the selected one or the env pin", async () => {
  await withWorld(({ alpha, beta }) => {
    bindSession("sess-a", alpha);
    const shell = readShell();
    // The roster's selection points somewhere else, and so does the pin.
    process.env.UB_ACTIVE_BOT_ID = beta;
    assert.notEqual(shell.selectedBotId, alpha);
    assert.equal(activeBotId(shell, { session: { id: "sess-a" } }), alpha);
    // The env pin is only the test override for a call with no binding.
    assert.equal(activeBotId(shell, { session: { id: "sess-unbound" } }), beta);
    assert.equal(activeBotId(shell), beta);
    delete process.env.UB_ACTIVE_BOT_ID;
    assert.throws(() => activeBotId(shell, { session: { id: "sess-unbound" } }), BotContextMissingError);
    assert.throws(() => activeBotId(shell), /bot_context_missing/);
  });
});

test("a child session is unbound by design and refuses even when its id is bound", async () => {
  await withWorld(async ({ alpha, beta }) => {
    bindSession("sess-child", alpha);
    process.env.UB_ACTIVE_BOT_ID = beta;
    const child = { session: { id: "sess-child", parent: { sessionId: "sess-parent", turn: 1 } } };
    assert.throws(() => activeBotId(readShell(), child), /bot_context_missing/);
    await assert.rejects(awaitActiveBotId(readShell(), child), /bot_context_missing/);
  });
});

test("a just-created session is waited for, then refused when nothing binds it", async () => {
  await withWorld(async ({ alpha }) => {
    const shell = readShell();
    // The proxy binds a moment after the tool starts: the wait picks it up.
    const waiting = awaitActiveBotId(shell, { session: { id: "sess-new" } }, 2_000);
    setTimeout(() => bindSession("sess-new", alpha), 120);
    assert.equal(await waiting, alpha);
    // Nothing ever binds this one: the wait is bounded.
    const started = Date.now();
    await assert.rejects(awaitActiveBotId(shell, { session: { id: "sess-never" } }, 200), /bot_context_missing/);
    const took = Date.now() - started;
    assert.ok(took >= 150 && took < 1_500, `waited ${took} ms`);
  });
});

test("every in-app and memory tool refuses an unbound or child session with bot_context_missing", async () => {
  await withWorld(async ({ alpha }) => {
    setApprovalStore(new ApprovalStore(() => 1_000));
    bindSession("sess-bound", alpha);
    for (const id of ["sess-unbound", "sess-bound"]) {
      upsertSessionGrant({ sessionId: id, path: null, permission: "auto" }, new Date(), process.env.UB_WORKSPACE_STORE_PATH);
    }
    const unbound = { session: { id: "sess-unbound" } };
    const child = { session: { id: "sess-bound", parent: { sessionId: "sess-parent", turn: 1 } } };
    const calls: Array<[string, Tool, Record<string, unknown>]> = [
      ["listBots", listBots, {}],
      ["createRoutine", createRoutineTool, { name: "n", instruction: "i", schedules: [{ kind: "daily", time: "09:00" }] }],
      ["listRoutines", listRoutines, {}],
      ["updateRoutine", updateRoutine, { routineId: "rtn_x", active: false }],
      ["deleteRoutine", deleteRoutine, { routineId: "rtn_x" }],
      ["runRoutine", runRoutine, { routineId: "rtn_x" }],
      ["railAction", railAction, { action: "pin", botId: alpha }],
      ["clearHistory", clearHistory, {}],
      ["deleteBot", deleteBot, { botId: alpha }],
      ["updateBotProfile", updateBotProfile, { description: "x" }],
      ["proposeBot", proposeBot, { name: "X" }],
      ["proposeGroup", proposeGroup, { name: "G", memberIds: ["a", "b"] }],
      ["sendToBot", sendToBot, { botId: alpha, message: "hi" }],
      ["postToGroup", postToGroup, { groupId: "g", message: "hi" }],
      ["memorySearch", memorySearch, { query: "x" }],
      ["memoryRead", memoryRead, { id: "note-1" }],
      ["memoryUpsert", memoryUpsert, { expectedRevision: null, title: "t", tags: [], body: "b", expiresAt: null }],
    ];
    for (const [name, tool, input] of calls) {
      for (const [label, ctx] of [["unbound", unbound], ["child", child]] as const) {
        const result = await run<{ status?: string; error?: string }>(tool, input, ctx);
        assert.deepEqual(
          { status: result?.status, error: result?.error },
          { status: "blocked", error: "bot_context_missing" },
          `${name} (${label})`,
        );
      }
    }
    assert.equal(readRoutinesStore().routines.length, 0);
  });
});

// MARK: - The proxy's identity rule

test("a send into an existing session takes its bot from the binding, never the body", () => {
  const body = JSON.stringify({ message: "hello", botId: "bot-a", continueFrom: "old", retry: true });
  // An unbound session is refused before eve sees it.
  assert.deepEqual(bindTurnBody(body, null), { ok: false, error: "session_unbound" });
  // A body naming another bot is refused.
  assert.deepEqual(bindTurnBody(body, "bot-b"), { ok: false, error: "session_bot_mismatch" });
  // The same bot passes, and the other fields ride along untouched.
  const ok = bindTurnBody(body, "bot-a");
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok ? JSON.parse(ok.body) : null, { message: "hello", botId: "bot-a", continueFrom: "old", retry: true });
  // A body with no bot at all takes the bound one.
  const bare = bindTurnBody(JSON.stringify({ message: "hello" }), "bot-a");
  assert.deepEqual(bare.ok ? JSON.parse(bare.body) : null, { message: "hello", botId: "bot-a" });
  // Anything that is not a JSON object is refused.
  assert.deepEqual(bindTurnBody("nope", "bot-a"), { ok: false, error: "eve_message_invalid" });
  assert.deepEqual(bindTurnBody("[1]", "bot-a"), { ok: false, error: "eve_message_invalid" });
  assert.deepEqual(bindTurnBody(JSON.stringify({ message: "x", botId: 5 }), "bot-a"), { ok: false, error: "session_bot_mismatch" });
});

// MARK: - Server-driven turns bind their sessions

/** A fake eve that opens sessions, retires chosen ones, and echoes each turn. */
function fakeEve(options: { created: string[]; retired?: string[] }) {
  const original = globalThis.fetch;
  const calls: Array<{ method: string; url: string }> = [];
  const lastMessage = new Map<string, string>();
  const created = [...options.created];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    const match = /\/eve\/v1\/session(?:\/([^/?]+))?(\/stream|\/cancel)?/.exec(url);
    const id = match?.[1] ?? "";
    if (match?.[2] === "/stream") {
      const lines = [
        { type: "message.received", data: { message: lastMessage.get(id) ?? "" } },
        { type: "message.completed", data: { message: "done" } },
        { type: "turn.completed", data: {} },
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
      return new Response(lines, { status: 200 });
    }
    if (match?.[2] === "/cancel") return new Response("{}", { status: 200 });
    if (method === "POST") {
      const message = (JSON.parse(String(init?.body)) as { message: string }).message;
      if (id) {
        if (options.retired?.includes(id)) {
          return new Response(JSON.stringify({ code: "session_not_active" }), { status: 409, headers: { "content-type": "application/json" } });
        }
        lastMessage.set(id, message);
        return new Response(JSON.stringify({ sessionId: id }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const fresh = created.shift();
      assert.ok(fresh, "the fake eve ran out of session ids");
      lastMessage.set(fresh, message);
      return new Response(JSON.stringify({ sessionId: fresh }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("", { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("a routine on a bot with no session binds the session eve creates", async () => {
  await withWorld(async ({ alpha }) => {
    const routine = createRoutine({ botId: alpha, name: "Daily", instruction: "do it", schedules: [] });
    const eve = fakeEve({ created: ["sess-routine-new"] });
    try {
      await startRoutineNow(routine.id);
    } finally {
      eve.restore();
    }
    assert.equal(readRoutinesStore().routines[0].runHistory[0].status, "ok");
    assert.equal(readSessionBot("sess-routine-new"), alpha);
  });
});

test("a routine continuing a bot's live session binds it from the pointer", async () => {
  await withWorld(async ({ beta }) => {
    point(beta, "sess-live");
    const routine = createRoutine({ botId: beta, name: "Daily", instruction: "do it", schedules: [] });
    const eve = fakeEve({ created: [] });
    try {
      await startRoutineNow(routine.id);
    } finally {
      eve.restore();
    }
    assert.equal(readRoutinesStore().routines[0].runHistory[0].status, "ok");
    assert.equal(readSessionBot("sess-live"), beta);
  });
});

test("a handoff to a bot with no session binds the session eve creates", async () => {
  await withWorld(async ({ alpha, beta }) => {
    const handoff = queueHandoff({
      sourceBotId: alpha,
      sourceName: "Alpha",
      targetBotId: beta,
      targetName: "Beta",
      message: "please look at this",
    });
    const eve = fakeEve({ created: ["sess-handoff-new"] });
    try {
      const result = await pumpHandoffs(1);
      assert.deepEqual(result.failed, []);
    } finally {
      eve.restore();
    }
    assert.equal(readHandoff(handoff.id)?.status, "delivered");
    assert.equal(readSessionBot("sess-handoff-new"), beta);
  });
});

test("the 409 carry-over binds the replacement session to the same bot", async () => {
  await withWorld(async ({ alpha }) => {
    point(alpha, "sess-retired");
    const routine = createRoutine({ botId: alpha, name: "Daily", instruction: "do it", schedules: [] });
    const eve = fakeEve({ created: ["sess-replacement"], retired: ["sess-retired"] });
    try {
      await startRoutineNow(routine.id);
    } finally {
      eve.restore();
    }
    assert.equal(readRoutinesStore().routines[0].runHistory[0].status, "ok");
    assert.equal(readSessionBot("sess-retired"), alpha);
    assert.equal(readSessionBot("sess-replacement"), alpha);
    assert.equal(readShell().bots.find((bot) => bot.id === alpha)?.sessionId, "sess-replacement");
  });
});

test("a pointer naming another bot's session is refused before eve sees the turn", async () => {
  await withWorld(async ({ alpha, beta }) => {
    bindSession("sess-alpha", alpha);
    // Beta's pointer was edited to name Alpha's session.
    point(beta, "sess-alpha");
    const routine = createRoutine({ botId: beta, name: "Daily", instruction: "do it", schedules: [] });
    const eve = fakeEve({ created: [] });
    try {
      await startRoutineNow(routine.id).catch(() => undefined);
    } finally {
      eve.restore();
    }
    assert.equal(readRoutinesStore().routines[0].runHistory[0].status, "failed");
    assert.match(readRoutinesStore().routines[0].runHistory[0].error ?? "", /session_owner_conflict/);
    assert.equal(eve.calls.length, 0, "no request reached eve");
    assert.equal(readSessionBot("sess-alpha"), alpha);
  });
});

test("the default bot is bound like any other", async () => {
  await withWorld(async () => {
    point(DEFAULT_BOT_ID, "sess-default");
    assert.equal(resolveSessionBot("sess-default"), DEFAULT_BOT_ID);
    assert.equal(existsSync(process.env.UB_SESSION_OWNERS_PATH as string), true);
  });
});
