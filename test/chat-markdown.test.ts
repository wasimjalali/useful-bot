import assert from "node:assert/strict";
import test from "node:test";
import { blocksFromMarkdown, parseInline } from "../shared/chat-markdown.ts";

test("blocksFromMarkdown turns headings, bold lists, and fences into blocks", () => {
  const blocks = blocksFromMarkdown([
    "**Who I am**",
    "- I'm Useful Bot",
    "- **Search the web**: look things up",
    "",
    "```ts",
    "const ok = true;",
    "```",
    "",
    "### Next",
    "1. One",
    "2. Two",
  ].join("\n"));
  assert.deepEqual(blocks[0], { type: "p", text: "**Who I am**" });
  assert.equal(blocks[1]?.type, "ul");
  if (blocks[1]?.type !== "ul") throw new Error("expected list");
  assert.equal(blocks[1].items[1], "**Search the web**: look things up");
  assert.equal(blocks[2]?.type, "code");
  assert.deepEqual(blocks[3], { type: "h", level: 3, text: "Next" });
  assert.equal(blocks[4]?.type, "ol");
});

test("parseInline links http(s) URLs with their label", () => {
  assert.deepEqual(parseInline("[site](https://example.com/a?b=1)"), [
    { type: "link", text: "site", href: "https://example.com/a?b=1" },
  ]);
  assert.deepEqual(parseInline("[site](http://example.com)"), [
    { type: "link", text: "site", href: "http://example.com" },
  ]);
});

test("parseInline never turns dangerous schemes into links", () => {
  for (const source of [
    "[x](javascript:alert(1))",
    "[x](data:text/html,<b>)",
    "[x](vbscript:msgbox(1))",
  ]) {
    const segments = parseInline(source);
    assert.equal(segments.filter((segment) => segment.type === "link").length, 0);
  }
});

test("parseInline does not italicize underscores", () => {
  assert.deepEqual(parseInline("my_var_name"), [{ type: "text", text: "my_var_name" }]);
  assert.deepEqual(parseInline("_not em_"), [{ type: "text", text: "_not em_" }]);
  assert.deepEqual(parseInline("__bold__"), [{ type: "strong", text: "bold" }]);
});

test("parseInline handles code, bold, and emphasis together", () => {
  assert.deepEqual(parseInline("`a_b` then **bold** and *em*"), [
    { type: "code", text: "a_b" },
    { type: "text", text: " then " },
    { type: "strong", text: "bold" },
    { type: "text", text: " and " },
    { type: "em", text: "em" },
  ]);
});
