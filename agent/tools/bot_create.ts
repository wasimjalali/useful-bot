import { defineTool } from "eve/tools";
import { z } from "zod";
import { applyShellAction, selectedBot } from "../../shared/shell-store.ts";
import { readShell, writeShell } from "../../shared/shell-io.ts";

export default defineTool({
  description:
    "Create a specialist bot for the owner. Use this when they ask you to add, name, or staff a new bot. Give a short name and a clear instruction in description. A face is assigned automatically.",
  inputSchema: z.object({
    name: z.string().min(1).max(80),
    label: z.string().max(24).optional(),
    description: z.string().max(500).optional(),
  }),
  execute(input) {
    const created = applyShellAction(readShell(), {
      type: "createBot",
      name: input.name,
      label: input.label,
      description: input.description,
    });
    writeShell(created.store);
    const bot = selectedBot(created.store);
    return {
      id: bot.id,
      name: bot.name,
      label: bot.label,
      description: bot.description,
      avatarShape: bot.avatarShape,
      avatarColor: bot.avatarColor,
    };
  },
});
