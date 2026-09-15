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
  line, severity, repro and fix. Same brief for both models.
- Verification outcomes: **confirmed** (real, patch it), **partial** (real problem, but
  the repro or cause is wrong, or no user impact), **false** (not a bug or unreachable),
  **dup** (same as an earlier finding from the other model).
- Patch outcomes: **mergeable** (landed as delivered), **rework** (landed after edits),
  **redo** (thrown away, orchestrator patched it).
- One PR per slice. Findings the orchestrator adds while verifying carry the `ORCH` prefix.

## Running totals

| Model | Reported | Confirmed | Partial | False | Dup | Precision (confirmed+partial / reported) |
|-------|---------:|----------:|--------:|------:|----:|----------:|
| Spark | 19 | 13 | 2 | 4 | 0 | 79% |
| GLM   | 15 | 13 | 0 | 0 | 2 | 100% of non-dups |

| Model | Patches | Mergeable | Rework | Redo |
|-------|--------:|----------:|-------:|-----:|
| Spark | 0 | 0 | 0 | 0 |
| GLM   | 0 | 0 | 0 | 0 |

## Round 1

### Runs

| Slice | Model | Wall time | Findings | Notes |
|-------|-------|----------:|---------:|-------|
| web | Spark | 2m45s | 6 | Read every listed file plus the shared stores. |
| web | GLM | 8m17s | 9 | Slower, wider net: caught the missing persona on server-driven turns. |
| mac-core | Spark | 3m29s | 5 | Cross-checked Swift against the TypeScript ports. |
| mac-app | Spark | 4m26s | 8 | State-flow reasoning through AppModel. |
| mac-app | GLM | 9m33s | 6 | Deeper lifecycle bugs (cancel, stream failure, task cancellation). |
| mac-core | GLM | pending | | |
| agent-router | Spark | pending | | |
| agent-router | GLM | pending | | |
| shared-scripts | Spark | pending | | |
| shared-scripts | GLM | pending | | |

### Findings

Severity is the auditor's. The verdict column is the orchestrator's after reading the code.

