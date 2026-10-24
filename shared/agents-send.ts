import { appendAgentEvent } from "./agent-store.ts";
import type { HandoffRecord } from "./handoffs.ts";

/**
 * After the receiver answers a queued handoff (today only a connect card's
 * resume), its transcript gets the reply as an assistant turn, or a note when
 * the turn ended with no text. The queue is drained by web/lib/agent-exec.ts.
 */
export function writeHandoffReply(input: {
  handoff: HandoffRecord;
  reply: string;
  sessionId: string;
  receiverId: string;
}): void {
  if (!input.reply) {
    appendAgentEvent(input.receiverId, {
      kind: "note",
      sessionId: input.sessionId,
      text: `${input.handoff.targetName} finished with no reply.`,
      authorBotId: input.handoff.targetBotId,
      authorName: input.handoff.targetName,
      handoffId: input.handoff.id,
    });
    return;
  }
  appendAgentEvent(input.receiverId, {
    kind: "assistant",
    sessionId: input.sessionId,
    text: input.reply,
    authorBotId: input.handoff.targetBotId,
    authorName: input.handoff.targetName,
    handoffId: input.handoff.id,
  });
}
