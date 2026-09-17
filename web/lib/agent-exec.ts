import { createHmac } from "node:crypto";
import {
  appendAgentEvent,
  referencedWidgetIds,
  sweepOrphanThreads,
  type ThreadKind,
} from "../../shared/agent-store.ts";
import { sweepOrphanWidgets } from "../../shared/widgets-store.ts";
import { parseEveStreamLine } from "../../shared/eve-stream.ts";
import { relayedEveCode } from "../../shared/eve-proxy.ts";
import { sendHandoff, writeHandoffReply } from "../../shared/agents-send.ts";
import {
  claimHandoff,
  listDeliverable,
  markDelivered,
  markFailed,
  ownsHandoffClaim,
  readHandoff,
  releaseHandoffClaim,
  HANDOFF_ATTEMPTS_MAX,
  HANDOFF_DEPTH_MAX,
  type HandoffRecord,
} from "../../shared/handoffs.ts";
import {
  appendRoutineRun,
  claimDueRoutine,
  readRoutine,
  claimManualRun,
  claimRunNow,
  pendingRoutines,
  sweepOrphanRoutines,
  type Routine,
  type RoutineRunStatus,
} from "../../shared/routines-store.ts";
import { peekShell, readShell, shellWasReseeded, updateShell } from "../../shared/shell-io.ts";
import { groupMembers, speakersFrom, threadPrefix } from "../../shared/threads.ts";
import { removeSessionGrant, upsertSessionGrant } from "../../shared/workspace-store.ts";
import type { ShellBot } from "../../shared/shell-store.ts";

/**
 * Handoff delivery. The sending agent tool only writes a queue record, so a
 * bot-to-bot message never blocks the sender's turn. The web server drains that
 * queue: it opens (or reuses) the receiving bot's eve session, waits for the
 * reply, and appends the result to the receiving transcript.
 */

const EVE = "http://127.0.0.1:4321";
const DELIVER_TIMEOUT_MS = 120_000;

/**
 * Stamp — or revoke — the workspace grant a turn's tools will read. Called
 * from the eve proxy and from server-driven turns: the agent process
 * resolves the grant per session, so it must be current before the turn
 * reaches eve. A bot whose folder was detached revokes the grant here, so
 * capability never outlives the owner's decision.
 */
export function syncSessionWorkspace(sessionId: string, bot: ShellBot): void {
  if (!sessionId) return;
  // Always stamped: the permission is the bot's whether or not a folder is
  // attached. No folder means the bot works under the owner's home.
  upsertSessionGrant({
    sessionId,
    path: bot.workspace?.path ?? null,
    permission: bot.permission,
  });
}

/**
 * Stamp from the roster as it is right now, not from a snapshot taken before
 * an await. `runEveTurn` reads the shell, then spends up to twenty seconds
 * replaying the session stream; stamping the pre-await bot in that window
 * resurrects a grant the owner detached while it ran. A bot that has since
 * disappeared revokes rather than keeps its old capability.
 */
function syncSessionWorkspaceFresh(sessionId: string, botId: string): void {
  if (!sessionId) return;
  try {
    let bot: ShellBot | undefined;
    try {
      bot = readShell().bots.find((item) => item.id === botId);
    } catch {
      // An unreadable roster is not permission to keep the grant.
      removeSessionGrant(sessionId);
      return;
    }
    if (!bot) {
      removeSessionGrant(sessionId);
      return;
    }
    syncSessionWorkspace(sessionId, bot);
  } catch (err) {
    // A contended grants store must not surface as a raw lock code in a
    // routine's transcript note. The turn does not start: running it against a
    // grant this process could not make current is the thing to avoid.
    throw new Error("workspace_unavailable", { cause: err });
  }
}

/**
 * Pump state, one copy per PROCESS rather than per module instance. The Next
 * dev server gives each API route its own copy of this module, so plain
 * module-level sets were not shared: a Test run (the run route) marked a
 * routine in flight in a set the tick route never saw. The rail showed that bot
 * as idle, and the in-memory mutex between a manual run and the scheduler did
 * not hold across the two routes (the durable store claim was the only guard).
 * Found live on 2026-09-17: five routines running, tick reported none.
 */
