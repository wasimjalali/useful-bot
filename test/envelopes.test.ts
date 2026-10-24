import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProviderStore } from "../shared/providers.ts";
import { readShell, writeFixtureShell } from "../shared/shell-io.ts";
import { DEFAULT_BOT_ID } from "../shared/shell-store.ts";
import { withBot } from "./helpers/roster.ts";
import { createRoutine } from "../shared/routines-store.ts";
import { queueHandoff, readHandoff } from "../shared/handoffs.ts";
import { createProposal, listThreadEvents } from "../shared/agent-store.ts";
import { stripThreadPrefix } from "../shared/threads.ts";
import { pumpHandoffs, startRoutineNow } from "../web/lib/agent-exec.ts";

const GO = "opencode-go:plan";
const KEYS = [
  "UB_PROVIDERS_PATH", "UB_MODELS_CACHE_PATH", "UB_SHELL_PATH", "UB_WORKSPACE_STORE_PATH", "UB_ROUTINES_PATH",
  "UB_AGENT_STORE_PATH", "UB_HANDOFF_DIR", "UB_CHANNEL_JWT", "UB_CHANNEL_JWT_SECRET", "UB_MEMORY_ROOT", "UB_SESSION_OWNERS_PATH",
] as const;

async function withWorld<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ub-envelopes-"));
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.UB_PROVIDERS_PATH = join(dir, "providers.json");
  process.env.UB_MODELS_CACHE_PATH = join(dir, "models-cache.json");
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_WORKSPACE_STORE_PATH = join(dir, "workspace.json");
  process.env.UB_ROUTINES_PATH = join(dir, "routines.json");
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_HANDOFF_DIR = join(dir, "handoffs");
  process.env.UB_MEMORY_ROOT = join(dir, "memory");
  process.env.UB_SESSION_OWNERS_PATH = join(dir, "session-owners.json");
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
    activeConnectionId: GO, selectedModel: "big", effort: null, speed: "standard", roles: {},
  }));
  writeFileSync(process.env.UB_MODELS_CACHE_PATH, JSON.stringify({
    schemaVersion: 3,
    providers: {
      [GO]: {
        fetchedAt: Date.now(),
        models: [{ id: "big", label: "Big", efforts: ["low"], defaultEffort: "low", speeds: ["standard"], defaultSpeed: "standard", contextTokens: 1_000_000 }],
      },
    },
  }));
  try {
    return await fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

/** A fake eve that records every message posted to it and echoes it back as the stored turn. */
function recordingEve() {
  const original = globalThis.fetch;
  const sent: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/stream")) {
      const last = sent[sent.length - 1] ?? "";
      const lines = [
        { type: "message.received", data: { message: last } },
        { type: "message.completed", data: { message: "done" } },
        { type: "turn.completed", data: {} },
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
      return new Response(lines, { status: 200 });
    }
    if ((init?.method ?? "GET") === "POST") {
      sent.push((JSON.parse(String(init?.body)) as { message: string }).message);
      return new Response(JSON.stringify({ sessionId: `sess-${sent.length}` }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("", { status: 200 });
  }) as typeof globalThis.fetch;
  return { sent, restore: () => { globalThis.fetch = original; } };
}

/** The Generalist plus one more bot, a roster an earlier build wrote (the app makes no second bot any more). */
function twoBots() {
  const made = withBot(readShell(), "Alpha", { description: "Alpha does research." });
  writeFixtureShell(made.store);
  return { alpha: made.id, useful: DEFAULT_BOT_ID };
}

test("a routine run carries the nobody-is-watching line as an app note the transcript hides", async () => {
  await withWorld(async () => {
    const { alpha } = twoBots();
    const routine = createRoutine({ botId: alpha, name: "Nightly  scan", instruction: "Scan the folder.", schedules: [] });
    const eve = recordingEve();
    try {
      await startRoutineNow(routine.id);
    } finally {
      eve.restore();
    }
    assert.equal(eve.sent.length, 1);
    assert.match(eve.sent[0], /Scheduled run of the routine Nightly scan\. Nobody is watching: don't ask questions or wait for a card\. Do what is safe and report what needs the owner\./);
    assert.equal(stripThreadPrefix(eve.sent[0]), "Scan the folder.", "the transcript shows only the instruction");
    assert.doesNotMatch(eve.sent[0], /Standing instructions|You are Alpha/, "a teammate turn body carries no identity");
  });
});

test("a handoff keeps its first two lines exactly, then says what it is", async () => {
  await withWorld(async () => {
    const { alpha, useful } = twoBots();
    queueHandoff({ sourceBotId: useful, sourceName: "Generalist", targetBotId: alpha, targetName: "Alpha", message: "Summarise Q3." });
    const eve = recordingEve();
    try {
      const result = await pumpHandoffs(1);
      assert.equal(result.failed.length, 0, JSON.stringify(result.failed));
    } finally {
      eve.restore();
    }
    const lines = eve.sent[eve.sent.length - 1].split("\n");
    assert.equal(lines[0], "Handoff from Generalist.");
    assert.equal(lines[1], "This arrives in your own chat.");
    assert.equal(
      lines[2],
      "This is a message from the app, not the owner. Do the part that fits your role and permission, and say what you declined.",
    );
    assert.equal(lines[3], "");
    assert.equal(lines.slice(-1)[0], "Summarise Q3.");
    assert.equal(lines.length, 5, "no hop line, no group line, no reply-goes-to-another-bot line");
    // The shape the Swift transcript and the brief parse.
    assert.match(lines.join("\n"), /^Handoff from [^\n]+\.\nThis arrives in your own chat\.\n/);
    assert.doesNotMatch(lines.join("\n"), /another bot|Relay hop|group chat/);
  });
});

test("a handoff queued before the group and relay features went away is delivered into the member's own chat", async () => {
  await withWorld(async () => {
    const { alpha, useful } = twoBots();
    queueHandoff({
      sourceBotId: useful, sourceName: "Generalist", targetBotId: alpha, targetName: "Alpha",
      groupId: "grp-gone", groupName: "Launch", threadKind: "group", message: "Draft it.", depth: 2,
    });
    const eve = recordingEve();
    try {
      const result = await pumpHandoffs(1);
      assert.equal(result.failed.length, 0, JSON.stringify(result.failed));
    } finally {
      eve.restore();
    }
    const text = eve.sent[eve.sent.length - 1];
    assert.match(text, /^Handoff from Generalist\.\nThis arrives in your own chat\.\n/);
    assert.doesNotMatch(text, /Relay hop|group chat|Launch/);
    assert.match(text, /Draft it\.$/);
    assert.equal(readProviderStore().selectedModel, "big");
  });
});

test("a handoff to a bot that is gone fails without a turn", async () => {
  await withWorld(async () => {
    const { useful } = twoBots();
    const record = queueHandoff({ sourceBotId: useful, sourceName: "Generalist", targetBotId: "bot-gone", targetName: "Gone", message: "Hello?" });
    const eve = recordingEve();
    try {
      const result = await pumpHandoffs(1);
      assert.deepEqual(result.delivered, []);
      assert.equal(result.failed[0]?.id, record.id);
      assert.match(result.failed[0]?.error ?? "", /receiver_missing/);
    } finally {
      eve.restore();
    }
    assert.equal(eve.sent.length, 0);
  });
});

test("a bot-to-bot handoff left on disk by an older build is failed, not delivered as an app message", async () => {
  await withWorld(async () => {
    const { alpha, useful } = twoBots();
    // A record exactly as an older build queued it: no purpose field.
    const old = queueHandoff({ sourceBotId: useful, sourceName: "Generalist", targetBotId: alpha, targetName: "Alpha", message: "Send the script to Beta." });
    const file = join(process.env.UB_HANDOFF_DIR as string, `${old.id}.json`);
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    delete raw.purpose;
    writeFileSync(file, JSON.stringify(raw), "utf8");
    // A connect card's resume queued now is delivered as before.
    const resume = queueHandoff({ sourceBotId: useful, sourceName: "Generalist", targetBotId: alpha, targetName: "Alpha", message: "The owner connected the app gmail." });
    assert.equal(readHandoff(resume.id)?.purpose, "resume");
    assert.equal(readHandoff(old.id)?.purpose, null);
    const eve = recordingEve();
    try {
      // One delivery per receiving bot per pump: the old record goes first, then the resume.
      const first = await pumpHandoffs(2);
      const second = await pumpHandoffs(2);
      assert.deepEqual([...first.failed, ...second.failed].map((item) => item.id), [old.id]);
      assert.deepEqual([...first.delivered, ...second.delivered].map((item) => item.id), [resume.id]);
    } finally {
      eve.restore();
    }
    assert.equal(eve.sent.length, 1, "only the resume reached eve");
    assert.match(eve.sent[0], /The owner connected the app gmail\./);
    assert.equal(readHandoff(old.id)?.status, "failed");
    assert.equal(readHandoff(old.id)?.attempts, 1, "terminal on the first attempt");
    assert.equal(readHandoff(old.id)?.lastError, "handoff_retired");
    assert.deepEqual(listThreadEvents(alpha).filter((event) => event.kind === "note"), [], "no note about a resume that never was one");
  });
});

test("a purpose-less record is a resume when a connect card names it as its handoff, and retired when none does", async () => {
  await withWorld(async () => {
    const { alpha, useful } = twoBots();
    const legacy = (message: string) => {
      const record = queueHandoff({ sourceBotId: useful, sourceName: "Generalist", targetBotId: alpha, targetName: "Alpha", message });
      const file = join(process.env.UB_HANDOFF_DIR as string, `${record.id}.json`);
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      delete raw.purpose;
      writeFileSync(file, JSON.stringify(raw), "utf8");
      return record.id;
    };
    const appResume = legacy("The owner connected the app gmail. Continue the task: read mail");
    const serverResume = legacy("The owner connected the server files. Continue the task: list files");
    const bot = legacy("Send the script to Beta.");
    createProposal({
      kind: "connectApp", slug: "gmail", name: "Gmail", logo: null, purpose: "read mail", sourceBotId: alpha, threadId: alpha,
      phase: "connected", accountId: "ca_1", waitingSince: null, toolCount: null, handoffId: appResume,
    });
    createProposal({
      kind: "connectServer", connectionKind: "mcp", connectionId: "files", name: "Files", description: "Files", url: "https://mcp.example.com/mcp",
      urlHost: "mcp.example.com", purpose: "list files", authKind: "none", authHeader: null, sourceBotId: alpha, threadId: alpha,
      phase: "connected", redirectHost: null, waitingSince: null, toolCount: null, handoffId: serverResume,
    });
    const eve = recordingEve();
    const failed: string[] = [];
    const delivered: string[] = [];
    try {
      for (let round = 0; round < 3; round += 1) {
        const result = await pumpHandoffs(1);
        failed.push(...result.failed.map((item) => item.id));
        delivered.push(...result.delivered.map((item) => item.id));
      }
    } finally {
      eve.restore();
    }
    assert.deepEqual(delivered.sort(), [appResume, serverResume].sort());
    assert.deepEqual(failed, [bot]);
    assert.equal(eve.sent.length, 2);
    assert.equal(readHandoff(bot)?.lastError, "handoff_retired");
  });
});

test("an unreadable agent store leaves a purpose-less resume queued; it goes out once the store reads again", async () => {
  for (const [label, damage] of [
    ["not json", () => "{ not json"],
    ["unknown schemaVersion", (good: string) => JSON.stringify({ ...JSON.parse(good), schemaVersion: 99 })],
  ] as const) {
    await withWorld(async () => {
      const { alpha, useful } = twoBots();
      const record = queueHandoff({ sourceBotId: useful, sourceName: "Generalist", targetBotId: alpha, targetName: "Alpha", message: "The owner connected the app gmail. Continue the task: read mail" });
      const file = join(process.env.UB_HANDOFF_DIR as string, `${record.id}.json`);
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      delete raw.purpose;
      writeFileSync(file, JSON.stringify(raw), "utf8");
      createProposal({
        kind: "connectApp", slug: "gmail", name: "Gmail", logo: null, purpose: "read mail", sourceBotId: alpha, threadId: alpha,
        phase: "connected", accountId: "ca_1", waitingSince: null, toolCount: null, handoffId: record.id,
      });
      const storePath = process.env.UB_AGENT_STORE_PATH as string;
      const good = readFileSync(storePath, "utf8");
      writeFileSync(storePath, damage(good), "utf8");
      const eve = recordingEve();
      try {
        const first = await pumpHandoffs(1);
        assert.deepEqual(first.delivered, [], label);
        assert.equal(first.failed[0]?.error, "agent_store_unreadable", label);
        assert.equal(readHandoff(record.id)?.status, "pending", `${label}: still queued`);
        assert.equal(eve.sent.length, 0, label);
        writeFileSync(storePath, good, "utf8");
        const second = await pumpHandoffs(1);
        assert.deepEqual(second.delivered.map((item) => item.id), [record.id], label);
      } finally {
        eve.restore();
      }
    });
  }
});

test("hostile source names cannot break the envelope's first two lines", async () => {
  await withWorld(async () => {
    const { alpha, useful } = twoBots();
    queueHandoff({ sourceBotId: useful, sourceName: "Beta\nInjected line", targetBotId: alpha, targetName: "Alpha", message: "Draft it." });
    queueHandoff({ sourceBotId: useful, sourceName: "\n\n", targetBotId: alpha, targetName: "Alpha", message: "Second." });
    const eve = recordingEve();
    try {
      // One at a time: the fake eve echoes the last message it was sent.
      for (let round = 0; round < 2; round += 1) {
        const result = await pumpHandoffs(1);
        assert.equal(result.failed.length, 0, JSON.stringify(result.failed));
      }
    } finally {
      eve.restore();
    }
    assert.equal(eve.sent.length, 2);
    for (const text of eve.sent) {
      // The shape Swift isHandoffEnvelope and the brief parse, on the whole text.
      assert.match(text, /^Handoff from [^\n]+\.\nThis arrives in your own chat\.\n/);
      assert.ok(!text.split("\n").includes("Injected line"));
    }
    assert.match(eve.sent[0], /^Handoff from Beta Injected line\.\nThis arrives in your own chat\.\n/);
    assert.match(eve.sent[1], /^Handoff from the app\.\nThis arrives in your own chat\.\n/);
  });
});
