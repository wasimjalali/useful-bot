import assert from "node:assert/strict";
import test from "node:test";
import { blocksFromMarkdown } from "../shared/chat-markdown.ts";

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
