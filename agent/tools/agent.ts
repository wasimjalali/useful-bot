import { disableTool } from "eve/tools";

// Child sessions stay off until ownership and grants propagate to them
// (UB-009 plan section 2, spike 4).
export default disableTool();
