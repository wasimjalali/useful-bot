import { defineTool } from "eve/tools";
import { z } from "zod";
import { MemoryStore } from "../lib/memory.ts";
import { wrapUntrusted } from "../../shared/untrusted.ts";

function store(): MemoryStore {
  return new MemoryStore();
}

export const search = defineTool({
  description: "Search desktop memory notes.",
  inputSchema: z.object({ query: z.string() }),
  execute(input) {
    return store().search(input.query, "desktop").map((note) => ({
      ...note,
      title: wrapUntrusted(`memory:${note.id} title`, note.title),
      body: wrapUntrusted(`memory:${note.id}`, note.body),
    }));
  },
});

export default search;
