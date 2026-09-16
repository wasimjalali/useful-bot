# Launch audit scoreboard

Started 2026-09-15. Orchestrated by Claude Code (Fable 5.1). Two auditor models run
through opencode at max reasoning: `opencode-go/muse-spark-1.3-contributor` (Spark)
and `opencode-go/glm-5.3-flash` (GLM). Each finding is verified by the orchestrator
against the code before it counts. Patches are handed to the models in turn and
scored on whether they were mergeable as delivered.

Earlier plan-level verdicts from the same models live in `docs/counsel/`.

## Method

- Slices: `mac-app` (macos/Sources/UsefulBotApp), `mac-core` (macos/Sources/UsefulBotCore),
  `web` (web/), `agent-router` (agent/, router/src), `shared-scripts` (shared/, scripts/).
- Each model reads the slice read-only and returns a JSON array of findings with file,
  line, severity, repro and fix. Same brief for both models, run in parallel.
- Verification outcomes: **confirmed** (real, patch it), **partial** (real problem, but
  the repro or cause is wrong, or no user impact), **false** (not a bug or unreachable),
  **dup** (same defect the other model, or the same model, already reported; Spark's
  runs finished first, so a shared find is usually credited to Spark and marked dup
  for GLM. Both found it independently).
- Patch outcomes: **mergeable** (landed as delivered), **rework** (landed after the
  orchestrator or the Spark review changed it), **redo** (thrown away, orchestrator
  patched it). Patch batches are split by file so the two models can run at once.
- One PR per slice, reviewed by a Spark pass before merge: #48 macOS, #49 web, #50 agent and shared, all merged 2026-09-15. Findings the orchestrator
  adds while verifying carry the `ORCH` prefix.

## Running totals (round 1)

| Model | Reported | Confirmed | Partial | False | Dup | Precision, non-dup findings that were real |
|-------|---------:|----------:|--------:|------:|----:|----------:|
| Spark | 37 | 26 | 5 | 5 | 1 | 86% (31 of 36) |
| GLM   | 39 | 25 | 2 | 0 | 12 | 100% (27 of 27) |

Reading the numbers: Spark is roughly twice as fast per slice and reports more, with a
handful of unreachable or by-design findings mixed in. GLM is slower, reports nothing
false so far, and found the two highest-impact defects of the round on its own (the
missing bot persona on server-driven turns, and the acting-bot resolution that nothing
ever sets).

| Model | Patches | Mergeable | Rework | Redo | Notes |
|-------|--------:|----------:|-------:|-----:|-------|
| Spark | 26 | 22 | 4 | 0 | macOS batch A, web batch D, agent batch G. Reworks: the Stop reload still blanked the chat during replay; late save errors not scoped to the bot; the web draft cleared before the body parsed; the banner Retry re-sent the fenced blob. The agent batch (stores, router search gate, scripts) reviewed clean. |
| GLM   | 28 | 25 | 3 | 0 | macOS batches B and E, web batch C, agent batch F. Reworks: the settings reseed watched the whole bot struct; an unguarded roster read in the persona prefix; one new test did not typecheck. |

Both models produced patches that landed as delivered most of the time. Every rework was
small (one hunk) and was caught by the Spark review pass or the typecheck, not by a user.

## Round 1

### Runs

| Slice | Model | Wall time | Findings | Notes |
|-------|-------|----------:|---------:|-------|
| web | Spark | 2m45s | 6 | Read every listed file plus the shared stores. |
| web | GLM | 8m17s | 9 | Slower, wider net: caught the missing persona on server-driven turns. |
| mac-core | Spark | 3m29s | 5 | Cross-checked Swift against the TypeScript ports. |
| mac-core | GLM | 14m22s | 4 | Found the mid-turn EOF being treated as a clean end. |
| mac-app | Spark | 4m26s | 8 | State-flow reasoning through AppModel. |
| mac-app | GLM | 9m33s | 6 | Deeper lifecycle bugs (cancel, stream failure, task cancellation). |
| agent-router | Spark | 5m07s | 7 | Reviewer never provisioned, search endpoint unthrottled. |
| agent-router | GLM | 12m44s | 11 | Acting-bot resolution, reviewer headers, bash maxBuffer. |
| shared-scripts | Spark | 3m56s | 11 | Store durability sweep, 12h token expiry, rotate ordering. |
| shared-scripts | GLM | 14m06s | 9 | Mostly the same store findings, plus two script nits. |

### Findings

Severity is the auditor's. The verdict column is the orchestrator's after reading the code.

