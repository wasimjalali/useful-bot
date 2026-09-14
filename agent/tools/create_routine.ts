import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  createRoutine,
  hostTimeZone,
  isValidTimeZone,
  parseSchedules,
  routineNextRun,
} from "../../shared/routines-store.ts";
import { readShell } from "../../shared/shell-io.ts";

const schedule = z.object({
  kind: z.enum(["weekly", "daily", "once"]),
  /** 0 is Sunday through 6 is Saturday. Weekly only. */
  days: z.array(z.number().int().min(0).max(6)).optional(),
  /** Wall clock in the routine's timezone, 24 hour, "HH:MM". */
  time: z.string().min(5).max(5),
  /** "YYYY-MM-DD" for a one-shot run. */
  date: z.string().min(10).max(10).optional(),
});

export default defineTool({
  description:
    "Create a routine: a standing instruction a bot runs on a schedule. Use it when the owner asks for recurring work (\"check this every Monday morning\"). Times are wall clock in the routine's timezone, so 09:00 stays 09:00 across a clock change. Defaults to this bot. The routine starts active, and the owner can pause or edit it in the chat details pane.",
  inputSchema: z.object({
    name: z.string().min(1).max(80),
    instruction: z.string().min(1).max(4000),
    schedules: z.array(schedule).min(1).max(10),
    botId: z.string().min(1).max(80).optional(),
    /** IANA zone, for example Europe/Berlin. Defaults to this Mac's zone. */
    timezone: z.string().max(80).optional(),
  }),
  execute(input) {
    const shell = readShell();
    const botId = input.botId?.trim() || process.env.UB_ACTIVE_BOT_ID || shell.selectedBotId;
    const bot = shell.bots.find((item) => item.id === botId) ?? null;
    if (!bot) {
      return { status: "not_found", error: `no bot with id ${botId}`, hint: "Call listBots for exact ids." };
    }
    if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) {
      return { status: "invalid", error: `${input.timezone} is not an IANA timezone`, hint: "For example Europe/Berlin." };
    }
    // Validate here rather than letting the store silently drop a bad row: a
    // routine with no schedule would never run and would look like it works.
    const schedules = parseSchedules(input.schedules);
    if (schedules.length !== input.schedules.length) {
      return {
        status: "invalid",
        error: "a schedule was malformed",
        hint: 'time must be "HH:MM" 24 hour, weekly needs days 0-6, once needs date "YYYY-MM-DD".',
      };
    }
    const timezone = input.timezone ?? hostTimeZone();
    let routine;
    try {
      routine = createRoutine({
        botId: bot.id,
        name: input.name,
        instruction: input.instruction,
        schedules,
        timezone,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "routine_create_failed";
      return { status: "invalid", error: code };
    }
    return {
      status: "created",
      routineId: routine.id,
      bot: { id: bot.id, name: bot.name },
      name: routine.name,
      timezone: routine.timezone,
      nextRunAt: routineNextRun(routine, new Date())?.toISOString() ?? null,
      note: "The owner sees this routine in the chat details pane and can pause or delete it there.",
    };
  },
});
