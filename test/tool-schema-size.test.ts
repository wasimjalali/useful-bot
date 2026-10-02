import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

const CAMEL = /\b(listBots|sendToBot|postToGroup|railAction|deleteBot|updateRoutine|listRoutines|createRoutine|deleteRoutine|runRoutine|proposeBot|proposeGroup|updateBotProfile|memoryUpsert)\b/;

// UB-009 PR C: the tool schemas are the biggest fixed cost per turn.
test("every authored tool stays short and names its siblings in snake_case", async () => {
  const { join } = await import("node:path");
  const { measureTools } = (await import(join(import.meta.dirname, "../scripts/tool-schema-size.mjs"))) as {
    measureTools: () => Promise<{ name: string; words: number; chars: number }[]>;
  };
  const rows = await measureTools();
  assert.ok(rows.length >= 30, `only ${rows.length} tools measured; the walk is broken`);
  const total = rows.reduce((sum, row) => sum + row.chars, 0);
  assert.ok(total < 19_500, `authored tools weigh ${total} chars, past the 19,500 ceiling (was 20,309 before PR C)`);
  for (const row of rows) {
    assert.ok(row.words <= 120, `${row.name} description is ${row.words} words; the ceiling is 120`);
  }
});

test("no tool description uses a camelCase tool name", async () => {
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(import.meta.dirname, "../agent/tools");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const mod = (await import(join(dir, file))) as { default?: { description?: string } };
    const text = mod.default?.description ?? "";
    assert.equal(CAMEL.test(text), false, `${file} description names a tool in camelCase`);
  }
});

test("the script prints a table with a total", () => {
  const out = execFileSync("/usr/local/bin/node", ["--experimental-strip-types", "scripts/tool-schema-size.mjs"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  assert.match(out, /^TOTAL\s+\d+\s+\d+\s+\d+\s+\d+$/m);
  assert.match(out, /^bash\s+/m);
});

// An override that re-declares eve's schema must not drift from it: if eve
// tightens a field, this fails instead of our copy silently validating less.
function withoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDescriptions);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "description")
        .map(([key, inner]) => [key, withoutDescriptions(inner)]),
    );
  }
  return value;
}

for (const [name, eveModule] of [
  ["web_fetch", "eve/tools/web_fetch"],
  ["todo", "eve/tools/todo"],
  ["load_skill", "eve/tools/load_skill"],
] as const) {
  test(`${name} override keeps eve's schema apart from description text`, async () => {
    const { z } = await import("zod");
    const { join } = await import("node:path");
    const ours = (await import(join(import.meta.dirname, `../agent/tools/${name}.ts`))) as { default: { inputSchema: never } };
    const theirs = (await import(eveModule)) as { default: { inputSchema: never } };
    const a = z.toJSONSchema(ours.default.inputSchema, { io: "input" });
    const b = z.toJSONSchema(theirs.default.inputSchema, { io: "input" });
    assert.deepEqual(withoutDescriptions(a), withoutDescriptions(b));
  });
}
