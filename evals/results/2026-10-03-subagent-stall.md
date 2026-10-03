# 2026-10-03: the Generalist went silent after five sub-agents

## Question

On 2026-10-01 the owner asked the Generalist (daily app, eve 0.54.3) to run five critic sub-agents
on the product log. Afterwards every message he sent got no reply, for two days. Why, and what
stops it happening again?

## What ran

Read-only trace of the daily app's eve store
(`~/Library/Application Support/Useful Bot/app/.eve/.workflow-data/streams/chunks/strm_<session>_user`,
each chunk a `devl`-framed base64 JSON event). The parent session `wrun_01M3QH5F3JNFVJMJ0KF7WCH1TE`
had 37,041 events; the five child sessions 1,167 to 19,067 each. Decoder: a 20-line Python script
(base64-decode the second element of the `devl` JSON array). No model calls, no cost.

## Timeline (UTC, 2026-10-01)

| Time | Event |
|------|-------|
| 20:49:29 | Five `agent` calls admitted (`subagent.completed` receipts, status working). |
| 20:54:23, 20:54:31, 20:58:12 | Three child model calls fail `upstream_timeout`, each exactly 180.0 s after its step started, the last token 0.1 s before the abort. |
| 20:52:27 to 21:02:56 | The other runs finish their reports. |
| 21:02:58 | The first report reaches the parent. Lifetime input: 41,267,787 tokens (parent 34.8M over 258 steps, children 6.1M). eve's default `maxInputTokensPerSession` is 40M, so it emits `input.requested` kind `session-limit` and parks. |
| 21:19 to 08:56 (+1 day) | Six owner messages. Each is `turn.started`, `message.received`, `turn.completed` with no model step; eve queues them and concatenates the text. |
| 2026-10-03 14:19:25 | Answered with `inputResponses` `{optionId: "continue"}`. The queued messages run. The three reports that finished during the pause never arrive. |

## Causes

1. The macOS app read only `kind == "question"` from `input.requested`; the session-limit request
   was dropped, so nothing told the owner the chat was waiting on him.
2. eve's 40M per-session input default counts cache reads (the last step: 289,669 of 289,929 input
   tokens were cache reads). At about 290k tokens a step, a busy long-lived bot chat reaches it in
   days. Drive Admin was at 11.2M.
3. The router's 180 s total cap (`REQUEST_TOTAL_MS`) applied to streaming calls while tokens still
   flowed, killing sub-agents writing long reports.
4. The app showed nothing per sub-agent, and no check notices a finished report that never reached
   the parent.

## What changed (branch fix/subagent-progress-and-limits)

- `agent/agent.ts`: `limits.maxInputTokensPerSession: false`. The router's daily budgets stay the
  spend guard.
- Router: streaming calls keep the 180 s cap only until headers arrive; then the idle timers govern,
  with a 15 minute backstop.
- Proxy: accepts eve's structured `inputResponses`; serves a sub-agent's stream read-only once it is
  verified against the bound parent's `subagent.called` event.
- macOS: any non-question request shows as a "waiting on you" card; held messages are tagged
  queued; a collapsible sub-agent card per launching turn shows each sub-agent's live step, timer,
  report, failure with Retry, a quiet warning and a "report not delivered" hand-off.

## Live checks in Useful Bot Dev (Test Bot, GLM 5.3 Flash, same day)

Sub-agents are disabled on `main` since UB-009 PR A, so the checks ran on dev-only builds with the
`agent` tool enabled and a small session cap; neither override was committed.

- **eve batches reports.** Run 1: children finished at +16 s, +22 s and +40 s; eve held every report
  and delivered all three in one parent message at +43 s. Run 2 behaved the same. So a finished
  sub-agent is not "working": the card now shows "Done, report on its way" from the child's own
  stream, and "report not delivered" waits until the whole batch is done and the bot idle.
- **eve drops the message whose turn raised the limit.** With a 150k cap: probe 18 raised the
  request, probe 19 was queued; after Continue eve replayed only probe 19. Probe 18 was never
  answered. This is what happened to the first critic report in the incident. The app now holds that
  row and, once dropped, shows "<Bot> never got this message" with Send again.
- **eve replays queued messages as new messages**, which showed each queued bubble twice; the replay
  now folds into the held rows.
- **eve fixes limits at session creation** (`create-session-step.js`). Uncapping in `agent.ts`
  applies to new sessions only; an existing chat keeps the 40M default, so the waiting card is
  what keeps it from going silent.
- **A child session was bound to the bot as a root** by the agent (`boundBotId`), because eve's
  dynamic resolver context has no `session.parent`. The proxy then refused every child-stream read.
  Fixed: a child (`channel.kind` "subagent") is never bound as a root.
- Two child calls failed with the provider's own `upstream service timeout` (30 s) and `request
  failed` (122 s); not the router cap. The bot relaunched them and all reports landed.

## Open

- Sub-agents stay disabled until PR 2 propagates bot ownership and grants to child sessions.
- Generalist steps carry about 290k tokens of context; earlier compaction would cut cost and time.
