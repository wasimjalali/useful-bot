# Pi engine: delivery plan

Status: draft 2, 2026-10-24. Companion to `SPEC.md` (decisions D1 to D26, sections cited as
SPEC 5.3 and so on). Each PR below is one session's work. An implementing agent reads this file,
the SPEC sections it names and the matching `app-map/*.md`, then builds.

## Order

```
PR 1  router accepts Pi requests                 main   (eve still runs)
PR 2  one strong bot                             main   (eve still runs)
PR 3  engine swap, feature branch feat/pi-engine -> main as one PR
        orchestrator contract commit, then W1 engine, W2 tools, W3 web and ops, W4 Swift
PR 4  one-release-later cleanup                  main
```

- PR 1 and PR 2 are independent and can run in parallel sessions (no shared files).
- PR 3 starts after both merge. It ships in one release with the clean slate (SPEC D22, D23).
- PR 4 lands in the release after PR 3's.

Every PR follows the global change loop: worktree, build, self-check (`npx tsc --noEmit` for the
root, `router/` and `web/` separately; node tests; `macos/test.sh` when Swift changes), live check
in Useful Bot Dev with Test Bot, artifacts in `verify/<branch>/`, docs updated, PR, review, merge,
then `npm run build:dev-app` and `npm run install:dev-app` from main. Full E2E suites run only
after a PR's last review round; a newly written spec runs on its own first.

Reviews (GPT paused until 2026-11-01: Opus takes the GPT slot, GLM 5.3 runs beside it):

| PR | Row | Reviewers |
|---|---|---|
| 1 | feature | Sonnet + Opus + GLM 5.3, medium |
| 2 | feature, stored roster state | Sonnet + Opus + GLM 5.3, high |
| 3 | sensitive (process auth, state, concurrency, data drop) | Sonnet + Opus + Opus + GLM 5.3, high; split by worker area so every file has one reviewer |
| 4 | small | Sonnet, medium |

---

## PR 1: router accepts Pi requests

**Goal:** the router takes what Pi's `openai-completions` client sends, while eve keeps working.

**Owns:** `router/src/index.ts`, `router/src/inline-think.ts`, `shared/inline-think.ts`,
`router/test/contracts.test.ts`, `test/inline-think.test.ts`, new `router/test/fixtures/
pi-request.json`, new `scripts/restamp-registry.mjs`, new `scripts/dev/pi-golden-payload.mjs`.

**Change (SPEC 8):**
1. Accept `max_completion_tokens` as an alias of `max_tokens`; replace the `> 4096` refusal
   (`index.ts:439-442`) with a clamp to the resolved output cap, before the reservation
   (`index.ts:636`).
2. Accept and drop `store`, `reasoning_effort`, `prompt_cache_key`, `prompt_cache_retention`
   (extend `DISCARDED_SAMPLING_KEYS`, `index.ts:388`); map role `developer` to `system`
   (`index.ts:253`, `:340`).
3. Extend `withoutReasoning`, `rewrapThinkHistory` (`inline-think.ts:312-355`) and message
   validation (`index.ts:353`) to `reasoning`, `reasoning_text`, `reasoning_details`.
4. Keep `tool-finish.ts` (eve needs it until PR 3).
5. `scripts/restamp-registry.mjs`: writes `sha256(package-lock.json)` into both
   `packageLockHash` fields of `shared/registry.json`.

**Golden payload:** `scripts/dev/pi-golden-payload.mjs` builds a request with
`@earendil-works/pi-ai`'s `openai-completions` builder from the globally installed Pi (dev only,
not a dependency), using SPEC 5.3's compat, a tool call history, an image and a reasoning field;
it writes `router/test/fixtures/pi-request.json`. The contract test asserts the router accepts it
and forwards the expected upstream body.

**Verify:** all router tests green; live, one normal turn in Useful Bot Dev still works on eve.

---

## PR 2: one strong bot

**Goal:** one all-round bot plus at most one more; no groups, sections, cross-bot tools or
sub-agents. Still on eve. Decisions SPEC D5 to D8, D20, D25. Tool merges (D21) wait for PR 3.

**Node worker owns:**
- delete `agent/tools/{list_bots,rail_action,delete_bot,propose_bot,propose_group,post_to_group,
  send_to_bot,update_bot_profile,clear_history,review,list_models}.ts`;
- `agent/instructions.md` (one bot, under 950 words, no team, peer, handoff, sub-agent or
  reviewer text), `agent/skills/**`, `test/prompt-texts.test.ts`, `test/skills.test.ts`;
- `agent/lib/permission.ts` (drop caller roles), `agent/lib/active-bot.ts`,
  `agent/lib/turn-snapshot.ts` (sub-agent and roster parts), `agent/agent.ts` (`disableTool` for
  eve `agent` and `task_cancel`);
