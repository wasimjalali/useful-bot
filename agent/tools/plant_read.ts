import { defineTool } from "eve/tools";
import { z } from "zod";

let executions = 0;

export default defineTool({
  description: "Return the S2 planted token. Spike fixture only.",
  inputSchema: z.object({}),
  execute() {
    executions += 1;
    return { token: "S2-TOOL-PLANT-001", executions };
  },
});
