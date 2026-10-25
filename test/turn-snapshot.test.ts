import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyShellAction, DEFAULT_BOT_ID } from "../shared/shell-store.ts";
import { withBot } from "./helpers/roster.ts";
import { readShell, updateShell, writeFixtureShell } from "../shared/shell-io.ts";
import { bindSession, readSessionBot } from "../shared/session-bindings.ts";
import { upsertSessionGrant } from "../shared/workspace-store.ts";
import { renderContext } from "../shared/context-blocks.ts";
import { withBotSelection } from "../shared/shell-store.ts";
import {
  boundBotId,
  ensureTurnSnapshot,
  markSnapshotFailed,
  turnSnapshot,
  type SnapshotCtx,
} from "../agent/lib/turn-snapshot.ts";

process.env.UB_ROUTER_DESKTOP_TOKEN ??= "test-router-token";
const { default: agent } = await import("../agent/agent.ts");
test("the agent leaves eve's per-session input cap off", () => {
  // eve's 40M default paused long chats; the router budgets are the spend guard.
  assert.equal((agent as { limits?: { maxInputTokensPerSession?: unknown } }).limits?.maxInputTokensPerSession, false);
});

const { default: contextResolver } = await import("../agent/instructions/context.ts");

const GO = "opencode-go:plan";
const KEYS = [
  "UB_SESSION_OWNERS_PATH",
  "UB_BINDING_WAIT_MS",
  "UB_SHELL_PATH",
  "UB_WORKSPACE_STORE_PATH",
  "UB_PROVIDERS_PATH",
  "UB_MODELS_CACHE_PATH",
  "UB_ACTIVE_BOT_ID",
] as const;

function modelRow(id: string, contextTokens: number) {
  return {
    id,
    label: id,
    efforts: ["low"],
    defaultEffort: "low",
    speeds: ["standard"],
    defaultSpeed: "standard",
    contextTokens,
  };
}

