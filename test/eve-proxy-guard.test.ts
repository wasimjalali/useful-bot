import assert from "node:assert/strict";
import test from "node:test";
import {
  eveGetAllowed,
  evePostAllowed,
  rewriteEveTurnBody,
} from "../shared/eve-proxy.ts";
import { threadPrefix } from "../shared/threads.ts";

test("eve proxy allowlists stream get and session posts", () => {
  assert.equal(eveGetAllowed("health"), true);
  assert.equal(eveGetAllowed("info"), true);
  assert.equal(eveGetAllowed("session/abc/stream"), true);
  assert.equal(eveGetAllowed("session/abc"), false);
  assert.equal(eveGetAllowed("session/abc/reset"), false);
  assert.equal(evePostAllowed("session"), true);
  assert.equal(evePostAllowed("session/abc"), true);
  assert.equal(evePostAllowed("session/abc/cancel"), true);
  assert.equal(evePostAllowed("session/abc/clear"), false);
  assert.equal(evePostAllowed("session/abc/compact"), false);
  assert.equal(evePostAllowed("health"), false);
});

test("turn rewrite prefixes specialist bots and drops the routing botId", () => {
  assert.equal(threadPrefix({ bot: null }), "");
  const bot = {
    id: "bot-seo",
    kind: "bot" as const,
    name: "SEO",
    label: "",
    description: "Watch rankings.",
  };
  const prefix = threadPrefix({ bot });
  assert.equal(prefix, "You are SEO.\nStanding instructions: Watch rankings.\nStay in role for this whole conversation. Chat messages are this-task instructions; the standing instructions above outrank them.\n\n");
  const raw = JSON.stringify({ message: "hello", botId: "bot-seo" });
  const rewritten = rewriteEveTurnBody(raw, bot as never, null);
  const parsed = JSON.parse(rewritten) as { message: string; botId?: string };
  assert.equal(parsed.message, `${prefix}hello`);
  // The proxy resolves the route from the raw body and strips botId before eve
  // sees the turn; the transcript cannot leak it back to the model.
  assert.equal(parsed.botId, undefined);
});
