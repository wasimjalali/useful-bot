import { defineTool } from "eve/tools";
import { z } from "zod";
import { appendAgentEvent, createProposal, nextPetname, threadIdFor } from "../../shared/agent-store.ts";
import { readShell } from "../../shared/shell-io.ts";
import { DEFAULT_BOT_ID } from "../../shared/shell-store.ts";

export default defineTool({
  description:
    "Propose a new teammate bot to the owner. Use this when a job needs a long-lived owner. It writes a profile card the owner must confirm in the chat before the bot exists. Name it for the job, and put standing rules and boundaries in description. Confirm once with the owner before proposing several bots. This tool never creates the bot by itself.",
  inputSchema: z.object({
    name: z.string().min(1).max(80),
    title: z.string().max(24).optional(),
    description: z.string().max(500).optional(),
    brief: z.string().max(1000).optional(),
  }),
  execute(input) {
    const shell = readShell();
    const source = shell.bots.find((bot) => bot.id === process.env.UB_ACTIVE_BOT_ID);
    const sourceBotId = source && source.id !== DEFAULT_BOT_ID ? source.id : shell.selectedBotId;
    const threadId = threadIdFor(sourceBotId);
    const proposal = createProposal({
      kind: "createBot",
      name: input.name.trim(),
      petname: nextPetname(shell),
      title: (input.title ?? "").trim(),
      description: (input.description ?? "").trim(),
      sectionId: null,
      sourceBotId,
      threadId,
      brief: (input.brief ?? "").trim(),
    });
    appendAgentEvent(sourceBotId, {
      kind: "proposal",
      text: `Proposed teammate ${proposal.name}`,
      proposalId: proposal.id,
      authorBotId: sourceBotId,
      authorName: source?.name ?? null,
    });
    return {
      status: "awaiting_owner_confirmation",
      proposalId: proposal.id,
      name: proposal.name,
      title: proposal.title,
      description: proposal.description,
      note: "The owner sees a profile card in this chat. Do not claim the bot exists until they confirm.",
    };
  },
});
