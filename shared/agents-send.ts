import { appendAgentEvent, type ThreadKind } from "./agent-store.ts";
import { queueHandoff, type HandoffRecord } from "./handoffs.ts";

/**
 * One bot messages one teammate. Both transcripts get a visible entry: the
 * sender side shows an outgoing handoff, the receiver side shows the message
 * queued for it. Delivery happens later (see web/lib/agent-exec.ts) so the
 * sender's turn never blocks on the receiver.
 */
export function sendHandoff(input: {
  source: { id: string; name: string } | null;
  target: { id: string; name: string };
  message: string;
  group?: { id: string; name: string } | null;
  /**
   * Where the visible "message received" entry goes. Defaults to the group so a
   * fan-out shows one card in the room plus one copy per member thread.
   */
  receiver?: { id: string; name: string } | null;
  /** Hop count; callers forwarding a received handoff increment it. */
  depth?: number;
}): HandoffRecord {
  const sourceId = input.source?.id ?? "bot-useful";
  const sourceName = input.source?.name ?? "Useful Bot";
  const receiver = input.receiver ?? input.group ?? input.target;
  const threadKind: ThreadKind = receiver.id === input.group?.id ? "group" : "bot";
  const record = queueHandoff({
    sourceBotId: sourceId,
    sourceName,
    targetBotId: input.target.id,
    targetName: input.target.name,
    groupId: input.group?.id ?? null,
    groupName: input.group?.name ?? null,
    threadKind,
    message: input.message,
    depth: input.depth,
  });
  appendAgentEvent(sourceId, {
    kind: "handoff",
    text: input.message,
    authorBotId: sourceId,
    authorName: sourceName,
    targetBotIds: [input.target.id],
    handoffId: record.id,
  });
  appendAgentEvent(receiver.id, {
    kind: "post",
    threadKind,
    text: input.message,
    authorBotId: sourceId,
    authorName: sourceName,
    targetBotIds: [input.target.id],
    handoffId: record.id,
  });
  wakePump();
  return record;
}

/**
 * Ask the web server to start delivering queued handoffs now. Best effort by
 * design: the UI poll drains the same queue, so a failed wake-up costs latency
 * only, and the tool never needs the channel credential to be present.
 */
function wakePump(): void {
  const base = process.env.UB_WEB_BASE_URL;
  const key = process.env.UB_CHANNEL_JWT ?? process.env.UB_CHANNEL_JWT_SECRET;
  if (!base || !key) return;
  try {
    void fetch(`${base}/api/agent/tick?limit=1`, {
      method: "POST",
      headers: { "x-ub-agent-key": key },
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  } catch {
    /* the UI poll picks the handoff up instead */
  }
}
