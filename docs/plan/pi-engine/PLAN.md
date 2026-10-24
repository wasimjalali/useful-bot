# Pi engine: delivery plan

Companion to `SPEC.md` (decisions D1 to D25, sections cited as SPEC 5.3 and so on). Each PR below
is one session's work. Briefs are self-contained: an implementing agent reads this file, the SPEC
sections it names and the matching `app-map/*.md`, then builds.

## Order

```
PR 1  router accepts Pi requests          main     (eve still runs)
PR 2  one strong bot                      main     (eve still runs)
PR 3  eve chat export                     main     -> release 1.2.0 (owner ships)
PR 4  engine swap (feature branch)        feat/pi-engine -> main as one PR
        W1 engine core   W2 tools   W3 web, ops, deps   W4 Swift client   W5 import
PR 5  perf fixtures, budgets, cleanup     main     -> release 1.3.0 (owner ships)
```

PR 1, 2 and 3 are independent of each other and can run in parallel sessions. PR 4 starts after
PR 1 and PR 2 merge (it builds on the single-bot code). PR 3 must ship in a release before PR 4's
release reaches users, so every chat is exported while eve can still read it.

Every PR follows the global change loop: worktree, build, self-check (`npx tsc --noEmit` for
root, `router/` and `web/` separately; node tests; `macos/test.sh` when Swift changes), live check
in Useful Bot Dev with Test Bot, artifacts in `verify/<branch>/`, docs updated, PR, review, merge,
`npm run build:dev-app` and `npm run install:dev-app` from main.

Reviews (GPT paused until 2026-11-01, so Opus takes the GPT slot and GLM 5.3 runs beside it):

| PR | Row | Reviewers |
|---|---|---|
| 1 | feature | Sonnet + Opus + GLM 5.3, medium |
| 2 | feature, touches stored roster state | Sonnet + Opus + GLM 5.3, high |
| 3 | feature, reads user data | Sonnet + Opus + GLM 5.3, medium |
| 4 | sensitive (process auth, state, concurrency, migration) | Sonnet + Opus + Opus + GLM 5.3, high |
| 5 | small | Sonnet, medium |

---

## PR 1: router accepts Pi requests

**Goal:** the router takes the requests Pi's `openai-completions` client sends, while eve keeps
working unchanged.

**Owns:** `router/src/index.ts`, `router/src/inline-think.ts`, `shared/inline-think.ts`,
`router/test/contracts.test.ts`, `test/inline-think.test.ts`, new `scripts/restamp-registry.mjs`,
`shared/registry.json` (restamp only if the lockfile changes; it should not in this PR).

**Change (SPEC 8):**
1. Accept `max_completion_tokens` as an alias of `max_tokens`. Replace the `> 4096` refusal
   (`index.ts:439-442`) with a clamp to the resolved output cap, before the reservation
   (`index.ts:636`).
2. Accept and drop `store`, `reasoning_effort`, `prompt_cache_key`, `prompt_cache_retention`
   (extend the `DISCARDED_SAMPLING_KEYS` pattern at `index.ts:388`).
3. Map role `developer` to `system` (`index.ts:253`, `:340`).
4. Extend `withoutReasoning` and `rewrapThinkHistory` (`inline-think.ts:312-355`) and message
   validation (`index.ts:353`) to `reasoning`, `reasoning_text`, `reasoning_details`.
5. Do **not** remove `tool-finish.ts` (eve needs it until PR 4).
6. `scripts/restamp-registry.mjs`: writes `sha256(package-lock.json)` into both
   `packageLockHash` fields; `test/registry-lock.test.ts` keeps passing.

**Verify:** new contract tests with a golden Pi request body. Produce it by running
`@earendil-works/pi-ai`'s `openai-completions` request builder (dev-only script, not a dependency
of the app) with the SPEC 5.3 compat, save the JSON as `router/test/fixtures/pi-request.json`,
assert the router accepts it and forwards the expected upstream body. All existing router tests
green. Live: one normal chat turn in Useful Bot Dev still works on eve.

