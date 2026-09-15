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
- One PR per slice, reviewed by a Spark pass before merge. Findings the orchestrator
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
| Spark | 8 | 6 | 2 | 0 | macOS batch A. Reworks: the Stop reload still blanked the chat during replay (orchestrator, one hunk); late save errors were not scoped to the bot (from the Spark review of its own PR). |
| GLM   | 15 | 14 | 1 | 0 | macOS batches B and E, web batch C. Rework: the settings reseed watched the whole bot struct (from the Spark review). |

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
| S-WEB-01 | Spark | high | bug | web/app/api/routines/[id]/run/route.ts:38 | Test run answers started before the claim | partial: the double click is closed by the synchronous in-flight set, but a claim that throws is swallowed with no history row | GLM | mergeable | web |
| S-WEB-02 | Spark | high | ux | web/components/bot-settings-panel.tsx:172 | Routines pane says the scheduler is not wired | confirmed | Spark | | web |
| S-WEB-03 | Spark | medium | bug | web/components/app-settings-dialog.tsx:394 | Usage meter ignores reserved tokens | confirmed | Spark | | web |
| S-WEB-04 | Spark | low | ux | web/components/app-settings-dialog.tsx:400 | "This week" label over 24h numbers | confirmed | Spark | | web |
| S-WEB-05 | Spark | high | bug | web/components/proposal-card.tsx:128 | Group-less fanout sends to one bot | false: post_to_group is the only fanout creator and always sets groupId | | | |
| S-WEB-06 | Spark | medium | ux | web/app/page.tsx:354 | Failed send leaves the rail preview | confirmed (web only; the Mac app stamps the preview after the send is accepted) | Spark | | web |
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
| S-AGENT-01 | Spark | high | bug | agent/tools/review.ts:11 | review tool returns fixture text as success without a token | confirmed: the reviewer token is never provisioned by scripts/service.mjs | GLM | | agent |
| S-AGENT-02 | Spark | high | reliability | router/src/index.ts:429 | /v1/search bypasses rate limits, budgets and the concurrency gate | confirmed | Spark | | agent |
| S-AGENT-03 | Spark | medium | reliability | shared/workspace-store.ts:183 | Workspace lock timeout shorter than stale window | dup of S-SHARED-01 (same run family) | | | |
| S-AGENT-04 | Spark | medium | bug | agent/tools/memory_upsert.ts:29 | memory_upsert consumes the approval before validating | confirmed | GLM | | agent |
| S-AGENT-05 | Spark | medium | ux | agent/tools/memory_upsert.ts:33 | Memory approval card shows only the title | confirmed | GLM | | agent |
| S-AGENT-06 | Spark | low | data | agent/lib/memory.ts:355 | Memory upsert misses tag length and expiry validation | partial: the schema has no maxima, the expiry corruption claim is not verified | GLM | | agent |
| S-AGENT-07 | Spark | low | reliability | agent/agent.ts:19 | SSE sleep leaks abort listeners | partial: that code is the S2 fixture path only, never runs in production; not patched | | | |
| S-SHARED-01 | Spark | high | reliability | shared/workspace-store.ts:183 | Workspace lock timeout shorter than its stale window | confirmed | Spark | | agent |
| S-SHARED-02 | Spark | critical | data | shared/providers.ts:163 | providers.json written in place, reader throws | confirmed | Spark | | agent |
| S-SHARED-03 | Spark | high | data | shared/connectors-store.ts:92 | Corrupt connectors.json throws forever | confirmed | Spark | | agent |
| S-SHARED-04 | Spark | high | data | shared/web-sessions.ts:40 | Corrupt session file silently replaced | confirmed | Spark | | agent |
| S-SHARED-05 | Spark | medium | reliability | shared/handoffs.ts:336 | dropHandoff passes dir as the claim token | confirmed | Spark | | agent |
| S-SHARED-06 | Spark | medium | bug | shared/handoffs.ts:290 | markDelivered read-modify-write without a lock | false: every caller passes the claim token and ownership is checked first, so two pumps cannot both write | | | |
| S-SHARED-07 | Spark | low | bug | shared/composio-catalogue.ts:42 | Catalogue memo ignores its path | confirmed, tests only in practice | Spark | | agent |
| S-SHARED-08 | Spark | high | reliability | scripts/service.mjs:178 | Web channel token minted once, expires after 12h | confirmed | GLM | mergeable | web |
| S-SHARED-09 | Spark | high | data | scripts/setup-local.mjs:70 | --rotate moves the config away before any key is written | confirmed | Spark | | agent |
| S-SHARED-10 | Spark | low | bug | shared/composio.ts:409 | disconnectConnector lists only 100 accounts | confirmed, needs over 100 connected accounts; not patched this round | | | |
| S-SHARED-11 | Spark | medium | reliability | scripts/verify.mjs:92 | opencode case certifies a stale results file | partial: dev tooling, documented as needing --live; not patched | | | |
| G-WEB-01 | GLM | high | bug | web/lib/agent-exec.ts:309 | Routines and handoffs run without the bot persona | confirmed: runEveTurn never applies threadPrefix; only a session that already carries it from a UI turn keeps the role | GLM | mergeable | web |
| G-WEB-02 | GLM | medium | ux | web/components/app-settings-dialog.tsx:394 | Usage meter observed-only, mislabelled | dup of S-WEB-03 and S-WEB-04 | | | |
| G-WEB-03 | GLM | medium | ux | web/components/bot-settings-panel.tsx:172 | Routines stub | dup of S-WEB-02 | | | |
| G-WEB-04 | GLM | low | ux | web/components/chat-search-dialog.tsx:20 | Dead search tabs | confirmed (web twin of S-MACAPP-03) | Spark | | web |
| G-WEB-05 | GLM | low | ux | web/app/page.tsx:403 | Failed send restores the fenced attachment blob | confirmed | Spark | | web |
| G-WEB-06 | GLM | low | reliability | web/app/api/approvals/route.ts:20 | Approvals GET 500s on a locked store | confirmed | GLM | mergeable | web |
| G-WEB-07 | GLM | low | bug | web/app/page.tsx:777 | Picker create inherits stale section | confirmed | Spark | | web |
| G-WEB-08 | GLM | low | bug | web/lib/use-shell.ts:115 | Failed queued save swallowed behind a newer action | confirmed | GLM | mergeable | web |
| G-WEB-09 | GLM | low | ux | web/components/chat-composer.tsx:391 | Composer setting change fails silently | confirmed | Spark | | web |
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
| G-AGENT-02 | GLM | high | bug | agent/subagents/reviewer/agent.ts:31 | Reviewer subagent cannot pass the router's session headers, wrong token fallback | confirmed | GLM | | agent |
| G-AGENT-03 | GLM | high | bug | agent/tools/review.ts:14 | review tool omits the required x-useful headers | confirmed | GLM | | agent |
| G-AGENT-04 | GLM | high | bug | agent/tools/create_routine.ts:45 | Nothing sets UB_ACTIVE_BOT_ID, so "this bot" is the selected bot | confirmed: twelve tools resolve the acting bot from a variable nothing sets; a routine or handoff for bot A while B is selected misattributes notes, routines and proposals | GLM | | agent |
| G-AGENT-05 | GLM | medium | reliability | agent/lib/approvals.ts:214 | Approval records never pruned | confirmed | GLM | | agent |
| G-AGENT-06 | GLM | medium | reliability | router/src/index.ts:435 | /v1/search bypasses rate limits | dup of S-AGENT-02 | | | |
| G-AGENT-07 | GLM | medium | security | agent/lib/write.ts:55 | write_file approval card shows only the path | confirmed | GLM | | agent |
| G-AGENT-08 | GLM | medium | ux | agent/tools/memory_upsert.ts:33 | memory approval card shows only the title | dup of S-AGENT-05 | | | |
| G-AGENT-09 | GLM | medium | bug | agent/tools/bash.ts:136 | Output over 1 MiB fails the call with a raw maxBuffer error | confirmed | GLM | | agent |
| G-AGENT-10 | GLM | low | data | shared/agents-send.ts:26 | Handoff to a one-member group flips its thread kind | confirmed | GLM | | agent |
| G-AGENT-11 | GLM | low | data | agent/lib/memory.ts:457 | tagsForBot drops the bot tag at 8 tags | confirmed | GLM | | agent |
| G-SHARED-01 | GLM | high | data | shared/providers.ts:163 | providers.json non-atomic, reader throws | dup of S-SHARED-02 | | | |
| G-SHARED-02 | GLM | critical | reliability | web/lib/agent-exec.ts:114 | Static 12h channel token | dup of S-SHARED-08 | | | |
| G-SHARED-03 | GLM | medium | reliability | shared/workspace-store.ts:184 | Lock stale window exceeds wait timeout | dup of S-SHARED-01 | | | |
| G-SHARED-03B | GLM | medium | data | shared/connectors-store.ts:92 | Corrupt connectors.json throws forever | dup of S-SHARED-03 | | | |
| G-SHARED-05 | GLM | medium | ux | scripts/service.mjs:101 | Router refuses to start without the opencode-go keychain item | partial: by design, the subscription is the primary upstream; not patched | | | |
| G-SHARED-06 | GLM | low | bug | shared/handoffs.ts:336 | dropHandoff passes dir as the token | dup of S-SHARED-05 | | | |
| G-SHARED-07 | GLM | low | ux | shared/threads.ts:214 | stripThreadPrefix can strip a look-alike user message | partial: known trade-off of the prefix scheme; not patched | | | |
| G-SHARED-08 | GLM | low | reliability | shared/live-models.ts:34 | models-cache.json written in place | confirmed | Spark | | agent |
| G-SHARED-09 | GLM | low | ux | scripts/service.mjs:162 | Eve startup names the wrong keychain item on failure | confirmed | Spark | | agent |
| ORCH-01 | orchestrator | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:772 | Attachments removed at send are not restored when the send fails | found while verifying G-WEB-05 | Spark | mergeable | #48 |

### Not patched this round, for the owner

- The reviewer credential (`UB_ROUTER_REVIEWER_TOKEN`, profile `reviewer`) is never minted by
  scripts/setup-local.mjs nor passed to eve by scripts/service.mjs, so "ask the reviewer" can
  only run in fixture mode. The agent-slice patch makes the tool say so instead of returning
  placeholder text. Provisioning the credential is a setup change, not a bug fix.
- The web routines pane is now honest copy pointing at the Mac app. A web routines UI is a
  feature, not a fix, and the web surface trails the app by design.