/** Temp stores, one connection, and a roster of the seeded Generalist plus Alpha and Beta. */
async function withWorld<T>(fn: (world: { alpha: string; beta: string }) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ub-snap-"));
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.UB_SESSION_OWNERS_PATH = join(dir, "session-owners.json");
  process.env.UB_BINDING_WAIT_MS = "150";
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_WORKSPACE_STORE_PATH = join(dir, "workspace.json");
  process.env.UB_PROVIDERS_PATH = join(dir, "providers.json");
  process.env.UB_MODELS_CACHE_PATH = join(dir, "models-cache.json");
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
    providers: { [GO]: { fetchedAt: Date.now(), models: [modelRow("glm-5.3-flash", 200_000), modelRow("glm-5", 100_000)] } },
  }));
  // Alpha and Beta are an earlier build's second and third bots: a roster the app no longer makes but still reads.
  const alpha = withBot(readShell(), "Alpha", { label: "the researcher", description: "Be brief." });
  const beta = withBot(alpha.store, "Beta");
  writeFixtureShell(beta.store);
  try {
    return await fn({ alpha: alpha.id, beta: beta.id });
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function ctxFor(sessionId: string, claim?: unknown, extra: Record<string, unknown> = {}): SnapshotCtx & { session: { turn: { id: string } } } {
  return {
    session: {
      id: sessionId,
      turn: { id: "t1" },
      auth: claim === undefined ? { current: null } : { current: { attributes: { botId: claim, ...extra } } },
    },
    messages: [],
  };
}

/** The eve turn.started and step.started events as the resolvers read them. */
const event = (turnId: string) => ({ type: "turn.started", data: { turnId } });

type Resolver = (event: unknown, ctx: unknown) => unknown;
const turnStarted = (contextResolver as unknown as { events: Record<string, Resolver> }).events["turn.started"];
const stepStarted = (agent as unknown as { model: { events: Record<string, Resolver> } }).model.events["step.started"];

function forgetSnapshots(): void {
  const holder = globalThis as unknown as Record<symbol, { byTurn: Map<string, unknown>; latest: Map<string, string> } | undefined>;
  const reg = holder[Symbol.for("useful-bot.turn-snapshots")];
  reg?.byTurn.clear();
  reg?.latest.clear();
}

async function silenced<T>(fn: () => Promise<T>): Promise<{ result: T; errors: string[] }> {
  const errors: string[] = [];
  const realError = console.error;
  const realWarn = console.warn;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  console.warn = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  try {
    return { result: await fn(), errors };
  } finally {
    console.error = realError;
    console.warn = realWarn;
  }
}

test("the claim beats the binding lookup, and a claim with no row binds the session", async () => {
  await withWorld(async ({ alpha }) => {
    assert.equal(await boundBotId(ctxFor("sess-claim", alpha)), alpha);
    assert.equal(readSessionBot("sess-claim"), alpha, "the first turn bound the session");
    bindSession("sess-agree", alpha);
    assert.equal(await boundBotId(ctxFor("sess-agree", alpha)), alpha);
  });
});

test("a claim and a binding that differ are refused", async () => {
  await withWorld(async ({ alpha, beta }) => {
    bindSession("sess-mismatch", alpha);
    const { result } = await silenced(() => boundBotId(ctxFor("sess-mismatch", beta)));
    assert.equal(result, null);
    assert.equal(readSessionBot("sess-mismatch"), alpha, "the binding never moves");
  });
});

test("with no claim the binding is used, after a bounded wait for a brand new session", async () => {
  await withWorld(async ({ alpha }) => {
    bindSession("sess-bound", alpha);
    assert.equal(await boundBotId(ctxFor("sess-bound")), alpha);
    // A claim that is not a string is dropped by eve; here it simply reads as none.
    assert.equal(await boundBotId(ctxFor("sess-bound", 7)), alpha);
    // The proxy binds a moment later.
    setTimeout(() => bindSession("sess-late", alpha), 60);
    const started = Date.now();
    assert.equal(await boundBotId(ctxFor("sess-late"), 2_000), alpha);
    assert.ok(Date.now() - started >= 50, "returned before the binding landed");
  });
});

test("neither a claim nor a binding is refused, after waiting for the binding", async () => {
  await withWorld(async () => {
    const started = Date.now();
    const { result } = await silenced(() => boundBotId(ctxFor("sess-nobody"), 120));
    assert.equal(result, null);
    assert.ok(Date.now() - started >= 100, "it waited for the binding first");
  });
});

// A session with a parent in its context (what eve gave a sub-agent's child) is
// an ordinary session now: sub-agents are off, nothing resolves it to a root.
test("a context that still carries a parent is judged like any other: by its own claim and grant", async () => {
  forgetSnapshots();
  await withWorld(async ({ alpha, beta }) => {
    upsertSessionGrant({ sessionId: "kid-1", path: null, permission: "full_access" }, new Date(), process.env.UB_WORKSPACE_STORE_PATH);
    const parent = { callId: "c", rootSessionId: "root-1", sessionId: "root-1", turn: { id: "t0", sequence: 0 } };
    const withParent = (claim: string) => ({ ...ctxFor("kid-1", claim), session: { ...ctxFor("kid-1", claim).session, parent } });
    const snap = await ensureTurnSnapshot(withParent(alpha) as never, "t1");
    assert.equal(snap?.status, "ok");
    assert.equal(snap?.status === "ok" ? snap.permission : null, "full_access", "its own grant, not a root's");
    assert.equal(readSessionBot("kid-1"), alpha, "bound as an ordinary session");
    // A claim for another bot is still the mismatch it always was.
    assert.equal((await silenced(() => boundBotId(withParent(beta) as never))).result, null);
  });
});

test("one snapshot per session and turn: a pick made mid-turn waits for the next turn", async () => {
  await withWorld(async ({ alpha }) => {
    const ctx = ctxFor("sess-once", alpha);
    const first = await ensureTurnSnapshot(ctx, "turn-1");
    assert.equal(first?.status, "ok");
    updateShell((current) => withBotSelection(current, alpha, { connectionId: GO, modelId: "glm-5", effort: "low", speed: "standard" }));
    const again = await ensureTurnSnapshot(ctx, "turn-1");
    assert.equal(again, first, "the same object, never rebuilt");
    assert.equal(first?.status === "ok" && first.selection.modelId, "glm-5.3-flash");
    const next = await ensureTurnSnapshot(ctx, "turn-2");
    assert.equal(next?.status === "ok" && next.selection.modelId, "glm-5");
    assert.equal(next?.status === "ok" && next.selection.windowTokens, 100_000);
  });
});

test("every bot's context is Your bot then This turn, with no Running the team block", async () => {
  await withWorld(async ({ alpha }) => {
    const text = async (botId: string, session: string): Promise<string> => {
      const out = await turnStarted(event("t1"), ctxFor(session, botId)) as { content?: string } | null;
      return out?.content ?? "";
    };
    const generalist = await text(DEFAULT_BOT_ID, "sess-gen");
    assert.ok(generalist.startsWith("# Your bot"));
    assert.doesNotMatch(generalist, /Running the team/);
    assert.match(generalist, /You are Generalist\./);
    assert.match(generalist, /You're the owner's main assistant/);
    assert.match(generalist, /# This turn/);
    const other = await text(alpha, "sess-alpha");
    assert.ok(other.startsWith("# Your bot"));
    assert.match(other, /You are Alpha, the researcher\./);
    assert.match(other, /<owner-instructions>\nBe brief\.\n<\/owner-instructions>/);
    assert.match(other, /first chat with you/);
  });
});

test("step.started: a fresh turn gets its model, a recorded resolver failure throws bot_context_missing", async () => {
  await withWorld(async ({ alpha }) => {
    process.env.UB_ROUTER_DESKTOP_TOKEN = "test-router-token";
    const ctx = ctxFor("sess-step", alpha);
    const ok = await stepStarted(event("turn-a"), ctx) as { modelContextWindowTokens: number };
    assert.equal(ok.modelContextWindowTokens, 200_000);

    // The context resolver threw on this turn (a throwing instruction resolver is skipped by eve):
    // the model resolver is where the turn fails.
    markSnapshotFailed("sess-step", "turn-b", alpha);
    const { errors } = await silenced(async () => {
      await assert.rejects(async () => stepStarted(event("turn-b"), ctx), /bot_context_missing/);
    });
    assert.ok(errors.some((line) => line.includes('"event":"bot_context_missing"')), "a counter line is logged");
    // The next turn is unaffected.
    await stepStarted(event("turn-c"), ctx);
  });
});

test("step.started rebuilds a missing snapshot after a restart, and refuses an unbound or mismatched session", async () => {
  await withWorld(async ({ alpha, beta }) => {
    const ctx = ctxFor("sess-restart", alpha);
    await turnStarted(event("turn-r"), ctx);
    assert.equal(turnSnapshot("sess-restart", "turn-r")?.status, "ok");
    forgetSnapshots();
    assert.equal(turnSnapshot("sess-restart", "turn-r"), null);
    const rebuilt = await stepStarted(event("turn-r"), ctx) as { modelContextWindowTokens: number };
    assert.equal(rebuilt.modelContextWindowTokens, 200_000);
    assert.equal(turnSnapshot("sess-restart", "turn-r")?.status, "ok");

    const unbound = await silenced(async () => {
      await assert.rejects(async () => stepStarted(event("turn-u"), ctxFor("sess-unbound")), /bot_context_missing/);
    });
    assert.ok(unbound.errors.length > 0);
    await silenced(async () => {
      await assert.rejects(async () => stepStarted(event("turn-m"), ctxFor("sess-restart", beta)), /bot_context_missing/);
    });
  });
});

test("the context resolver records a failure instead of throwing, so the model resolver refuses", async () => {
  await withWorld(async ({ alpha }) => {
    // The bot vanishes between the claim and the build: the roster no longer has it.
    bindSession("sess-gone", alpha);
    const roster = readShell();
    writeFixtureShell({ ...roster, bots: roster.bots.filter((bot) => bot.id !== alpha) });
    const ctx = ctxFor("sess-gone", alpha);
    const { result } = await silenced(async () => turnStarted(event("turn-x"), ctx));
    assert.equal(result, null, "nothing rendered, nothing thrown");
    await silenced(async () => {
      await assert.rejects(async () => stepStarted(event("turn-x"), ctx), /bot_context_missing/);
    });
  });
});

test("the context names the model the turn froze, not the default", async () => {
  await withWorld(async ({ alpha }) => {
    updateShell((current) => withBotSelection(current, alpha, { connectionId: GO, modelId: "glm-5", effort: "low", speed: "standard" }));
    const ctx = ctxFor("sess-lm", alpha);
    const rendered = await turnStarted(event("t1"), ctx) as { content: string };
    assert.match(rendered.content, /Model: glm-5 \(glm-5\) via /);
    // A pick afterwards changes neither the line nor the snapshot inside this turn.
    updateShell((current) => withBotSelection(current, alpha, { connectionId: GO, modelId: "glm-5.3-flash", effort: "low", speed: "standard" }));
    const still = await ensureTurnSnapshot(ctx, "t1");
    assert.equal(still?.status === "ok" && still.selection.modelId, "glm-5");
    assert.match(still?.status === "ok" ? renderContext(still.context) : "", /Model: glm-5 \(glm-5\) via /);
    // The next turn takes the new pick.
    const next = await ensureTurnSnapshot(ctx, "t2");
    assert.equal(next?.status === "ok" && next.selection.modelId, "glm-5.3-flash");
  });
});

test("with no turn id a failed mark sticks until the next turn.started, then the turn rebuilds", async () => {
  await withWorld(async ({ alpha }) => {
    const ctx = ctxFor("sess-sticky", alpha);
    markSnapshotFailed("sess-sticky", undefined, alpha);
    const stuck = await ensureTurnSnapshot(ctx, undefined);
    assert.equal(stuck?.status, "failed", "a later step does not rebuild the failure away");
    assert.equal((await ensureTurnSnapshot(ctx, undefined)), stuck);
    const fresh = await ensureTurnSnapshot(ctx, undefined, true);
    assert.equal(fresh?.status, "ok", "turn.started clears it");
    assert.equal((await ensureTurnSnapshot(ctx, undefined))?.status, "ok");
  });
});

test("This chat shows the permission and folder the session grant gives, which is what the tools enforce", async () => {
  await withWorld(async ({ alpha }) => {
    const ctx = ctxFor("sess-grant", alpha);
    // No grant: the tools treat the session as Read only, so that is what is shown.
    const bare = await ensureTurnSnapshot(ctx, "t1");
    assert.equal(bare?.status === "ok" && bare.permission, "read_only");
    assert.equal(bare?.status === "ok" && bare.folder, null);
    upsertSessionGrant({ sessionId: "sess-grant", path: "/Users/someone/Projects/Atlas", permission: "full_access" });
    const granted = await ensureTurnSnapshot(ctx, "t2");
    assert.equal(granted?.status === "ok" && granted.permission, "full_access");
    assert.equal(granted?.status === "ok" && granted.folder, "Atlas");
    assert.match(granted?.status === "ok" ? renderContext(granted.context) : "", /This chat: Full access, folder "Atlas" attached\./);
  });
});

// What the turn read from outside. Failure modes: a mark that leaks into the
// next turn or another session, a handoff turn that is not marked, and a mark
// that survives a snapshot rebuild it should not.
import { markOutside, seenOutside } from "../agent/lib/outside-content.ts";

function forgetOutside(): void {
  const holder = globalThis as unknown as Record<symbol, { clear(): void } | undefined>;
  holder[Symbol.for("useful-bot.outside-content")]?.clear();
}

test("outside reading marks its own turn only", async () => {
  forgetOutside();
  forgetSnapshots();
  await withWorld(async ({ alpha }) => {
    const turn = (session: string, id: string) => ({ session: { id: session, turn: { id } } });
    assert.equal(seenOutside(turn("sess-o", "a")), false);
    markOutside(turn("sess-o", "a"));
    assert.equal(seenOutside(turn("sess-o", "a")), true);
    assert.equal(seenOutside(turn("sess-o", "b")), false, "the next turn starts clean");
    assert.equal(seenOutside(turn("sess-other", "a")), false, "another session is untouched");
    // No session at all (a bare test call) is ignored both ways.
    markOutside({});
    assert.equal(seenOutside({}), false);
    // A handoff-delivered turn starts after outside content; an owner or routine turn does not.
    await ensureTurnSnapshot(ctxFor("sess-h", alpha, { delivery: "handoff" }), "t-h");
    assert.equal(seenOutside(turn("sess-h", "t-h")), true);
    await ensureTurnSnapshot(ctxFor("sess-owner", alpha, { delivery: "owner" }), "t-o");
    assert.equal(seenOutside(turn("sess-owner", "t-o")), false);
    await ensureTurnSnapshot(ctxFor("sess-routine", alpha, { delivery: "routine" }), "t-r");
    assert.equal(seenOutside(turn("sess-routine", "t-r")), false);
  });
});

test("a sub-agent's report turn is an ordinary turn now: it neither marks nor clears anything", async () => {
  forgetOutside();
  forgetSnapshots();
  await withWorld(async ({ alpha }) => {
    const report = { ...ctxFor("sess-rep", alpha, { delivery: "owner" }), messages: [{ role: "user", kind: "execution.background_task", content: "Background task task_ab12 is completed." }] };
    await ensureTurnSnapshot(report, "t-a");
    assert.equal(seenOutside({ session: { id: "sess-rep", turn: { id: "t-a" } } }), false);
  });
});
