import assert from "node:assert/strict";
import test from "node:test";
import {
  eveGetAllowed,
  evePostAllowed,
  personaPrefix,
  rewriteEveSessionBody,
  rewriteEveTurnBody,
} from "../shared/eve-proxy.ts";
import { DEFAULT_BOT_ID } from "../shared/shell-store.ts";

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

test("persona prefix is only for specialist bots", () => {
  assert.equal(personaPrefix({ id: DEFAULT_BOT_ID, kind: "bot", name: "Useful Bot", description: "Main" }), "");
  assert.equal(
    personaPrefix({ id: "bot-seo", kind: "bot", name: "SEO", description: "Watch rankings." }),
    "You are SEO. Standing instructions: Watch rankings.\n\n",
  );
  const rewritten = rewriteEveSessionBody(
    JSON.stringify({ message: "hello", botId: "bot-seo" }),
    { id: "bot-seo", kind: "bot", name: "SEO", description: "Watch rankings." },
  );
  assert.equal(JSON.parse(rewritten).message.startsWith("You are SEO."), true);
  // The full turn rewrite keeps botId: the proxy reads it to pick the route.
  assert.equal(JSON.parse(rewritten).botId, undefined);
  const turned = rewriteEveTurnBody(
    JSON.stringify({ message: "hello", botId: "bot-seo" }),
    {
      id: "bot-seo",
      kind: "bot",
      name: "SEO",
      label: "",
      description: "Watch rankings.",
    } as never,
    null,
  );
  assert.equal(JSON.parse(turned).message.startsWith("You are SEO."), true);
});
