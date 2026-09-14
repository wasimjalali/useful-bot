import { defineTool } from "eve/tools";
import { z } from "zod";
import { readRoutine, requestRoutineRun } from "../../shared/routines-store.ts";

export default defineTool({
  description:
    "Run a routine now, outside its schedule, the way the owner's Test run button does. The run starts within a few seconds and lands as a turn in the owning bot's chat, so do not wait for it here. A manual run does not consume the next scheduled slot. Call listRoutines for the id.",
  inputSchema: z.object({
    routineId: z.string().min(1).max(120),
  }),
  execute(input) {
    const routine = readRoutine(input.routineId);
    if (!routine) {
      return { status: "not_found", error: `no routine with id ${input.routineId}`, hint: "Call listRoutines." };
    }
    // The web server owns delivery; this only raises the request flag, which
    // the next tick claims. A second call while one is waiting is a no-op.
    if (!requestRoutineRun(routine.id)) {
      return { status: "duplicate", routineId: routine.id, error: "a run is already queued for that routine" };
    }
    return {
      status: "queued",
      routineId: routine.id,
      name: routine.name,
      botId: routine.botId,
      note: "The result appears in that bot's chat and in the routine's run history.",
    };
  },
});
