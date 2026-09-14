import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyShellAction, seedStore, type ShellStore } from "../shared/shell-store.ts";
import { readShell, writeShell } from "../shared/shell-io.ts";
import { appendAgentEvent, listThreadEvents, readProposal } from "../shared/agent-store.ts";
import { HANDOFF_DEPTH_MAX, listHandoffs, queueHandoff } from "../shared/handoffs.ts";
import bash from "../agent/tools/bash.ts";
import listBots from "../agent/tools/list_bots.ts";
import proposeBot from "../agent/tools/propose_bot.ts";
import proposeGroup from "../agent/tools/propose_group.ts";
import postToGroup from "../agent/tools/post_to_group.ts";
import sendToBot from "../agent/tools/send_to_bot.ts";
import updateBotProfile from "../agent/tools/update_bot_profile.ts";

type Tool = { execute: (input: never, context: never) => unknown };

async function run<T>(tool: Tool, input: Record<string, unknown>): Promise<T> {
  return await tool.execute(input as never, {} as never) as T;
}

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ub-tools-"));
  const previous = {
    shell: process.env.UB_SHELL_PATH,
    store: process.env.UB_AGENT_STORE_PATH,
    handoffs: process.env.UB_HANDOFF_DIR,
    active: process.env.UB_ACTIVE_BOT_ID,
  };
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_HANDOFF_DIR = join(dir, "handoffs");
  return {
    dir,
    restore() {
      const put = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      put("UB_SHELL_PATH", previous.shell);
      put("UB_AGENT_STORE_PATH", previous.store);
      put("UB_HANDOFF_DIR", previous.handoffs);
      put("UB_ACTIVE_BOT_ID", previous.active);
    },
  };
}

function seedRoster(names: string[]): ShellStore {
  let store = seedStore();
  for (const name of names) {
    store = applyShellAction(store, { type: "createBot", name }).store;
  }
  writeShell(store);
  return store;
}

function idOf(store: ShellStore, name: string): string {
  const bot = store.bots.find((item) => item.name === name);
  assert.ok(bot, `missing ${name}`);
  return bot.id;
}

test("proposeBot writes a confirmable card instead of creating the bot", async () => {
  const box = sandbox();
  try {
    const store = seedRoster(["CEO"]);
    const ceo = idOf(store, "CEO");
    process.env.UB_ACTIVE_BOT_ID = ceo;
    const result = await run<{ status: string; proposalId: string }>(proposeBot, {
      name: "Research Lead",
      title: "Research",
      description: "Find sources. Never publish without approval.",
      brief: "Own pricing research.",
    });
    assert.equal(result.status, "awaiting_owner_confirmation");
    const shell = readShell();
    assert.equal(shell.bots.some((bot) => bot.name === "Research Lead"), false);
    const proposal = readProposal(result.proposalId);
    assert.equal(proposal?.kind, "createBot");
    assert.equal(listThreadEvents(ceo).length, 1);
    assert.equal(listThreadEvents(ceo)[0].kind, "proposal");
  } finally {
    box.restore();
  }
});

test("sendToBot queues a handoff, is idempotent per requestId, and refuses self-sends", async () => {
  const box = sandbox();
  try {
    const store = seedRoster(["CEO", "Research"]);
    const ceo = idOf(store, "CEO");
    const research = idOf(store, "Research");
    process.env.UB_ACTIVE_BOT_ID = ceo;
    const first = await run<{ status: string; handoffId: string }>(sendToBot, {
      botId: research,
      message: "Draft the pricing brief.",
      requestId: "req-1",
    });
    assert.equal(first.status, "queued");
    const duplicate = await run<{ status: string }>(sendToBot, {
      botId: research,
      message: "Draft the pricing brief.",
      requestId: "req-1",
    });
    assert.equal(duplicate.status, "duplicate");
    assert.equal(listHandoffs().length, 1);
    assert.equal(listThreadEvents(research)[0].kind, "post");
    assert.equal(listThreadEvents(ceo).some((event) => event.kind === "handoff"), true);

    const self = await run<{ status: string }>(sendToBot, { botId: ceo, message: "hi" });
    assert.equal(self.status, "invalid");
    const missing = await run<{ status: string }>(sendToBot, { botId: "nope", message: "hi" });
    assert.equal(missing.status, "not_found");
  } finally {
    box.restore();
  }
});

