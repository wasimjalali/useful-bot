import { defineTool } from "eve/tools";
import { z } from "zod";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";
import { deleteRoutine, readRoutine } from "../../shared/routines-store.ts";

export default defineTool({
  description:
    "Delete a routine for good, including its run history. The owner sees an approval card and nothing is removed until they approve it. Prefer updateRoutine with active false when the owner only wants it paused.",
  inputSchema: z.object({
    routineId: z.string().min(1).max(120),
    reason: z.string().max(300).optional(),
  }),
  async execute(input, ctx) {
    const routine = readRoutine(input.routineId);
    if (!routine) {
      return { status: "not_found", error: `no routine with id ${input.routineId}`, hint: "Call listRoutines." };
    }
    // The hash binds the approval to this routine at this revision, so a card
    // the owner approved cannot be spent on another routine.
    const hash = actionSha256({
      tool: "delete_routine",
      canonicalArgs: JSON.stringify({ routineId: routine.id }),
      cwd: "routines",
      targetRevision: routine.updatedAt,
      backend: "routines-store",
      toolVersion: "1",
    });
    const store = getApprovalStore();
    const record = store.request({
      ...approvalActor(ctx),
      tool: "delete_routine",
      actionSha256: hash,
      preview: `delete routine ${routine.name}`,
    });
    await waitUntilNotPending(store, record.id);
    return executeIfApproved(store, record.id, hash, () => {
      const removed = deleteRoutine(routine.id);
      return {
        status: removed ? "deleted" : "already_gone",
        routineId: routine.id,
        name: routine.name,
      };
    });
  },
});
