import { createHmac } from "node:crypto";
import { appendAgentEvent, type ThreadKind } from "../../shared/agent-store.ts";
import { parseEveStreamLine } from "../../shared/eve-stream.ts";
import { sendHandoff } from "../../shared/agents-send.ts";
import {
  claimHandoff,
  listDeliverable,
  markDelivered,
  markFailed,
  ownsHandoffClaim,
  releaseHandoffClaim,
  HANDOFF_ATTEMPTS_MAX,
  HANDOFF_DEPTH_MAX,
  type HandoffRecord,
} from "../../shared/handoffs.ts";
import {
  appendRoutineRun,
  claimDueRoutine,
  claimManualRun,
  claimRunNow,
  pendingRoutines,
  type Routine,
} from "../../shared/routines-store.ts";
import { readShell, updateShell } from "../../shared/shell-io.ts";
import type { ShellBot } from "../../shared/shell-store.ts";

/**
 * Handoff delivery. The sending agent tool only writes a queue record, so a
 * bot-to-bot message never blocks the sender's turn. The web server drains that
 * queue: it opens (or reuses) the receiving bot's eve session, waits for the
 * reply, and appends the result to the receiving transcript.
 */

const EVE = "http://127.0.0.1:4321";
const DELIVER_TIMEOUT_MS = 120_000;

const inflight = new Set<string>();

type EveEvent = { type?: string; data?: Record<string, unknown>; meta?: { id?: string; at?: string } };

function signChannelJwt(secret: string, sub: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub,
    iss: "useful-bot",
    aud: "useful-bot",
    iat: now,
    exp: now + 12 * 60 * 60,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function agentsEnabled(): boolean {
  return Boolean(process.env.UB_CHANNEL_JWT || process.env.UB_CHANNEL_JWT_SECRET);
}

export function channelJwt(): string | null {
  if (process.env.UB_CHANNEL_JWT) return process.env.UB_CHANNEL_JWT;
  const secret = process.env.UB_CHANNEL_JWT_SECRET;
  if (!secret) return null;
  try {
    return signChannelJwt(secret, "desktop-app");
  } catch {
    return null;
  }
}

function textField(data: Record<string, unknown> | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Follow an eve session stream to the end of the turn in progress.
 * `message.appended` deltas accumulate; `message.completed` is authoritative
 * when it carries text. Resolves with an empty string if the turn ends with no
 * assistant text, which is recorded as an empty reply rather than a failure.
 */
export async function readHandoffStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  historyIds: Set<string> = new Set(),
  expectedMessage = "",
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let done = false;
  // Events replayed from before this delivery are ignored; then the reader only
  // starts collecting once eve echoes the exact envelope for this handoff, so a
  // gap in the id skip set can never resolve with an older turn's reply.
  let armed = expectedMessage.length === 0;
  let seenNew = false;
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) {
    onAbort();
    return "";
  }
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
        if (!payload || payload === "[DONE]") continue;
        let event: EveEvent | null = null;
        try {
          event = JSON.parse(payload) as EveEvent;
        } catch {
          continue;
        }
        if (!event || typeof event.type !== "string") continue;
        const eventId = event.meta?.id;
        if (eventId && historyIds.has(eventId)) continue;
        if (!armed) {
          if (event.type === "message.received" && textField(event.data, "message") === expectedMessage) {
            armed = true;
          }
          continue;
        }
        if (event.type === "message.received" || event.type === "message.appended" || event.type === "step.started") {
          seenNew = true;
        }
        if (event.type === "message.appended") {
          text += textField(event.data, "messageDelta");
        } else if (event.type === "message.completed") {
          seenNew = true;
          const full = textField(event.data, "message");
          if (full) text = full;
        } else if (
          event.type === "turn.completed"
          || event.type === "turn.cancelled"
          || event.type === "turn.failed"
          || event.type === "session.failed"
          || event.type === "session.waiting"
        ) {
          if (seenNew) done = true;
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  if (expectedMessage && !armed) {
    // Our envelope never came back: marking this delivered with an empty reply
    // would silently drop the handoff from the receiver transcript.
    throw new Error("envelope_mismatch");
  }
  return text.trim();
}

/**
 * Every event id a session already holds. The post-send read uses this to skip
 * the replayed history, so a second handoff into the same chat does not resolve
 * with the previous turn's reply.
 */
async function sessionEventIds(sessionId: string, jwt: string): Promise<Set<string>> {
  const ids = new Set<string>();
  // The stream pauses after every turn with session.waiting but stays open, so
  // "done" is a short quiet period after the last replayed event, not the first
  // waiting marker. Stopping at the first marker misses later turns and makes
  // the next delivery resolve with an older reply.
  const controller = new AbortController();
  const idleMs = 2_000;
  let idle = setTimeout(() => controller.abort(), idleMs);
  const hard = setTimeout(() => controller.abort(), 20_000);
  const reset = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), idleMs);
  };
  try {
    const res = await fetch(`${EVE}/eve/v1/session/${sessionId}/stream?startIndex=0`, {
      headers: { authorization: `Bearer ${jwt}` },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return ids;
    reset();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      reset();
      buf += decoder.decode(chunk.value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseEveStreamLine(line);
        if (event?.meta?.id) ids.add(event.meta.id);
      }
    }
  } catch {
    /* idle timeout: whatever history was collected is enough */
  } finally {
    clearTimeout(idle);
    clearTimeout(hard);
  }
  return ids;
}

