import { createHmac } from "node:crypto";
import { appendAgentEvent, type ThreadKind } from "../../shared/agent-store.ts";
import { sendHandoff } from "../../shared/agents-send.ts";
import {
  listDeliverable,
  markDelivered,
  markFailed,
  HANDOFF_ATTEMPTS_MAX,
  type HandoffRecord,
} from "../../shared/handoffs.ts";
import { readShell, writeShell } from "../../shared/shell-io.ts";
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

type EveEvent = { type?: string; data?: Record<string, unknown> };

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

function channelJwt(): string | null {
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
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let done = false;
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
        if (event.type === "message.appended") {
          text += textField(event.data, "messageDelta");
        } else if (event.type === "message.completed") {
          const full = textField(event.data, "message");
          if (full) text = full;
        } else if (
          event.type === "turn.completed"
          || event.type === "turn.cancelled"
          || event.type === "turn.failed"
          || event.type === "session.failed"
          || event.type === "session.waiting"
        ) {
          done = true;
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  return text.trim();
}

function handoffEnvelope(handoff: HandoffRecord): string {
  const lines = [
    `Handoff from ${handoff.sourceName}.`,
    handoff.groupName ? `This belongs to the group chat ${handoff.groupName}.` : "This arrives in your own chat.",
    "Do the work and answer here. The owner reads this transcript.",
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

async function deliverOne(handoff: HandoffRecord): Promise<string> {
  const jwt = channelJwt();
  if (!jwt) throw new Error("channel_credential_missing");
  const shell = readShell();
  const receiver = receiverOf(handoff, shell.bots);
  if (!receiver) throw new Error("receiver_missing");
  const { bot, kind } = receiver;
  if (bot.hidden) throw new Error("receiver_hidden");

  const path = bot.sessionId ? `session/${bot.sessionId}` : "session";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVER_TIMEOUT_MS);
  let sessionId = bot.sessionId ?? "";
  let reply = "";
  try {
    const res = await fetch(`${EVE}/eve/v1/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ message: handoffEnvelope(handoff), botId: bot.id }),
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
    reply = await readHandoffStream(stream.body, controller.signal);
  } finally {
    clearTimeout(timer);
  }

  markDelivered(handoff.id, reply);
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
  const current = readShell();
  writeShell({
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
  });
  return reply;
}

export function handoffsInFlight(): string[] {
  return [...inflight];
}

/**
 * Deliver queued handoffs, oldest first, one at a time. Called by the UI poll
 * and by the agent tool that just queued one; concurrent calls are deduped per
 * handoff id so a fan-out is never delivered twice.
 */
export async function pumpHandoffs(limit = 2): Promise<{
  delivered: Array<{ id: string; to: string }>;
  failed: Array<{ id: string; error: string }>;
  queued: number;
}> {
  const delivered: Array<{ id: string; to: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const candidates = listDeliverable().filter((record) => !inflight.has(record.id));
  const batch = candidates.slice(0, limit);
  for (const record of batch) {
    inflight.add(record.id);
    try {
      await deliverOne(record);
      delivered.push({ id: record.id, to: record.targetName });
    } catch (err) {
      const message = err instanceof Error ? err.message : "handoff_failed";
      const next = markFailed(record.id, message);
      failed.push({
        id: record.id,
        error: next && next.status === "failed" && next.attempts >= HANDOFF_ATTEMPTS_MAX
          ? `gave up after ${next.attempts} tries: ${message}`
          : message,
      });
    } finally {
      inflight.delete(record.id);
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