| ID | Model | Sev | Kind | File:line | Title | Verdict | Patch by | Patch result | PR |
|----|-------|-----|------|-----------|-------|---------|----------|--------------|----|
| S-WEB-01 | Spark | high | bug | web/app/api/routines/[id]/run/route.ts:38 | Test run answers started before the claim | partial: the double-click race is closed by the synchronous in-flight set, but a claim that throws (locked store) is swallowed with no history row | | | |
| S-WEB-02 | Spark | high | ux | web/components/bot-settings-panel.tsx:172 | Routines pane says the scheduler is not wired | confirmed | | | |
| S-WEB-03 | Spark | medium | bug | web/components/app-settings-dialog.tsx:394 | Usage meter ignores reserved tokens | confirmed | | | |
| S-WEB-04 | Spark | low | ux | web/components/app-settings-dialog.tsx:400 | "This week" label over 24h numbers | confirmed | | | |
| S-WEB-05 | Spark | high | bug | web/components/proposal-card.tsx:128 | Group-less fanout sends to one bot | false: post_to_group is the only fanout creator and always sets groupId | | | |
| S-WEB-06 | Spark | medium | ux | web/app/page.tsx:354 | Failed send leaves the rail preview | confirmed (web only; the Mac app stamps the preview after the send is accepted) | | | |
| S-MACCORE-01 | Spark | low | bug | macos/Sources/UsefulBotCore/ChatMarkdown.swift:190 | Table cell drops backslash | confirmed | | | |
| S-MACCORE-02 | Spark | medium | bug | macos/Sources/UsefulBotCore/EveStream.swift:240 | stripThreadPrefix looser than the TypeScript regex | confirmed, low in practice | | | |
| S-MACCORE-03 | Spark | medium | ux | macos/Sources/UsefulBotCore/BackendClient.swift:354 | shell() drops the server error code | confirmed | | | |
| S-MACCORE-04 | Spark | low | reliability | macos/Sources/UsefulBotCore/ServiceSupervisor.swift:51 | isNodeAvailable bypasses injected predicate | partial: real, but a test seam with no user impact; not patched | | | |
| S-MACCORE-05 | Spark | low | bug | macos/Sources/UsefulBotCore/Threads.swift:67 | Mention roster capped at 64 | false: documented bound against unbounded regex, roster never approaches it | | | |
| S-MACAPP-01 | Spark | high | bug | macos/Sources/UsefulBotApp/AppModel.swift:606 | Send no-ops on stale selectedBotId | false: every store write reconciles the selection synchronously, so the stale state cannot be observed | | | |
| S-MACAPP-02 | Spark | medium | ux | macos/Sources/UsefulBotApp/ChatView.swift:35 | Thread error has no retry | confirmed | | | |
| S-MACAPP-03 | Spark | medium | ux | macos/Sources/UsefulBotApp/PickerViews.swift:221 | Search tabs Files/Links/Routines/Actions never return results | confirmed | | | |
| S-MACAPP-04 | Spark | high | ux | macos/Sources/UsefulBotApp/ChatView.swift:132 | Approval with empty hash is a dead card | false: listPending always carries actionSha256, the empty string is a decode fallback | | | |
| S-MACAPP-05 | Spark | medium | data | macos/Sources/UsefulBotApp/SettingsPaneView.swift:285 | Settings fields seed once and clobber server renames | confirmed | | | |
| S-MACAPP-06 | Spark | low | ux | macos/Sources/UsefulBotApp/AppModel.swift:1332 | saveError leaks across bots | confirmed | | | |
| S-MACAPP-07 | Spark | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:1549 | Proposal buttons re-enable before reload | confirmed | | | |
| S-MACAPP-08 | Spark | medium | ux | macos/Sources/UsefulBotApp/AppSettingsView.swift:552 | Typed budget only commits on Return | confirmed | | | |
| G-WEB-01 | GLM | high | bug | web/lib/agent-exec.ts:309 | Routines and handoffs run without the bot persona | confirmed: runEveTurn never applies threadPrefix; only a session that already carries it from a UI turn keeps the role | | | |
| G-WEB-02 | GLM | medium | ux | web/components/app-settings-dialog.tsx:394 | Usage meter observed-only, mislabelled | dup of S-WEB-03 and S-WEB-04 | | | |
| G-WEB-03 | GLM | medium | ux | web/components/bot-settings-panel.tsx:172 | Routines stub | dup of S-WEB-02 | | | |
| G-WEB-04 | GLM | low | ux | web/components/chat-search-dialog.tsx:20 | Dead search tabs | confirmed (web twin of S-MACAPP-03) | | | |
| G-WEB-05 | GLM | low | ux | web/app/page.tsx:403 | Failed send restores the fenced attachment blob | confirmed | | | |
| G-WEB-06 | GLM | low | reliability | web/app/api/approvals/route.ts:20 | Approvals GET 500s on a locked store | confirmed | | | |
| G-WEB-07 | GLM | low | bug | web/app/page.tsx:777 | Picker create inherits stale section | confirmed | | | |
| G-WEB-08 | GLM | low | bug | web/lib/use-shell.ts:115 | Failed queued save swallowed behind a newer action | confirmed | | | |
| G-WEB-09 | GLM | low | ux | web/components/chat-composer.tsx:391 | Composer setting change fails silently | confirmed | | | |
| G-MACAPP-01 | GLM | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:759 | Stop wipes the transcript until a replay | confirmed, arguably high: the chat goes blank after Stop | | | |
| G-MACAPP-02 | GLM | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:734 | Stream failure after delivery restores the draft | confirmed | | | |
| G-MACAPP-03 | GLM | medium | ux | macos/Sources/UsefulBotApp/SettingsPaneView.swift:206 | Edits dropped on close or bot switch | confirmed | | | |
| G-MACAPP-04 | GLM | low | bug | macos/Sources/UsefulBotApp/AppModel.swift:753 | Stop during the POST orphans the turn | confirmed | | | |
| G-MACAPP-05 | GLM | low | bug | macos/Sources/UsefulBotApp/ComposerView.swift:795 | Hover task writes @State off the main actor | confirmed | | | |
| G-MACAPP-06 | GLM | low | bug | macos/Sources/UsefulBotApp/AppModel.swift:1622 | Cancelled memory load paints an error on the next bot | confirmed | | | |
| ORCH-01 | orchestrator | medium | bug | macos/Sources/UsefulBotApp/AppModel.swift:772 | Attachments removed at send are not restored when the send fails | found while verifying G-WEB-05 | | | |
