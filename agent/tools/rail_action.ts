import { defineTool } from "eve/tools";
import { z } from "zod";
import { readShell, updateShell } from "../../shared/shell-io.ts";
import { applyShellAction, DEFAULT_BOT_ID, type ShellAction } from "../../shared/shell-store.ts";

/**
 * The reversible rail actions the owner can take from a bot row. Nothing here
 * destroys anything: pin, hide and move can all be undone from the same tool or
 * the rail, so these write straight through instead of asking for approval.
 * Deleting a bot is not one of them; that is `deleteBot`.
 */
export default defineTool({
  description:
    "Organise the owner's sidebar: pin or unpin a bot, hide or unhide it, move it into a section, or create and rename sections. Every action here is reversible and applies immediately. Use it when the owner asks you to tidy the sidebar. Call listBots first for exact bot and section ids.",
  inputSchema: z.object({
    action: z.enum(["pin", "unpin", "hide", "unhide", "move", "createSection", "renameSection"]),
    botId: z.string().min(1).max(80).optional(),
    /** Target section for `move`, or the section to rename. Null unassigns. */
    sectionId: z.string().min(1).max(80).nullable().optional(),
    /** New name for `createSection` and `renameSection`. */
    name: z.string().min(1).max(80).optional(),
  }),
  execute(input) {
    const shell = readShell();
    const needsBot = input.action !== "createSection" && input.action !== "renameSection";
    let botId = "";
    if (needsBot) {
      const requested = input.botId?.trim() ?? "";
      if (!requested) return { status: "invalid", error: `${input.action} needs a botId` };
      const target = shell.bots.find((bot) => (
        bot.id === requested || bot.name.toLowerCase() === requested.toLowerCase()
      ));
      if (!target) {
        return { status: "not_found", error: `no bot matches ${requested}`, hint: "Call listBots for exact ids." };
      }
      botId = target.id;
    }

    let action: ShellAction;
    switch (input.action) {
      case "pin":
        action = { type: "pin", botId, pinned: true };
        break;
      case "unpin":
        action = { type: "pin", botId, pinned: false };
        break;
      case "hide":
        if (botId === DEFAULT_BOT_ID) {
          // The default bot answers untargeted group turns and owns the app's
          // own chat; hiding it also makes handoffs to it fail.
          return { status: "refused", error: "the default Useful Bot cannot be hidden" };
        }
        if (botId === (process.env.UB_ACTIVE_BOT_ID ?? shell.selectedBotId)) {
          // Hiding the chat the owner is standing in takes the thread they are
          // talking to off the rail mid-conversation. `delete_bot` refuses the
          // same move for the same reason.
          return { status: "refused", error: "that is this bot; the owner hides it from the rail" };
        }
        action = { type: "hide", botId, hidden: true };
        break;
      case "unhide":
        action = { type: "hide", botId, hidden: false };
        break;
      case "move": {
        const sectionId = input.sectionId ?? null;
        if (sectionId && !shell.sections.some((section) => section.id === sectionId)) {
          return {
            status: "not_found",
            error: `no section with id ${sectionId}`,
            hint: "Create it first with action createSection.",
          };
        }
        action = { type: "move", botId, sectionId };
        break;
      }
      case "createSection": {
        const name = input.name?.trim();
        if (!name) return { status: "invalid", error: "createSection needs a name" };
        action = { type: "createSection", name };
        break;
      }
      case "renameSection": {
        const name = input.name?.trim();
        const sectionId = input.sectionId ?? "";
        if (!name) return { status: "invalid", error: "renameSection needs a name" };
        if (!shell.sections.some((section) => section.id === sectionId)) {
          return { status: "not_found", error: `no section with id ${sectionId}` };
        }
        action = { type: "renameSection", sectionId, name };
        break;
      }
    }

    let createdId: string | undefined;
    updateShell((current) => {
      const result = applyShellAction(current, action);
      createdId = result.createdId;
      return result.store;
    });
    return {
      status: "applied",
      action: input.action,
      botId: botId || null,
      sectionId: createdId ?? input.sectionId ?? null,
    };
  },
});
