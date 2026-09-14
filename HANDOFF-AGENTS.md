# Handoff: multi-bot capabilities (slices A to D), uncommitted on `feat/multi-bot-capabilities`

Date: 2026-09-13. Written by the DSH agent that did the work. The work is complete
enough to commit as-is; the remaining items are verification and one build-config
fix. The authoring agent could not run `git` or any shell command at the end of its
session (process spawn returned EAGAIN after several Next dev servers piled up), so
nothing below is committed yet.

## Read this first

1. The branch already exists: `feat/multi-bot-capabilities`, created off `main` at
   `bd41eed`. Verify with `git branch --show-current`.
2. Everything is on disk and typechecks, but the full suite and `next build web` were
   last run before the final two edits (`web/next.config.ts` turbopack root, probe
   route rename). Re-run the verification loop below before pushing.
3. The **web dev server is down** (the authoring agent killed PID 3896 and the
   restart was interrupted). The macOS app shows a dead page until you start it.

## Terminal housekeeping first

```sh
pkill -f 'next/dist/bin/next dev' ; pkill -f 'service.mjs web' ; sleep 1
lsof -nP -iTCP:4320 -sTCP:LISTEN | tail -2
```

Then start web again when you want the UI back (`router` and `eve` were still up):

```sh
cd ~/Desktop/useful-bot
/usr/local/bin/node scripts/service.mjs web      # 127.0.0.1:4320
```

Use `/usr/local/bin/node` (Node 24.11.1) for everything. Login-shell `node` is v22.

## What this change does

Implements slices A to D of `docs/plan/GROKBOT-AGENT-CAPABILITIES.md`: bots are durable
teammates with profiles, they can be created conversationally, they can live in group
chats with `@Bot` routing, and one bot can hand work to another with the handoff
visible in both transcripts.

Design constraint that shaped everything: there is a **single eve agent process**, so
bot and group identity travels as a system-style prefix on the user turn
(`shared/threads.ts` `threadPrefix`). `DEFAULT_BOT_ID` (`bot-useful`) must produce an
empty prefix so the already-verified 1:1 path stays byte identical. There is a test
for that exact byte equality in `test/multi-agent.test.ts`.

Handoffs are deliberately asynchronous: the agent tool only writes a queue record
(one file per record under `UB_HANDOFF_DIR`), and the web server drains the queue via
`/api/agent/tick` (called by the UI poll every 2500 ms, and woken immediately by the
tool through `wakePump()` in `shared/agents-send.ts` when `UB_WEB_BASE_URL` is set).

## Files: new

- `shared/agent-store.ts` (about 590 lines): agent threads keyed by bot id
  (`threadIdFor(botId) === botId`, because an eve session can be created mid-turn).
  Event kinds `user | assistant | handoff | post | note | proposal`. Proposals
  `createBot | createGroup | updateBotProfile | fanout` with `PROPOSAL_TTL_MS` 24 h and
  `EVENT_CAP_PER_THREAD` 300. `withAgentStore` lock, `appendAgentEvent`,
  `createProposal`, `resolveProposal`, `readProposal`, `listPendingProposals`,
  `reserveKey` / `reserveSend` for idempotency, `clearThread`, `threadSnapshot`,
  `nextPetname`. Path from `UB_AGENT_STORE_PATH` or `~/.useful-bot/agents.json`.
- `shared/handoffs.ts`: `HandoffRecord` (source/target ids and names, group, thread
  kind, message, `status pending|delivered|failed`, attempts, `lastError`, response).
  `HANDOFF_ATTEMPTS_MAX = 3`. Dir from `UB_HANDOFF_DIR` or `~/.useful-bot/handoffs`.
  `queueHandoff`, `readHandoff`, `listHandoffs`, `listDeliverable`, `markDelivered`,
  `markFailed`, `dropHandoff`.
- `shared/agents-send.ts`: `sendHandoff({source, target, message, group?, receiver?})`
  writes one handoff record, a `handoff` event on the sender thread and a `post` event
  on the receiver thread (both carrying `handoffId`), then calls `wakePump()`.
- `shared/threads.ts`: `GROUP_MIN_MEMBERS` 2, `GROUP_MAX_MEMBERS` 6,
  `GROUP_ROSTER_MAX` 6, `Speaker`, `parseMentions` (roster driven, longest name first,
  case-insensitive, bare id fallback, reports unknowns), `resolveRoute`,
  `groupMembers` (drops self, the default orchestrator, groups, dupes; caps at 6),
  `speakersFrom`, `threadPrefix`, `speakerLabel`, `RosterEntry`, `rosterLine`,
  `groupLine`.