| ID | Model | Sev | Kind | File:line | Title | Verdict | Patch by | Patch result | PR |
|----|-------|-----|------|-----------|-------|---------|----------|--------------|----|
| S-WEB-01 | Spark | high | bug | web/app/api/routines/[id]/run/route.ts:38 | Test run answers started before the claim | partial: the double click is closed by the synchronous in-flight set, but a claim that throws is swallowed with no history row | GLM | mergeable | #49 |
| S-WEB-02 | Spark | high | ux | web/components/bot-settings-panel.tsx:172 | Routines pane says the scheduler is not wired | confirmed | Spark | mergeable | #49 |
| S-WEB-03 | Spark | medium | bug | web/components/app-settings-dialog.tsx:394 | Usage meter ignores reserved tokens | confirmed | Spark | mergeable | #49 |
| S-WEB-04 | Spark | low | ux | web/components/app-settings-dialog.tsx:400 | "This week" label over 24h numbers | confirmed | Spark | mergeable | #49 |
| S-WEB-05 | Spark | high | bug | web/components/proposal-card.tsx:128 | Group-less fanout sends to one bot | false: post_to_group is the only fanout creator and always sets groupId | | | |
| S-WEB-06 | Spark | medium | ux | web/app/page.tsx:354 | Failed send leaves the rail preview | confirmed (web only; the Mac app stamps the preview after the send is accepted) | Spark | rework: the draft was cleared before the body parsed (Spark review) | #49 |
| S-MACCORE-01 | Spark | low | bug | macos/Sources/UsefulBotCore/ChatMarkdown.swift:190 | Table cell drops backslash | confirmed | GLM | mergeable | #48 |
| S-MACCORE-02 | Spark | medium | bug | macos/Sources/UsefulBotCore/EveStream.swift:240 | stripThreadPrefix looser than the TypeScript regex | confirmed, low in practice | GLM | mergeable | #48 |
| S-MACCORE-03 | Spark | medium | ux | macos/Sources/UsefulBotCore/BackendClient.swift:354 | shell() drops the server error code | confirmed | GLM | mergeable | #48 |
| S-MACCORE-04 | Spark | low | reliability | macos/Sources/UsefulBotCore/ServiceSupervisor.swift:51 | isNodeAvailable bypasses injected predicate | partial: real, but a test seam with no user impact; not patched | | | |
| S-MACCORE-05 | Spark | low | bug | macos/Sources/UsefulBotCore/Threads.swift:67 | Mention roster capped at 64 | false: documented bound against unbounded regex, roster never approaches it | | | |
| S-MACAPP-01 | Spark | high | bug | macos/Sources/UsefulBotApp/AppModel.swift:606 | Send no-ops on stale selectedBotId | false: every store write reconciles the selection synchronously, so the stale state cannot be observed | | | |
| S-MACAPP-02 | Spark | medium | ux | macos/Sources/UsefulBotApp/ChatView.swift:35 | Thread error has no retry | confirmed | Spark | mergeable | #48 |
| S-MACAPP-03 | Spark | medium | ux | macos/Sources/UsefulBotApp/PickerViews.swift:221 | Search tabs Files/Links/Routines/Actions never return results | confirmed | GLM | mergeable | #48 |
| S-MACAPP-04 | Spark | high | ux | macos/Sources/UsefulBotApp/ChatView.swift:132 | Approval with empty hash is a dead card | false: listPending always carries actionSha256, the empty string is a decode fallback | | | |
| S-MACAPP-05 | Spark | medium | data | macos/Sources/UsefulBotApp/SettingsPaneView.swift:285 | Settings fields seed once and clobber server renames | confirmed | GLM | rework: reseed watched the whole struct, so a just-committed edit flickered back until its echo | #48 |
| S-MACAPP-06 | Spark | low | ux | macos/Sources/UsefulBotApp/AppModel.swift:1332 | saveError leaks across bots | confirmed | Spark | rework: a save failing after a switch still painted the new bot | #48 |
| S-MACAPP-07 | Spark | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:1549 | Proposal buttons re-enable before reload | confirmed | Spark | mergeable | #48 |
| S-MACAPP-08 | Spark | medium | ux | macos/Sources/UsefulBotApp/AppSettingsView.swift:552 | Typed budget only commits on Return | confirmed | GLM | mergeable | #48 |
| S-AGENT-01 | Spark | high | bug | agent/tools/review.ts:11 | review tool returns fixture text as success without a token | confirmed: the reviewer token is never provisioned by scripts/service.mjs | GLM | mergeable | #50 |
| S-AGENT-02 | Spark | high | reliability | router/src/index.ts:429 | /v1/search bypasses rate limits, budgets and the concurrency gate | confirmed | Spark | mergeable | #50 |
| S-AGENT-03 | Spark | medium | reliability | shared/workspace-store.ts:183 | Workspace lock timeout shorter than stale window | dup of S-SHARED-01 (same run family) | | | |
| S-AGENT-04 | Spark | medium | bug | agent/tools/memory_upsert.ts:29 | memory_upsert consumes the approval before validating | confirmed | GLM | mergeable | #50 |
| S-AGENT-05 | Spark | medium | ux | agent/tools/memory_upsert.ts:33 | Memory approval card shows only the title | confirmed | GLM | rework: the test it added did not typecheck (a helper's return type) | #50 |
| S-AGENT-06 | Spark | low | data | agent/lib/memory.ts:355 | Memory upsert misses tag length and expiry validation | partial: the schema has no maxima, the expiry corruption claim is not verified | GLM | mergeable | #50 |
| S-AGENT-07 | Spark | low | reliability | agent/agent.ts:19 | SSE sleep leaks abort listeners | partial: that code is the S2 fixture path only, never runs in production; not patched | | | |
| S-SHARED-01 | Spark | high | reliability | shared/workspace-store.ts:183 | Workspace lock timeout shorter than its stale window | confirmed | Spark | mergeable | #50 |
| S-SHARED-02 | Spark | critical | data | shared/providers.ts:163 | providers.json written in place, reader throws | confirmed | Spark | mergeable | #50 |
| S-SHARED-03 | Spark | high | data | shared/connectors-store.ts:92 | Corrupt connectors.json throws forever | confirmed | Spark | mergeable | #50 |
| S-SHARED-04 | Spark | high | data | shared/web-sessions.ts:40 | Corrupt session file silently replaced | confirmed | Spark | mergeable | #50 |
| S-SHARED-05 | Spark | medium | reliability | shared/handoffs.ts:336 | dropHandoff passes dir as the claim token | confirmed | Spark | mergeable | #50 |
| S-SHARED-06 | Spark | medium | bug | shared/handoffs.ts:290 | markDelivered read-modify-write without a lock | false: every caller passes the claim token and ownership is checked first, so two pumps cannot both write | | | |
| S-SHARED-07 | Spark | low | bug | shared/composio-catalogue.ts:42 | Catalogue memo ignores its path | confirmed, tests only in practice | Spark | mergeable | #50 |
| S-SHARED-08 | Spark | high | reliability | scripts/service.mjs:178 | Web channel token minted once, expires after 12h | confirmed | GLM | mergeable | #49 |
| S-SHARED-09 | Spark | high | data | scripts/setup-local.mjs:70 | --rotate moves the config away before any key is written | confirmed | Spark | mergeable | #50 |
| S-SHARED-10 | Spark | low | bug | shared/composio.ts:409 | disconnectConnector lists only 100 accounts | confirmed, needs over 100 connected accounts; not patched this round | | | |
| S-SHARED-11 | Spark | medium | reliability | scripts/verify.mjs:92 | opencode case certifies a stale results file | partial: dev tooling, documented as needing --live; not patched | | | |
| G-WEB-01 | GLM | high | bug | web/lib/agent-exec.ts:309 | Routines and handoffs run without the bot persona | confirmed: runEveTurn never applies threadPrefix; only a session that already carries it from a UI turn keeps the role | GLM | rework: the new roster read was unguarded (Spark review, one hunk) | #49 |
| G-WEB-02 | GLM | medium | ux | web/components/app-settings-dialog.tsx:394 | Usage meter observed-only, mislabelled | dup of S-WEB-03 and S-WEB-04 | | | |
| G-WEB-03 | GLM | medium | ux | web/components/bot-settings-panel.tsx:172 | Routines stub | dup of S-WEB-02 | | | |
| G-WEB-04 | GLM | low | ux | web/components/chat-search-dialog.tsx:20 | Dead search tabs | confirmed (web twin of S-MACAPP-03) | Spark | mergeable | #49 |
| G-WEB-05 | GLM | low | ux | web/app/page.tsx:403 | Failed send restores the fenced attachment blob | confirmed | Spark | rework: the banner Retry still re-sent the blob with the chips left behind (Spark review); the retry was removed | #49 |
| G-WEB-06 | GLM | low | reliability | web/app/api/approvals/route.ts:20 | Approvals GET 500s on a locked store | confirmed | GLM | mergeable | #49 |
| G-WEB-07 | GLM | low | bug | web/app/page.tsx:777 | Picker create inherits stale section | confirmed | Spark | mergeable | #49 |
| G-WEB-08 | GLM | low | bug | web/lib/use-shell.ts:115 | Failed queued save swallowed behind a newer action | confirmed | GLM | mergeable | #49 |
| G-WEB-09 | GLM | low | ux | web/components/chat-composer.tsx:391 | Composer setting change fails silently | confirmed | Spark | mergeable | #49 |
| G-MACAPP-01 | GLM | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:759 | Stop wipes the transcript until a replay | confirmed, arguably high: the chat went blank after Stop | Spark | rework: the reload it added still blanked the chat during replay; orchestrator gated the eager rebuild | #48 |
| G-MACAPP-02 | GLM | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:734 | Stream failure after delivery restores the draft | confirmed | Spark | mergeable | #48 |
| G-MACAPP-03 | GLM | medium | ux | macos/Sources/UsefulBotApp/SettingsPaneView.swift:206 | Edits dropped on close or bot switch | confirmed | GLM | mergeable | #48 |
| G-MACAPP-04 | GLM | low | bug | macos/Sources/UsefulBotApp/AppModel.swift:753 | Stop during the POST orphans the turn | confirmed | Spark | mergeable | #48 |
| G-MACAPP-05 | GLM | low | bug | macos/Sources/UsefulBotApp/ComposerView.swift:795 | Hover task writes @State off the main actor | confirmed | GLM | mergeable | #48 |
| G-MACAPP-06 | GLM | low | bug | macos/Sources/UsefulBotApp/AppModel.swift:1622 | Cancelled memory load paints an error on the next bot | confirmed | Spark | mergeable | #48 |
| G-MACCORE-01 | GLM | high | bug | macos/Sources/UsefulBotCore/BackendClient.swift:1097 | Mid-turn EOF treated as a clean stream end | confirmed | GLM | mergeable (orchestrator shortened the copy) | #48 |
| G-MACCORE-02 | GLM | medium | bug | macos/Sources/UsefulBotCore/EveStream.swift:240 | stripThreadPrefix looser than the contract | dup of S-MACCORE-02 | | | |
| G-MACCORE-03 | GLM | low | reliability | macos/Sources/UsefulBotCore/LocalServices.swift:309 | Termination handler races registry.add, leaking a handle | confirmed | GLM | mergeable | #48 |
| G-MACCORE-04 | GLM | low | bug | macos/Sources/UsefulBotCore/ChatMarkdown.swift:190 | Table cell drops backslash | dup of S-MACCORE-01 | | | |
| G-AGENT-01 | GLM | high | bug | web/lib/agent-exec.ts:309 | Server-driven turns skip the identity prefix | dup of G-WEB-01 (same model, earlier run) | | | |
| G-AGENT-02 | GLM | high | bug | agent/subagents/reviewer/agent.ts:31 | Reviewer subagent cannot pass the router's session headers, wrong token fallback | confirmed | GLM | mergeable | #50 |
| G-AGENT-03 | GLM | high | bug | agent/tools/review.ts:14 | review tool omits the required x-useful headers | confirmed | GLM | mergeable | #50 |
| G-AGENT-04 | GLM | high | bug | agent/tools/create_routine.ts:45 | Nothing sets UB_ACTIVE_BOT_ID, so "this bot" is the selected bot | confirmed: twelve tools resolve the acting bot from a variable nothing sets; a routine or handoff for bot A while B is selected misattributes notes, routines and proposals | GLM | mergeable | #50 |
| G-AGENT-05 | GLM | medium | reliability | agent/lib/approvals.ts:214 | Approval records never pruned | confirmed | GLM | mergeable | #50 |
| G-AGENT-06 | GLM | medium | reliability | router/src/index.ts:435 | /v1/search bypasses rate limits | dup of S-AGENT-02 | | | |
| G-AGENT-07 | GLM | medium | security | agent/lib/write.ts:55 | write_file approval card shows only the path | confirmed | GLM | mergeable | #50 |
| G-AGENT-08 | GLM | medium | ux | agent/tools/memory_upsert.ts:33 | memory approval card shows only the title | dup of S-AGENT-05 | | | |
| G-AGENT-09 | GLM | medium | bug | agent/tools/bash.ts:136 | Output over 1 MiB fails the call with a raw maxBuffer error | confirmed | GLM | mergeable | #50 |
| G-AGENT-10 | GLM | low | data | shared/agents-send.ts:26 | Handoff to a one-member group flips its thread kind | confirmed | GLM | mergeable | #50 |
| G-AGENT-11 | GLM | low | data | agent/lib/memory.ts:457 | tagsForBot drops the bot tag at 8 tags | confirmed | GLM | mergeable | #50 |
| G-SHARED-01 | GLM | high | data | shared/providers.ts:163 | providers.json non-atomic, reader throws | dup of S-SHARED-02 | | | |
| G-SHARED-02 | GLM | critical | reliability | web/lib/agent-exec.ts:114 | Static 12h channel token | dup of S-SHARED-08 | | | |
| G-SHARED-03 | GLM | medium | reliability | shared/workspace-store.ts:184 | Lock stale window exceeds wait timeout | dup of S-SHARED-01 | | | |
| G-SHARED-03B | GLM | medium | data | shared/connectors-store.ts:92 | Corrupt connectors.json throws forever | dup of S-SHARED-03 | | | |
| G-SHARED-05 | GLM | medium | ux | scripts/service.mjs:101 | Router refuses to start without the opencode-go keychain item | partial: by design, the subscription is the primary upstream; not patched | | | |
| G-SHARED-06 | GLM | low | bug | shared/handoffs.ts:336 | dropHandoff passes dir as the token | dup of S-SHARED-05 | | | |
| G-SHARED-07 | GLM | low | ux | shared/threads.ts:214 | stripThreadPrefix can strip a look-alike user message | partial: known trade-off of the prefix scheme; not patched | | | |
| G-SHARED-08 | GLM | low | reliability | shared/live-models.ts:34 | models-cache.json written in place | confirmed | Spark | mergeable | #50 |
| G-SHARED-09 | GLM | low | ux | scripts/service.mjs:162 | Eve startup names the wrong keychain item on failure | confirmed | Spark | mergeable | #50 |
| ORCH-01 | orchestrator | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:772 | Attachments removed at send are not restored when the send fails | found while verifying G-WEB-05 | Spark | mergeable | #48 |

### Landed after the three slice PRs

- #52 `fix(agent)`: eve failed to boot after #50 because the reviewer subagent threw at module
  load when the reviewer token was absent. Found by restarting the services against main,
  not by either auditor or the Spark review of #50. The provider now builds either way and
  the first reviewer call fails with `reviewer_unconfigured`, reading the token per call.
- #53 `feat(agent)`: railAction gained `removeSection` (approval-gated) and `updateSection`,
  from the owner's brief mid-session. Verified live in the app.

### Open for round 2

- ORCH-02 (medium, ux): the macOS rail does not refresh while a turn is running (the store
  poll pauses so the optimistic session echo is not overwritten), so a section or bot a
  tool changed mid-turn appears only after the turn ends. Seen while verifying #53.
- Provision the reviewer credential (profile `reviewer`) in setup-local and service.mjs.
- Re-audit every slice against main with fresh briefs; re-verify the persona prefix on a
  routine run and the acting-bot resolution on a handoff.

### Not patched this round, for the owner

- The reviewer credential (`UB_ROUTER_REVIEWER_TOKEN`, profile `reviewer`) is never minted by
  scripts/setup-local.mjs nor passed to eve by scripts/service.mjs, so "ask the reviewer" can
  only run in fixture mode. The agent-slice patch makes the tool say so instead of returning
  placeholder text. Provisioning the credential is a setup change, not a bug fix.
- The web routines pane is now honest copy pointing at the Mac app. A web routines UI is a
  feature, not a fix, and the web surface trails the app by design.

## Running totals (round 2)

| Model | Reported | Confirmed | Partial | False | Dup | Precision, non-dup findings that were real |
|-------|---------:|----------:|--------:|------:|----:|----------:|
| Spark | 29 | 19 | 5 | 4 | 1 | 86% (24 of 28) |
| GLM   | 33 | 28 | 1 | 0 | 4 | 100% (29 of 29) |

Same shape as round 1. Spark reads a slice in 2.5 to 10 minutes and reports more, with the
by-design and unreachable items mixed in (two router findings the spec settles, one crash
claim a live test refuted, two repeats of round 1 verdicts). GLM takes 11 to 16 minutes, has
reported nothing false in two rounds, and again found the round's highest-impact defects on
its own: a docker binary on PATH stopping eve from booting, the handoff pump never
recovering from a retired session, the dev-only auth backdoor being live in the shipped web
tier, and the open chat never following its session.

| Model | Patches | Mergeable | Rework | Redo | Notes |
|-------|--------:|----------:|-------:|-----:|-------|
| Spark | 27 | 22 | 4 | 1 | macOS batch B, web batch B, agent batch A, shared batch B. Reworks: the ambiguous hint named the wrong tool; the connector throw path kept the truncation; the circuit still recorded success at headers and never counted timeouts; the quote parser shadowed its own name and the view recursed on an opaque type. Redo: disableTool on a top-level tool source made eve exit at boot, reverted. |
| GLM   | 27 | 17 | 10 | 0 | macOS batch A, web batch A, agent batch B, shared batch A. The macOS batch hit the 25 minute cap before it could summarise, but every item was implemented. Reworks: the follow loop seeded with in-progress turns and skipped them for good; perform() unscoped on success; the select-failure banner wiped by the repair switch; a Stop after the POST dropped the pointer; ctx dereferenced without the optional; botId frozen before the approval; the shared store pinned its first root; the claim takeover refused a vanished file; a narrowed type broke tsc; a new test asserted the wrong thing. |

Both models patched at the same rate; GLM's larger, riskier batches (AppModel, agent-exec)
drew more review reworks, all one hunk each. Every rework was caught by the Spark review,
the typecheck or a test, except the eve boot failure, which only the service restart found,
for the second round in a row.

## Round 2

Started 2026-09-15 late evening, finished 2026-09-16 early morning. Same slices, fresh briefs
that listed the round 1 fixes as already landed. Setup PRs before the audit: #55 (the reviewer
credential) and #56 (ORCH-02). Slice PRs: #57 web, #58 shared and scripts, #59 agent and
router, #60 macOS (plus the plant_read revert and this section), all squash-merged on
2026-09-16 after a clean Spark pass.

