import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAgentEvent,
  claimProposal,
  createProposal,
  isReserved,
  listPendingProposals,
  listProposalsOfKind,
  listThreadEvents,
  newProposalId,
  parseAgentStore,
  readAgentStore,
  readProposal,
  reserveKey,
  reserveSend,
  threadSnapshot,
  updateProposal,
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
import { writeHandoffReply } from "../shared/agents-send.ts";

function tempPaths() {
  const dir = mkdtempSync(join(tmpdir(), "ub-agents-"));
  return { dir, storePath: join(dir, "agents.json"), handoffDir: join(dir, "handoffs") };
}

/** A connect card for an app, the one kind of card a bot can still raise besides a server. */
function appCard(name: string, threadId = "b1") {
  return {
    kind: "connectApp" as const,
    slug: name.toLowerCase(),
    name,
    logo: null,
    purpose: "Read the last invoice thread",
    sourceBotId: threadId,
    threadId,
    phase: "proposed" as const,
    accountId: null,
    waitingSince: null,
    toolCount: null,
    handoffId: null,
  };
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
  const proposal = createProposal(appCard("ResearchLead"), storePath);
  assert.equal(proposal.status, "pending");
  appendAgentEvent("b1", {
    kind: "proposal",
    text: "Proposed connecting an app",
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
  const proposal = createProposal(appCard("Once"), storePath);
  assert.equal(claimProposal(proposal.id, "confirmed", storePath)?.id, proposal.id);
  assert.equal(claimProposal(proposal.id, "confirmed", storePath), null);
  assert.equal(claimProposal(proposal.id, "dismissed", storePath), null);
});

test("an expired proposal cannot be claimed", () => {
  const { storePath } = tempPaths();
  const proposal = createProposal(appCard("TooLate"), storePath);
  const store = readAgentStore(storePath);
  store.proposals[0].expiresAt = new Date(Date.now() - 1000).toISOString();
  writeAgentStore(store, storePath);
  assert.equal(claimProposal(proposal.id, "confirmed", storePath), null);
});

test("a corrupt expiry is treated as expired, not confirmable", () => {
  const { storePath } = tempPaths();
  const proposal = createProposal(appCard("Corrupt"), storePath);
  const store = readAgentStore(storePath);
  store.proposals[0].expiresAt = "not-a-date";
  writeAgentStore(store, storePath);
  // The pending list already hides an unparsable expiry; confirming must fail
  // the same way instead of letting a corrupt card through.
  assert.deepEqual(listPendingProposals("b1", storePath), []);
  assert.equal(claimProposal(proposal.id, "confirmed", storePath), null);
});

test("the same side of a handoff lands once per transcript", () => {
  const { storePath } = tempPaths();
  appendAgentEvent("b1", { kind: "assistant", text: "reply", handoffId: "hnd_x", id: "e1" }, storePath);
  appendAgentEvent("b1", { kind: "assistant", text: "reply", handoffId: "hnd_x", id: "e2" }, storePath);
  appendAgentEvent("b1", { kind: "note", text: "no reply", handoffId: "hnd_x", id: "e3" }, storePath);
  assert.equal(listThreadEvents("b1", storePath).length, 2);
});

test("agent tool sends are idempotent per request id", () => {
  const { storePath } = tempPaths();
  const key = reserveKey("proposal", "req-1");
  assert.equal(isReserved(key, storePath), false);
  assert.equal(reserveSend("proposal", "req-1", storePath), true);
  assert.equal(reserveSend("proposal", "req-1", storePath), false);
  assert.equal(isReserved(key, storePath), true);
  assert.equal(reserveSend("proposal", "req-2", storePath), true);
  // The same request id on another kind is its own slot.
  assert.equal(reserveSend("image", "req-1", storePath), true);
});

test("handoff and post rows from before handoffs were removed stay in the file but no read returns them", () => {
  const { storePath } = tempPaths();
  const row = (id: string, kind: string, text: string) => ({ id, at: "2026-09-01T00:00:00.000Z", kind, text, handoffId: id === "o1" ? "hnd_old" : null });
  writeAgentStore(parseAgentStore({
    schemaVersion: 1,
    threads: [{
      id: "b1", botId: "b1", kind: "bot", sessionId: "", updatedAt: "2026-09-01T00:00:00.000Z",
      events: [row("o1", "handoff", "old out"), row("o2", "post", "old in"), row("o3", "assistant", "kept"), row("o4", "note", "kept too")],
    }],
    proposals: [],
    reserves: [],
  }), storePath);
  assert.deepEqual(listThreadEvents("b1", storePath).map((event) => event.id), ["o3", "o4"]);
  assert.deepEqual(threadSnapshot("b1", storePath).events.map((event) => event.id), ["o3", "o4"]);
  // Nothing is deleted: the rows are still in the file, and a new event lands beside them.
  assert.equal(readAgentStore(storePath).threads[0].events.length, 4);
  appendAgentEvent("b1", { kind: "note", text: "new", id: "n1" }, storePath);
  assert.equal(readAgentStore(storePath).threads[0].events.length, 5);
  assert.deepEqual(listThreadEvents("b1", storePath).map((event) => event.id), ["o3", "o4", "n1"]);
});

test("cards of the removed kinds on disk are ignored: never listed, never claimable, never kept", () => {
  const { storePath } = tempPaths();
  const base = { createdAt: "2026-09-01T00:00:00.000Z", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), status: "pending", threadId: "b1", sourceBotId: null };
  const live = createProposal(appCard("Gmail"), storePath);
  const raw = readAgentStore(storePath) as unknown as { proposals: unknown[] };
  raw.proposals.push(
    { ...base, id: "prp_bot", kind: "createBot", name: "Writer", petname: "New Bot 1", title: "", description: "x", sectionId: null, brief: "", proposerId: "bot-useful" },
    { ...base, id: "prp_group", kind: "createGroup", name: "Desk", memberIds: ["a", "b"], description: "", proposerId: "bot-useful" },
    { ...base, id: "prp_profile", kind: "updateBotProfile", botId: "b1", baseRevision: 0, patch: {}, proposerId: "bot-useful" },
    { ...base, id: "prp_fanout", kind: "fanout", message: "hi", targetIds: ["a"], groupId: null },
  );
  writeFileSync(storePath, JSON.stringify(raw), "utf8");
  assert.deepEqual(readAgentStore(storePath).proposals.map((item) => item.id), [live.id]);
  for (const id of ["prp_bot", "prp_group", "prp_profile", "prp_fanout"]) {
    assert.equal(readProposal(id, storePath), null, id);
    assert.equal(claimProposal(id, "confirmed", storePath), null, id);
  }
  assert.deepEqual(listPendingProposals("b1", storePath).map((item) => item.id), [live.id]);
  assert.deepEqual(threadSnapshot("b1", storePath).proposals.map((item) => item.id), [live.id]);
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

test("handoff records carry and default the hop depth", () => {
  const { handoffDir } = tempPaths();
  const shallow = queueHandoff({
    sourceBotId: "b1",
    sourceName: "CEO",
    targetBotId: "b2",
    targetName: "Research",
    message: "one",
  }, handoffDir);
  const deep = queueHandoff({
    sourceBotId: "b2",
    sourceName: "Research",
    targetBotId: "b1",
    targetName: "CEO",
    message: "two",
    depth: 2,
  }, handoffDir);
  assert.equal(readHandoff(shallow.id, handoffDir)?.depth, 0);
  assert.equal(readHandoff(deep.id, handoffDir)?.depth, 2);
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

test("a resume's reply lands on the receiver alone, and nothing is written to the sender", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-reply-"));
  const storePath = join(dir, "agents.json");
  const handoffDir = join(dir, "handoffs");
  const previousStore = process.env.UB_AGENT_STORE_PATH;
  process.env.UB_AGENT_STORE_PATH = storePath;
  try {
    const record = queueHandoff({
      sourceBotId: "bot-useful",
      sourceName: "Generalist",
      targetBotId: "bot-research",
      targetName: "Research",
      message: "The owner connected the app gmail. Continue the task: read the invoice thread",
    }, handoffDir);
    writeHandoffReply({ handoff: record, reply: "Forty.", sessionId: "sess_1", receiverId: "bot-research" });
    const receiver = listThreadEvents("bot-research", storePath);
    assert.deepEqual(receiver.map((event) => event.kind), ["assistant"]);
    assert.equal(receiver[0].text, "Forty.");
    assert.equal(receiver[0].authorName, "Research");
    assert.equal(receiver[0].handoffId, record.id);
    // The sender's thread gets nothing: no handoff row, no post row.
    assert.deepEqual(listThreadEvents("bot-useful", storePath), []);
    assert.equal(readAgentStore(storePath).threads.some((thread) => thread.id === "bot-useful"), false);
  } finally {
    if (previousStore === undefined) delete process.env.UB_AGENT_STORE_PATH;
    else process.env.UB_AGENT_STORE_PATH = previousStore;
  }
});

test("writeHandoffReply records a note on the receiver when the reply is empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-empty-"));
  const storePath = join(dir, "agents.json");
  const handoffDir = join(dir, "handoffs");
  const previousStore = process.env.UB_AGENT_STORE_PATH;
  process.env.UB_AGENT_STORE_PATH = storePath;
  try {
    const record = queueHandoff({
      sourceBotId: "bot-useful",
      sourceName: "Generalist",
      targetBotId: "bot-research",
      targetName: "Research",
      message: "Anything?",
    }, handoffDir);
    writeHandoffReply({ handoff: record, reply: "", sessionId: "sess_1", receiverId: "bot-research" });
    const receiver = listThreadEvents("bot-research", storePath);
    assert.equal(receiver.at(-1)?.kind, "note");
    assert.match(receiver.at(-1)?.text ?? "", /no reply/);
    assert.deepEqual(listThreadEvents("bot-useful", storePath), []);
  } finally {
    if (previousStore === undefined) delete process.env.UB_AGENT_STORE_PATH;
    else process.env.UB_AGENT_STORE_PATH = previousStore;
  }
});