function handoffEnvelope(handoff: HandoffRecord): string {
  const lines = [
    `Handoff from ${handoff.sourceName}.`,
    handoff.groupName ? `This belongs to the group chat ${handoff.groupName}.` : "This arrives in your own chat.",
    "Do the work and answer here. The owner reads this transcript.",
    ...(handoff.depth > 0 ? [`This is relay hop ${handoff.depth} of at most ${HANDOFF_DEPTH_MAX}.`] : []),
    "",
    handoff.message,
  ];
  return lines.join("\n");
}

function receiverOf(handoff: HandoffRecord, bots: ShellBot[]): { bot: ShellBot; kind: ThreadKind } | null {
  if (handoff.groupId) {
    const group = bots.find((bot) => bot.id === handoff.groupId && bot.kind === "group");
    if (group) return { bot: group, kind: "group" };
  }
  const target = bots.find((bot) => bot.id === handoff.targetBotId);
  return target ? { bot: target, kind: "bot" } : null;
}

/**
 * Open (or reuse) a bot's eve session, send one message and wait for the reply.
 * Shared by handoff delivery and by routine runs so both reach eve the same
 * way: the same envelope-matched stream read, the same timeout, the same
 * history skip that keeps a second send from resolving with an older turn.
 */
async function runEveTurn(bot: ShellBot, message: string): Promise<{ sessionId: string; reply: string }> {
  const jwt = channelJwt();
  if (!jwt) throw new Error("channel_credential_missing");
  const path = bot.sessionId ? `session/${bot.sessionId}` : "session";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVER_TIMEOUT_MS);
  let sessionId = bot.sessionId ?? "";
  let reply = "";
  try {
    const historyIds = sessionId ? await sessionEventIds(sessionId, jwt) : new Set<string>();
    const res = await fetch(`${EVE}/eve/v1/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ message, botId: bot.id }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`eve_send_${res.status}`);
    const body = await res.json() as { sessionId?: string };
    sessionId = body.sessionId ?? sessionId;
    if (!sessionId) throw new Error("eve_session_missing");
    const stream = await fetch(`${EVE}/eve/v1/session/${sessionId}/stream?startIndex=0`, {
      headers: { authorization: `Bearer ${jwt}` },
      signal: controller.signal,
    });
    if (!stream.ok || !stream.body) throw new Error(`eve_stream_${stream.status}`);
    reply = await readHandoffStream(stream.body, controller.signal, historyIds, message);
  } finally {
    clearTimeout(timer);
  }
  return { sessionId, reply };
}

async function deliverOne(handoff: HandoffRecord, claimToken: string): Promise<string> {
  if (handoff.depth > HANDOFF_DEPTH_MAX) throw new Error("handoff_depth_exceeded");
  const shell = readShell();
  const receiver = receiverOf(handoff, shell.bots);
  if (!receiver) throw new Error("receiver_missing");
  const { bot, kind } = receiver;
  if (bot.hidden) throw new Error("receiver_hidden");

  const { sessionId, reply } = await runEveTurn(bot, handoffEnvelope(handoff));

  // A stale takeover may have handed this record to another process; only the
  // token holder may write the transcript, or both would append a reply.
  if (!ownsHandoffClaim(handoff.id, claimToken)) throw new Error("claim_lost");
  // Transcript and shell row first, delivery marker last: a crash in between
  // leaves the record claimed/pending so the next pump retries, and the event
  // dedupe keeps the retry from appending a second copy.
  if (reply) {
    appendAgentEvent(bot.id, {
      kind: "assistant",
      threadKind: kind,
      sessionId,
      text: reply,
      authorBotId: handoff.targetBotId,
      authorName: handoff.targetName,
      handoffId: handoff.id,
    });
  }
  updateShell((current) => ({
    ...current,
    bots: current.bots.map((item) => (
      item.id === bot.id
        ? {
          ...item,
          sessionId,
          lastPreview: reply ? reply.slice(0, 160) : item.lastPreview,
          lastAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        : item
    )),
  }));
  markDelivered(handoff.id, reply, undefined, claimToken);
  return reply;
}

export function handoffsInFlight(): string[] {
  return [...inflight];
}

// Pumps are single-flight: the UI poll, wakePump and fan-out confirmations can
// all call this within the same second, and overlapping pumps would hold many
// eve deliveries open at once. Callers queue behind the pump in progress.
let pumpQueue: Promise<unknown> = Promise.resolve();

export function pumpHandoffs(limit = 2): Promise<{
  delivered: Array<{ id: string; to: string }>;
  failed: Array<{ id: string; error: string }>;
  queued: number;
}> {
  const run = pumpQueue.then(() => pumpOnce(limit), () => pumpOnce(limit));
  pumpQueue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Deliver queued handoffs, oldest first, one at a time. Concurrent calls are
 * deduped per handoff id and serialized by pumpHandoffs.
 */
async function pumpOnce(limit: number): Promise<{
  delivered: Array<{ id: string; to: string }>;
  failed: Array<{ id: string; error: string }>;
  queued: number;
}> {
  const delivered: Array<{ id: string; to: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const candidates = listDeliverable().filter((record) => !inflight.has(record.id));
  const batch = candidates.slice(0, limit);
  for (const record of batch) {
    // Cross-process claim: without it two web servers can both deliver the
    // same record and append two replies to the receiver transcript.
    const claimToken = claimHandoff(record.id);
    if (!claimToken) continue;
    inflight.add(record.id);
    try {
      await deliverOne(record, claimToken);
      delivered.push({ id: record.id, to: record.targetName });
    } catch (err) {
      const message = err instanceof Error ? err.message : "handoff_failed";
      if (message === "claim_lost") continue;
      const next = markFailed(record.id, message, undefined, claimToken);
      failed.push({
        id: record.id,
        error: next && next.status === "failed" && next.attempts >= HANDOFF_ATTEMPTS_MAX
          ? `gave up after ${next.attempts} tries: ${message}`
          : message,
      });
    } finally {
      inflight.delete(record.id);
      releaseHandoffClaim(record.id, claimToken);
    }
  }
  return { delivered, failed, queued: Math.max(0, candidates.length - batch.length) };
}

/**
 * Confirm a fan-out: one handoff per target. Every target gets a copy in its own
 * thread and the room gets one card showing the same message. Replies land back
 * in the group. A single-bot send is the same path with one target and no group.
 */
export function fanOut(input: {
  source: { id: string; name: string } | null;
  targets: Array<{ id: string; name: string }>;
  message: string;
  group?: { id: string; name: string } | null;
}): number {
  if (input.targets.length === 0) throw new Error("fanout_empty");
  const sourceBotId = input.source?.id ?? null;
  const sourceName = input.source?.name ?? "Useful Bot";
  let count = 0;
  for (const target of input.targets) {
    sendHandoff({
      source: input.source,
      target,
      message: input.message,
      group: input.group ?? null,
      // Explicit receiver: with a group set, the default would put every copy
      // in the room instead of in each member's own thread.
      receiver: target,
    });
    count += 1;
  }
  if (input.group) {
    appendAgentEvent(input.group.id, {
      kind: "post",
      threadKind: "group",
      text: input.message,
      authorBotId: sourceBotId,
      authorName: sourceName,
      targetBotIds: input.targets.map((target) => target.id),
    });
  }
  return count;
}

/**
 * Routine runs. A routine is owner-initiated work on a schedule, so it enters
 * the bot's own 1:1 chat as a turn at depth 0: a note saying which routine
 * fired, the instruction as the owner's message, and the bot's reply. Delivery
 * uses the same eve path as a handoff.
 */

const routinesInflight = new Set<string>();

export type RoutineRunResult = { routineId: string; sessionId: string; reply: string };

function runFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : "routine_failed";
  return message.slice(0, 300);
}

async function executeRoutine(
  routine: Routine,
  trigger: "schedule" | "manual",
): Promise<RoutineRunResult> {
  const shell = readShell();
  const bot = shell.bots.find((item) => item.id === routine.botId);
  if (!bot) throw new Error("routine_bot_missing");
  if (bot.hidden) throw new Error("routine_bot_hidden");
  const threadKind: ThreadKind = bot.kind === "group" ? "group" : "bot";
  // The note keeps the transcript honest: without it a scheduled turn reads as
  // something the owner typed.
  appendAgentEvent(bot.id, {
    kind: "note",
    threadKind,
    text: trigger === "manual"
      ? `Test run of routine "${routine.name}".`
      : `Routine "${routine.name}" ran.`,
  });
  // The instruction is stored verbatim and sent verbatim, so the live stream
  // echo pairs with this durable row instead of rendering a second bubble.
  appendAgentEvent(bot.id, {
    kind: "user",
    threadKind,
    sessionId: bot.sessionId ?? "",
    text: routine.instruction,
  });
  // Every path out of the turn leaves an outcome row. The claim has already
  // moved the anchor, so there is no retry: a turn that throws must say so in
  // the transcript instead of leaving the note and the instruction hanging
  // with nothing after them.
  let sessionId: string;
  let reply: string;
  try {
    ({ sessionId, reply } = await runEveTurn(bot, routine.instruction));
  } catch (err) {
    appendAgentEvent(bot.id, {
      kind: "note",
      threadKind,
      text: `Routine "${routine.name}" failed: ${err instanceof Error ? err.message : "routine_failed"}`.slice(0, 300),
    });
    throw err;
  }
  if (reply) {
    appendAgentEvent(bot.id, {
      kind: "assistant",
      threadKind,
      sessionId,
      text: reply,
    });
  }
  const stamp = new Date().toISOString();
  updateShell((current) => ({
    ...current,
    bots: current.bots.map((item) => (
      item.id === bot.id
        ? {
          ...item,
          sessionId,
          lastPreview: reply ? reply.slice(0, 160) : item.lastPreview,
          lastAt: stamp,
          updatedAt: stamp,
        }
        : item
    )),
  }));
  return { routineId: routine.id, sessionId, reply };
}

/**
 * Run one routine now, the way the pane's Test run button does. The scheduler
 * shares the in-flight set, so a manual run cannot overlap a scheduled one.
 */
export async function runRoutineNow(routineId: string): Promise<RoutineRunResult> {
  if (routinesInflight.has(routineId)) throw new Error("routine_busy");
  // Take the durable ticket, not just the local one: a request an agent tool
  // raised has to be consumed here, or the next tick claims it and runs the
  // same routine a second time.
  const claim = claimRunNow(routineId);
  if (!claim) throw new Error("routine_missing");
  const routine = claim.routine;
  routinesInflight.add(routine.id);
  try {
    const result = await executeRoutine(routine, "manual");
    appendRoutineRun(routine.id, { status: "ok", sessionId: result.sessionId });
    return result;
  } catch (err) {
    const error = runFailure(err);
    appendRoutineRun(routine.id, { status: "failed", error });
    throw err;
  } finally {
    routinesInflight.delete(routine.id);
  }
}

// Like the handoff pump: overlapping runs would hold several eve turns open at
// once, so callers queue behind the run in progress.
let routineQueue: Promise<unknown> = Promise.resolve();

export function pumpRoutines(limit = 2): Promise<{
  ran: Array<{ id: string; name: string }>;
  failed: Array<{ id: string; error: string }>;
}> {
  const run = routineQueue.then(() => pumpRoutinesOnce(limit), () => pumpRoutinesOnce(limit));
  routineQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function pumpRoutinesOnce(limit: number): Promise<{
  ran: Array<{ id: string; name: string }>;
  failed: Array<{ id: string; error: string }>;
}> {
  const ran: Array<{ id: string; name: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const now = new Date();
  const candidates = pendingRoutines(now).filter((routine) => !routinesInflight.has(routine.id));
  for (const candidate of candidates.slice(0, limit)) {
    // Both claims flip their marker inside the store lock, so a tick that raced
    // this one finds the request already taken or nothing due. A contended
    // lock is that race, not a fault in this routine: skip the candidate and
    // leave the rest of the batch alone rather than failing the whole pump.
    let manual: { routine: Routine } | null = null;
    let claim: { routine: Routine } | null = null;
    try {
      manual = claimManualRun(candidate.id);
      claim = manual ?? claimDueRoutine(candidate.id, now);
    } catch (err) {
      failed.push({ id: candidate.id, error: runFailure(err) });
      continue;
    }
    if (!claim) continue;
    routinesInflight.add(candidate.id);
    try {
      const result = await executeRoutine(claim.routine, manual ? "manual" : "schedule");
      appendRoutineRun(candidate.id, { status: "ok", sessionId: result.sessionId });
      ran.push({ id: candidate.id, name: claim.routine.name });
    } catch (err) {
      const error = runFailure(err);
      appendRoutineRun(candidate.id, { status: "failed", error });
      failed.push({ id: candidate.id, error });
    } finally {
      routinesInflight.delete(candidate.id);
    }
  }
  return { ran, failed };
}

export function routinesInFlight(): string[] {
  return [...routinesInflight];
}
