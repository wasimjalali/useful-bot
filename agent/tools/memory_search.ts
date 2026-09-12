import { defineTool } from "eve/tools";
import { z } from "zod";
import { MemoryStore } from "../lib/memory.ts";

function store(): MemoryStore {
  return new MemoryStore();
}

export const search = defineTool({
  description: "Search desktop memory notes.",
  inputSchema: z.object({ query: z.string() }),
  execute(input) {
    return store().search(input.query, "desktop");
  },
});

export default search;
