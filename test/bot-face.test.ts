import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultFaceFor,
  isAvatarColor,
  isAvatarShape,
  randomFace,
} from "../shared/bot-face.ts";

test("random faces always produce a known shape and color", () => {
  // The old signed-bitwise implementation produced negative indices for large
  // timestamps, which yielded undefined and made the Generate button a no-op.
  for (let index = 0; index < 500; index += 1) {
    const face = randomFace(Date.now() + index * 977);
    assert.ok(isAvatarShape(face.shape), `bad shape at ${index}: ${String(face.shape)}`);
    assert.ok(isAvatarColor(face.color), `bad color at ${index}: ${String(face.color)}`);
  }
});

test("default faces derive from the bot id and stay valid", () => {
  for (const id of ["bot-useful", "0c2bf8f4-3979-4f5c-800a-c630eb4df4d5", "bot-🙂"]) {
    const face = defaultFaceFor(id);
    assert.ok(isAvatarShape(face.shape));
    assert.ok(isAvatarColor(face.color));
  }
});
