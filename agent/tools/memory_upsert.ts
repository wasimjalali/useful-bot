import { defineTool } from "eve/tools";
import { z } from "zod";
import { MemoryStore } from "../lib/memory.ts";
import { actionSha256, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
import { getApprovalStore } from "../lib/write.ts";

export default defineTool({
  description: "Create or update a memory note. Requires desktop approval.",
  inputSchema: z.object({
    id: z.string().optional(),
    expectedRevision: z.number().nullable(),
    title: z.string(),
    tags: z.array(z.string()),
    body: z.string(),
    audience: z.enum(["desktop", "shared-phone"]),
    expiresAt: z.string().nullable(),
  }),
  execute: async (input) => {
    const hash = actionSha256({
      tool: "memory.upsert",
      canonicalArgs: JSON.stringify(input),
      cwd: "memory",
      targetRevision: input.expectedRevision === null ? null : String(input.expectedRevision),
      backend: "memory",
      toolVersion: "1",
    });
    const rec = getApprovalStore().request({
      sessionId: "live",
      turnId: "live",
      toolCallId: "live",
      tool: "memory.upsert",
      actionSha256: hash,
      preview: `memory ${input.title}`,
    });
    await waitUntilNotPending(getApprovalStore(), rec.id);
    return executeIfApproved(getApprovalStore(), rec.id, hash, () =>
      new MemoryStore().upsert({ ...input, sessionId: "live" }),
    );
  },
});