- `shared/shell-store.ts`, `shared/shell-io.ts`, `shared/threads.ts` (delete group and mention
  code; keep `stripThreadPrefix` and the default bot id, which other files still import),
  `shared/context-blocks.ts`, `shared/admission.ts` (group branch), `shared/agent-store.ts`
  (bot, group, profile and fan-out proposal kinds), `shared/bot-face.ts`, `shared/subagent-stops.ts`;
- `web/app/api/shell/route.ts`, `web/lib/agent-exec.ts` (fan-out, first brief, cross-bot
  deliveries; **keep** the handoff pump for connect-card resume, the only remaining handoff use),
  `web/app/api/agent/tick/route.ts`, `web/lib/eve-session-auth.ts` (child-stream verification),
  `web/app/eve/v1/[...path]/route.ts` (child stream and child cancel), `shared/eve-proxy.ts`
  (child parsing, mentions), `web/app/api/approvals/route.ts`, `web/app/api/reviewer/` (delete);
- tests: `cross-bot`, `multi-agent`, `agents`, `envelopes`, `admission`, `session-binding`,
  `turn-snapshot`, `first-brief`, the group cases of `shell-store` and `context-blocks`.

Rules it builds:
- Bot cap 2: `createBot` refuses a third with `bot_cap_reached`.
- Archive (D6): a one-time shell migration (marker `shell.json.archived-v1`) marks every bot except
  `bot-useful` and the most recently used other bot `archived: true`, pauses their routines, deletes
  nothing. Shell actions `archiveBot` and `restoreBot`. In the dev stack, bots named in
  `perf/fixtures.dev.lock.json` are exempt (the perf guard still needs them until PR 3).
- `GENERALIST_SEED_V3` without team language.

**Swift worker owns:** `App/RailView.swift`, `App/RootView.swift` (create-group dialog, sections),
`App/PickerViews.swift`, `App/ProposalCardView.swift`, `App/SettingsPaneView.swift` (group fields
out; Archived bots with Restore in), `App/ChatDetailsPaneView.swift`, `App/ChatView.swift`
(sub-agent cards, handoff and post strips, group header), `App/SubagentCard.swift` (delete),
`App/AvatarStackView.swift` (delete), `App/ProvidersPaneView.swift` and `App/AppSettingsView.swift`
(reviewer row), `App/ComposerView.swift` (group placeholder), `Core/SubagentRuns.swift` and
`Core/SubagentCard.swift` (delete), `Core/Threads.swift` (keep `defaultBotId`),
`Core/ChatAttribution.swift` (delete), `Core/ShellActions.swift`, `Core/Proposal.swift`,
`Core/TranscriptBlocks.swift`, `Core/Transcript.swift`, `Core/BackendModels.swift`, the sub-agent
branches of `Core/EveStream.swift` and `App/AppModel.swift`, and the Swift tests that cover these
(`SubagentCardTests`, `SubagentRunTests`, `ThreadsTests`, `ChatAttributionTests`, the group and
fan-out cases of `TranscriptTests`, `TranscriptBlocksTests`, `ProposalTests`, `ShellActionsTests`).

**Verify:** node and Swift suites green. Live in Useful Bot Dev: the rail shows the two bots; a
third cannot be created; an archived bot appears in Settings and restores; Test Bot runs a turn
with bash and an approval; a routine runs; asked to "use a sub-agent", the bot does the work
itself; connecting an app resumes the chat. Screenshots of rail, chat, Settings.

---

## PR 3: engine swap (feature branch `feat/pi-engine`)

**Goal:** SPEC 5 to 9 and 11 to 14. eve is gone; the app runs on the Pi engine with a clean slate.

### Step 0: orchestrator contract commit (before any worker starts)

In `.claude/worktrees/pi-engine` from main:

1. **Renames** (SPEC 13 rename table), mechanical, all call sites: `shared/stack.ts`,
   `shared/policy.ts`, `scripts/service.mjs` mode and `servicePorts()`, `package.json` scripts,
   `shared/launchd-render.ts`, `ops/launchd/`, `web/lib/api-guard.ts`, `tsconfig.json`,
   `.gitignore`. Swift renames are W4's.
2. **Tool contract:** `agent/lib/tool.ts` with `ToolCtx`, `RowInput`, `defineTool` (SPEC 5.8) and
   a working shim; `agent/tools/index.ts` exporting `allTools(): ToolDefinition[]` (W2 fills it).
3. **Host interfaces (stubs W1 implements, others call):** `agent/engine/api.ts` with
   `appendRow(botId, chatId|null, row)`, `systemTurn(botId, key, text)`, `runRoutine(id)`,
   `botContext(botId)`; `shared/shell-store.ts` gains the signature
   `setBotChat(botId, chatId, preview, at)` (W3 implements).
