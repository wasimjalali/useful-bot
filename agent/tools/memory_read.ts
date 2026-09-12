import { defineTool } from "eve/tools";
import { z } from "zod";
import { MemoryStore } from "../lib/memory.ts";

export default defineTool({
  description: "Read one desktop memory note by id.",
  inputSchema: z.object({ id: z.string() }),
  execute(input) {
    return new MemoryStore().read(input.id, "desktop");
  },
});
