import { defineTool } from "eve/tools";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolveWorkspacePath, workspaceRoot } from "../lib/workspace.ts";
import { READ_MAX_BYTES } from "../../shared/policy.ts";

export default defineTool({
  description: "Read a UTF-8 file from the Useful Bot workspace.",
  inputSchema: z.object({
    path: z.string(),
    offset: z.number().int().optional(),
    limit: z.number().int().optional(),
  }),
  execute(input) {
    const target = resolveWorkspacePath(input.path, workspaceRoot());
    const raw = readFileSync(target, "utf8");
    const sliced = raw.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? READ_MAX_BYTES));
    return sliced.slice(0, READ_MAX_BYTES);
  },
});
