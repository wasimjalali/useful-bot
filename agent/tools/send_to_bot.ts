import { defineTool } from "eve/tools";
import { z } from "zod";
import { activeBotId } from "../lib/active-bot.ts";
import { sendHandoff } from "../../shared/agents-send.ts";
import { listThreadEvents, releaseSend, reserveSend } from "../../shared/agent-store.ts";
import { HANDOFF_DEPTH_MAX, readHandoff } from "../../shared/handoffs.ts";
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
  execute(input, ctx) {
    const shell = readShell();
    const requested = input.botId.trim();
    const exact = shell.bots.find((bot) => bot.id === requested) ?? null;
    const named = exact
      ? []
      : shell.bots.filter((bot) => (
        bot.name.toLowerCase() === requested.toLowerCase()
        || bot.label.toLowerCase() === requested.toLowerCase()
      ));
    if (named.length > 1) {
      return {
        status: "ambiguous",
        error: `several teammates match ${requested}; use an exact id`,
        matches: named.map((bot) => ({ id: bot.id, name: bot.name })),
      };
    }
    const target = exact ?? named[0] ?? null;
    if (!target) {
      return {
        status: "not_found",
        error: `no teammate matches ${requested}`,
        hint: "Call listBots for exact ids.",
      };
    }
    if (target.hidden) {
      return { status: "invalid", error: `${target.name} is hidden; it cannot receive a handoff` };
    }
    const sourceId = activeBotId(shell, ctx);
    if (target.id === sourceId) {
      return { status: "invalid", error: "that is this bot; answer directly instead" };
    }
    const source = shell.bots.find((bot) => bot.id === sourceId) ?? null;
    // A one-member group is still a group: the handoff carries the group so
    // the reply lands in the group thread instead of flipping its kind to a
    // plain bot chat.
    let handoffGroup: { id: string; name: string } | null = null;
    if (target.kind === "group") {
      const members = groupMembers(speakersFrom(shell.bots), target.memberIds);
      if (members.length === 0) {
        return { status: "invalid", error: "that group has no member bots" };
      }
      if (members.length > 1) {
        return {
          status: "needs_post_to_group",
          error: "groups need postToGroup so the owner confirms the fan-out",
          memberCount: members.length,
        };
      }
      handoffGroup = { id: target.id, name: target.name };
    }
    // Forwarding a handoff this bot just received increments the hop count; a
    // chain that bounces back and forth is refused rather than run forever.
    let depth = 0;
    const incoming = listThreadEvents(sourceId)
      .filter((event) => event.kind === "post" && event.handoffId)
      .at(-1);
    if (incoming?.handoffId) {
      const prior = readHandoff(incoming.handoffId);
      if (prior && prior.targetBotId === sourceId) depth = prior.depth + 1;
    }
    if (depth > HANDOFF_DEPTH_MAX) {
      return {
        status: "loop_refused",
        error: `handoff chain is ${depth} hops deep; answer in this chat instead`,
      };
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
        group: handoffGroup,
        message: input.message.trim(),
        depth,
      });
    } catch (err) {
      // sendHandoff only throws before the durable write; a queued record
      // reports a transcript miss on its return instead. A crash between
      // reserve and queue must not burn the requestId.
      if (requestId && !record) releaseSend("handoff", requestId);
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