### Runs

| Slice | Model | Wall time | Findings | Notes |
|-------|-------|----------:|---------:|-------|
| mac-app | Spark | 2m37s | 8 | Two repeats of round 1 verdicts, one crash claim refuted live. |
| mac-app | GLM | 15m38s | 4 | Every one real: the silent save failures and the select bounce. |
| mac-core | Spark | 10m28s | 2 | A clip premise not in the code, and a round 1 repeat. |
| mac-core | GLM | 13m57s | 5 | Found the open chat never following its session. |
| web | Spark | 3m21s | 6 | Composer, dialogs and routes; all real, one partial. |
| web | GLM | 11m01s | 8 | Found the test backdoor live under next dev. |
| agent-router | Spark | 3m02s | 7 | Two by-design router findings the spec settles. |
| agent-router | GLM | 13m47s | 9 | Found the sandbox module refusing to boot with docker on PATH. |
| shared-scripts | Spark | 4m50s | 6 | Store and claim races, all real. |
| shared-scripts | GLM | 14m14s | 7 | Found the pump never rotating a retired session. |

### Findings

| ID | Model | Sev | Kind | File:line | Title | Verdict | Patch by | Patch result | PR |
|----|-------|-----|------|-----------|-------|---------|----------|--------------|----|
| S-MACAPP-01 | Spark | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:1342 | perform() failure paints saveError on whatever bot is open | confirmed | GLM | rework: the success path stayed unscoped and the bot was read inside the queued work (Spark review) | #60 |
| S-MACAPP-02 | Spark | high | ux | macos/Sources/UsefulBotApp/AppModel.swift:628 | Send silently does nothing when the selection is stale | partial: repeat of round 1 S-MACAPP-01 (ruled false); real only inside the 2.5s poll window after a server-side delete | GLM | mergeable | #60 |
| S-MACAPP-03 | Spark | medium | ux | macos/Sources/UsefulBotApp/AppSettingsView.swift:617 | Rejected budget input wipes what the owner typed | confirmed | Spark | rework: a server refusal still cleared it (Spark review) | #60 |
| S-MACAPP-04 | Spark | medium | bug | macos/Sources/UsefulBotApp/ChatDetailsPaneView.swift:571 | Rejected routine schedule edit stays on screen | confirmed | Spark | rework: the reseed could land over an in-flight write (Spark review) | #60 |
| S-MACAPP-05 | Spark | medium | ux | macos/Sources/UsefulBotApp/ChatView.swift:141 | Approval with an empty hash is a dead end | false: repeat of round 1 S-MACAPP-04, listPending always carries the hash | | | |
| S-MACAPP-06 | Spark | medium | ux | macos/Sources/UsefulBotApp/AppModel.swift:1838 | Later attachment success erases an earlier batch failure | confirmed | GLM | mergeable | #60 |
| S-MACAPP-07 | Spark | high | bug | macos/Sources/UsefulBotApp/ComposerTextView.swift:146 | Model-driven draft write can set an out-of-bounds selection | false: tested live, select-all then Send sends and the app stays up | | | |
| S-MACAPP-08 | Spark | low | ux | macos/Sources/UsefulBotApp/ProposalCardView.swift:126 | Group fanout says nobody is available next to Send to group | confirmed | Spark | mergeable | #60 |
| S-MACCORE-01 | Spark | medium | bug | macos/Sources/UsefulBotCore/EveStream.swift:412 | Optimistic user row folds only on exact equality | partial: the claimed server-side 2000 clip is in neither the proxy nor eve; deferred, not patched | | | |
| S-MACCORE-02 | Spark | low | bug | macos/Sources/UsefulBotCore/Threads.swift:67 | Mention roster capped at 64 | dup of round 1 S-MACCORE-05 (false) | | | |
| S-WEB-01 | Spark | medium | ux | web/components/chat-composer.tsx:408 | Adding files at the cap silently does nothing | confirmed | Spark | mergeable | #57 |
| S-WEB-02 | Spark | medium | bug | web/app/page.tsx:412 | Stop is dead while the first send has no session | confirmed | GLM | rework: a Stop after the POST answered dropped the pointer and kept the draft (security pass) | #57 |
| S-WEB-03 | Spark | medium | ux | web/components/app-settings-dialog.tsx:37 | Providers csrfHeaders hides an expired session | confirmed | Spark | mergeable | #57 |
| S-WEB-04 | Spark | medium | ux | web/components/marketplace-dialog.tsx:59 | Connectors csrfHeaders hides an expired session | confirmed | Spark | mergeable | #57 |
| S-WEB-05 | Spark | medium | reliability | web/app/api/usage/route.ts:36 | Usage route opens a sqlite store per request | partial: handles are released on GC, still wasteful | Spark | mergeable | #57 |
| S-WEB-06 | Spark | low | reliability | web/app/api/attachments/route.ts:15 | Attachments POST has no rate limit | confirmed | Spark | mergeable | #57 |
| S-AGENT-01 | Spark | medium | bug | agent/tools/rail_action.ts:47 | rail_action resolves names without an ambiguity check | confirmed | Spark | rework: the hint named railAction (Spark review) | #59 |
| S-AGENT-02 | Spark | low | ux | agent/tools/connector_execute.ts:41 | not_connected hint truncates multi-word toolkits | confirmed | Spark | rework: the throw path in composio.ts kept the truncation (Spark review) | #59 |
| S-AGENT-03 | Spark | medium | reliability | agent/lib/memory.ts:146 | MemoryStore opens SQLite per call and never closes it | partial: released on GC | GLM | rework: the shared store pinned its first root (Spark review) | #59 |
| S-AGENT-04 | Spark | high | reliability | router/src/index.ts:545 | Client disconnect leaves the reservation charged | false: the spec keeps reservations on aborted requests by design | | | |
| S-AGENT-05 | Spark | high | reliability | router/src/circuit.ts:63 | One overrun disables the alias permanently | false: the spec blocks the alias on an overrun by design | | | |
| S-AGENT-06 | Spark | medium | bug | router/src/index.ts:485 | Upstream timeout before headers surfaces as 500 | confirmed | Spark | mergeable | #59 |
| S-AGENT-07 | Spark | low | data | agent/tools/memory_upsert.ts:65 | memory_upsert accepts any botId | confirmed | GLM | rework: botId frozen before the approval (Spark review) | #59 |
| S-SHARED-01 | Spark | medium | bug | shared/routines-store.ts:593 | createRoutine drops invalid schedules silently | confirmed | GLM | mergeable | #58 |
| S-SHARED-02 | Spark | medium | data | shared/agent-store.ts:528 | Unparsable expiresAt bypasses the confirm TTL | confirmed | GLM | mergeable | #58 |
| S-SHARED-03 | Spark | medium | reliability | shared/live-models.ts:105 | Concurrent refreshes lose a provider's cache entry | confirmed | GLM | mergeable | #58 |
| S-SHARED-04 | Spark | medium | reliability | shared/handoffs.ts:170 | Stale claim takeover can steal a live claim | confirmed | GLM | rework: a vanished claim was refused instead of taken (Spark review) | #58 |
| S-SHARED-05 | Spark | low | reliability | shared/workspace-store.ts:188 | sleep lacks the Atomics.wait fallback | partial: Node allows Atomics.wait on the main thread; consistency only, not patched | | | |
| S-SHARED-06 | Spark | low | data | shared/shell-store.ts:552 | createBot with kind group bypasses member validation | confirmed | GLM | rework: the new guard narrowed a type and broke tsc (orchestrator) | #58 |
| G-MACAPP-01 | GLM | medium | ux | macos/Sources/UsefulBotApp/AppModel.swift:606 | Composer setting save failures are swallowed | confirmed | GLM | mergeable | #60 |
| G-MACAPP-02 | GLM | medium | ux | macos/Sources/UsefulBotApp/AppModel.swift:1342 | saveError has no surface outside the settings pane | confirmed | GLM | mergeable | #60 |
| G-MACAPP-03 | GLM | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:432 | A swallowed select write lets the idle poll bounce back | confirmed | GLM | rework: the failure banner was wiped by the repair switch (Spark review) | #60 |
| G-MACAPP-04 | GLM | low | data | macos/Sources/UsefulBotApp/ChatDetailsPaneView.swift:326 | Routine editor commits stale text over an external edit | confirmed | Spark | mergeable | #60 |
| G-MACCORE-01 | GLM | high | bug | scripts/setup-local.mjs:121 | Every credential expires after 30 days, then a dead end | partial: the TTL is by spec; --add-missing now re-mints an expired row | Spark | mergeable | #58 |
| G-MACCORE-02 | GLM | medium | bug | scripts/service.mjs:9 | Hardcoded /usr/local/bin/node | confirmed | Spark | mergeable | #58 |
| G-MACCORE-03 | GLM | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:483 | Open-chat stream is never reconnected | confirmed | GLM | rework: seeded with in-progress turns, which it then skipped for good (Spark review) | #60 |
| G-MACCORE-04 | GLM | low | bug | macos/Sources/UsefulBotCore/ServiceSupervisor.swift:72 | isOwnNodeProcess matches a sibling checkout | confirmed | Spark | mergeable | #60 |
| G-MACCORE-05 | GLM | low | reliability | macos/Sources/UsefulBotCore/LocalServices.swift:489 | Service logs grow forever | confirmed | Spark | mergeable | #60 |
| G-WEB-01 | GLM | medium | security | web/lib/auth.ts:43 | Device-token test backdoor is live under next dev | confirmed | GLM | mergeable | #57 |
| G-WEB-02 | GLM | medium | ux | web/app/page.tsx:412 | Stop is a no-op during the first send | dup of S-WEB-02 | | | |
| G-WEB-03 | GLM | medium | ux | web/app/page.tsx:473 | Error banner stale across bot switches | confirmed | GLM | mergeable | #57 |
| G-WEB-04 | GLM | medium | data | web/app/api/memory/route.ts:12 | Memory pane truncates before the per-bot filter | confirmed | GLM | mergeable | #59 |
| G-WEB-05 | GLM | low | ux | web/lib/use-shell.ts:83 | detachError never surfaced on the web | confirmed | GLM | mergeable | #57 |
| G-WEB-06 | GLM | low | ux | web/app/page.tsx:448 | Approve or Deny fails silently when the POST throws | confirmed | GLM | mergeable | #57 |
| G-WEB-07 | GLM | low | ux | web/components/chat-composer.tsx:408 | Attaching at the cap does nothing | dup of S-WEB-01 | | | |
| G-WEB-08 | GLM | low | reliability | web/app/api/usage/route.ts:36 | Polled routes open a sqlite handle per request | dup of S-WEB-05 | | | |
| G-AGENT-01 | GLM | high | bug | agent/sandbox/sandbox.ts:6 | Docker on PATH refuses to boot the whole agent | confirmed | GLM | mergeable | #59 |
| G-AGENT-02 | GLM | medium | bug | agent/tools/bash.ts:136 | bash ignores the turn's abort signal | confirmed | GLM | rework: ctx dereferenced without the optional (Spark review) | #59 |
| G-AGENT-03 | GLM | medium | bug | agent/tools/review.ts:29 | UB_ROUTER_BASE_URL used as a full URL | confirmed | GLM | mergeable | #59 |
| G-AGENT-04 | GLM | medium | reliability | router/src/index.ts:486 | Circuit only counts failures before the first byte | confirmed | Spark | rework: success was still recorded at headers, clearing the window, and timeouts were not counted (orchestrator, Spark review) | #59 |
| G-AGENT-05 | GLM | medium | security | agent/tools/web_search.ts:27 | Search results reach the model without the untrusted envelope | confirmed | Spark | mergeable | #59 |
| G-AGENT-06 | GLM | medium | reliability | router/src/search.ts:56 | Search body read with no deadline or cap | confirmed | Spark | mergeable | #59 |
| G-AGENT-07 | GLM | low | data | agent/lib/memory.ts:268 | Expiry compared lexicographically with offsets | confirmed | GLM | mergeable | #59 |
| G-AGENT-08 | GLM | low | bug | agent/lib/memory.ts:293 | Per-bot list applies LIMIT before the filter | dup of G-WEB-04 | | | |
| G-AGENT-09 | GLM | low | ux | agent/tools/plant_read.ts:6 | S2 fixture tool registered in production | confirmed | Spark | redo: disableTool on a top-level source makes eve exit at boot; reverted in #60, still open | #59 |
| G-SHARED-01 | GLM | high | bug | web/lib/agent-exec.ts:355 | Server-driven turns never rotate a retired session | confirmed | Spark | mergeable | #58 |
| G-SHARED-02 | GLM | medium | bug | agent/tools/send_to_bot.ts:101 | Reserve released after the handoff was queued | confirmed | Spark | mergeable | #58 |
| G-SHARED-03 | GLM | medium | ux | web/app/api/providers/route.ts:79 | Saving a second key switches the active provider | confirmed | Spark | mergeable | #58 |
| G-SHARED-04 | GLM | medium | bug | shared/threads.ts:216 | stripThreadPrefix mangles a description with a blank line | confirmed | GLM | rework: its new test asserted the prefix had no blank line at all (orchestrator) | #58 |
| G-SHARED-05 | GLM | medium | bug | shared/providers.ts:282 | A settings-saved key is never used while the env key exists | confirmed | Spark | mergeable | #58 |
| G-SHARED-06 | GLM | medium | ux | web/app/api/agent/tick/route.ts:88 | Handoff delivery failures are silently dropped | confirmed | Spark | mergeable | #58 |
| G-SHARED-07 | GLM | low | data | shared/connectors-store.ts:112 | Credential store written without fsync | confirmed | GLM | mergeable | #58 |
| ORCH-03 | orchestrator | critical | data | scripts/setup-local.mjs:27 | putKeychain stored an empty value: a bare security -w prompts for the value and a retype on stdin and exits 0 on a mismatch | found while provisioning the reviewer credential | orchestrator | | #55 |
| ORCH-04 | orchestrator | medium | ux | macos/Sources/UsefulBotCore/ChatMarkdown.swift:78 | Fenced code inside a blockquote renders as loose backticks | seen in the reviewer screenshot | Spark | rework: the parser shadowed its own name and the view recursed on an opaque type (compile errors, orchestrator) | #60 |
| ORCH-05 | orchestrator | low | ux | shared/threads.ts:197 | The prefix repeats the name when the label equals it | seen in a stored routine turn | GLM | mergeable | #58 |
| ORCH-06 | orchestrator | high | ux | macos/Sources/UsefulBotApp/ComposerTextView.swift:170 | Pasting more than the draft cap leaves Send disabled | found while testing S-MACCORE-01 | Spark | mergeable | #60 |

