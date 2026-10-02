import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyShellAction, DEFAULT_BOT_ID, orchestratorId, type ShellStore } from "../shared/shell-store.ts";
import { readShell, updateShell, writeShell } from "../shared/shell-io.ts";
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
import listModels from "../agent/tools/list_models.ts";

process.env.UB_ROUTER_DESKTOP_TOKEN ??= "test-router-token";
const { default: agent } = await import("../agent/agent.ts");
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
  let store: ShellStore = readShell();
  const alpha = applyShellAction(store, { type: "createBot", name: "Alpha", label: "the researcher", description: "Be brief." });
  store = alpha.store;
  const beta = applyShellAction(store, { type: "createBot", name: "Beta" });
  writeShell(beta.store);
  try {
    return await fn({ alpha: alpha.createdId as string, beta: beta.createdId as string });
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

test("neither a claim nor a binding, and a child session, are refused", async () => {
  await withWorld(async ({ alpha }) => {
    const started = Date.now();
    const { result } = await silenced(() => boundBotId(ctxFor("sess-nobody"), 120));
    assert.equal(result, null);
    assert.ok(Date.now() - started >= 100, "it waited for the binding first");
    const child = { ...ctxFor("sess-child", alpha), session: { ...ctxFor("sess-child", alpha).session, parent: { id: "p" } } };
    assert.equal((await silenced(() => boundBotId(child))).result, null);
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

test("the Generalist's own chat gets Running the team, a teammate does not, a group gets the group variant", async () => {
  await withWorld(async ({ alpha, beta }) => {
    const text = async (botId: string, session: string): Promise<string> => {
      const out = await turnStarted(event("t1"), ctxFor(session, botId)) as { content?: string } | null;
      return out?.content ?? "";
    };
    const generalist = await text(DEFAULT_BOT_ID, "sess-gen");
    assert.match(generalist, /# Running the team/);
    assert.match(generalist, /You are the owner's main assistant/);
    assert.match(generalist, /# This turn/);
    const teammate = await text(alpha, "sess-alpha");
    assert.doesNotMatch(teammate, /# Running the team/);
    assert.match(teammate, /You are Alpha, the researcher\./);
    assert.match(teammate, /<owner-instructions>\nBe brief\.\n<\/owner-instructions>/);
    assert.match(teammate, /first chat with you/);

    writeShell(applyShellAction(readShell(), { type: "createGroup", name: "Crew", memberIds: [alpha, beta], description: "Work together." }).store);
    const groupId = readShell().bots.find((bot) => bot.kind === "group")!.id;
    const group = await text(groupId, "sess-group");
    assert.match(group, /You orchestrate the group Crew\. Members: Alpha \(the researcher\), Beta/);
    assert.doesNotMatch(group, /# Running the team/);

    // The owner deleted the Generalist: the first visible bot orchestrates, without the first sentence.
    writeShell(applyShellAction(readShell(), { type: "deleteBot", botId: DEFAULT_BOT_ID }).store);
    const fallback = await text(orchestratorId(readShell()) as string, "sess-fallback");
    assert.match(fallback, /# Running the team/);
    assert.doesNotMatch(fallback, /You are the owner's main assistant/);
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
    writeShell(applyShellAction(readShell(), { type: "deleteBot", botId: alpha }).store);
    const ctx = ctxFor("sess-gone", alpha);
    const { result } = await silenced(async () => turnStarted(event("turn-x"), ctx));
    assert.equal(result, null, "nothing rendered, nothing thrown");
    await silenced(async () => {
      await assert.rejects(async () => stepStarted(event("turn-x"), ctx), /bot_context_missing/);
    });
  });
});

test("list_models reports the model the turn froze, not the default", async () => {
  await withWorld(async ({ alpha }) => {
    updateShell((current) => withBotSelection(current, alpha, { connectionId: GO, modelId: "glm-5", effort: "low", speed: "standard" }));
    const ctx = ctxFor("sess-lm", alpha);
    const rendered = await turnStarted(event("t1"), ctx) as { content: string };
    const out = await listModels.execute({ kind: "chat" } as never, ctx as never) as { current: { chat: { id: string } } };
    assert.equal(out.current.chat.id, "glm-5");
    assert.match(rendered.content, /Model: glm-5 \(glm-5\) via /);
    // A pick afterwards changes neither the line nor the tool inside this turn.
    updateShell((current) => withBotSelection(current, alpha, { connectionId: GO, modelId: "glm-5.3-flash", effort: "low", speed: "standard" }));
    const still = await listModels.execute({ kind: "chat" } as never, ctx as never) as { current: { chat: { id: string } } };
    assert.equal(still.current.chat.id, "glm-5");
    // A session nobody is bound to has no turn to describe.
    const blocked = await silenced(async () => listModels.execute({ kind: "chat" } as never, ctxFor("sess-lm-nobody") as never));
    assert.deepEqual(blocked.result, { status: "blocked", error: "bot_context_missing" });
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
