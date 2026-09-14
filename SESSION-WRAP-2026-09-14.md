# Session wrap: routines branch review + Astra chat-UX work

Date: 2026-09-14. Purpose: record exactly where both parallel tracks stopped so a
fresh Claude Code session with Opus can finish. Do not re-derive; everything below
was verified live before this file was written.

## Track 1: Muse max review of `feat/routines-and-bot-tools` (DONE)

- Review prompt: `/tmp/review-prompt-routines.md`
- Full review log: `/tmp/review-routines-1.log` (opencode-go/muse-spark-1.3-contributor, variant max)
- Review was read-only; no files touched by it.

**Verdict: not merge-ready. Blockers: none found. 6 majors, 7 minors, 4 nits.**

Majors (fix first):

1. `shared/routines-store.ts:320-345,426-453` — tolerant decode drops unknown
   fields on every write (forward-compat broken); `withRoutinesStore` rewrites the
   file even when `fn` returns null. Fix: round-trip unknown keys, or only write
   when `fn` mutates.
2. `shared/routines-store.ts:214,258-262` — `DATE` regex accepts impossible civil
   dates (`2026-02-31`); `Date.UTC` rolls them forward and the routine fires on the
   wrong day. Fix: validate `Date.UTC(y,m-1,d)` round-trips to the same y/m/d;
   reject in `parseSchedule` + tool schema.
3. `web/lib/agent-exec.ts:437-467,579-598` — crash between claim and completion
   leaves an orphan transcript ("Routine ran" note appended before `runEveTurn`,
   anchor already moved, no retry). Fix: append outcome after success/catch.
4. `web/app/api/routines/[id]/run/route.ts:31-34` + `web/lib/agent-exec.ts:490-506`
   — manual Test run bypasses the durable claim; tick+click can double-run across
   processes and `manualRunRequested` is never consumed by the manual path. Fix:
   take the ticket inside `withRoutinesStore` in `runRoutineNow`.
5. `web/app/api/shell/route.ts:64-66,204-209` + `agent/tools/delete_bot.ts:60-68`
   — bot-delete orphan path swallows `routines_locked` and never cleans
   transcripts; orphaned routines then fail every tick with `routine_bot_missing`.
   Fix: delete routines before shell commit, or retry loudly + sweeper.
6. `shared/routines-store.ts:34-35,429-440` — liveness inversion:
   `LOCK_TIMEOUT_MS=4000 < LOCK_STALE_MS=15000`, so writers fail for ~15s after a
   crash. Fix: stale < timeout (approvals uses ~2s); catch claim errors
   per-candidate in the pump.

Minors: 7. `rail_action.ts:47-53` self-hide not refused; 8. `delete_bot.ts:19-21`
case-insensitive name match ambiguous on duplicates; 9. `web/app/api/routines/route.ts:58-68`
create path bot-existence TOCTOU; 10. `shared/routines-store.ts:445-449` read-only
claims still rewrite/fsync; 11. Swift `default: .daily` vs server drop for unknown
schedule kind (divergent); 12. Test run fires paused routines (intentional but
undocumented); 13. `RoutineRun.id = "\(at)-\(status)"` can collide; 14. details
pane `once.date` has no editor and `+ Add another` appends server-deduped
duplicates. Nits: 15. `*.invalid.*` backups accumulate; 16. O(n) FIFO eviction in
`ChatMarkdown.swift:144-146`; 17. API-guard tests are source-regex, not behavioral.

Explicitly clean (nothing found): DST wall-clock math, desktop gate/CSRF/rate-limit
on all new routes, tick auth (no raw token logged), approval hash binding +
`targetRevision` checks, no SSRF surface, transcript interleave/sortKeys, markdown
cache + Equatable rows + coalesced publish, hover grace/hit target, pane
empty-state/double-post/duplicate-id audit fixes.

## Track 2: Astra chat-UX branch (useful-bot-astra worktree) (INTERRUPTED)

