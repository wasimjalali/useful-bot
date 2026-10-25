import type { UsefulTool } from "../lib/tool.ts";

/**
 * The 16 declared tools of SPEC 5.8, in a fixed order (the order is part of the
 * cached prompt). W2 fills this list; the engine host (agent/engine/pi-host.ts)
 * turns each entry into a Pi tool with `toPiTool`. Picked MCP tools are not
 * here: they register per chat at pick time.
 */
export function allTools(): UsefulTool[] {
  return [];
}
