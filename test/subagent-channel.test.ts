import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callAdapterEventHandler } from "../node_modules/eve/dist/src/channel/adapter.js";
import { buildAdapterContext } from "../node_modules/eve/dist/src/channel/adapter-context.js";
import { ContextContainer } from "../node_modules/eve/dist/src/context/container.js";
import { SessionIdKey } from "../node_modules/eve/dist/src/context/keys.js";
import channel from "../agent/channels/eve.ts";
import { bindSession, readSessionBot, readSessionParent } from "../shared/session-bindings.ts";

// eve's emitTaskSubagentCalledStep needs a compiled runtime bundle to rebuild its
// context, so this drives the two calls it makes after that, on eve's own code:
// buildAdapterContext, then callAdapterEventHandler on the channel's adapter,
// with the event the emitter was given. The step then writes the event to the
// parent stream; nothing in it dispatches hooks (the reason the handler is on
// the adapter, not in agent/hooks).
const adapterOf = (value: unknown) => (value as { adapter: never }).adapter;

async function emitCalled(sessionId: string, event: Record<string, unknown>): Promise<unknown> {
  const ctx = new ContextContainer();
  ctx.set(SessionIdKey, sessionId);
  const adapter = adapterOf(channel);
  return await callAdapterEventHandler(adapter, event as never, buildAdapterContext(adapter, ctx));
}

test("eve's own adapter dispatch of subagent.called on our channel records the child", async () => {
  const saved = process.env.UB_SESSION_OWNERS_PATH;
  process.env.UB_SESSION_OWNERS_PATH = join(mkdtempSync(join(tmpdir(), "ub-sub-")), "owners.json");
  try {
    bindSession("wrun_ROOT", "bot-a");
    const called = (sessionId: string, childSessionId: string) => ({
      type: "subagent.called",
      data: { sessionId, childSessionId, callId: "c1", agentId: "a1", name: "agent", sequence: 3, turnId: "t", toolName: "agent", workflowId: "w" },
    });
    const out = await emitCalled("wrun_ROOT", called("wrun_ROOT", "wrun_KID1")) as { type: string };
    // The event goes on to the stream unchanged.
    assert.equal(out.type, "subagent.called");
    assert.equal(readSessionBot("wrun_KID1"), "bot-a");
    assert.equal(readSessionParent("wrun_KID1"), "wrun_ROOT");
    // A second delivery is harmless, and a data session that is not the context's records nothing.
    await emitCalled("wrun_ROOT", called("wrun_ROOT", "wrun_KID1"));
    await emitCalled("wrun_ROOT", called("wrun_OTHER", "wrun_KID2"));
    assert.equal(readSessionBot("wrun_KID2"), null);
    // A parent nobody bound, and a child's own nested call, record nothing.
    await emitCalled("wrun_GHOST", called("wrun_GHOST", "wrun_KID3"));
    await emitCalled("wrun_KID1", called("wrun_KID1", "wrun_KID4"));
    assert.equal(readSessionBot("wrun_KID3"), null);
    assert.equal(readSessionBot("wrun_KID4"), null);
    // The channel stays eve's default http adapter, with no other handler of ours.
    assert.equal((adapterOf(channel) as { kind: string }).kind, "http");
  } finally {
    if (saved === undefined) delete process.env.UB_SESSION_OWNERS_PATH; else process.env.UB_SESSION_OWNERS_PATH = saved;
  }
});