interface PumpState {
  inflight: Set<string>;
  routinesInflight: Set<string>;
  pumpQueue: Promise<unknown>;
  routineQueue: Promise<unknown>;
}
const PUMP_STATE_KEY = Symbol.for("useful-bot.agent-exec.pump-state");
const pumpState: PumpState = ((globalThis as Record<symbol, unknown>)[PUMP_STATE_KEY] ??= {
  inflight: new Set<string>(),
  routinesInflight: new Set<string>(),
  pumpQueue: Promise.resolve(),
  routineQueue: Promise.resolve(),
}) as PumpState;

const inflight = pumpState.inflight;

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

// A token signed from the channel secret, cached until it nears expiry. The
// web process is long-lived and service.mjs bakes a 12-hour token into the
// env at boot, so a process that only ever returned UB_CHANNEL_JWT would 401
// against eve after 12 hours until the next restart.
let signedChannelJwt: { secret: string; token: string; exp: number } | null = null;

export function channelJwt(): string | null {
  const secret = process.env.UB_CHANNEL_JWT_SECRET;
  if (!secret) return process.env.UB_CHANNEL_JWT ?? null;
  try {
    const now = Math.floor(Date.now() / 1000);
    // Re-sign once the cached token is within an hour of its exp, or when the
    // secret itself changed; signing is cheap but there is no reason to do it
    // on every proxy request.
    if (!signedChannelJwt || signedChannelJwt.secret !== secret || now >= signedChannelJwt.exp - 60 * 60) {
      const token = signChannelJwt(secret, "desktop-app");
      signedChannelJwt = { secret, token, exp: now + 12 * 60 * 60 };
      return token;
    }
    return signedChannelJwt.token;
  } catch {
    return process.env.UB_CHANNEL_JWT ?? null;
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
    "Do the work and answer here. Your reply is returned to the sender and the owner reads both transcripts.",
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
 * The identity prefix the eve proxy puts on a UI turn for this bot. Handoff
 * delivery and routine runs reach eve directly, not through the proxy, so
 * without it a teammate bot would answer as the default Useful Bot unless the
 * session already carried a prefix from an earlier owner turn.
 */
function turnPrefixFor(bot: ShellBot): string {
  // Only a group needs the roster: its member list is part of the prefix. A
  // roster that will not read must not fail the turn, which never needed it
  // before; the group then speaks without its member list.
  let members: ReturnType<typeof groupMembers> = [];
  if (bot.kind === "group") {
    try {
      members = groupMembers(speakersFrom(readShell().bots), bot.memberIds);
    } catch {
      members = [];
    }
  }
  return threadPrefix({
    bot: { id: bot.id, kind: bot.kind, name: bot.name, label: bot.label, description: bot.description },
    members,
  });
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
  // The body the proxy would have built for this bot: identity prefix first,
  // then the caller's text. readHandoffStream arms on this exact string,
  // because eve echoes the turn as it was stored.
  const sent = `${turnPrefixFor(bot)}${message}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVER_TIMEOUT_MS);
  let sessionId = bot.sessionId ?? "";
  let reply = "";
  try {
    let historyIds = sessionId ? await sessionEventIds(sessionId, jwt) : new Set<string>();
    if (sessionId) syncSessionWorkspaceFresh(sessionId, bot.id);
    const res = await fetch(`${EVE}/eve/v1/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ message: sent, botId: bot.id }),
      signal: controller.signal,
    });
    if (!res.ok && res.status === 409 && sessionId) {
      // eve retired the stored session (a failed turn ends it for good), so
      // drop the pointer and start a fresh one with this same message, the
      // way the UI clients recover.
      const text = await res.text().catch(() => "");
      if (relayedEveCode(409, text) === "session_not_active") {
        const retry = await fetch(`${EVE}/eve/v1/session`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ message: sent, botId: bot.id }),
          signal: controller.signal,
        });
        if (!retry.ok) throw new Error(`eve_send_${retry.status}`);
        const retryBody = await retry.json() as { sessionId?: string };
        sessionId = retryBody.sessionId ?? "";
        if (!sessionId) throw new Error("eve_session_missing");
        // Persist the fresh pointer now, so a crash before the reply still
        // leaves later handoffs and routines on the live session.
        const stamp = new Date().toISOString();
        updateShell((current) => ({
          ...current,
          bots: current.bots.map((item) => (
            item.id === bot.id
              ? { ...item, sessionId, lastAt: stamp, updatedAt: stamp }
              : item
          )),
        }));
        historyIds = new Set<string>();
        syncSessionWorkspaceFresh(sessionId, bot.id);
        const stream = await fetch(`${EVE}/eve/v1/session/${sessionId}/stream?startIndex=0`, {
          headers: { authorization: `Bearer ${jwt}` },
          signal: controller.signal,
        });
        if (!stream.ok || !stream.body) throw new Error(`eve_stream_${stream.status}`);
        reply = await readHandoffStream(stream.body, controller.signal, historyIds, sent);
        return { sessionId, reply };
      }
      throw new Error(`eve_send_${res.status}`);
    }
    if (!res.ok) throw new Error(`eve_send_${res.status}`);
    const body = await res.json() as { sessionId?: string };
    sessionId = body.sessionId ?? sessionId;
    if (!sessionId) throw new Error("eve_session_missing");
    syncSessionWorkspaceFresh(sessionId, bot.id);
    const stream = await fetch(`${EVE}/eve/v1/session/${sessionId}/stream?startIndex=0`, {
      headers: { authorization: `Bearer ${jwt}` },
      signal: controller.signal,
    });
    if (!stream.ok || !stream.body) throw new Error(`eve_stream_${stream.status}`);
    reply = await readHandoffStream(stream.body, controller.signal, historyIds, sent);
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
  const sender = shell.bots.find((item) => item.id === handoff.sourceBotId);
  writeHandoffReply({
    handoff,
    reply,
    sessionId,
    receiverId: bot.id,
    threadKind: kind,
    sourceThreadKind: sender?.kind === "group" ? "group" : "bot",
  });
  const stamp = new Date().toISOString();
  const preview = reply ? reply.slice(0, 160) : "";
  updateShell((current) => ({
    ...current,
    bots: current.bots.map((item) => {
      if (item.id === bot.id) {
        return {
          ...item,
          sessionId,
          lastPreview: preview || item.lastPreview,
          lastAt: stamp,
          updatedAt: stamp,
        };
      }
      if (preview && item.id === handoff.sourceBotId) {
        return { ...item, lastPreview: preview, lastAt: stamp, updatedAt: stamp };
      }
      return item;
    }),
  }));
  markDelivered(handoff.id, reply, undefined, claimToken);
  return reply;
}

