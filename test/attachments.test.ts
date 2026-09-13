import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAttachedMessage,
  isTextAttachment,
  safeAttachName,
} from "../shared/attachments.ts";

test("safe attach names and text detection", () => {
  assert.equal(safeAttachName("notes.md"), "notes.md");
  assert.equal(isTextAttachment("notes.md", ""), true);
  assert.equal(isTextAttachment("shot.png", "image/png"), false);
  assert.throws(() => safeAttachName(".env"), /attachment_forbidden/);
  assert.equal(
    formatAttachedMessage("see this", [{ name: "a.txt", text: "hi", bytes: 2 }]).includes("Attached file: a.txt"),
    true,
  );
});