4. **Protocol fixtures:** `test/fixtures/chat-protocol/` with `rows-page.json`,
   `events-turn.ndjson` (deltas, a tool call, search results, a widget, a question),
   `events-failure.ndjson`, `events-queue.ndjson` (three sends, one cancel), `events-compaction.ndjson`,
   `events-resync.ndjson`. W1 tests its output against them; W4 tests its client against them.
5. `package.json` dependency diff (remove `eve`, `just-bash`, `ai`, `@ai-sdk/openai-compatible`,
   `postinstall`, `s1`; add `@earendil-works/pi-coding-agent`, `turndown`, exact), `npm install`,
   `node scripts/restamp-registry.mjs`. The tree will not type-check until the workers finish;
   that is expected on the feature branch.

### Workers (4 on the Mac, each in its own worktree from the contract commit)

**W1 engine core** (sonnet-sweeper; the orchestrator's brief carries the host design):
`agent/server.ts`, `agent/engine/**` (`pi-host.ts`, `provider.ts`, `chats.ts`, `turns.ts`,
`queue.ts`, `rows.ts`, `events.ts`, `context.ts`, `routines.ts`, `internal.ts`, `http.ts`,
`migrate.ts`, `api.ts`), `agent/lib/{router-fetch,router-identity,turn-snapshot,
outside-content}.ts`, `test/engine/**`, `test/turn-snapshot.test.ts`,
`test/router-identity.test.ts`. Builds SPEC 5.1 to 5.7, 5.11, 5.12, 6, the boot-time migration
runner of SPEC 11 (`migrate.ts`, which calls W3's store functions) and contract
tests 1 to 8 and 11 to 14 against a fake router (`test/engine/fake-router.ts`). Done when those
pass, the fixtures match, and `npx tsc --noEmit` is clean for `agent/engine` and `agent/server.ts`.

**W2 tools** (sonnet-worker): `agent/lib/tool.ts` (beyond the contract), `agent/tools/**`,
`agent/lib/{approvals,write,permission,memory,workspace,sandbox,run-command,command-risk,
cli-registry,connector-risk,guard-hint,lenient-null,model-window}.ts`, `agent/skills/**`,
`agent/instructions.md`; deletes `agent/agent.ts`, `agent/channels/`, `agent/connections/`,
`agent/hooks/`, `agent/sandbox/`, `agent/memory/notes.ts` (renderer into `shared/notes-block.ts`),
`agent/instructions/context.ts`, `agent/lib/{active-bot,channel-auth,openapi-approval,
session-model,session-owners,web-fetch-fence}.ts`; `shared/{connection-tools,
connection-tools-store,tool-wire-size,notes-block,json-schema-zod,mcp-apps,connection-auth}.ts`;
`scripts/tool-schema-size.mjs`; tests `lenient-tool-input`, `mcp-on-demand`, `connection-tools`,
`connector-tools`, `cli-tools`, `images`, `agent-tools`, `planted-config`, `openapi-approval`
(delete), `notes-slot`, `write-approval`, `memory`, `command-risk`, `sandbox`, `approvals-persist`,
`routines`, `skills`, `tool-cap`, `tool-schema-size`, `prompt-texts`, `fixture-tool` (delete),
`spikes/s3/approvals.test.ts`. Builds SPEC 5.8 to 5.10 and contract tests 9 and 10. Done when
those tests pass and the 16 tools' schemas total under 15,000 chars.

**W3 web, shared and ops** (sonnet-worker): `web/app/api/**` per SPEC 7 (new `chats`,
`engine/status`, `proposals`; changed `agent/tick`, `agent/widget`, `routines/[id]/run`, `status`,
`shell`, `approvals`, `bots/context`; deleted `agent/state`), `web/app/eve/**` (delete),
`web/lib/{agent-exec,eve-session-auth,image-regenerate,providers-write}.ts`,
`shared/{eve-proxy,eve-stream,continuation-brief,session-bindings,admission,workspace-store,
agent-store,shell-store,shell-io,threads,handoffs,agents-send,subagent-stops,bot-face,
context-blocks,session-selection,connect-flow,connection-flow,media-store,widgets-store,
turn-input}.ts`, `router/src/tool-finish.ts` (delete) and its uses in `router/src/index.ts`,
`scripts/{service,verify,build-runtime,setup-local,smoke-runtime,patch-eve,ios-contract-fixtures,
ios-pairing-gate}.*`, `test/fixtures/ios-contract/**`; tests `eve-stream`, `eve-proxy-guard`,
`channel-auth`, `session-owners`, `session-binding`, `continuation-brief`, `handoff-stream`,
`cross-bot`, `multi-agent`, `first-brief`, `agents`, `envelopes` (delete or rewrite), `admission`,
`model-switching`, `shell-store`, `seed-overlay`, `context-blocks`, `launchd-render`,
`setup-local`, `router-entry`, `ios-contract`, `dev-stack`, `widget-sweep`, `media-store`,
`connect-flow`, `connection-flow`, the tool-finish cases of `upstream-adapters` and
`local-stream-usage`, `router/test/contracts.test.ts` (tool-finish cases). Builds SPEC 7, 8
(tool-finish), 11 (the `shell.json` v2 migration function in `shell-store.ts` and the
image-prompt backfill function in `media-store.ts`, both called by W1's `migrate.ts`), 13. Done when web routes pass
against a stub engine and `npx tsc --noEmit` is clean for `web/` and `router/`.

**W4 Swift** (sonnet-sweeper): every file under `macos/Sources/**` and `macos/Tests/**` that SPEC
9 names, including `Core/{EveStream,BackendClient,BackendModels,Transcript,TranscriptBlocks,
ReplayGate,ChatSnapshot,UnsentMessages,Attachments,LocalServices,ServiceSupervisor,AppVariant,
RuntimeInstall,ShellActions,Proposal}.swift`, `App/{AppModel,ChatView,RailView,PickerViews,
SettingsPaneView,TurnNotifier,ComposerView,PerfHarness}.swift`, and the tests in
`app-map/swift.md` 7.1 to 7.3. Builds against the protocol fixtures; no running engine needed until
integration. Done when `macos/test.sh` passes and the app builds.

### Ownership rules

- Orchestrator only: `package.json`, `package-lock.json`, `shared/registry.json`,
  `shared/stack.ts`, `shared/policy.ts`, `tsconfig.json`, `.gitignore`, `AGENTS.md`, `README.md`,
  `perf/**`, `scripts/perf-fixtures.mjs`, `scripts/restamp-registry.mjs`, `test/fixtures/
  chat-protocol/**` and the `npm test` list.
- Step 0 stubs (`agent/lib/tool.ts`, `agent/tools/index.ts`, `agent/engine/api.ts`, the
  `setBotChat` signature) are written by the orchestrator; after step 0 each belongs to the worker
  whose list names it (`agent/engine/api.ts` W1, `agent/lib/tool.ts` and `agent/tools/index.ts`
  W2, `shared/shell-store.ts` W3).
- A worker that needs a change outside its list reports back instead of editing.
- Any file that mentions eve and is not listed above belongs to the worker whose folder it is in
  (`agent/` W2 unless under `agent/engine` or the W1 lib list; `web/`, `shared/`, `scripts/`,
  `router/` W3; `macos/` W4). Before opening the PR the orchestrator runs
  `git grep -n -E '\beve\b|node_modules/eve|eve/v1|evePort|eveOrigin|EVE_|UB_EVE' -- ':!docs' ':!evals'`
  and every hit must be one of the one-release-kept items (the Swift supervisor's eve process
  patterns and the engine's boot-time eve-listener kill, SPEC 5.1 and 9), removed in PR 4.

### Integration (orchestrator)

1. Merge W1 to W4 into the feature branch; rewrite the `npm test` list; run every suite.
2. `scripts/perf-fixtures.mjs` writes the four synthetic fixture chats of `bot-perf`; update
   `perf/config.json`, `perf/runner/perfguard.py` (rows marks, snapshot cases out, fixture check by
   entry count), `perf/README.md`, re-lock.
3. `npm run build:dev-app`, `npm run install:dev-app` (shared resource, orchestrator only).
4. E2E scenario of SPEC 14 through the heavy lock; artifacts in `verify/feat/pi-engine/`.
5. Golden eval: the eve baseline runs on main before step 1, the Pi run here (owner approves the
   spend first). Write-up in `evals/results/`.
6. `perf:check` baseline on the new engine; review budgets; commit the records.
7. Docs: `AGENTS.md`, `README.md`, `docs/audit/SCOREBOARD.md`, this plan's status.
8. One PR to main; the review row above; then merge, build and install the dev app.

---

## PR 4: one-release-later cleanup

Remove the eve patterns from the Swift supervisor (`isStrayServiceLine`, `isOwnNodeProcess`) and
the engine's eve-listener kill at boot, once every install has run the PR 3 release. Delete any
`.eve` reference left in `RuntimeInstall.swift`. Small-PR review row.

---

## What the owner decides or does

- Confirm or override SPEC 4 defaults, especially D5 and D6 (cap 2, archive), D17 (OpenAPI
  dropped), D25 (reviewer role removed).
- Approve the golden-eval spend (two runs of 10 tasks on his subscriptions).
- Ship the PR 3 release when he decides (`npm run release:mac`); its notes say old chats are not
  carried over.
