# Performance record

What made the macOS app slow, what was changed, and what it bought. Newest batch first.
Every number here was measured on the owner's machine; nothing is an estimate unless it says so.

## How the audit ran (2026-09-17)

Five models read the code against the same read-only brief, then each finding was checked by
hand against the source and against a live `sample` of the running app before anything was
changed.

| Auditor | How it ran | Round 1 findings |
|---|---|---|
| GPT-6 Astra | Codex, xhigh effort, three rounds on one session | 18, plus 5 new in round 2 and the risk-ordered plan |
| Muse Spark 1.3 contributor | opencode, `--variant max`, rounds 1 and 3 | 20 |
| GLM 5.3 flash | opencode, `--variant max`, rounds 1 and 3 | 20 |
| DeepSeek V4.1 flash | opencode, `--variant max` | 16 |
| HY4 preview | opencode, `--variant max` | 18 |

Round 2 asked Astra to judge what only the other models had found and to trace the main actor
for a keystroke, a streamed delta, an idle poll and a chat switch. Round 3 was a trap review of
the fix plan before any code was written (Spark and GLM answered it; Astra's copy ran out of
workspace credits once and was rerun).

## How to measure

- Idle CPU: `top -l 31 -s 1 -pid <pid> -stats pid,cpu,mem`, drop the first sample, average the rest.
  Let the app settle for 20 s after launch first.
- Where the time goes: `sample <pid> 5` and read "Sort by top of stack".
- Chat open: count seconds from the `stream?startIndex=0` line in
  `~/Library/Logs/UsefulBot/service-web.log` to the first `stream?startIndex=<n>` follow read.
  The stream closes 3 s after its last event, so 3 to 4 s is the floor.
- Service cost: `ps -axo pid,rss,%cpu,command | grep -E 'next-server|eve'`.
- Memory: `footprint <pid>` for the total and the per-category table (a big "CG image" line is a
  bitmap someone drew too large; `vmmap -v <pid> | grep '^CG image'` lists the regions). To find who
  allocated a region, launch the debug binary with `MallocStackLogging=1` and run
  `malloc_history <pid> <region start>`. The production web server logs no per-request lines, so
  chat-open is now timed by `ps -o %cpu` per second after the click until it settles.

## Batch 4: the app icon was a 278 MB bitmap (PR: perf/brand-rasters)

Measured with `footprint <pid>` on the installed app, settled 25 s after launch, Generalist open:

| Measure | Before (main @ a1c7709) | After |
|---|---|---|
| Footprint, fresh launch | 352 MB, of which "CG image" 266 MB in one region | 98 MB, "CG image" 14 MB |
| Footprint after 10 h 44 min | 661 MB, "CG image" 532 MB (two of the same region), peak 1.1 GB | see "Verified" |
| ImageIO (decoded PNGs) | 29 MB, the eight 1024 px motion layers | 1.3 MB |
| Idle CPU | 0.6% | 0.6% |

- **Problem.** Every PNG under `brand/` carries 25 dpi metadata, the iconset inside
  `UsefulBot.icns` included, so `NSImage` reported a 1024 px bitmap as 2,949 pt.
  `NSApp.applicationIconImage = BrandAssets.image("app/macos/UsefulBot.icns")` in `RootView` made
  AppKit snapshot the icon at its point size times the 2x backing scale: a 5,898 px RGBA half-float
  bitmap, 278 MB, allocated under `-[NSApplication _updateIconImageFromOriginal]`, and again on the
  next icon refresh, which is where the second copy came from. The audit had this filed as "30 fps
  avatar timelines with 1024 px layers" because the layers share the metadata; the splash decoded all
  eight at 1024 px for a 168 pt view, but that was the 29 MB of ImageIO, not the 532 MB.
- **How it was found.** `footprint` put 532 of 661 MB under "CG image" in four 128 MB regions plus
  two of 9.5 MB. `lldb` dumped one region; the pixel values were half floats, the row autocorrelation
  gave a width of 5,900 px, and the rendered dump was the mascot's body. `MallocStackLogging=1` plus
  `malloc_history <pid> <address>` on the debug build gave the allocating frame.
