import { defineTool } from "eve/tools";
import { z } from "zod";
import { MemoryStore, tagsForBot } from "../lib/memory.ts";
import { actionSha256, approvalActor, executeIfApproved, waitUntilNotPending } from "../lib/approvals.ts";
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
    botId: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const actor = approvalActor(ctx);
    const hash = actionSha256({
      tool: "memory.upsert",
      canonicalArgs: JSON.stringify(input),
      cwd: "memory",
      targetRevision: input.expectedRevision === null ? null : String(input.expectedRevision),
      backend: "memory",
      toolVersion: "1",
    });
    const rec = getApprovalStore().request({
      ...actor,
      tool: "memory.upsert",
      actionSha256: hash,
      preview: `memory ${input.title}`,
    });
    await waitUntilNotPending(getApprovalStore(), rec.id);
    return executeIfApproved(getApprovalStore(), rec.id, hash, () => {
      const botId = input.botId ?? process.env.UB_ACTIVE_BOT_ID;
      const tags = botId ? tagsForBot(input.tags, botId) : input.tags;
      return new MemoryStore().upsert({
        id: input.id,
        expectedRevision: input.expectedRevision,
        title: input.title,
        tags,
        body: input.body,
        audience: input.audience,
        expiresAt: input.expiresAt,
        sessionId: actor.sessionId,
      });
    });
  },
});
