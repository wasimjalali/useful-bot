import { eveChannel } from "eve/channels/eve";
import { channelAuth } from "../lib/channel-auth.ts";
import { bindSubagentChild } from "../lib/subagent-binding.ts";

const channel = eveChannel({
  auth: [channelAuth()],
  turnPolicy: "queue",
});

/**
 * Record each sub-agent child session against its parent's bot (lib/subagent-binding.ts).
 * eve's `events` option and `agent/hooks/` never see `subagent.called` from a
 * background task agent: its emitter calls the channel adapter's handler for the
 * event and writes it to the parent stream, with no hook dispatch, and
 * `defineChannel` only wires a fixed list of event types that omits this one. So
 * the handler goes on the adapter itself. The default eve channel has no handler
 * for this event, so nothing is replaced. The context's session is the parent's.
 */
(channel as unknown as { adapter: Record<string, unknown> }).adapter["subagent.called"] = (
  data: Record<string, unknown> | undefined,
  context: { session: { id: string } },
): void => {
  bindSubagentChild({ type: "subagent.called", data }, { session: { id: context.session.id } });
};

export default channel;