test("a corrupt store reads as empty rather than throwing", () => {
  const { dir } = tempPaths();
  const store = readAgentStore(join(dir, "missing.json"));
  assert.deepEqual(store.threads, []);
  assert.match(newProposalId(), /^prp_[0-9a-f]{16}$/);
});

test("a connectApp proposal round-trips its phase fields and can be patched in place", () => {
  const { storePath } = tempPaths();
  const proposal = createProposal({
    kind: "connectApp",
    slug: "gmail",
    name: "Gmail",
    logo: "https://logos.composio.dev/api/gmail",
    purpose: "Read the last invoice thread",
    sourceBotId: "b1",
    threadId: "b1",
    phase: "proposed",
    accountId: null,
    waitingSince: null,
    toolCount: null,
    handoffId: null,
  }, storePath);
  const stored = readProposal(proposal.id, storePath);
  assert.equal(stored?.kind, "connectApp");
  assert.equal(stored && stored.kind === "connectApp" ? stored.phase : null, "proposed");
  updateProposal(proposal.id, (item) => {
    if (item.kind === "connectApp") {
      item.phase = "waiting";
      item.accountId = "ca_gmail";
      item.waitingSince = "2026-09-16T10:00:00.000Z";
    }
  }, storePath);
  const waiting = listProposalsOfKind("connectApp", storePath);
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].phase, "waiting");
  assert.equal(waiting[0].accountId, "ca_gmail");
  assert.equal(waiting[0].logo, "https://logos.composio.dev/api/gmail");
  // A bad phase on disk reads as proposed, never as connected.
  updateProposal(proposal.id, (item) => { (item as { phase: string }).phase = "bogus"; }, storePath);
  assert.equal(listProposalsOfKind("connectApp", storePath)[0].phase, "proposed");
  assert.equal(updateProposal("prp_missing", () => undefined, storePath), null);
});

