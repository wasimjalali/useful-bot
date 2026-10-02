import { defineTool } from "eve/tools";
import { loadSkill } from "eve/tools/load_skill";

// eve's own load_skill with a shorter description (UB-009 PR C). Same schema
// and executor.
export default defineTool({
  ...loadSkill,
  description:
    "Load one skill's full instructions by name from the Available skills block, when the request matches it or the owner names it. They apply to the current turn.",
});