test("postToGroup asks before fanning out and refuses a multi-member direct send", async () => {
  const box = sandbox();
  try {
    let store = seedRoster(["CEO", "Research", "Writer"]);
    const group = applyShellAction(store, {
      type: "createGroup",
      name: "Launch",
      memberIds: [idOf(store, "Research"), idOf(store, "Writer")],
    });
    store = group.store;
    writeShell(store);
    const groupId = group.createdId ?? "";
    process.env.UB_ACTIVE_BOT_ID = idOf(store, "CEO");

    const direct = await run<{ status: string }>(sendToBot, { botId: groupId, message: "kickoff" });
    assert.equal(direct.status, "needs_post_to_group");

    const posted = await run<{ status: string; proposalId: string }>(postToGroup, {
      groupId,
      message: "Kickoff at nine: Research owns sources, Writer owns the brief.",
    });
    assert.equal(posted.status, "awaiting_owner_confirmation");
    const proposal = readProposal(posted.proposalId);
    assert.equal(proposal?.kind, "fanout");
    assert.equal(proposal?.kind === "fanout" ? proposal.targetIds.length : 0, 2);
    assert.equal(listHandoffs().length, 0, "nothing is delivered before the owner confirms");
  } finally {
    box.restore();
  }
});

test("proposeGroup needs two real member bots and never the orchestrator", async () => {
  const box = sandbox();
  try {
    const store = seedRoster(["CEO", "Research"]);
    process.env.UB_ACTIVE_BOT_ID = idOf(store, "CEO");
    const tooFew = await run<{ status: string }>(proposeGroup, {
      name: "Alone",
      memberIds: [idOf(store, "Research")],
    });
    assert.equal(tooFew.status, "invalid");
    const withDefault = await run<{ status: string }>(proposeGroup, {
      name: "Bad",
      memberIds: [idOf(store, "Research"), "bot-useful"],
    });
    assert.equal(withDefault.status, "invalid");
    // The orchestrator is dropped from the roster and duplicates collapse, so
    // this leaves a single member and must not become a group.
    const tooThin = await run<{ status: string; proposalId: string }>(proposeGroup, {
      name: "Pair",
      memberIds: [idOf(store, "Research"), "bot-useful", idOf(store, "Research")],
    });
    assert.equal(tooThin.status, "invalid");

    const second = applyShellAction(store, { type: "createBot", name: "Writer" }).store;
    writeShell(second);
    const good = await run<{ status: string; proposalId: string }>(proposeGroup, {
      name: "Pair",
      memberIds: [idOf(second, "Research"), idOf(second, "Writer")],
    });
    assert.equal(good.status, "awaiting_owner_confirmation");
    assert.equal(readProposal(good.proposalId)?.kind, "createGroup");
  } finally {
    box.restore();
  }
});

test("updateBotProfile proposes the edit and reports no_change honestly", async () => {
  const box = sandbox();
  try {
    const store = seedRoster(["CEO", "Research"]);
    const research = idOf(store, "Research");
    process.env.UB_ACTIVE_BOT_ID = idOf(store, "CEO");
    const proposed = await run<{ status: string; proposalId: string }>(updateBotProfile, {
      botId: research,
      description: "Own pricing research. Never publish without approval.",
      title: "Research",
    });
    assert.equal(proposed.status, "awaiting_owner_confirmation");
    const proposal = readProposal(proposed.proposalId);
    assert.equal(proposal?.kind, "updateBotProfile");
    assert.equal(proposal?.kind === "updateBotProfile" ? proposal.patch.description.length > 0 : false, true);
    assert.equal(readShell().bots.find((bot) => bot.id === research)?.description, "");

    const unchanged = await run<{ status: string }>(updateBotProfile, { botId: research });
    assert.equal(unchanged.status, "no_change");
    const missing = await run<{ status: string }>(updateBotProfile, { botId: "nope", name: "x" });
    assert.equal(missing.status, "not_found");
  } finally {
    box.restore();
  }
});