---

## PR 2: one strong bot

**Goal:** Useful Bot runs one all-round bot plus at most one more, with no groups, sections,
handoffs, fan-out, cross-bot tools or sub-agents. Still on eve.

**Decisions:** SPEC D5 to D8, D20 (multi-bot tools only; `review`, `list_models`,
`clear_history`, `update_bot_profile` also go), D21 is **not** in this PR (tool merges land with
the shim in PR 4).

**Workers (2, disjoint files):**

- **Node worker owns:** `agent/tools/{list_bots,rail_action,delete_bot,propose_bot,propose_group,
  post_to_group,send_to_bot,update_bot_profile,clear_history,review,list_models}.ts` (delete),
  `agent/instructions.md` (rewrite for one bot, under 950 words, no team, peer, handoff or
  sub-agent text), `agent/skills/**` (trim), `agent/lib/permission.ts` (drop caller roles),
  `agent/lib/active-bot.ts`, `agent/lib/turn-snapshot.ts` (sub-agent and roster parts),
  `shared/shell-store.ts`, `shared/shell-io.ts`, `shared/threads.ts`, `shared/handoffs.ts`,
  `shared/agents-send.ts`, `shared/subagent-stops.ts`, `shared/context-blocks.ts`,
  `shared/agent-store.ts` (proposal kinds), `shared/bot-face.ts`, `web/app/api/shell/route.ts`,
  `web/lib/agent-exec.ts` (handoff pump, fan-out, first brief), `web/app/api/agent/tick/route.ts`,
  `web/lib/eve-session-auth.ts` (child-stream verification), `web/app/eve/v1/[...path]/route.ts`
  (child stream and child cancel), `shared/eve-proxy.ts` (child parsing, mentions),
  `web/app/api/approvals/route.ts`, the node tests that cover these.
  - Disable eve's `agent` and `task_cancel` built-ins with `disableTool`.
  - Bot cap 2: `createBot` refuses a third (`bot_cap_reached`).
  - Archive (D6): a one-time shell migration marks every bot except `bot-useful` and the most
    recently used other bot `archived: true`; routines of archived bots paused; nothing deleted.
    The marker file `shell.json.archived-v1` makes it run once.
  - Connect-card resume (D19, interim): until the engine exists, deliver it as a direct turn to
    the bot (`runEveTurn` with origin system) instead of a handoff.
- **Swift worker owns:** `App/RailView.swift`, `App/RootView.swift` (create-group dialog,
  sections), `App/PickerViews.swift`, `App/ProposalCardView.swift`, `App/SettingsPaneView.swift`
  (group fields; new Archived bots list with Restore), `App/ChatDetailsPaneView.swift`,
  `App/ChatView.swift` (sub-agent cards, handoff/post strips, group header),
  `App/SubagentCard.swift`, `App/AvatarStackView.swift`, `Core/SubagentRuns.swift`,
  `Core/SubagentCard.swift`, `Core/Threads.swift`, `Core/ChatAttribution.swift`,
  `Core/ShellActions.swift`, `Core/Proposal.swift`, `Core/TranscriptBlocks.swift` (summary and
  handoff collapse), `Core/Transcript.swift` (group attribution, handoff envelope),
  `Core/BackendModels.swift` (group and section fields), the sub-agent branches of
  `Core/EveStream.swift` and `App/AppModel.swift`, and the Swift tests in `app-map/swift.md` 7.1
  and 7.2 that cover these.

