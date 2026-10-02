import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const WORD_CAP = 950;

// Failure cases first: each one must be caught on a bad prompt.

test("a prompt over the word cap fails", () => {
  const bad = Array.from({ length: WORD_CAP + 1 }, () => "word").join(" ");
  assert.ok(wordCount(bad) > WORD_CAP);
});

test("a tool name with no tool file is reported", () => {
  const known = new Set(["bash", "read_file"]);
  assert.deepEqual(unknownToolNames("Use `read_file` then `read_fiel`.", known), ["read_fiel"]);
});

test("a disabled tool is reported", () => {
  const known = new Set<string>(["read_file"]);
  assert.deepEqual(unknownToolNames("Spawn it with `task_cancel`.", known), ["task_cancel"]);
});

test("a made-up tool in a skill body is reported", () => {
  const known = new Set(["connector_search"]);
  assert.deepEqual(unknownToolNames("Call `connector_search`, then `connector_run_all`.", known), ["connector_run_all"]);
});

test("status codes and mounted connection tools are not tool names", () => {
  const known = new Set<string>();
  assert.deepEqual(unknownToolNames("`connectors_not_set_up` and `excalidraw__create_view`.", known), []);
});

test("an unknown mounted prefix is reported", () => {
  assert.deepEqual(unknownToolNames("`mystery__do_it`", new Set<string>()), ["mystery__do_it"]);
});

// The real checks.

test("agent/instructions.md is at most 950 words", () => {
  const words = wordCount(read("agent/instructions.md"));
  assert.ok(words <= WORD_CAP, `instructions.md is ${words} words, the cap is ${WORD_CAP}`);
});

test("every tool name in the instructions and skills is a real, enabled tool", () => {
  const known = knownTools();
  const files = ["agent/instructions.md", ...skillFiles()];
  assert.ok(files.length >= 3, "expected the instructions and both skills");
  for (const file of files) {
    assert.deepEqual(unknownToolNames(read(file), known), [], `${file} names a tool that does not exist or is disabled`);
  }
});

test("known tools include find_tools and drop the disabled ones", () => {
  const known = knownTools();
  assert.ok(known.has("find_tools"));
  assert.ok(known.has("connection_search"));
  assert.ok(!known.has("task_cancel"));
  assert.ok(!known.has("agent"));
});

// Helpers.

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Eve's default tools this agent keeps. `agent` and `task_cancel` are disabled in agent/tools. */
const EVE_BUILT_INS = ["bash", "read_file", "write_file", "web_fetch", "web_search", "todo", "ask_question", "load_skill", "connection_search"];
/** Backticked snake_case words that name a result status, not a tool. */
const STATUS_TOKENS = new Set(["connectors_not_set_up", "not_connected", "no_connectors"]);
/** Tools mounted from a connection are named `<connection>__<tool>`. */
const MOUNTED_PREFIXES = ["excalidraw__"];

function knownTools(): Set<string> {
  const dir = join(ROOT, "agent/tools");
  const names = new Set<string>(EVE_BUILT_INS);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const name = file.slice(0, -3);
    if (readFileSync(join(dir, file), "utf8").includes("disableTool(")) names.delete(name);
    else names.add(name);
  }
  // connection_tools.ts defines find_tools inside a factory, so it has no file of its own.
  for (const match of readFileSync(join(dir, "connection_tools.ts"), "utf8").matchAll(/^\s*([a-z_]+): defineTool\(/gm)) {
    names.add(match[1]!);
  }
  return names;
}

function skillFiles(): string[] {
  const dir = join(ROOT, "agent/skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) => `agent/skills/${name}/SKILL.md`);
}

/** Backticked snake_case tokens that are not a known tool, a status code or a mounted tool. */
function unknownToolNames(text: string, known: Set<string>): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/`([a-z][a-z0-9]*(?:_{1,2}[a-z0-9]+)+)`/g)) {
    const token = match[1]!;
    if (known.has(token) || STATUS_TOKENS.has(token)) continue;
    if (MOUNTED_PREFIXES.some((prefix) => token.startsWith(prefix))) continue;
    found.add(token);
  }
  return [...found];
}
