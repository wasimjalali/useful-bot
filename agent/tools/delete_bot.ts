import { defineTool } from "eve/tools";
import { z } from "zod";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";
import { deleteThread } from "../../shared/agent-store.ts";
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
    // An id is exact. A name is not: the roster allows two bots whose names
    // differ only in case, and this call deletes something, so an ambiguous
    // match has to come back as a question rather than a coin toss.
    const byId = shell.bots.find((bot) => bot.id === requested) ?? null;
    const byName = byId
      ? []
      : shell.bots.filter((bot) => bot.name.toLowerCase() === requested.toLowerCase());
    if (byName.length > 1) {
      return {
        status: "ambiguous",
        error: `${byName.length} bots are named ${requested}`,
        hint: `Call delete_bot again with one of these ids: ${byName.map((bot) => bot.id).join(", ")}.`,
      };
    }
    const target = byId ?? byName[0] ?? null;
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
      // The id is in the preview because a bot's name is editable; the owner
      // has to be able to tell two similarly named cards apart.
      preview: `delete ${target.kind === "group" ? "group" : "bot"} ${target.name} (${target.id})`,
    });
    await waitUntilNotPending(store, record.id);
    return executeIfApproved(store, record.id, hash, () => {
      // The approval belongs to the revision on the card, so a bot renamed or
      // re-profiled while the owner was deciding is not deleted. Checked here
      // and again inside the roster lock below.
      const live = readShell().bots.find((bot) => bot.id === target.id);
      if (!live) throw new Error("bot_missing");
      if (live.updatedAt !== target.updatedAt) throw new Error("bot_changed");
      // Routines and the transcript live in their own stores and outlive the
      // bot. They go first: a store that will not open then fails the delete,
      // where doing it afterwards left routines coming due forever for a bot
      // nobody can see.
      const routines = deleteRoutinesForBot(target.id);
      deleteThread(target.id);
      const next = updateShell((current) => {
        const inLock = current.bots.find((bot) => bot.id === target.id);
        if (!inLock) throw new Error("bot_missing");
        if (inLock.updatedAt !== target.updatedAt) throw new Error("bot_changed");
        return applyShellAction(current, { type: "deleteBot", botId: target.id }).store;
      });
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
