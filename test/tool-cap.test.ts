import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_SESSION_TOOLS, MAX_TOOL_SCHEMAS, MOUNTED_TOOL_BUDGET } from "../shared/policy.ts";

const ROOT = join(import.meta.dirname, "..");

/**
 * Room for whatever a future eve default adds and a few more authored tools.
 * The connection tools have their own budgets now and are counted below; the
 * point is still that a single added tool trips this test in CI, never a live
 * turn at the router.
 */
const SESSION_TOOL_HEADROOM = 16;

/**
 * eve advertises its default tools on every turn unless a same-named file
 * under `agent/tools/` replaces it. The list is read from the installed eve's
 * own docs (docs/concepts/built-in-tools.md, "Default tools" section) so an
 * eve upgrade that adds a default changes this count instead of drifting
 * past a pinned copy.
 */
export function eveDefaultTools(): string[] {
  const doc = readFileSync(join(ROOT, "node_modules/eve/docs/concepts/built-in-tools.md"), "utf8");
  const start = doc.indexOf("## Default tools");
  const end = doc.indexOf("## Opt-in framework tools");
  assert.ok(start >= 0 && end > start, "eve built-in-tools doc changed shape; update eveDefaultTools()");
  const names = [...doc.slice(start, end).matchAll(/^### `([a-z_]+)`/gm)].map((match) => match[1]);
  assert.ok(names.length > 0, "no default tools parsed from the eve doc");
  return names;
}

/**
 * Every tool schema the agent ships on a turn, counted the way eve builds the
 * request: authored tools plus the defaults they do not override.
 */
export function shippedToolCount(): number {
  const authored = readdirSync(join(ROOT, "agent/tools"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.slice(0, -3));
  const overridden = new Set(authored);
  const defaults = eveDefaultTools().filter((name) => !overridden.has(name));
  return authored.length + defaults.length;
}

test("the tools the agent ships fit under the router's schema cap with headroom", () => {
  // On 2026-09-15 the 26th authored tool took the total to 33 against a cap
  // of 32, and every turn died at the router with `unsupported_parameter`
  // before the model was called. This is the test that was missing.
  const count = shippedToolCount();
  assert.ok(count >= 33, `expected at least the 33 tools shipped on 2026-09-15, counted ${count}`);
  // The connect budget and the per-session limit are what stop a bot walking
  // into the cap, so the arithmetic that says they are enough is checked
  // here rather than asserted in a comment: every connection a connect will
  // admit, plus every tool a session may pick up, plus everything the agent
  // ships, has to fit.
  const worst = count + MOUNTED_TOOL_BUDGET + MAX_SESSION_TOOLS + SESSION_TOOL_HEADROOM;
  assert.ok(
    worst <= MAX_TOOL_SCHEMAS,
    `agent ships ${count} tool schemas; with MOUNTED_TOOL_BUDGET=${MOUNTED_TOOL_BUDGET}, MAX_SESSION_TOOLS=${MAX_SESSION_TOOLS} and ${SESSION_TOOL_HEADROOM} headroom that is ${worst}, past MAX_TOOL_SCHEMAS=${MAX_TOOL_SCHEMAS}. Lower a budget in shared/policy.ts`,
  );
});