export function handoffsInFlight(): string[] {
  return [...inflight];
}

/** Bot ids currently receiving a handoff, for the rail working pulse. */
export function handoffWorkingBotIds(): string[] {
  const ids = new Set<string>();
  for (const id of inflight) {
    const record = readHandoff(id);
    if (!record) continue;
    // A group handoff runs on the room, not on the member it names. Same
    // fallback as the delivery: a room that is gone means the member runs it.
    const bots = peekShell()?.bots ?? [];
    ids.add(receiverOf(record, bots)?.bot.id ?? record.targetBotId);
  }
  return [...ids];
}

// Pumps are single-flight: the UI poll, wakePump and fan-out confirmations can
// all call this within the same second, and overlapping pumps would hold many
// eve deliveries open at once. Callers queue behind the pump in progress.
// Inside one pump the batch runs together, one delivery per receiving bot: the
// router takes ten model calls at once now, and a two minute turn on one bot
// must not hold up a handoff to another. The batch size is the bound on how
// many eve deliveries this pump holds open (the tick caps it at four).

export function pumpHandoffs(limit = 2): Promise<{
  delivered: Array<{ id: string; to: string }>;
  failed: Array<{ id: string; error: string }>;
  queued: number;
}> {
  const run = pumpState.pumpQueue.then(() => pumpOnce(limit), () => pumpOnce(limit));
  pumpState.pumpQueue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Deliver queued handoffs, oldest first, at most one per receiving bot at a
 * time: eve runs one turn per session, so a second handoff to a bot that is
 * already receiving one waits for the next pump. Concurrent calls are deduped
 * per handoff id and serialized by pumpHandoffs.
 */
async function pumpOnce(limit: number): Promise<{
  delivered: Array<{ id: string; to: string }>;
  failed: Array<{ id: string; error: string }>;
  queued: number;
}> {
  const delivered: Array<{ id: string; to: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const candidates = listDeliverable().filter((record) => !inflight.has(record.id));
  const bots = peekShell()?.bots ?? [];
  const receivers = new Set<string>();
  const batch: HandoffRecord[] = [];
  for (const record of candidates) {
    if (batch.length >= limit) break;
    const receiver = receiverOf(record, bots)?.bot.id ?? record.targetBotId;
    if (receivers.has(receiver)) continue;
    receivers.add(receiver);
    batch.push(record);
  }
  await Promise.all(batch.map(async (record) => {
    // Cross-process claim: without it two web servers can both deliver the
    // same record and append two replies to the receiver transcript.
    const claimToken = claimHandoff(record.id);
    if (!claimToken) return;
    inflight.add(record.id);
    try {
      await deliverOne(record, claimToken);
      delivered.push({ id: record.id, to: record.targetName });
    } catch (err) {
      const message = err instanceof Error ? err.message : "handoff_failed";
      if (message === "claim_lost") return;
      const next = markFailed(record.id, message, undefined, claimToken);
      const terminal = next && next.status === "failed" && next.attempts >= HANDOFF_ATTEMPTS_MAX;
      if (terminal) {
        // The sender card still reads as a normal outgoing handoff, so say
        // here that delivery gave up, the way a failed routine run does.
        try {
          let threadKind: ThreadKind = "bot";
          try {
            const sender = readShell().bots.find((item) => item.id === record.sourceBotId);
            if (sender?.kind === "group") threadKind = "group";
          } catch {
            /* unreadable roster keeps the default kind */
          }
          appendAgentEvent(record.sourceBotId, {
            kind: "note",
            threadKind,
            text: `Handoff to ${record.targetName} failed: ${message}`.slice(0, 300),
          });
        } catch {
          /* the failed status still records the outcome */
        }
      }
      failed.push({
        id: record.id,
        error: terminal
          ? `gave up after ${next?.attempts} tries: ${message}`
          : message,
      });
    } finally {
      inflight.delete(record.id);
      releaseHandoffClaim(record.id, claimToken);
    }
  }));
  return { delivered, failed, queued: Math.max(0, candidates.length - batch.length) };
}

/**
 * Confirm a fan-out: one handoff per target. Every target gets a copy in its own
 * thread and the room gets one card showing the same message. Replies land back
 * in the group. A single-bot send is the same path with one target and no group.
 */
/**
 * Hand a newly created bot the first brief its proposal card carried, as a
 * message from the bot that proposed it.
 *
 * Without this the brief was only ever shown on the card: the owner approved
 * it, the bot was created idle, and the work stayed in the proposer's chat.
 * Returns the number of handoffs queued, so a card with no brief and a
 * creation that did not happen both read as zero.
 */
export function deliverFirstBrief(input: {
  brief: string;
  createdBotId: string | undefined;
  sourceBotId: string | null;
  bots: ShellBot[];
}): number {
  const brief = input.brief.trim();
  if (!brief || !input.createdBotId) return 0;
  const target = input.bots.find((bot) => bot.id === input.createdBotId);
  // A group is never created by a createBot card, and a bot that is already
  // gone cannot be briefed.
  if (!target || target.kind === "group") return 0;
  const source = input.sourceBotId
    ? input.bots.find((bot) => bot.id === input.sourceBotId) ?? null
    : null;
  return fanOut({
    source: source ? { id: source.id, name: source.name } : null,
    targets: [{ id: target.id, name: target.name }],
    message: brief,
  });
}

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

const routinesInflight = pumpState.routinesInflight;

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
  // These two go in before the turn so the live stream echo pairs with the
  // durable row rather than rendering a second bubble. If the agent store
  // itself will not open, there is no transcript to leave hanging and no point
  // spending an eve turn nobody will see, so that fails the run outright.
  try {
    // The note keeps the transcript honest: without it a scheduled turn reads
    // as something the owner typed.
    appendAgentEvent(bot.id, {
      kind: "note",
      threadKind,
      text: trigger === "manual"
        ? `Test run of routine "${routine.name}".`
        : `Routine "${routine.name}" ran.`,
    });
    // The instruction is stored verbatim; the bot's identity prefix is added
    // on the way to eve (see runEveTurn).
    appendAgentEvent(bot.id, {
      kind: "user",
      threadKind,
      sessionId: bot.sessionId ?? "",
      text: routine.instruction,
    });
  } catch (err) {
    // The note can land and the instruction fail, which leaves the same
    // dangling row this whole path exists to avoid. Say so where it shows.
    try {
      appendAgentEvent(bot.id, {
        kind: "note",
        threadKind,
        text: `Routine "${routine.name}" could not start: the transcript was unavailable.`,
      });
    } catch {
      /* the store is what failed; the run history still records it */
    }
    throw new Error(`routine_transcript_unavailable: ${err instanceof Error ? err.message : "unknown"}`);
  }
  // Every path out of the turn leaves an outcome row. The claim has already
  // moved the anchor, so there is no retry: a turn that throws must say so in
  // the transcript instead of leaving the note and the instruction hanging
  // with nothing after them.
  let sessionId: string;
  let reply: string;
  try {
    ({ sessionId, reply } = await runEveTurn(bot, routine.instruction));
  } catch (err) {
    // Best effort, like the pre-append note: a locked store must not become
    // the error the caller sees in place of whatever eve actually did.
    try {
      appendAgentEvent(bot.id, {
        kind: "note",
        threadKind,
        text: `Routine "${routine.name}" failed: ${err instanceof Error ? err.message : "routine_failed"}`.slice(0, 300),
      });
    } catch { /* the run history still records the failure */ }
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
 * Claim a manual run synchronously, then start the turn. The Test run route
 * needs the claim settled before it answers, so it calls this and maps a sync
 * throw (routine_busy, routine_missing, routines_locked) to a status; a run
 * told "started" but whose claim failed would leave no history row anywhere.
 * The scheduler shares the in-flight set, so a manual run cannot overlap a
 * scheduled one.
 */
export function startRoutineNow(routineId: string): Promise<RoutineRunResult> {
  if (routinesInflight.has(routineId)) throw new Error("routine_busy");
  // Claimed before anything can yield. The pump re-reads this set immediately
  // before its own claim, and both paths run to their `add` without an await,
  // so the single-threaded runtime makes this an actual mutex: a Test run and
  // a tick can no longer hold two eve turns open on one routine.
  routinesInflight.add(routineId);
  let routine: Routine;
  try {
    // Take the durable ticket too: a request an agent tool raised has to be
    // consumed here, or the next tick claims it and runs this a second time.
    const claim = claimRunNow(routineId);
    if (!claim) throw new Error("routine_missing");
    routine = claim.routine;
  } catch (err) {
    routinesInflight.delete(routineId);
    throw err;
  }
  return runClaimedRoutine(routine);
}

/**
 * Run a routine whose in-flight and store claims are already taken, and leave
 * an outcome row whatever the turn does. Shared by both manual-run entries.
 */
async function runClaimedRoutine(routine: Routine): Promise<RoutineRunResult> {
  try {
    const result = await executeRoutine(routine, "manual");
    recordRun(routine.id, { status: "ok", sessionId: result.sessionId });
    return result;
  } catch (err) {
    recordRun(routine.id, { status: "failed", error: runFailure(err) });
    throw err;
  } finally {
    routinesInflight.delete(routine.id);
  }
}

/**
 * Run one routine now, the way the pane's Test run button does. Kept for any
 * caller that wants the old rejected-promise shape for a failed claim.
 */
export async function runRoutineNow(routineId: string): Promise<RoutineRunResult> {
  return startRoutineNow(routineId);
}

/**
 * Write one run-history row. The store can be locked, and that must not become
 * the error the caller sees: losing the history line is a smaller loss than
 * replacing a real eve failure with `routines_locked`, or than aborting a pump
 * batch that still has candidates to get through.
 */
function recordRun(
  id: string,
  run: { status: RoutineRunStatus; sessionId?: string | null; error?: string },
): void {
  try {
    appendRoutineRun(id, run);
  } catch (err) {
    // The pane polls run history, so a lost row is invisible there. Say it
    // here rather than nowhere.
    console.warn(`[useful-bot] routine ${id} ran but its history row was lost:`, err);
  }
}

// Like the handoff pump: single-flight across calls, and inside one pump the
// batch runs together, one routine per bot, so two bots' routines due in the
// same minute no longer run back to back.

export type RoutinePumpResult = {
  ran: Array<{ id: string; name: string }>;
  failed: Array<{ id: string; error: string }>;
  /** Candidates a contended store lock made someone else's turn this tick. */
  skipped: Array<{ id: string; reason: string }>;
};

export function pumpRoutines(limit = 2): Promise<RoutinePumpResult> {
  const run = pumpState.routineQueue.then(() => pumpRoutinesOnce(limit), () => pumpRoutinesOnce(limit));
  pumpState.routineQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function pumpRoutinesOnce(limit: number): Promise<RoutinePumpResult> {
  const ran: Array<{ id: string; name: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const now = new Date();
  const candidates = pendingRoutines(now).filter((routine) => !routinesInflight.has(routine.id));
  // One per bot: a routine is a turn in the bot's own chat, and eve runs one
  // turn per session. A bot's second due routine waits for the next pump.
  const owners = new Set<string>();
  const batch: Routine[] = [];
  for (const candidate of candidates) {
    if (batch.length >= limit) break;
    if (owners.has(candidate.botId)) continue;
    owners.add(candidate.botId);
    batch.push(candidate);
  }
  // Everything up to `routinesInflight.add` below runs without an await, so
  // each callback reaches its claim before any of them yields: the mutex with
  // startRoutineNow holds exactly as it did in the sequential loop.
  await Promise.all(batch.map(async (candidate) => {
    // Re-checked here, not only when the list was built: a Test run can have
    // started on this routine since, and it marks the set before it yields.
    if (routinesInflight.has(candidate.id)) return;
    // Both claims flip their marker inside the store lock, so a tick that raced
    // this one finds the request already taken or nothing due. A contended
    // lock is that race, not a fault in this routine: skip the candidate and
    // leave the rest of the batch alone. It is not a failed run either, so it
    // does not go in `failed`, where it would read as the routine misbehaving.
    let manual: { routine: Routine } | null = null;
    let claim: { routine: Routine } | null = null;
    try {
      manual = claimManualRun(candidate.id);
      claim = manual ?? claimDueRoutine(candidate.id, now);
    } catch (err) {
      const error = runFailure(err);
      if (error === "routines_locked") {
        skipped.push({ id: candidate.id, reason: error });
      } else {
        failed.push({ id: candidate.id, error });
      }
      return;
    }
    if (!claim) return;
    routinesInflight.add(candidate.id);
    try {
      const result = await executeRoutine(claim.routine, manual ? "manual" : "schedule");
      recordRun(candidate.id, { status: "ok", sessionId: result.sessionId });
      ran.push({ id: candidate.id, name: claim.routine.name });
    } catch (err) {
      const error = runFailure(err);
      recordRun(candidate.id, { status: "failed", error });
      failed.push({ id: candidate.id, error });
    } finally {
      routinesInflight.delete(candidate.id);
    }
  }));
  return { ran, failed, skipped };
}

/**
 * Drop routines and transcripts belonging to bots the roster no longer has.
 * Deleting a bot sweeps its own, but the roster, the routines and the agent
 * store have three separate locks: a delete that failed between them, or a
 * routine created for a bot deleted in the same moment, leaves work nothing
 * can ever complete. The tick calls this, which makes that state temporary.
 *
 * Returns the routine ids it dropped.
 */
export function sweepOrphanState(): string[] {
  try {
    // `peekShell`, never `readShell`. A roster this process could not parse is
    // reseeded by `readShell` to a single default bot, and sweeping against
    // that would read every other bot's routines and transcripts as orphans
    // and delete all of them. No roster means no sweep, and neither does a
    // roster another process already replaced with that stub: a reseed leaves
    // valid JSON, so only the marker can tell the two apart.
    if (shellWasReseeded()) return [];
    const shell = peekShell();
    if (!shell) return [];
    const live = shell.bots.map((bot) => bot.id);
    const routines = sweepOrphanRoutines(live);
    sweepOrphanThreads(live);
    // After the threads, so what is left naming a widget is all of it. A
    // cleared chat used to take its events and leave the drawings behind, and
    // nothing else ever removed one: the directory only grew.
    //
    // A null keep set means the store would not parse. Sweeping on that would
    // read every drawing on the machine as an orphan, so this tick does not
    // sweep at all.
    const referenced = referencedWidgetIds();
    if (referenced) sweepOrphanWidgets(referenced);
    return routines;
  } catch {
    // A locked or unreadable store is the next tick's problem, never this
    // tick's failure: the sweep is maintenance, not the work.
    return [];
  }
}

export function routinesInFlight(): string[] {
  return [...routinesInflight];
}

/**
 * Every bot doing background work, for the rail's working row: the receivers
 * of in-flight handoffs plus the bots whose routine is running. The routine
 * half was missing, so a bot working through a routine looked idle in the rail
 * until its reply landed. With several bots running at once that is the state
 * the owner most needs to see.
 */
export function backgroundWorkingBotIds(): string[] {
  const ids = new Set(handoffWorkingBotIds());
  for (const routineId of routinesInflight) {
    // A routine deleted mid-run has no row to read; its turn still ends on its
    // own and the set clears then.
    const routine = readRoutine(routineId);
    if (routine) ids.add(routine.botId);
  }
  return [...ids];
}
