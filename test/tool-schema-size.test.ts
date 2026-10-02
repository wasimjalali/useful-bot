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
