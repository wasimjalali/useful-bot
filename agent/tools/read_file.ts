import { defineTool } from "eve/tools";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolveWorkspacePath, workspaceRoot } from "../lib/workspace.ts";
import { READ_MAX_BYTES } from "../../shared/policy.ts";

export default defineTool({
  description: "Read a UTF-8 file from the Useful Bot workspace.",
  inputSchema: z.object({
    path: z.string(),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(0).optional(),
  }),
  execute(input) {
    const target = resolveWorkspacePath(input.path, workspaceRoot());
    const raw = readFileSync(target, "utf8");
    const offset = input.offset ?? 0;
    const end = Math.min(raw.length, offset + Math.min(input.limit ?? READ_MAX_BYTES, READ_MAX_BYTES));
    const text = raw.slice(offset, end);
    return { text, truncated: end < raw.length };
  },
});