- `web/lib/agent-exec.ts`: `agentsEnabled()`, `channelJwt()`, `readHandoffStream`
  (parses the eve `data:` NDJSON: `message.appended` deltas, `message.completed` is
  authoritative), `deliverOne` (POST `/eve/v1/session` or `/session/:id`, then GET
  `/eve/v1/session/:id/stream?startIndex=0`, 120 s timeout), `pumpHandoffs(limit = 2)`
  with a module level `inflight` set, `handoffsInFlight()`, `fanOut`.
- `web/lib/use-agent-thread.ts`: polls `/api/agent/state` every 2500 ms and POSTs
  `/api/agent/tick?limit=2` per poll, guarded by a busy ref.
- `web/components/proposal-card.tsx`: `ProposalCard` for the four proposal kinds plus
  `OnboardingCard` for a freshly created bot.
- `web/components/group-settings-panel.tsx`: group name, instructions, face, member
  toggles from real bots (excludes the default bot and hidden bots), 2 to 6 guard
  messages, delete.
- `web/app/api/agent/state/route.ts`: desktop gated GET `?botId=` returning
  `{ok, botId, events, proposals}`.
- `web/app/api/agent/tick/route.ts`: GET status; POST pumps handoffs, authorised by
  `x-ub-agent-key` compared timing-safe against `UB_CHANNEL_JWT` /
  `UB_CHANNEL_JWT_SECRET`, or by `originAllowed`. `?limit=` clamped 1 to 4. Returns
  503 `agent_credential_missing` when disabled.
- `agent/tools/propose_bot.ts`, `agent/tools/update_bot_profile.ts`,
  `agent/tools/propose_group.ts`, `agent/tools/send_to_bot.ts`,
  `agent/tools/post_to_group.ts`, `agent/tools/list_bots.ts`.
- `test/agents.test.ts` (8 cases), `test/multi-agent.test.ts` (14 cases),
  `test/agent-tools.test.ts` (6 cases).

## Files: changed

- `shared/shell-store.ts`: `ShellBot.petname`, `normalizeMembers` (drops self, default
  bot, groups, hidden bots, dedupes, caps 6), `createGroup` accepts `label` and
  `description` and throws `shell_group_members` under 2 members, `updateBot` uses
  `normalizeMembers` and enforces the minimum, new actions `sendToBot`, `clearThread`,
  `nameBot`.
- `shared/eve-proxy.ts`: kept `personaPrefix`, `rewriteEveSessionBody`,
  `eveGetAllowed`, `evePostAllowed`, `isEveSessionPost`; added `SessionRoute`,
  `eveSessionRoute`, `sessionRouteHeader`, `parseSessionRouteHeader`. Rewrote the turn
  body path as `rewriteEveTurnBody(raw, bot, route, members)`; `members` is the
  resolved group roster and `personaPrefix` copy changed to "Standing instructions:".
- `web/app/eve/v1/[...path]/route.ts`: computes the route from the shell store, calls
  `rewriteEveTurnBody` with the roster from `groupMembers(speakersFrom(shell.bots), ...)`,
  and returns the route back to the browser as a base64url `x-ub-route` response header.
- `web/app/api/shell/route.ts`: PUT now takes `{store?, action?, proposalId?,
  proposalStatus?}`. `applyFollowUp` handles `sendToBot` (fan-out through `fanOut`,
  group targets expand to `groupMembers`) and `clearThread`; `noteProposal` resolves
  the proposal and appends a `note` event. Returns `{ok, store, queued}`.
- `web/lib/use-shell.ts`: `persist(action, meta)` and `dispatch(action, meta)` carry
  `proposalId` / `proposalStatus`.
- `web/app/page.tsx`: `useAgentThread` wiring, per bot transcript rows merged with
  thread events (deduped by event id and by user text), onboarding card, proposal
  cards, handoff cards with per speaker attribution, group composer placeholder
  ("Message this group. @name to direct one bot"), group versus bot settings pane,
  group aware delete confirm, `startNewChat` now dispatches `clearThread`.
- `web/components/create-dialogs.tsx`: create bot sends `petname`, copy explains
  conversational naming, group dialog shows `n/6` and disables submit below 2 members.
- `web/app/globals.css`: `.member-row`, `.member-row:hover`, `.member-row-on` built
  from existing tokens (`--sunken`, `--border-strong`, `--surface`).
- `agent/instructions.md`: the `# Bots` section replaced with the real tool set.
- `scripts/service.mjs`: eve mode also exports `UB_WEB_BASE_URL`
  (default `http://127.0.0.1:4320`) so a tool can wake the pump.
- `package.json`: `npm test` now includes `test/agents.test.ts`,
  `test/multi-agent.test.ts`, `test/agent-tools.test.ts`.
- `test/eve-proxy-guard.test.ts` and `test/shell-store.test.ts`: updated for the two
  intentional behaviour changes (new persona prefix wording; the default orchestrator
  is never a group member, so a group needs two real bots).
