import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAgentEvent,
  claimProposal,
  createProposal,
  isReserved,
  listThreadEvents,
  newProposalId,
  parseAgentStore,
  readAgentStore,
  reserveKey,
  reserveSend,
  threadSnapshot,
  writeAgentStore,
} from "../shared/agent-store.ts";
import {
  claimHandoff,
  HANDOFF_ATTEMPTS_MAX,
  listDeliverable,
  listHandoffs,
  markDelivered,
  markFailed,
  ownsHandoffClaim,
  queueHandoff,
  readHandoff,
} from "../shared/handoffs.ts";
import { sendHandoff } from "../shared/agents-send.ts";

function tempPaths() {
  const dir = mkdtempSync(join(tmpdir(), "ub-agents-"));
  return { dir, storePath: join(dir, "agents.json"), handoffDir: join(dir, "handoffs") };
}

test("unknown keys at any level are tolerated instead of dropping data", () => {
  // A newer build adding a field must not make this build prune transcripts.
  const parsed = parseAgentStore({
    schemaVersion: 1,
    threads: [{
      id: "b1",
      botId: "b1",
      kind: "bot",
      sessionId: "",
      updatedAt: "x",
      events: [],
      futureThreadField: 1,
    }],
    proposals: [],
    reserves: [],
    futureTopLevel: true,
  });
  assert.equal(parsed.threads.length, 1);
  assert.equal(parsed.threads[0].id, "b1");
});

test("thread events dedupe by id and stay capped", () => {
  const { storePath } = tempPaths();
  appendAgentEvent("b1", { kind: "user", text: "hi", id: "e1" }, storePath);
  appendAgentEvent("b1", { kind: "user", text: "hi", id: "e1" }, storePath);
  const events = listThreadEvents("b1", storePath);
  assert.equal(events.length, 1);
  for (let index = 0; index < 320; index += 1) {
    appendAgentEvent("b1", { kind: "note", text: `n${index}`, id: `n${index}` }, storePath);
  }
  const capped = listThreadEvents("b1", storePath);
  assert.equal(capped.length, 300);
  assert.equal(capped.at(-1)?.id, "n319");
});

test("proposals are created pending, scoped to a thread, and resolved once", () => {
  const { storePath } = tempPaths();
  const proposal = createProposal({
    kind: "createBot",
    name: "Research Lead",
    petname: "New Bot 1",
    title: "Research",
    description: "Find sources and cite them.",
    sectionId: null,
    sourceBotId: null,
    threadId: "b1",
    brief: "",
  }, storePath);
  assert.equal(proposal.status, "pending");
  appendAgentEvent("b1", {
    kind: "proposal",
    text: "Proposed teammate",
    proposalId: proposal.id,
    id: "ev1",
  }, storePath);
  const snapshot = threadSnapshot("b1", storePath);
  assert.equal(snapshot.proposals.length, 1);
  assert.equal(snapshot.proposals[0].id, proposal.id);
  const resolved = claimProposal(proposal.id, "confirmed", storePath);
  assert.equal(resolved?.status, "confirmed");
  assert.equal(threadSnapshot("b1", storePath).proposals.length, 0);
  assert.equal(threadSnapshot("b2", storePath).proposals.length, 0);
});

test("a proposal can only be claimed once", () => {
  const { storePath } = tempPaths();
  const proposal = createProposal({
    kind: "createBot",
    name: "Once",
    petname: "New Bot 1",
    title: "",
    description: "",
    sectionId: null,
    sourceBotId: null,
    threadId: "b1",
    brief: "",
  }, storePath);
  assert.equal(claimProposal(proposal.id, "confirmed", storePath)?.id, proposal.id);
  assert.equal(claimProposal(proposal.id, "confirmed", storePath), null);
  assert.equal(claimProposal(proposal.id, "dismissed", storePath), null);
});

test("an expired proposal cannot be claimed", () => {
  const { storePath } = tempPaths();
  const proposal = createProposal({
    kind: "createBot",
    name: "Too Late",
    petname: "New Bot 1",
    title: "",
    description: "",
    sectionId: null,
    sourceBotId: null,
    threadId: "b1",
    brief: "",
  }, storePath);
  const store = readAgentStore(storePath);
  store.proposals[0].expiresAt = new Date(Date.now() - 1000).toISOString();
  writeAgentStore(store, storePath);
  assert.equal(claimProposal(proposal.id, "confirmed", storePath), null);
});

test("the same side of a handoff lands once per transcript", () => {
  const { storePath } = tempPaths();
  appendAgentEvent("b1", { kind: "post", text: "task", handoffId: "hnd_x", id: "e1" }, storePath);
  appendAgentEvent("b1", { kind: "post", text: "task", handoffId: "hnd_x", id: "e2" }, storePath);
  appendAgentEvent("b1", { kind: "assistant", text: "reply", handoffId: "hnd_x", id: "e3" }, storePath);
  assert.equal(listThreadEvents("b1", storePath).length, 2);
});

test("agent tool sends are idempotent per request id", () => {
  const { storePath } = tempPaths();
  const key = reserveKey("handoff", "req-1");
  assert.equal(isReserved(key, storePath), false);
  assert.equal(reserveSend("handoff", "req-1", storePath), true);
  assert.equal(reserveSend("handoff", "req-1", storePath), false);
  assert.equal(isReserved(key, storePath), true);
  assert.equal(reserveSend("handoff", "req-2", storePath), true);
});

