import assert from "node:assert/strict";
import test from "node:test";
import {
  eveGetAllowed,
  evePostAllowed,
  relayedEveCode,
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

test("eve proxy rejects traversal and out-of-charset session ids", () => {
  assert.equal(evePostAllowed("session/.."), false);
  assert.equal(eveGetAllowed("session/../stream"), false);
  assert.equal(evePostAllowed("session/."), false);
  assert.equal(evePostAllowed("session/../../health"), false);
  assert.equal(evePostAllowed("session/a.b"), false);
  assert.equal(eveGetAllowed("session/a b/stream"), false);
  // Real identifiers (uuid, dashed slug) stay allowed.
  assert.equal(evePostAllowed("session/00000000-0000-4000-8000-000000000002"), true);
  assert.equal(evePostAllowed("session/sess-old"), true);
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

test("eve proxy relays only the session_not_active code from an upstream error", () => {
  assert.equal(
    relayedEveCode(409, '{"code":"session_not_active","error":"The session is no longer active.","ok":false}'),
    "session_not_active",
  );
  // Any other code, status or body shape stays behind the proxy.
  assert.equal(relayedEveCode(409, '{"code":"something_else","ok":false}'), null);
  assert.equal(relayedEveCode(500, '{"code":"session_not_active","ok":false}'), null);
  assert.equal(relayedEveCode(409, "not json"), null);
  assert.equal(relayedEveCode(409, ""), null);
});