- `web/next.config.ts`: added `turbopack: { root: ".." }` and
  `outputFileTracingRoot: ".."`. **This is unverified** and is the one real risk, see
  "Known issue" below.
- `web/tsconfig.json`: added the new `../shared/*.ts` files to `include`, dropped the
  redundant duplicate entry, and removed a `baseUrl` / `paths` experiment.

## Files: deleted

- `agent/tools/bot_create.ts`. It created a bot with no owner confirmation, which
  contradicts the capability plan; `propose_bot.ts` replaces it.

## Files: temporary, must be deleted before commit

- `web/app/api/agentstate/route.ts` is a probe route used to isolate the Turbopack
  resolution problem. Delete the directory.

```sh
rm -rf web/app/api/agentstate
```

## Known issue: parent directory imports did not resolve in the Turbopack dev server

Symptom: `next dev` on 4320 returned 500 for every new route with
`Module not found: Can't resolve '../../../../shared/agent-store.ts'`, and the same
failure appeared for `../../../shared/shell-store.ts` and `../../../shared/eve-stream.ts`
from a flat probe route, while `../../../lib/desktop-gate` (inside `web/`) resolved
fine. `next build web` failed with the same four errors. Root `tsc --noEmit` was clean
throughout, and already-shipped routes such as `web/app/api/usage/route.ts` import
`../../../../router/src/limits.ts`, so the pattern itself is not new; the dev server
predated these files, and only routes first compiled after the files appeared failed.

What was tried: restarting the dev server (did not help), file modes (the write tool
creates files 0600, now normalised to 0644, did not help), and a `baseUrl` + `paths`
alias (did not help; Turbopack reported `aliased to relative './shared/shell-store.ts'
inside of [project]/web`, which is the useful clue: Turbopack treats `web/` as the
project root, so anything above it is out of bounds).

Current state: `web/next.config.ts` sets `turbopack.root = ".."` and
`outputFileTracingRoot = ".."`, which is the documented way to widen that root. It was
written but never exercised, because the restart that would have tested it ran out of
process slots.

**Verify this first.** If `next build web` still reports module-not-found:

- Delete `web/.next` and rebuild before concluding anything; the Turbopack cache was
  demonstrably stale during this work.
- Fall back to the shim approach: add `web/lib/shared.ts` that re-exports
  `../../shared/agent-store.ts`, `../../shared/handoffs.ts`, `../../shared/threads.ts`
  and `../../shared/agents-send.ts`, then import from `../../../lib/shared` in
  `web/app/api/agent/state/route.ts`, `web/app/api/agent/tick/route.ts` and
  `web/lib/agent-exec.ts`. The probe evidence says three levels up (still inside
  `web/`) resolves where four levels does not.
- `web/app/page.tsx` has always imported `../../shared/...` and has always worked in
  the browser, so check whether those imports resolve under the same build before
  restructuring more than the three files above.

## Verification loop (all of it, before push)

```sh
cd ~/Desktop/useful-bot
/usr/local/bin/node node_modules/typescript/bin/tsc --noEmit          # was exit 0
/usr/local/bin/node node_modules/typescript/bin/tsc --noEmit -p router/tsconfig.json
npm test                                                             # was 90/90
/usr/local/bin/node node_modules/next/dist/bin/next build web         # was failing, see above
```

Then live checks, with `router`, `eve` and `web` up and the macOS app open:

1. 1:1 chat still sends and streams (the default bot prefix must stay empty).
2. Create a bot from the sidebar, and create one conversationally by asking the
   orchestrator; confirm the proposal card appears and only applies on confirm.
3. Edit the new bot profile, pin it, move it to a section, delete it with confirm.
4. Create a group of 2 bots, `@mention` one member, confirm only that member answers
   in role and the orchestrator is not listed as a member.
5. Ask one bot to message another; confirm the handoff card appears in both
   transcripts and that the reply lands in the receiver's chat.
6. For UI claims, take a real screenshot of the running app. The macOS shell is
   WKWebView, so DOM tools see nothing; use a vision capture.

## Commit plan

Six conventional commits, this order. Do not commit to `main`. No `--no-verify`, no
force push.

```sh
git status --short                       # confirm only intended paths are listed
git add -A && git status --short         # never add web/.next, node_modules or ~/.useful-bot
```

1. `feat(agents): add agent threads, handoffs and group routing`
   `shared/agent-store.ts`, `shared/handoffs.ts`, `shared/agents-send.ts`,
   `shared/threads.ts`, `shared/shell-store.ts`, `shared/eve-proxy.ts`
   Body: durable per bot threads keyed by bot id, one file per handoff record with
   retry to three attempts, roster aware mention parsing, group membership of 2 to 6
   real member bots that never includes the orchestrator, and turn rewriting that
   stays byte identical for the default bot.