test("handoff queue delivers oldest first, retries twice, then gives up", () => {
  const { handoffDir } = tempPaths();
  const first = queueHandoff({
    sourceBotId: "b1",
    sourceName: "CEO",
    targetBotId: "b2",
    targetName: "Research",
    message: "one",
  }, handoffDir);
  const second = queueHandoff({
    sourceBotId: "b1",
    sourceName: "CEO",
    targetBotId: "b3",
    targetName: "Writer",
    message: "two",
  }, handoffDir);
  const queued = listDeliverable(handoffDir);
  assert.deepEqual(queued.map((row) => row.message), ["one", "two"]);
  assert.equal(readHandoff(first.id, handoffDir)?.status, "pending");

  markFailed(second.id, "boom", handoffDir);
  assert.equal(readHandoff(second.id, handoffDir)?.status, "pending");
  for (let attempt = 1; attempt < HANDOFF_ATTEMPTS_MAX; attempt += 1) {
    markFailed(second.id, "boom", handoffDir);
  }
  assert.equal(readHandoff(second.id, handoffDir)?.attempts, HANDOFF_ATTEMPTS_MAX);
  assert.equal(readHandoff(second.id, handoffDir)?.status, "failed");
  assert.deepEqual(listDeliverable(handoffDir).map((row) => row.id), [first.id]);

  markDelivered(first.id, "done", handoffDir);
  assert.equal(readHandoff(first.id, handoffDir)?.status, "delivered");
  assert.deepEqual(listDeliverable(handoffDir), []);
  assert.equal(listHandoffs(handoffDir).length, 2);
});

test("a handoff record is claimed by one deliverer at a time", () => {
  const { handoffDir } = tempPaths();
  const record = queueHandoff({
    sourceBotId: "b1",
    sourceName: "CEO",
    targetBotId: "b2",
    targetName: "Research",
    message: "claim me",
  }, handoffDir);
  const first = claimHandoff(record.id, handoffDir);
  assert.ok(first);
  assert.equal(claimHandoff(record.id, handoffDir), null);
  assert.equal(ownsHandoffClaim(record.id, first, handoffDir), true);
  // A failed attempt releases the claim so the retry can pick it up.
  markFailed(record.id, "boom", handoffDir, first);
  assert.equal(ownsHandoffClaim(record.id, first, handoffDir), false);
  assert.ok(claimHandoff(record.id, handoffDir));
});

test("sendHandoff writes both sides of the transcript and one queue record", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-send-"));
  const storePath = join(dir, "agents.json");
  const handoffDir = join(dir, "handoffs");
  const previousStore = process.env.UB_AGENT_STORE_PATH;
  const previousDir = process.env.UB_HANDOFF_DIR;
  process.env.UB_AGENT_STORE_PATH = storePath;
  process.env.UB_HANDOFF_DIR = handoffDir;
  try {
    const record = sendHandoff({
      source: { id: "bot-ceo", name: "CEO" },
      target: { id: "bot-research", name: "Research" },
      message: "Draft the pricing page brief.",
    });
    assert.equal(record.status, "pending");
    assert.equal(listHandoffs(handoffDir).length, 1);
    const sender = listThreadEvents("bot-ceo", storePath);
    const receiver = listThreadEvents("bot-research", storePath);
    assert.equal(sender.length, 1);
    assert.equal(sender[0].kind, "handoff");
    assert.equal(sender[0].targetBotIds[0], "bot-research");
    assert.equal(receiver.length, 1);
    assert.equal(receiver[0].kind, "post");
    assert.equal(receiver[0].authorName, "CEO");
    assert.equal(sender[0].handoffId, record.id);
  } finally {
    if (previousStore === undefined) delete process.env.UB_AGENT_STORE_PATH;
    else process.env.UB_AGENT_STORE_PATH = previousStore;
    if (previousDir === undefined) delete process.env.UB_HANDOFF_DIR;
    else process.env.UB_HANDOFF_DIR = previousDir;
  }
});

test("a corrupt store reads as empty rather than throwing", () => {
  const { dir } = tempPaths();
  const store = readAgentStore(join(dir, "missing.json"));
  assert.deepEqual(store.threads, []);
  assert.match(newProposalId(), /^prp_[0-9a-f]{16}$/);
});

test("group fan-out sends one handoff per member and one card per target thread", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-fanout-"));
  const storePath = join(dir, "agents.json");
  const handoffDir = join(dir, "handoffs");
  const previousStore = process.env.UB_AGENT_STORE_PATH;
  const previousDir = process.env.UB_HANDOFF_DIR;
  process.env.UB_AGENT_STORE_PATH = storePath;
  process.env.UB_HANDOFF_DIR = handoffDir;
  try {
    const targets = [
      { id: "bot-a", name: "Alpha" },
      { id: "bot-b", name: "Beta" },
    ];
    for (const target of targets) {
      sendHandoff({
        source: { id: "bot-ceo", name: "CEO" },
        target,
        message: "Kickoff at nine.",
        group: { id: "grp-1", name: "Launch" },
        receiver: target,
      });
    }
    assert.equal(listHandoffs(handoffDir).length, 2);
    // One copy in each member thread, and the handoff records the room.
    for (const id of ["bot-a", "bot-b"]) {
      const post = listThreadEvents(id, storePath)[0];
      assert.equal(post.kind, "post");
      assert.equal(post.text, "Kickoff at nine.");
      assert.notEqual(post.handoffId, null, `${id} post links to its handoff`);
    }
    const queued = listHandoffs(handoffDir);
    assert.deepEqual(queued.map((row) => row.groupId), ["grp-1", "grp-1"]);
    assert.deepEqual(queued.map((row) => row.threadKind), ["bot", "bot"]);
  } finally {
    if (previousStore === undefined) delete process.env.UB_AGENT_STORE_PATH;
    else process.env.UB_AGENT_STORE_PATH = previousStore;
    if (previousDir === undefined) delete process.env.UB_HANDOFF_DIR;
    else process.env.UB_HANDOFF_DIR = previousDir;
  }
});