- **Fix.** `BrandAssets.image` sets the point size of any all-bitmap brand image to its largest
  representation's pixels divided by two: a brand bitmap is a 2x asset. SVGs keep their own size.
  Motion layers are rasterised once per drawn size (`BrandAssets.motionLayer`, a `size x 2` px
  bitmap, scaled up by the avatar crop and the working row's breath so it stays 1:1 on screen)
  instead of handing the 1024 px source to eight `Image` views 30 times a second. The working row
  draws `BrandMotionFrameView` from its own timeline; it used to nest a `BrandMotionView` with a
  second 30 fps timeline inside the first.
- **Not done.** The PNGs keep their metadata. Rewriting `brand/` touches tracked assets, the manifest
  and the web build for no gain the loader does not already give.
- **Found in review (Muse Spark).** The avatar path scales the layer stack by 1024/768 after layout,
  so a 28 pt raster was drawn at 37 pt and went soft. The raster now takes that scale, and the 1.04
  breath, into its pixel count.
- **Caught by.** All five models filed the 1024 px layers and the nested timeline (open item 7). None
  found the icon; the footprint did.

## Batch 3: a send stops replaying the session before its reply (PR: perf/send-cursor)

Measured through the app's own `BackendClient` against the live server, on the 3,504 event
Drive Admin session, three rounds, nothing posted:

| Work in front of the first token of every reply | Before | After |
|---|---|---|
| Turn id snapshot | 1,032 to 1,178 ms, 3,504 events, 1.1 MB | 392 to 397 ms, 0 events |
| Send stream walking history to reach its own turn | 1,030 to 1,059 ms, 3,504 events | none, it starts at the tail |
| Total | 2.07 to 2.21 s | 0.39 to 0.40 s |

- **Problem.** `send()` read the session from event zero to collect the turn ids on record,
  posted the turn, then opened its reply stream from event zero again and skipped forward until
  it met its own message. Two full replays, decoded line by line, before a single token, growing
  with every message in the chat.
- **Fix.** `BackendClient.historySnapshot` returns the turn ids and `nextIndex`, one past the
  tail the server reported (`x-eve-stream-tail-index`). It reads only past the follower's cursor
  when the follower holds this session. The send's stream starts at `nextIndex`.
- **Why the reply cannot be missed.** The cursor is taken before the turn is posted, so the new
  turn's first event sits at or after it. The server's tail is the only authority: an earlier
  draft used `max(tail + 1, cursor)`, which would have started past the new turn had a cursor
  ever run ahead of the record, and the reply would never have armed.
- **Why it cannot arm on the wrong turn.** Old turns are behind the cursor and are never read,
  and the turn id check stays in place. Proven live: four real turns with identical text on one
  session each armed on their own new turn (`turn_0` at index 2, `turn_1` at 18, `turn_2` at 26,
  `turn_3` at 34), including one through the old from-zero path for comparison.
- **No tail header, no change.** `nextIndex` is nil, the stream reads from zero and the snapshot
  is retaken from zero so its turn ids cover the whole session. The app remembers that and reads
  from zero directly afterwards.
- **Found in review (Muse Spark).** The follower reads live events past the recorded tail, so its
  cursor can sit ahead of it; a short snapshot then returns no ids for the very stretch the send
  reads. And the stream's tolerance for an untagged message fires when the id set is empty, which
  used to mean "this session tags nothing" and had become true on nearly every send. The app now
  keeps every turn id it has read per session (`seenTurnIds`), unions it into the snapshot, uses
  the short read only for sessions known to tag their turns, and shuts the untagged arm for them.
  Any other session gets the old full read.
- **Accepted, not fixed.** A session truncated under the same id in the instant between the
  snapshot and the POST would leave the stream waiting past the new turn until the 20 s unarmed
  watchdog reports that the turn did not start. eve retires an id on reset rather than reusing
  it, so this needs a storage fault inside a window of milliseconds.
- **What is left.** About 0.4 s of that is eve opening any stream at all, measured the same with
  nothing to read and through the proxy, so it is eve's cost, not the app's.
- **Caught by.** All five models. Astra (A-04) named the fix, a cursor returned with the
  snapshot, and warned to capture it before the POST and to keep the turn matching.

## Batch 2: the web service runs a production build (PR: perf/production-services)

| Measure | Before (`next dev`) | After (standalone build) |
|---|---|---|
| Web server memory | 268 MB after 12 h, 166 MB earlier the same day, plus a postcss worker | 114 MB fresh, 131 MB with the app attached |
| Web service ready after its launcher starts | route compiled on its first hit, "tens of seconds" cold | "Ready in 0ms"; healthy 2.6 s after the app launches, launcher and keychain included |
| `/api/shell`, `/api/providers`, `/api/approvals`, `/api/agent/state` | 6 to 40 ms average from the dev log, 1,184 ms worst case logged for `/api/providers` | 4 to 5 ms each |
| Replay of the 3,504 event session through the `/eve` proxy | 1,524 ms logged | 1,128 ms, all 3,504 events, tail header intact |

- **Problem.** `scripts/service.mjs` started the installed app's web service with `next dev`:
  a compiler, file watchers and a postcss worker on the request path of every poll and stream,
  and the largest process in the stack.
- **Fix.** `npm run build:app` now runs `next build web`, copies `static` and `public` into the
  standalone output (Next leaves that to the caller) and stamps the build with a SHA-256 of its
  sources. `scripts/web-mode.mjs` decides how the service runs: the built server while the
  sources (`web/`, `shared/`, `agent/`, `router/src`, `brand/source`, `package.json`) still hash
  to that stamp, otherwise `next dev`. The launcher logs one line saying which and why.
  `UB_WEB_MODE=dev` forces the dev server. The check costs 0.17 s at launch.
- **Why a fallback and not a hard failure.** This checkout is both where the code is edited and
  what the installed app runs. A stale build would serve old routes against new shared code, and
  a launcher that refused to start would take chat down for an edit. The dev server is always
  correct, just heavier, so an edit costs memory until the next `build:app`, never correctness.
- **The lockfile is not a freshness input.** eve restamps `package-lock.json` on its first boot,
  which would mark every build stale the moment the services came up.
- **The trap we hit.** Next does not recognise TypeScript 7 as `typescript` and runs
  `npm install typescript` on every build. It installs nothing, but npm rewrote
  `package-lock.json`, and the router refuses a lockfile whose hash changed: 42 tests failed with
  "package-lock hash mismatch" and the router would have refused to boot after the next
  `build:app`. The build now runs with `npm_config_package_lock=false npm_config_save=false`.
  `NEXT_IGNORE_INCORRECT_LOCKFILE` does not cover this path.
- **Found in review (Muse Spark).** The first version compared modified times and missed
  `brand/source` (the avatar palette `shared/bot-face.ts` imports) and `package.json`; a restored
  backup with old times would have served a stale build. Hence contents, not times. Also from
  that review: node is looked up in both supported install paths, a freshness check that throws
  falls back to the dev server, and `/api/status` gets the app version from the launcher because
  the traced copy has no `package.json` beside it. One finding was rejected: the supervisor does
  recognise the renamed `next-server`, through its `service.mjs` parent, as it did for `next dev`.
- **eve stays on `eve dev`, on purpose.** Measured at 20 MB and 0% CPU idle, so there is nothing
  to win, and `eve start` changes the auth policy, port defaults and build output the rest of the
  stack depends on.
- **Supervisor.** `ServiceSupervisor.isOwnNodeProcess` recognises the built server's command line
  on the same path-boundary rule as the others, so a sibling checkout is still never signalled.
- **Verified.** Through the web UI's own session on the production server: the four poll routes
  and a full stream read of the long session. macOS app relaunched against it and rendered.
- **Caught by.** All five models reported `next dev`. Spark and GLM established that
  `web/.next/standalone` was a stale manual build that `build:app` never refreshed; Astra
  confirmed the dates. Astra, Spark and GLM all advised against treating eve the same way
  without checking its auth and data directory, which is why eve was measured first.

## Batch 1: idle and render invalidation (PR: perf/idle-and-render-batch-1)

Test chat: Drive Admin, one eve session of 3,504 events, with markdown tables in its history.

| Measure | Before (main @ cb0ceba) | After |
|---|---|---|
| Idle CPU, no turn running | 29.2% average, 69.5% peak, window not even on screen | 0.6% average, window visible |
| CPU profile while idle | almost all SwiftUI layout: `UnaryLayoutEngine.sizeThatFits`, `GridLayout.Cache`, `NSAttributedString.MetricsCache` | no layout work between events |
| Warm launch to usable | services ready, then the rest of a fixed 2.8 s animation | as soon as services answer |
| Opening the 3,504 event chat with the view mounted | over 4 minutes at about 96% CPU (see "The trap we hit") | 4 s, 2.9 s of CPU in total |
| `GET /api/providers`, polled every 2.5 s | parsed a 593 KB `models-cache.json` each time, 1.2 s in one logged request | parsed once per file change |
| App memory | 393 MB | 417 MB (unchanged; memory is batch 3 work) |

### 1. The idle poll republished everything, every 2.5 seconds

- **Problem.** `AppModel` is one `ObservableObject` with 59 `@Published` fields, and every view
  observes all of it. `pollOnce` assigned `store`, `proposals`, `busyProposals`, `durableEvents`
  and `composer` and ran a full `rebuildTranscript()` on every tick whether or not anything had
  changed; `pollApprovals` did the same to `approvals` every 1.5 s. Each assignment invalidated
  the whole window, and the transcript is an eager `VStack`, so each one re-laid out the entire
  chat history, tables included. That is the 29% idle CPU.
- **Fix.** Compare before assigning, in `pollOnce`, `pollApprovals`, `refreshComposer`,
  `pruneBusyProposals` and `loadRoutines`. The transcript is rebuilt from the poll only when the
  durable events, the store (group attribution reads names from it) or the calendar day (the
  dividers say Today and Yesterday) changed. A proposal card also closes by the clock with no
  change on the wire, so the set of open ids is compared as well as the list.
- **Caught by.** All five models. Astra's round 2 trace listed the seven unconditional writes;
  Astra, Spark and GLM each named the day-label and roster traps; the proposal TTL trap was found
  while implementing.

### 2. Replaying history painted every old event

- **Problem.** A chat's turns live in the eve session, not in the durable store, so
  `ReplayGate.Durable.startsLive` is true and a replay counted as "live" from its first event.
  Every one of several thousand historical events called `publishTranscript()`, and each publish
  laid out the whole chat. On a cold launch the old 2.8 s splash hid this, because no transcript
  was mounted yet. On a chat switch nothing hid it.
- **Fix.** `performReload` does not publish while `historyRemaining > 0`. The forced publish after
  the loop paints the history once. A server that sends no count keeps the old behaviour.
- **Caught by.** Astra (A-05, the exact mechanism: "historyRemaining gates the working indicator
  but doesn't gate publishTranscript"). Spark, GLM, DeepSeek and HY4 reported the replay from
  zero but not the publish gate.

### 3. One bot's new preview rebuilt every row of the open chat

- **Problem.** `TranscriptRowView` is `Equatable` so unchanged rows skip their body, but it was
  handed whole `ShellBot` values. `sessionId`, `lastPreview` and `lastAt` change whenever any bot
  says anything, so a reply in another chat made every row here unequal and rebuilt its markdown.
- **Fix.** Rows get `ShellBot.transcriptFace`: the same bot with those three fields blanked. No
  row reads them (checked across `ChatView`, `NativeAvatar`, `AvatarStackView`, `FacePalette`,
  `ChatAttribution`). Names and avatars still compare, so a rename still redraws.
- **Caught by.** Astra only (round 2, B-01). Spark's round 3 listed the fields each row reads.

### 4. The launch animation was a minimum launch time

- **Problem.** `RootView.showingLaunch` held the splash until a 2.8 s sleep finished, even with
  services already healthy.
- **Fix.** The splash shows only while `phase == .starting`.
- **Caught by.** Astra only (A-13).

### 5. Group attribution was quadratic

- **Problem.** `Transcript.attributeGroupReplies` searched backwards for the last user row and
  re-ran the mention regexes for every assistant bubble, on every publish.
- **Fix.** One forward pass; mentions are resolved once per user turn. Pinned by
  `attributionFollowsTheNewestUserTurnAcrossARunOfReplies`.
- **Caught by.** DeepSeek (A-13); Astra confirmed it in round 2 and noted it is only quadratic
  for long runs of replies under one message.

### 6. Every streamed delta scanned the whole message history

- **Problem.** `StreamProjection.apply` used `firstIndex(where:)` and `contains(where:)` over
  `messages` once or twice per delta, on the main actor, for every streaming bot.
- **Fix.** An id to index dictionary maintained on append and on the optimistic-row id swap.
  First holder wins, as `firstIndex` did.
- **Caught by.** Astra (A-08), DeepSeek, HY4.

### 7. The Send button formatted the whole message to learn whether it was empty

- **Problem.** `canSend` called `Attachments.formatMessage`, which scans every attached file's
  text for fences, three times per body pass, and the body runs on every model publish.
- **Fix.** Sendable means a non-blank draft or at least one attachment, which is exactly when
  the formatted message is non-empty.
- **Caught by.** Astra (B-03), HY4 (A-14).

### 8. A 593 KB JSON file was parsed on every poll and twice per model call

- **Problem.** `readModelsCache` did `readFileSync` plus `JSON.parse` with no memo. The composer
  poll hits it every 2.5 s through `/api/providers`, and the router reads it per completion.
- **Fix.** The parse is kept while the file's inode, size and mtime are unchanged. Writers replace
  the file by rename, so another process's write is always a new inode. `writeModelsCache` drops
  the memo first, because callers edit the object they read. Pinned by a test that swaps in a
  same-size file within the same clock tick.
- **Caught by.** HY4 (measured the 593 KB), GLM (the router reads). Spark and GLM both warned
  that mtime plus size alone is not a safe key.

### 9. Smaller ones

- Display polls (shell, thread, composer) drop to every fourth tick while no window is visible.
  Handoff ticks and approvals keep full cadence. Gated on window occlusion, not on the app being
  active, so a visible window on a second display is never slowed. (Trap from GLM and Spark.)
- `ScrollPinnedTracker` assigns `viewport` only when it changed. Hygiene: GLM and Astra both
  judged the gain near zero, and nothing here claims otherwise.

### The trap we hit

Fix 4 on its own made things far worse. With the splash gone, the transcript was mounted during
the launch replay, and problem 2 became visible: 96% CPU for over four minutes to open one chat,
where the old build took 3 s behind its splash. A before and after measurement caught it; the
tests did not. Lesson: measure each fix on the long chat, not on a fresh one.

### Looked at and not done

- Reusing one `JSONDecoder` per stream line: the allocation is small next to the decode.
- Skipping the `JSONValue` tree for header-only events: marginal, and a closed skip list would
  drop payloads of event types added later (GLM T-08).
- A shared 30 Hz animation clock published app-wide: it would invalidate everything 30 times a
  second (Astra).

## Still open, in the order Astra's plan ranks them

| Item | Why it matters | Risk | Found by |
|---|---|---|---|
| Transient markdown cache for the growing reply | every streamed prefix is parsed again and kept, up to 2,048 entries | medium | Astra, Spark, GLM |
| Cached chat switch resumes from its cursor | a switch back still replays from zero | high | all five |
| Windowed transcript (last N blocks, "Show earlier") before any `LazyVStack` | layout still scales with history on a real change. Spark and GLM both advise the window first: laziness breaks the reply-height sum and the tall-reply anchor | high | all five |
| One `WKWebView` per widget row, mounted eagerly | memory in widget-heavy chats | medium | all five |
| Per-bot transcript caches have no eviction | memory grows with chats visited | medium | Astra, Spark, DeepSeek |
| Server reads and parses whole JSON stores per poll; tick sweeps orphans every 2.5 s | event-loop stalls shared by all bots | medium | GLM, DeepSeek, HY4, Spark |

Closed: the avatar timelines and 1024 px layers (batch 4). Deferred by decision: the cached chat
switch resuming from its cursor.
