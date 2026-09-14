import { defineTool } from "eve/tools";
import { z } from "zod";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";
import { deleteRoutinesForBot } from "../../shared/routines-store.ts";
import { readShell, updateShell } from "../../shared/shell-io.ts";
import { applyShellAction, DEFAULT_BOT_ID } from "../../shared/shell-store.ts";

export default defineTool({
  description:
    "Delete a teammate bot or group chat when the owner asks for it. The owner sees an approval card and nothing is removed until they approve it. This also removes that bot's routines and recent chats, and it cannot be undone, so confirm which bot they mean before calling it.",
  inputSchema: z.object({
    botId: z.string().min(1).max(80),
    reason: z.string().max(300).optional(),
  }),
  async execute(input, ctx) {
    const shell = readShell();
    const requested = input.botId.trim();
    const target = shell.bots.find((bot) => (
      bot.id === requested || bot.name.toLowerCase() === requested.toLowerCase()
    )) ?? null;
    if (!target) {
      return { status: "not_found", error: `no bot matches ${requested}`, hint: "Call listBots for exact ids." };
    }
    if (target.id === DEFAULT_BOT_ID) {
      return { status: "refused", error: "the default Useful Bot runs this app and cannot be deleted" };
    }
    const activeBotId = process.env.UB_ACTIVE_BOT_ID ?? shell.selectedBotId;
    if (target.id === activeBotId) {
      return { status: "refused", error: "that is this bot; the owner deletes it from the rail" };
    }
    if (shell.bots.length <= 1) {
      return { status: "refused", error: "the last bot cannot be deleted" };
    }

    // The hash binds the approval to this exact bot, so a card the owner
    // approved cannot be spent on a different one.
    const hash = actionSha256({
      tool: "delete_bot",
      canonicalArgs: JSON.stringify({ botId: target.id }),
      cwd: "shell",
      targetRevision: target.updatedAt,
      backend: "shell-store",
      toolVersion: "1",
    });
    const store = getApprovalStore();
    const record = store.request({
      ...approvalActor(ctx),
      tool: "delete_bot",
      actionSha256: hash,
      preview: `delete ${target.kind === "group" ? "group" : "bot"} ${target.name}`,
    });
    await waitUntilNotPending(store, record.id);
    return executeIfApproved(store, record.id, hash, () => {
      // Re-read under the store lock: the roster can have changed while the
      // owner was deciding, and applyShellAction refuses a missing bot.
      const next = updateShell((current) => applyShellAction(current, {
        type: "deleteBot",
        botId: target.id,
      }).store);
      // Routines outlive their bot in their own store and would keep coming
      // due for a bot that no longer exists.
      const routines = deleteRoutinesForBot(target.id);
      return {
        status: "deleted",
        botId: target.id,
        name: target.name,
        routinesRemoved: routines,
        remaining: next.bots.length,
      };
    });
  },
});