Astra hit the workspace credit limit at 18:52 UTC (535k tokens used) mid-verification.
**All engineering work appears done and green; what is missing is final native UI
verification, fixture cleanup, and the commit.**

Branch state (worktree at `/Users/wasimjalali/Desktop/useful-bot-astra`, on
`feat/routines-and-bot-tools` at `b62fc88`):

- Committed: the two routines/agent-tools commits are intact (36 files,
  +1673/-59 vs main). Nothing committed by Astra on top.
- Uncommitted, modified: `README.md`, `macos/Package.swift`, `AppModel.swift`,
  `ChatMarkdownView.swift`, `ChatView.swift`, `RailView.swift`,
  `SettingsPaneView.swift`, `ChatMarkdown.swift`, `EveStream.swift`,
  `Transcript.swift`.
- Uncommitted, new files: `macos/Sources/UsefulBotApp/TranscriptScrollView.swift`,
  `macos/Sources/UsefulBotCore/BotRequestGate.swift`, `ProfileDraft.swift`,
  `ShellRefreshGate.swift`, `TranscriptPublisher.swift`, `TranscriptScrollPin.swift`,
  plus tests `macos/Tests/UsefulBotCoreTests/ChatUpdateTests.swift` and
  `NativeChatTests.swift`.

Gate status at Astra's last verified runs (logs in /tmp):

- `npm run typecheck`: clean (`/tmp/ub-astra-typecheck-d3.log`)
- `npm test`: **200 pass, 0 fail** (`/tmp/ub-astra-node-d3.log`) — includes
  `delete_bot` owner-gate and routine delivery tests
- `macos` tests: **169 tests in 24 suites pass** (`/tmp/ub-astra-swift-d3-final.log`),
  including the new ChatUpdateTests
- `web:build`: compiles (`/tmp/ub-astra-web-d3.log`)
- Release bundle built at 20:51 and **app is currently running** (pid 35171,
  launched with `-repoPath /Users/wasimjalali/Desktop/useful-bot-astra`),
  showing Astra's working tree.

Astra's own stated last step (verbatim): "The final native checks are now the only
work left. I've kept the live test in a dedicated verification bot. After confirming
the handoff and hover-menu behavior, I'll remove the test fixtures, restore the
dependency symlink and commit the macOS fixes."

Last action in the log: an accessibility-dump driven hover-menu click test on the
rail ("Actions for ..." menu) whose result was never read (credit error hit first).

### Remaining work for the next session (in order)

1. Finish the native UI verification Astra was doing: the hover-menu click test
   (rail `Actions for` menu must open and register clicks) and the handoff
   lands-at-bottom check. Her scratch harness lives in
   `build/astra-verification/` (`ui` binary for AX dump/click, `handoff-check.mjs`,
   `ui.swift`). This directory is NOT gitignored (18 dirty paths total); it must be
   removed or gitignored before commit.
2. Clean fixtures: delete/ignore `build/astra-verification/`, remove the
   "Astra UX Check" bot Astra created in the live shell for testing (owner action
   via UI or API), restore the node_modules dependency symlink she borrowed,
   and make sure the modified `README.md` diff is intentional.
3. Re-run gates on the final tree: `npm run typecheck`, `npm test`,
   `macos/test.sh`, `npm run web:build`.
4. Commit the macOS chat-UX work as its own conventional commit on the branch
   (e.g. `feat(macos): chat transcript streaming, scroll pinning and rail polish`).
5. Kill the still-running app (pid 35171) when done with it.
6. Then apply the Muse review fixes above (majors 1-6) on the same branch, and
   re-run the review loop to merge-ready.

Do not trust the pid above if the machine rebooted; check
`pgrep -fl UsefulBotApp` and whether
`/Users/wasimjalali/Desktop/useful-bot-astra/macos/dist/Useful Bot.app` is running.

## Services

Router 4319, web 4320, eve 4321 were healthy during the session (`/api/health`
returned ok). Start them with `scripts/service.mjs` as documented in `HANDOFF.md`
if they are down.
