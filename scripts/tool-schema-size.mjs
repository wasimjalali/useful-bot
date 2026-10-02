#!/usr/bin/env node
// Weighs the authored tools the way the wire sees them: the description plus the
// JSON schema zod emits for the input. Reports per-tool and total characters and
// description words. Compare two runs with --diff <before.txt>.
// usage: node --experimental-strip-types scripts/tool-schema-size.mjs [--diff before.txt]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const TOOLS = join(ROOT, "agent/tools");

export async function measureTools() {
  const rows = [];
  for (const file of readdirSync(TOOLS).filter((name) => name.endsWith(".ts")).sort()) {
    const mod = await import(join(TOOLS, file));
    const tool = mod.default;
    if (!tool?.inputSchema) continue;
    const description = String(tool.description ?? "");
    const schema = JSON.stringify(z.toJSONSchema(tool.inputSchema, { io: "input" }));
    rows.push({
      name: file.slice(0, -3),
      words: description.split(/\s+/).filter(Boolean).length,
      descChars: description.length,
      schemaChars: schema.length,
      chars: description.length + schema.length,
    });
  }
  return rows;
}

export function parseTable(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const match = /^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/.exec(line);
    if (match && match[1] !== "TOTAL") out.set(match[1], Number(match[5]));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await measureTools();
  const diffAt = process.argv.indexOf("--diff");
  const before = diffAt > 0 ? parseTable(readFileSync(process.argv[diffAt + 1], "utf8")) : null;
  const pad = (value, width) => String(value).padStart(width);
  console.log(`${"tool".padEnd(22)}${pad("words", 7)}${pad("desc", 8)}${pad("schema", 8)}${pad("total", 8)}${before ? pad("delta", 8) : ""}`);
  for (const row of [...rows].sort((a, b) => b.chars - a.chars)) {
    const delta = before ? pad(row.chars - (before.get(row.name) ?? 0), 8) : "";
    console.log(`${row.name.padEnd(22)}${pad(row.words, 7)}${pad(row.descChars, 8)}${pad(row.schemaChars, 8)}${pad(row.chars, 8)}${delta}`);
  }
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const beforeTotal = before ? [...before.values()].reduce((a, b) => a + b, 0) : 0;
  console.log(`${"TOTAL".padEnd(22)}${pad(sum("words"), 7)}${pad(sum("descChars"), 8)}${pad(sum("schemaChars"), 8)}${pad(sum("chars"), 8)}${before ? pad(sum("chars") - beforeTotal, 8) : ""}`);
  console.log(`tools: ${rows.length}`);
}