**Verify:** node and Swift suites green. Live in Useful Bot Dev: rail shows the two bots; a third
bot cannot be created; an archived bot appears in Settings and restores; Test Bot runs a turn
with bash and an approval; a routine runs; no sub-agent card can appear (ask the bot to "use a
sub-agent", it does the work itself). Screenshots of rail, chat, Settings.

---

## PR 3: eve chat export

**Goal:** every chat that exists only in eve's store is exported while eve can still read it.

**Owns:** new `web/lib/eve-export.ts`, a call from the tick route (one step per tick, low
priority), `shared/stack.ts` (export path helper), Settings status line in
`App/SettingsPaneView.swift`, tests.

**Change (SPEC 11.1):** for each bot's current session and recents, read the stream with the
existing carry-over reader (`readSessionEvents`, raise the caps for export only, stream to disk),
write `<stateRoot>/export/eve-chats/<botId>/<sessionId>.ndjson`, a Markdown rendering, and
`index.json`. Resumable (skip sessions whose export is complete and whose tail event id is
unchanged), one session at a time, stops while a turn runs. Never writes inside `.eve/`.

**Verify:** dev app: every recent of Test Bot exported; Markdown readable; re-run is a no-op; a
12k-event chat exports without freezing the UI (record CPU and time). Write-up of sizes and
timings in `evals/results/<date>-eve-export.md`.

**Owner step:** release 1.2.0 (PR 1 to 3) through `npm run release:mac` when he decides.

---

## PR 4: engine swap (feature branch `feat/pi-engine`)

**Goal:** SPEC 5 to 9, 11.2, 12 to 14. eve is gone; the app runs on the Pi engine.

The orchestrator creates `feat/pi-engine` in `.claude/worktrees/pi-engine` from main (after PR 1
and 2), writes the protocol fixtures first (below), then starts the workers in their own
worktrees. Workers report back; the orchestrator merges their branches into the feature branch,
runs the E2E and opens one PR to main.

**Orchestrator-only files:** `package.json`, `package-lock.json`, `shared/registry.json`,
`AGENTS.md`, `README.md`, `shared/stack.ts`, `shared/policy.ts`, protocol fixtures.

**Protocol fixtures (first commit on the branch):** `test/fixtures/chat-protocol/` with
`rows-page.json`, `events-turn.ndjson` (a turn with deltas, a tool call, a search result, a
widget, a question), `events-failure.ndjson`, `events-queue.ndjson`, `events-compaction.ndjson`,
`events-epoch-change.ndjson`. Both the engine (W1) and the Swift client (W4) test against them.

### W1 engine core (sonnet-sweeper; Opus designs the host in the brief)

Owns `agent/server.ts`, `agent/engine/**` (new: `pi-host.ts`, `provider.ts`, `chats.ts`,
`turns.ts`, `rows.ts`, `events.ts`, `routines.ts`, `http.ts`, `migrate-boot.ts`),
`agent/lib/router-fetch.ts`, `agent/lib/router-identity.ts`, `agent/lib/turn-snapshot.ts`
(keep `buildSnapshot` only), `agent/lib/outside-content.ts`, `test/engine/**`.

Builds SPEC 5.1 to 5.7, 5.11, 5.12, 6. Contract tests 1 to 12 of SPEC 14 with a fake router
upstream (`test/engine/fake-router.ts`, an HTTP server that records requests and replays scripted
streams). Done when the contract tests and the fixture tests pass and `npx tsc --noEmit` is clean.

### W2 tools (sonnet-worker)

Owns `agent/lib/tool.ts` (new shim), `agent/tools/**`, `agent/lib/{approvals,write,permission,
memory,workspace,sandbox,run-command,command-risk,cli-registry,connector-risk,guard-hint,
lenient-null,model-window}.ts`, `agent/skills/**`, `shared/connection-tools*.ts`,
`shared/notes-block.ts`, the node tests for tools (`app-map/router-ops-tests.md` D: the N+shim
group).

Builds SPEC 5.8 to 5.10: shim, the 16-tool set with merges (D21), `ask`, `load_skill`, new
`web_fetch` (SSRF tests), `todo` on details, picked MCP tools registered as Pi tools, approval
actor on `chatId`, deletion of eve-only lib files. Done when every tool test passes against the
shim, tool schemas total under 15,000 chars (measure with the rewritten
`scripts/tool-schema-size.mjs`), and `npx tsc --noEmit` is clean.

### W3 web, ops, dependencies (sonnet-worker)

Owns `web/app/api/chats/**` (new), `web/app/eve/**` (delete), `web/lib/{agent-exec,
eve-session-auth}.ts`, `web/app/api/{agent/state,agent/tick,agent/widget,status,bots/context,
reviewer,approvals}/**`, `shared/{eve-proxy,eve-stream,continuation-brief,session-bindings,
admission,workspace-store,agent-store,launchd-render}.ts`, new `shared/turn-input.ts`,
`scripts/{service,verify,build-runtime,tool-schema-size}.mjs` (eve parts), `scripts/patch-eve.mjs`
(delete), `perf/config.json`, `router/src/tool-finish.ts` (delete and its uses, SPEC 8),
web and ops tests.

Builds SPEC 7, 8 (tool-finish only), 13. Hands the orchestrator the exact `package.json` diff;
the orchestrator applies it, runs `npm install`, restamps the registry. Done when web routes pass
their tests against a stub engine and `npx tsc --noEmit` is clean for `web/`.

### W4 Swift client (sonnet-sweeper)

Owns `Core/EveStream.swift` (split into `ChatProjection.swift` plus kept types), `Core/
BackendClient.swift` (chat section), `App/AppModel.swift` (chat core), `App/ChatView.swift`,
`Core/Transcript.swift`, `Core/TranscriptBlocks.swift`, `Core/ReplayGate.swift` and
`Core/ChatSnapshot.swift` (delete), `Core/UnsentMessages.swift`, `Core/Attachments.swift`,
`Core/{LocalServices,ServiceSupervisor,AppVariant,RuntimeInstall}.swift`, `App/PerfHarness.swift`,
`macos/Tests/**` for these.

Builds SPEC 9 against the protocol fixtures (no running engine needed until integration). Done
when `macos/test.sh` passes and the app builds.

### W5 import (sonnet-worker, starts after W1's `rows.ts` and `chats.ts` exist)

Owns `agent/engine/import/**`, `test/engine/import/**`.

Builds SPEC 11.2: export reader, offline `devalue` chunk reader, converter to Pi session JSONL,
Markdown archive, archived-bot handling, `migration.json`. Verified on a copy of the dev app's
`.eve/` (copied into a scratch folder, never in place) and on PR 3's exports.

### Integration (orchestrator)

1. Merge W1 to W5 into the feature branch, resolve, run every suite.
2. `npm run build:dev-app`, `npm run install:dev-app` (shared resource, orchestrator only).
3. E2E scenario of SPEC 14 through the heavy lock, artifacts in `verify/feat/pi-engine/`.
4. Golden eval on Pi (owner approves the spend first; the eve baseline runs before step 1 on
   main).
5. Docs: `AGENTS.md`, `README.md`, `docs/audit/SCOREBOARD.md` entry, this plan's status.
6. PR to main with the Local handoff checklist only if anything is left for the owner.

---

## PR 5: perf fixtures, budgets, cleanup

**Goal:** the release guard runs on the new engine.

Rebuild the four perf fixture bots as Pi sessions with the importer (no paid turns), re-lock,
re-baseline, review budgets (raise only in a reviewed edit that says why), commit the records
under `evals/results/`. Remove leftovers the swap could not delete in one go (for example the
`/.eve/` rsync exclude one release later). Owner then ships release 1.3.0.

---

## What the owner decides or does

- Ship release 1.2.0 (PR 1 to 3) before 1.3.0 so chats export while eve can read them.
- Approve the golden-eval spend (two runs of 10 tasks on his subscriptions).
- Confirm or override the defaults in SPEC 4, especially D5/D6 (cap 2, archive), D9 (recents),
  D17 (OpenAPI dropped), D22 (import scope).
- Remove `.eve/` data from Settings when he is satisfied with the import.