test("sendToBot refuses hidden targets and ambiguous names", async () => {
  const box = sandbox();
  try {
    let store = seedRoster(["CEO", "Research", "Writer"]);
    const ceo = idOf(store, "CEO");
    const research = idOf(store, "Research");
    process.env.UB_ACTIVE_BOT_ID = ceo;
    store = applyShellAction(store, { type: "hide", botId: research, hidden: true }).store;
    writeShell(store);
    const hidden = await run<{ status: string }>(sendToBot, { botId: research, message: "hi" });
    assert.equal(hidden.status, "invalid");

    store = applyShellAction(store, {
      type: "nameBot",
      botId: idOf(store, "Research"),
      name: "Research",
      label: "Lead",
    }).store;
    store = applyShellAction(store, {
      type: "nameBot",
      botId: idOf(store, "Writer"),
      name: "Writer",
      label: "Lead",
    }).store;
    writeShell(store);
    const ambiguous = await run<{ status: string; matches?: unknown[] }>(sendToBot, {
      botId: "Lead",
      message: "hi",
    });
    assert.equal(ambiguous.status, "ambiguous");
    assert.equal(ambiguous.matches?.length, 2);
    // An exact id still wins over the duplicate label.
    const byId = await run<{ status: string }>(sendToBot, { botId: idOf(store, "Writer"), message: "hi" });
    assert.equal(byId.status, "queued");
  } finally {
    box.restore();
  }
});

test("sendToBot refuses to forward a handoff past the depth cap", async () => {
  const box = sandbox();
  try {
    const store = seedRoster(["CEO", "Research"]);
    const ceo = idOf(store, "CEO");
    const research = idOf(store, "Research");
    process.env.UB_ACTIVE_BOT_ID = research;
    const incoming = queueHandoff({
      sourceBotId: ceo,
      sourceName: "CEO",
      targetBotId: research,
      targetName: "Research",
      message: "deep task",
      depth: HANDOFF_DEPTH_MAX,
    });
    appendAgentEvent(research, {
      kind: "post",
      text: "deep task",
      handoffId: incoming.id,
      authorBotId: ceo,
    }, process.env.UB_AGENT_STORE_PATH);
    const bounced = await run<{ status: string }>(sendToBot, { botId: ceo, message: "back at you" });
    assert.equal(bounced.status, "loop_refused");
  } finally {
    box.restore();
  }
});

test("bash refuses commands that reference secret stores or parent traversal", async () => {
  const blocked = await run<{ status: string }>(bash, { command: "cat ~/.ssh/id_rsa" });
  assert.equal(blocked.status, "blocked");
  const traversal = await run<{ status: string }>(bash, { command: "cat ../../etc/passwd" });
  assert.equal(traversal.status, "blocked");
});

test("listBots reports ids, groups and sections", async () => {
  const box = sandbox();
  try {
    let store = seedRoster(["CEO", "Research", "Writer"]);
    const section = applyShellAction(store, { type: "createSection", name: "Work" });
    store = section.store;
    const group = applyShellAction(store, {
      type: "createGroup",
      name: "Launch",
      memberIds: [idOf(store, "Research"), idOf(store, "Writer")],
      sectionId: section.createdId ?? null,
    });
    store = group.store;
    writeShell(store);
    process.env.UB_ACTIVE_BOT_ID = idOf(store, "CEO");
    const listing = await run<{
      bots: Array<{ id: string; name: string }>;
      groups: Array<{ name: string; members: Array<{ name: string }> }>;
      sections: Array<{ name: string }>;
      roster: string[];
    }>(listBots, {});
    assert.equal(listing.bots.length, 4);
    assert.equal(listing.bots.some((bot) => bot.id === "bot-useful"), true);
    assert.equal(listing.groups.length, 1);
    assert.deepEqual(
      listing.groups[0].members.map((member) => member.name).sort(),
      ["Research", "Writer"],
    );
    assert.deepEqual(listing.sections.map((item) => item.name), ["Work"]);
    assert.equal(listing.roster.length, 5);
  } finally {
    box.restore();
  }
});
