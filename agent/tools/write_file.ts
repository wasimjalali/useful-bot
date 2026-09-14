import { defineTool } from "eve/tools";
import { z } from "zod";
import { approvalActor } from "../lib/approvals.ts";
import { approvedWrite } from "../lib/write.ts";

export default defineTool({
  description: "Write a UTF-8 file in the workspace this conversation works in. Gated by the conversation's permission.",
  inputSchema: z.object({
    path: z.string(),
    content: z.string(),
    expectedSha256: z.string().nullable(),
  }),
  execute(input, ctx) {
    return approvedWrite({
      path: input.path,
      content: input.content,
      expectedSha256: input.expectedSha256,
      ...approvalActor(ctx),
    });
  },
});
