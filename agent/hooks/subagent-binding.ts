import { defineHook } from "eve/hooks";
import { bindSubagentChild } from "../lib/subagent-binding.ts";

/** Records each sub-agent child session against its parent's bot (see lib/subagent-binding.ts). */
export default defineHook({
  events: {
    "subagent.called": (event, ctx) => {
      bindSubagentChild(event, ctx);
    },
  },
});
