import { defineTool, disableTool } from "eve/tools";
import { z } from "zod";

let executions = 0;

const plantRead = defineTool({
  description: "Return the S2 planted token. Spike fixture only.",
  inputSchema: z.object({}),
  execute() {
    executions += 1;
    return { token: "S2-TOOL-PLANT-001", executions };
  },
});

// A spike fixture: the live model never sees it. The S2 probe opts back in
// with UB_S2_FIXTURE=1.
export default process.env.UB_S2_FIXTURE === "1" ? plantRead : disableTool();
