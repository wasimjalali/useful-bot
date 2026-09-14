import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  isValidTimeZone,
  parseSchedules,
  readRoutine,
  routineNextRun,
  updateRoutine,
} from "../../shared/routines-store.ts";

const schedule = z.object({
  kind: z.enum(["weekly", "daily", "once"]),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  time: z.string().min(5).max(5),
  date: z.string().min(10).max(10).optional(),
});

export default defineTool({
  description:
    "Edit one routine: rename it, change what it does, change when it runs, or pause and resume it with active. Every change here is reversible, so it applies immediately. Passing schedules replaces the whole list, so send every schedule the routine should keep. Call listRoutines first for the id and the current schedule.",
  inputSchema: z.object({
    routineId: z.string().min(1).max(120),
    name: z.string().min(1).max(80).optional(),
    instruction: z.string().min(1).max(4000).optional(),
    schedules: z.array(schedule).max(10).optional(),
    /** false pauses the routine without deleting it. */
    active: z.boolean().optional(),
    timezone: z.string().max(80).optional(),
  }),
  execute(input) {
    const existing = readRoutine(input.routineId);
    if (!existing) {
      return { status: "not_found", error: `no routine with id ${input.routineId}`, hint: "Call listRoutines." };
    }
    if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) {
      return { status: "invalid", error: `${input.timezone} is not an IANA timezone` };
    }
    if (input.schedules !== undefined) {
      const parsed = parseSchedules(input.schedules);
      if (parsed.length !== input.schedules.length) {
        return {
          status: "invalid",
          error: "a schedule was malformed",
          hint: 'time must be "HH:MM" 24 hour, weekly needs days 0-6, once needs date "YYYY-MM-DD".',
        };
      }
    }
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.instruction !== undefined) patch.instruction = input.instruction;
    if (input.schedules !== undefined) patch.schedules = input.schedules;
    if (input.active !== undefined) patch.active = input.active;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (Object.keys(patch).length === 0) {
      return { status: "no_change", routineId: existing.id, note: "Nothing to change." };
    }
    let routine;
    try {
      routine = updateRoutine(existing.id, patch);
    } catch (err) {
      return { status: "invalid", error: err instanceof Error ? err.message : "routine_update_failed" };
    }
    return {
      status: "updated",
      routineId: routine.id,
      name: routine.name,
      active: routine.active,
      schedules: routine.schedules,
      nextRunAt: routine.active
        ? routineNextRun(routine, routine.lastRunAt ? new Date(routine.lastRunAt) : new Date())?.toISOString() ?? null
        : null,
    };
  },
});
