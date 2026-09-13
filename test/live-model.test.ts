import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_PIN_MODEL, resolveUpstreamModelId } from "../shared/live-model.ts";

test("live pin accepts only deepseek-v4.1-flash and otherwise uses registry", () => {
  assert.equal(resolveUpstreamModelId({ upstreamModelId: "glm-5.3-flash" }, undefined), "glm-5.3-flash");
  assert.equal(resolveUpstreamModelId({ upstreamModelId: "glm-5.3-flash" }, LIVE_PIN_MODEL), LIVE_PIN_MODEL);
  assert.throws(
    () => resolveUpstreamModelId({ upstreamModelId: "glm-5.3-flash" }, "glm-5.3-flash"),
    /live_upstream_pin_rejected/,
  );
});
