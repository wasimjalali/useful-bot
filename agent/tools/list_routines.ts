import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerOf } from "../lib/permission.ts";
import { listRoutines, routineNextRun } from "../../shared/routines-store.ts";
import { readShell } from "../../shared/shell-io.ts";
import { wrapUntrusted } from "../../shared/untrusted.ts";

export default defineTool({
  description:
    "List this bot's routines with next run and recent outcomes. Read only. Call before editing or deleting one, for the id.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const who = await callerOf(readShell(), ctx);
    if (!who.ok) return who.result;
    const bot = who.caller.bot;
    const now = new Date();
    return {
      status: "ok",
      bot: { id: bot.id, name: bot.name },
      routines: listRoutines(bot.id).map((routine) => ({
        id: routine.id,
        // The name and instruction are owner text and may carry instructions
        // aimed at a model; they are data here, not orders.
        name: wrapUntrusted(`routine:${routine.id} name`, routine.name),
        instruction: wrapUntrusted(`routine:${routine.id} instruction`, routine.instruction),
        schedules: routine.schedules,
        timezone: routine.timezone,
        active: routine.active,
        lastRunAt: routine.lastRunAt,
        nextRunAt: routine.active
          ? routineNextRun(routine, routine.lastRunAt ? new Date(routine.lastRunAt) : now)?.toISOString() ?? null
          : null,
        runHistory: routine.runHistory.slice(-5).map((run) => ({
          at: run.at,
          status: run.status,
          error: run.error,
        })),
      })),
    };
  },
});
