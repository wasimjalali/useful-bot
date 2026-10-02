import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

// eve refuses to start when one skill's frontmatter isn't valid YAML, which
// takes every bot down with it (seen live: an unquoted description holding
// ": " broke discovery). Every packaged skill must parse and carry a
// description eve can show.

const SKILLS = "agent/skills";

function frontmatter(text: string): unknown {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error("no frontmatter block");
  return parse(match[1]);
}

test("a description holding an unquoted colon is refused", () => {
  assert.throws(() => frontmatter("---\ndescription: Use it for this: and that.\n---\n# x\n"));
  assert.deepEqual(frontmatter("---\ndescription: \"Use it for this: and that.\"\n---\n# x\n"), {
    description: "Use it for this: and that.",
  });
});

test("every packaged skill has valid frontmatter with a description", () => {
  const names = readdirSync(SKILLS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.ok(names.length >= 2, "expected the packaged skills");
  for (const name of names) {
    const path = join(SKILLS, name, "SKILL.md");
    assert.ok(existsSync(path), `${name} has no SKILL.md`);
    const data = frontmatter(readFileSync(path, "utf8")) as { description?: unknown };
    assert.equal(typeof data.description, "string", `${name} needs a string description`);
    assert.ok((data.description as string).trim().length > 0, `${name} description is empty`);
  }
});
