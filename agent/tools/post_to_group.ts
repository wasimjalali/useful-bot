import { defineTool } from "eve/tools";
import { z } from "zod";
import { appendAgentEvent, createProposal } from "../../shared/agent-store.ts";
import { readShell } from "../../shared/shell-io.ts";
import { DEFAULT_BOT_ID } from "../../shared/shell-store.ts";
import { groupMembers, speakersFrom } from "../../shared/threads.ts";

export default defineTool({
  description:
    "Post one message to a group chat. Every member bot receives it and the owner confirms the fan-out before anything is delivered, because this wakes several bots at once. Use it for kickoffs, status pushes and shared decisions. Confirm with the owner in chat first when the group is large.",
  inputSchema: z.object({
    groupId: z.string().min(1).max(80),
    message: z.string().min(1).max(2000),
  }),
  execute(input) {
    const shell = readShell();
    const requested = input.groupId.trim();
    const group = shell.bots.find((bot) => (
      bot.kind === "group"
      && (bot.id === requested || bot.name.toLowerCase() === requested.toLowerCase())
    )) ?? null;
    if (!group) {
      return { status: "not_found", error: `no group matches ${requested}`, hint: "Call listBots for groups." };
    }
    const members = groupMembers(speakersFrom(shell.bots), group.memberIds);
    if (members.length === 0) {
      return { status: "invalid", error: "that group has no member bots" };
    }
    const sourceId = process.env.UB_ACTIVE_BOT_ID ?? shell.selectedBotId;
    const source = shell.bots.find((bot) => bot.id === sourceId) ?? null;
    const sourceBotId = source && source.id !== DEFAULT_BOT_ID ? source.id : null;
    const message = input.message.trim();
    const proposal = createProposal({
      kind: "fanout",
      message,
      targetIds: members.map((member) => member.id),
      groupId: group.id,
      sourceBotId,
      threadId: group.id,
    });
    appendAgentEvent(group.id, {
      kind: "proposal",
      threadKind: "group",
      text: message,
      authorBotId: sourceBotId,
      authorName: source?.name ?? null,
      proposalId: proposal.id,
      targetBotIds: members.map((member) => member.id),
    });
    return {
      status: "awaiting_owner_confirmation",
      proposalId: proposal.id,
      group: { id: group.id, name: group.name },
      members: members.map((member) => ({ id: member.id, name: member.name })),
      note: "The owner sees a fan-out card in this group. Nothing is delivered until they confirm.",
    };
  },
});
