import { defineTool } from "eve/tools";
import { z } from "zod";
import { approvedWrite } from "../lib/write.ts";

export default defineTool({
  description: "Write a UTF-8 file in the Useful Bot workspace. Requires desktop approval.",
  inputSchema: z.object({
    path: z.string(),
    content: z.string(),
    expectedSha256: z.string().nullable(),
  }),
  execute(input) {
    return approvedWrite({
      path: input.path,
      content: input.content,
      expectedSha256: input.expectedSha256,
      sessionId: "live",
      turnId: "live",
      toolCallId: "live",
    });
  },
});
