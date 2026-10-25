import assert from "node:assert/strict";
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { EngineError } from "../../agent/engine/protocol.ts";
import { makeWorld, types, waitForRequests, type World } from "./helpers.ts";

/**
 * Contract tests 6, 7, 8 and 13 (SPEC 14): Retry through navigateTree, a
 * crash mid-turn, the host queue and Stop, and Stop with a card waiting.
 */

function expectRefusal(fn: () => unknown, status: number, code: string): EngineError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof EngineError, `expected an EngineError, got ${String(error)}`);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected ${code}`);
}

function userMessages(world: World, chatId: string, text: string): number {
  const live = world.engine.host.chat(chatId).live;
  assert.ok(live);
  return live.sm.getBranch().filter((entry) => {
    if (entry.type !== "message") return false;
    const message = entry.message as unknown as { role: string; content: unknown };
    return message.role === "user" && JSON.stringify(message.content).includes(text);
  }).length;
}

test("contract 6: Retry leaves one owner message on the active branch and the model sees it once", async () => {
  const world = await makeWorld();
  try {
    const chatId = world.newChat();
    const recorder = world.record(chatId);
    const clientId = crypto.randomUUID();
    world.router.enqueue(
      { kind: "error", status: 503, code: "upstream_unavailable" },
      { kind: "error", status: 503, code: "upstream_unavailable" },
      { kind: "error", status: 503, code: "upstream_unavailable" },
    );
    world.send(chatId, "Summarise the plan", { clientId });
    await world.idle(chatId);
    let rows = world.engine.rows(chatId, {}).rows;
    assert.deepEqual(rows.map((row) => row.kind), ["user", "failure"]);
    const failed = recorder.events.find((event) => event.type === "turn.failed");
    assert.ok(failed);
    assert.equal(failed.code, "upstream_unavailable");
    assert.equal(failed.messageKept, true);
    assert.equal(userMessages(world, chatId, "Summarise the plan"), 1);

    world.router.enqueue({ kind: "text", text: "Here is the plan." });
    const retried = world.send(chatId, "Summarise the plan", { clientId, retry: true });
    assert.ok(retried.turnId);
    await world.idle(chatId);
    rows = world.engine.rows(chatId, {}).rows;
    assert.deepEqual(rows.map((row) => row.kind), ["user", "assistant"], "the failed attempt is off the active branch");
    assert.equal(userMessages(world, chatId, "Summarise the plan"), 1, "one owner message on the active branch");
    const started = recorder.events.filter((event) => event.type === "turn.started");
    assert.equal(started.at(-1)?.retry, true);
    assert.equal(started.at(-1)?.clientId, clientId);
    const session = world.engine.host.chat(chatId).live?.session;
    const owner = session?.messages.filter((message) => (message as { role: string }).role === "user" && JSON.stringify(message).includes("Summarise the plan"));
    assert.equal(owner?.length, 1, "the session's own context matches the branch");
    assert.ok(!session?.messages.some((message) => (message as { stopReason?: string }).stopReason === "error"), "no failed assistant message in the model's context");
    const last = world.router.requests.at(-1)?.body.messages as { role: string; content: unknown }[];
    assert.equal(last.filter((message) => message.role === "user" && JSON.stringify(message.content).includes("Summarise the plan")).length, 1);
    assert.deepEqual(world.router.refused, []);
  } finally {
    await world.close();
  }
});

test("contract 6: Retry waits out retryAfterMs, only for the newest failed turn, and only when idle", async () => {
  const world = await makeWorld();
  try {
    const chatId = world.newChat();
    const clientId = crypto.randomUUID();
    world.router.enqueue(
      { kind: "error", status: 503, code: "upstream_unavailable", retryAfterMs: 60_000 },
      { kind: "error", status: 503, code: "upstream_unavailable", retryAfterMs: 60_000 },
      { kind: "error", status: 503, code: "upstream_unavailable", retryAfterMs: 60_000 },
    );
    world.send(chatId, "first", { clientId });
    await world.idle(chatId);
    const refusal = expectRefusal(() => world.send(chatId, "first", { clientId, retry: true }), 429, "retry_too_soon");
    assert.ok(Number(refusal.fields.retryAfterMs) > 0 && Number(refusal.fields.retryAfterMs) <= 60_000);
    expectRefusal(() => world.send(chatId, "first", { clientId: crypto.randomUUID(), retry: true }), 409, "retry_not_available");

    // A later turn makes the old failure no longer the newest.
    world.router.enqueue({ kind: "text", text: "fine" });
    world.send(chatId, "second");
    await world.idle(chatId);
    expectRefusal(() => world.send(chatId, "first", { clientId, retry: true }), 409, "retry_not_available");
  } finally {
    await world.close();
  }
});

test("contract 7: kill the engine mid-turn; on boot the chat shows an interrupted row and Retry works", async () => {
  const world = await makeWorld();
  const restartRoot = `${world.root}-restart`;
  let second: World | null = null;
  try {
    const chatId = world.newChat();
    const clientId = crypto.randomUUID();
    world.router.enqueue({ kind: "stall", text: "The plan has two parts" });
    world.send(chatId, "Write the plan", { clientId });
    const deadline = Date.now() + 5_000;
    while (!world.engine.host.chat(chatId).turn?.partialText && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(world.engine.host.chat(chatId).turn?.partialText, "the turn is streaming");
    // The "kill": the state on disk exactly as a dead process would leave it.
    cpSync(world.root, restartRoot, { recursive: true });
    world.router.release();
    await world.idle(chatId);

    second = await makeWorld({ root: restartRoot, router: world.router });
    const rows = second.engine.rows(chatId, {}).rows;
    assert.deepEqual(rows.map((row) => row.kind), ["user", "failure"]);
    const failure = rows[1] as { code: string; rowId: string };
    assert.equal(failure.code, "interrupted");
    const status = second.engine.status().chats.find((chat) => chat.chatId === chatId);
    assert.equal(status?.lastTurn?.outcome, "failed");
    assert.equal(status?.running, null);

    second.router.enqueue({ kind: "text", text: "Here is the plan." });
    second.send(chatId, "Write the plan", { clientId, retry: true });
    await second.idle(chatId);
    assert.deepEqual(second.engine.rows(chatId, {}).rows.map((row) => row.kind), ["user", "assistant"]);
  } finally {
    await second?.close();
    await world.close();
    rmSync(restartRoot, { recursive: true, force: true });
  }
});

test("contract 7: a crash inside a tool leaves no orphan tool call for the next owner message", async () => {
  const world = await makeWorld();
  const restartRoot = `${world.root}-restart`;
  let second: World | null = null;
  try {
    const chatId = world.newChat();
    world.router.enqueue({ kind: "tools", calls: [{ name: "slow", args: {} }] });
    world.send(chatId, "Run the slow thing");
    const deadline = Date.now() + 5_000;
    while (world.engine.host.chat(chatId).turn?.activity?.tool !== "slow" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    cpSync(world.root, restartRoot, { recursive: true });
    world.engine.cancel(chatId);
    await world.idle(chatId);

    second = await makeWorld({ root: restartRoot, router: world.router });
    assert.equal((second.engine.rows(chatId, {}).rows.at(-1) as { code?: string }).code, "interrupted");
    // Not a Retry: a fresh message continues from the end of the chat. The router refuses an orphan tool call.
    second.router.enqueue({ kind: "text", text: "Understood." });
    second.send(chatId, "Never mind, what time is it?");
    await second.idle(chatId);
    assert.deepEqual(second.router.refused, [], "the next request had no unanswered tool call");
    assert.equal((second.engine.rows(chatId, {}).rows.at(-1) as { text?: string }).text, "Understood.");
  } finally {
    await second?.close();
    await world.close();
    rmSync(restartRoot, { recursive: true, force: true });
  }
});

test("contract 8: three quick sends run as three turns, in order", async () => {
  const world = await makeWorld();
  try {
    const chatId = world.newChat();
    const recorder = world.record(chatId);
    world.router.enqueue({ kind: "stall", text: "one" }, { kind: "text", text: "two" }, { kind: "text", text: "three" });
    const first = world.send(chatId, "first");
    const second = world.send(chatId, "second");
    const third = world.send(chatId, "third");
    await waitForRequests(world, 1);
    assert.ok(first.turnId);
    assert.equal(second.queued, true);
    assert.equal(third.queued, true);
    assert.equal(world.engine.rows(chatId, {}).queued?.length, 2);
    assert.equal((world.engine.rows(chatId, {}).rows.at(-1) as { queued?: boolean }).queued, true);
    world.router.release();
    await world.idle(chatId);
    const lifecycle = recorder.events.filter((event) => ["turn.started", "turn.completed", "message.queued"].includes(event.type)).map((event) => event.type);
    assert.deepEqual(lifecycle, ["turn.started", "message.queued", "message.queued", "turn.completed", "turn.started", "turn.completed", "turn.started", "turn.completed"]);
    const users = recorder.events.filter((event) => event.type === "message.user").map((event) => event.text);
    assert.deepEqual(users, ["first", "second", "third"]);
    const rows = world.engine.rows(chatId, {}).rows;
    assert.deepEqual(rows.map((row) => row.kind), ["user", "assistant", "user", "assistant", "user", "assistant"]);
    assert.ok(rows.every((row) => row.kind !== "user" || row.queued === undefined), "no row is still marked queued");
    assert.equal(world.router.refused.length, 0);
  } finally {
    await world.close();
  }
});

test("contract 8: Stop drops the queued messages to unsent rows", async () => {
  const world = await makeWorld();
  try {
    const chatId = world.newChat();
    const recorder = world.record(chatId);
    world.router.enqueue({ kind: "stall", text: "partial" });
    world.send(chatId, "first");
    const second = crypto.randomUUID();
    const third = crypto.randomUUID();
    world.send(chatId, "second", { clientId: second });
    world.send(chatId, "third", { clientId: third });
    await waitForRequests(world, 1);
    world.engine.cancel(chatId);
    await world.idle(chatId);
    const kinds = types(recorder.events);
    assert.equal(kinds.filter((type) => type === "message.dropped").length, 2);
    assert.equal(kinds.at(-1), "turn.cancelled");
    const rows = world.engine.rows(chatId, {}).rows;
    const unsent = rows.filter((row) => row.kind === "unsent");
    assert.deepEqual(unsent.map((row) => (row as { clientId: string }).clientId), [second, third]);
    assert.deepEqual(unsent.map((row) => (row as { reason: string }).reason), ["cancelled", "cancelled"]);
    assert.ok(!rows.some((row) => row.kind === "user" && row.queued), "no queued bubble is left");
    assert.equal(world.router.requests.length, 1, "the dropped messages never reached the model");
    assert.equal(world.engine.host.chat(chatId).queue.length, 0);
    // A dropped message can be sent again.
    world.router.enqueue({ kind: "text", text: "now it runs" });
    world.send(chatId, "second", { clientId: second });
    await world.idle(chatId);
    assert.equal((world.engine.rows(chatId, {}).rows.at(-1) as { text?: string }).text, "now it runs");
  } finally {
    await world.close();
  }
});

test("contract 13: Stop with an approval card pending returns within a second and the card is expired", async () => {
  const world = await makeWorld();
  try {
    const chatId = world.newChat();
    const recorder = world.record(chatId);
    world.router.enqueue({ kind: "tools", calls: [{ name: "gated", args: {} }] });
    world.send(chatId, "do the gated thing");
    const deadline = Date.now() + 5_000;
    while (world.state.approvals.listPending().length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(world.state.approvals.listPending().length, 1, "the card is waiting");
    assert.equal(world.engine.status().chats.find((chat) => chat.chatId === chatId)?.waitingOnOwner, "approval");
    const started = Date.now();
    world.engine.cancel(chatId);
    await world.idle(chatId, 1_000);
    assert.ok(Date.now() - started < 1_000, `Stop took ${Date.now() - started} ms`);
    assert.equal(world.state.approvals.listPending().length, 0, "the card is expired");
    assert.equal(types(recorder.events).at(-1), "turn.cancelled");
  } finally {
    await world.close();
  }
});
