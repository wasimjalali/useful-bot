import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerOf } from "../lib/permission.ts";
import { sharedMemoryStore } from "../lib/memory.ts";
import { readShell } from "../../shared/shell-io.ts";
import { wrapUntrusted } from "../../shared/untrusted.ts";

export const search = defineTool({
  description: "Search this bot's own memory notes.",
  inputSchema: z.object({ query: z.string() }),
  async execute(input, ctx) {
    const who = await callerOf(readShell(), ctx);
    if (!who.ok) return who.result;
    return sharedMemoryStore().search(input.query, who.caller.id).map((note) => ({
      ...note,
      title: wrapUntrusted(`memory:${note.id} title`, note.title),
      body: wrapUntrusted(`memory:${note.id}`, note.body),
    }));
  },
});

export default search;