2. `feat(agents): add orchestrator tools for teammates and groups`
   `agent/tools/propose_bot.ts`, `update_bot_profile.ts`, `propose_group.ts`,
   `send_to_bot.ts`, `post_to_group.ts`, `list_bots.ts`,
   delete `agent/tools/bot_create.ts`, `agent/instructions.md`
   Body: creation and profile edits go through confirmable proposals, single bot
   sends execute immediately, group posts and fan-outs wait for the owner, and
   `bot_create` is removed because it created bots without asking.
3. `feat(web): deliver handoffs from the web server`
   `web/lib/agent-exec.ts`, `web/app/api/agent/state/route.ts`,
   `web/app/api/agent/tick/route.ts`, `web/app/api/shell/route.ts`,
   `web/lib/use-agent-thread.ts`, `web/app/eve/v1/[...path]/route.ts`,
   `scripts/service.mjs`
   Body: the tick endpoint drains the handoff queue under a timing-safe channel key,
   the UI polls thread state and the pump, and the eve proxy reports the resolved
   route back to the browser.
4. `feat(web): add bot and group management UI`
   `web/app/page.tsx`, `web/components/proposal-card.tsx`,
   `web/components/group-settings-panel.tsx`, `web/components/create-dialogs.tsx`,
   `web/lib/use-shell.ts`, `web/app/globals.css`
   Body: onboarding and proposal cards, group settings with 2 to 6 member guard,
   per speaker transcript attribution, and pinned and hidden states kept as they
   were. Useful Brain tokens only, light theme.
5. `test(agents): cover threads, handoffs, routing and the agent tools`
   `test/agents.test.ts`, `test/multi-agent.test.ts`, `test/agent-tools.test.ts`,
   `test/eve-proxy-guard.test.ts`, `test/shell-store.test.ts`, `package.json`
6. `build(web): point Turbopack at the repository root`
   `web/next.config.ts`, `web/tsconfig.json`

Then:

```sh
git push -u origin feat/multi-bot-capabilities
```

## PR body

Title: `Multi-bot capabilities: teammates, group chats and bot-to-bot handoffs`

```markdown
## What

Slices A to D of docs/plan/GROKBOT-AGENT-CAPABILITIES.md.

- Bots are durable teammates: profile (name, title, description, avatar), pin, hide,
  sections, delete with confirm.
- Creating a bot is conversational: the orchestrator proposes a profile in chat and
  the bot only exists after the owner confirms.
- Group chats of 2 to 6 member bots with @Bot routing; the default Useful Bot answers
  untargeted turns but is never a member.
- Bot-to-bot messaging: sendToBot hands one task to one teammate and the handoff is
  visible in both transcripts; postToGroup fans out to a room and asks first.
- New orchestrator tools: proposeBot, updateBotProfile, proposeGroup, sendToBot,
  postToGroup, listBots. bot_create is removed because it created bots without asking.
- 1:1 chat send and stream is unchanged: the default bot still sends a byte identical
  turn body, with a test asserting it.

## How it works

One eve agent process, so bot identity travels as a turn prefix. Handoffs are queued
as one file per record and drained by the web server through /api/agent/tick, called
by the UI poll and woken by the tool. Threads are keyed by bot id because a session
can be created mid-turn. Cross process writes use atomic replace plus a lock
directory; handoff files are written once and rewritten only by the consumer.

## Tests

- npm test: 90 cases, including 28 new ones across agent threads, handoffs, mention
  parsing, group membership guards, roster repair on delete, the agent tools, and the
  byte identical default bot turn.
- tsc --noEmit at the root and in router/.
- next build web.
- Manual: create a bot conversationally, edit and pin it, create a 2 bot group and
  @mention one member, hand work from one bot to another, confirm the handoff shows in
  both chats.

## Deferred, on purpose

Skills (`/`), the routines scheduler, Cursor composer extras, Marketplace depth, dark
theme, public bot share, and any virtual computer or agent screen preview.
```

## Deferred, do not build now

Skills (`/`), routines scheduler, Cursor composer extras, Marketplace depth, dark
theme, public bot share, virtual computer or agent screen preview.

## Gotchas worth keeping

- The write tool creates files mode 0600; the rest of the tree is 0644. Normalise if
  some tool complains about reading a new file.
- `NEXT_TELEMETRY` and process limits: several `next dev` servers at once exhausted
  process spawning on this Mac (bash returned EAGAIN for every command). Kill stale
  servers before starting another, and do not leave one per experiment.
- Do not read `.env*`, Keychain values, `secrets/`, or any auth.json.
- Useful Brain tokens only, light theme. The CEO sized card in the reference is the
  pinned state, not the default row height.