test("a connectServer proposal round-trips auth and phase fields", () => {
  const { storePath } = tempPaths();
  const proposal = createProposal({
    kind: "connectServer",
    connectionKind: "mcp",
    connectionId: "excalidraw",
    name: "Excalidraw",
    description: "Draw diagrams",
    url: "https://mcp.excalidraw.com/mcp",
    urlHost: "mcp.excalidraw.com",
    purpose: "Draw a cat",
    authKind: "none",
    authHeader: null,
    sourceBotId: "b1",
    threadId: "b1",
    phase: "proposed",
    redirectHost: null,
    waitingSince: null,
    toolCount: null,
    handoffId: null,
  }, storePath);
  assert.equal(readProposal(proposal.id, storePath)?.kind, "connectServer");
  updateProposal(proposal.id, (item) => {
    if (item.kind === "connectServer") {
      item.phase = "waiting";
      item.redirectHost = "auth.example.com";
    }
  }, storePath);
  const waiting = listProposalsOfKind("connectServer", storePath);
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].phase, "waiting");
  assert.equal(waiting[0].redirectHost, "auth.example.com");
  assert.equal(waiting[0].urlHost, "mcp.excalidraw.com");
  updateProposal(proposal.id, (item) => { (item as { phase: string }).phase = "bogus"; }, storePath);
  assert.equal(listProposalsOfKind("connectServer", storePath)[0].phase, "proposed");
});
