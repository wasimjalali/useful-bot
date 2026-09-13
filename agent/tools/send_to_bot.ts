import { defineTool } from "eve/tools";
import { z } from "zod";
import { sendHandoff } from "../../shared/agents-send.ts";
import { releaseSend, reserveSend } from "../../shared/agent-store.ts";
import { readShell } from "../../shared/shell-io.ts";
import { DEFAULT_BOT_ID } from "../../shared/shell-store.ts";
import { groupMembers, speakersFrom } from "../../shared/threads.ts";

export default defineTool({
  description:
    "Hand a task to one teammate bot and keep working. The teammate picks it up asynchronously and the owner sees the handoff in both transcripts. Use it when another bot owns the deliverable or should review your work. One recipient only: use postToGroup for several at once, which asks the owner first. Expect the reply to land in the target bot's chat.",
  inputSchema: z.object({
    botId: z.string().min(1).max(80),
    message: z.string().min(1).max(4000),
    requestId: z.string().min(1).max(120).optional(),
  }),
  execute(input) {
    const shell = readShell();
    const requested = input.botId.trim();
    const target = shell.bots.find((bot) => (
      bot.id === requested
      || bot.name.toLowerCase() === requested.toLowerCase()
      || bot.label.toLowerCase() === requested.toLowerCase()
    )) ?? null;
    if (!target) {
      return {
        status: "not_found",
        error: `no teammate matches ${requested}`,
        hint: "Call listBots for exact ids.",
      };
    }
    const sourceId = process.env.UB_ACTIVE_BOT_ID ?? shell.selectedBotId;
    if (target.id === sourceId) {
      return { status: "invalid", error: "that is this bot; answer directly instead" };
    }
    const source = shell.bots.find((bot) => bot.id === sourceId) ?? null;
    if (target.kind === "group") {
      const members = groupMembers(speakersFrom(shell.bots), target.memberIds);
      if (members.length > 1) {
        return {
          status: "needs_post_to_group",
          error: "groups need postToGroup so the owner confirms the fan-out",
          memberCount: members.length,
        };
      }
    }
    const requestId = input.requestId?.trim();
    if (requestId && !reserveSend("handoff", requestId)) {
      return { status: "duplicate", error: "that requestId was already sent", requestId };
    }
    let record;
    try {
      record = sendHandoff({
        source: source && source.id !== DEFAULT_BOT_ID ? { id: source.id, name: source.name } : null,
        target: { id: target.id, name: target.name },
        message: input.message.trim(),
      });
    } catch (err) {
      // A crash between reserve and queue must not burn the requestId.
      if (requestId) releaseSend("handoff", requestId);
      throw err;
    }
    return {
      status: "queued",
      handoffId: record.id,
      to: { id: target.id, name: target.name },
      note: "The teammate runs on its own and answers in its own chat. The owner sees this handoff.",
    };
  },
});