### Verified live on 2026-09-16

- "Ask the reviewer" from the Mac app: the CEO bot called the review tool and quoted the
  reviewer's answer (#55). The router accepts the new credential for the reviewer alias and
  refuses workhorse for it.
- The rail refreshes mid-turn: a section rename made by railAction showed while the reply was
  still streaming (#56).
- A routine run carries the bot persona: the stored turn in Drive Admin's eve session begins
  with "You are Drive Admin" and its standing instructions.
- A handoff resolves the acting bot from the eve session: a routine created through a handoff
  landed on Drive Admin while CEO was the selected bot.
- /v1/search is gated: an overlapping call gets 409 session_busy, a back-to-back call 429
  search_rate_limited.
- An over-cap paste lands clipped with Send enabled (ORCH-06); a fenced block inside a quote
  renders as a code card (ORCH-04).

### Open for round 3

- G-AGENT-09: hide plant_read from live sessions without disableTool (eve refuses it on a
  top-level source). Move the fixture tool out of agent/tools or gate its registration.
- G-MACCORE-03 was not exercised live (the owner was at the machine when the check came up):
  open a bot's chat, run one of its routines from the web API, confirm the reply renders
  without re-selecting the bot.
- S-MACCORE-01: establish whether anything clips a stored turn at 2000 characters before
  changing the optimistic fold.
- Owner decision 2026-09-16: the macOS app is the priority, then the mobile app. No further
  web audits; the web surface stays as it is until the desktop and mobile apps are done.
  The CLI is out of scope.
