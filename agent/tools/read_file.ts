import { defineTool } from "eve/tools";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolveWorkspacePath, workspaceRoot } from "../lib/workspace.ts";
import { READ_MAX_BYTES } from "../../shared/policy.ts";
import { wrapUntrusted } from "../../shared/untrusted.ts";

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
    // An offset past the end returns no text; without a flag that is
    // indistinguishable from a genuinely empty file.
    const offsetOutOfRange = offset > raw.length;
    const end = Math.min(raw.length, offset + Math.min(input.limit ?? READ_MAX_BYTES, READ_MAX_BYTES));
    const text = raw.slice(offset, end);
    return {
      text: wrapUntrusted(`file:${input.path}`, text),
      truncated: end < raw.length,
      offsetOutOfRange,
    };
  },
});
