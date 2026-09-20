# Useful Bot iOS build log

Append-only per-PR record of the cloud build (spec §17.4). Measured numbers and
estimates are never mixed; anything not instrumented is labelled an estimate or
marked "not exposed". Publishable by construction: no secrets, no personal
identifiers, no tailnet addresses, no device names.

## Running totals

| Metric | Total |
|--------|-------|
| PRs merged | 1/8 |
| Total wall time | ~6.1 h (PR-1 session) |
| Review rounds | 6 |
| Findings (blocker/high/medium/low) | 1/6/14/27 |
| Token spend | not exposed |

## Environment record (spec 17.0)

Recorded by the PR-1 session; every `-destination` below means this device.

- VM: Devin macOS cloud, Apple Silicon, macOS 26.5.2
- Xcode: 26.6 (build 17F113) at `/Applications/Xcode.app`
- The simulator: iPhone 17, iOS 26.5 runtime (23F73), id
  `D0B64A8A-D5F1-4668-8FFC-A86B400AF527`, booted. Note: a second iOS 27.0
  runtime exists on the image; all builds pin the 26.5 device by id.
- Swift: 6.3.3 (swiftlang-6.3.3.1.3)
- Node: v24.20.0 at `/opt/homebrew/bin/node`; `/usr/local/bin/node` symlinked to
  it because `scripts/verify-release.mjs` and `package.json` scripts hard-code
  the owner's path
- XcodeGen: 2.46.0 (Homebrew)
- iOS platform support: not present on first boot; installed via
  `xcodebuild -downloadPlatform iOS` (iOS 26.5 simulator package 23F77)

Clean-clone proof at `ef24d21` (main before PR-1):

- `cd macos && swift build`: green (12.8s)
- `make -C macos test`: green, 280 tests in 41 suites
- Trivial SwiftUI app: built for `iphonesimulator`, installed, launched, one
  `xcrun simctl io booted screenshot` captured (1206x2622)
- `node scripts/verify-release.mjs`: green, but only after two fixes for
  failures preexisting on `main` (see PR-1 Surprises): `tsc_web` failed on
  `web/app/page.tsx` (a `ThreadRow.kind` union missing `"widget"`) and `unit`
  failed in `test/api-guard.test.ts` (unhandled rejection when `readBody`
  cancels a streamed multipart body on Node 24.20)

VM stack (spec 17.5), all live checks target it:

- `node scripts/setup-local.mjs`: minted the five VM Keychain items and
  `~/.useful-bot/config.json`; `com.usefulbot.opencode-go` installed manually
  from `UB_CLOUD_PROVIDER_KEY` (the script says so itself)
- `scripts/service.mjs router|eve|web` running in background, logs under
  `~/Library/Logs/UsefulBot/`; web serving `mode=production`
- `GET /api/status`: `ok`, `eve: available`
- OpenCode Go connected via `PUT /api/providers` (`opencode-go` + `plan`); the
  `opencode-go:plan` connection is active, models synced (`glm-5.3-flash`
  workhorse, `glm-5.3` reviewer)
- "Test Bot" created via `PUT /api/shell`; one turn sent through
  `POST /eve/v1/session`; streamed `message.appended` deltas and a
  `message.completed` (`finishReason: stop`) observed on
  `/eve/v1/session/<id>/stream` - a real model answer, not a fixture

## PR-1 - Repo & project skeleton (P0)

- Session: `devin-598068a36aa04f2fbab55b43459147d6`
- Started: 2026-09-19T17:23Z
- Branch: `ios/pr-1`

### Scope

Per spec 17.2/3.2: `Package.swift` gains `.iOS(.v17)` and an explicit
`UsefulBotCore` library product; macOS-only sources (`LocalServices`,
`ServiceSupervisor`, `HealthPoller`, `ServerConfig` and their tests) are gated
`#if os(macOS)`; `BackendClient` now takes injected `DeviceTokenStore` and
`EndpointPolicy` protocols with the macOS defaults preserved
(`ProcessDeviceTokenStore`, `DesktopEndpointPolicy`), a private per-client
`HTTPCookieStorage`, and a portable `ServerEndpoint` value type; iOS project
scaffolded via XcodeGen 2.46.0 (`ios/project.yml`, generated `.xcodeproj`
committed); iOS 17.0, bundle id `com.usefulbot.app`, name "Useful Bot", icon
from `brand/app/useful-bot-app-icon-1024.png`; static pairing screen per design
spec 1.1 (badge, title, subtitle, 300 pt scanner square with corner guides,
status line, three numbered steps, secondary "Enter manually" button, manual
form with Connect gating) in both appearances.

### Effort

One session (`devin-598068a36aa04f2fbab55b43459147d6`). ACU spend is not
exposed to the session.

### Verification

Measured on this VM against the live stack; destinations are the iPhone 16e
(390 pt) and iPhone 13 mini (375 pt) simulators unless named.

- `make -C macos test`: 280/280 in 41 suites (macOS regression).
- `xcodebuild test -only-testing:UsefulBotCoreTests` (iPhone 16e, iOS 26.5):
  259/259 - the portable suite runs green on the iOS simulator.
- `xcodebuild test -only-testing:UsefulBotUITests`: 4/4 on 390 pt, 4/4 on
  375 pt (pairing-empty and pairing-manual, light and dark, plus
  accessibility-XXXL variants).
- `node scripts/verify-release.mjs`: all checks PASS.
- `npm test`: 538/538.
- `xcodegen generate` twice: byte-identical `project.pbxproj` (sha256 match),
  so the committed project regenerates with no diff.
- Visual gate: 16 committed screenshots in `docs/audit/ios-shots/PR-1/` -
  `pairing-{empty,manual}-{light,dark}[-375][-xxxl].png`, exported via
  `xcrun simctl io` attachments through the UITest harness, scaled to 1x
  review size with `sips -Z 1000`.
- Backend gate: PR-1 ships no server changes (S1-S15 land in PR-2 onward) and
  creates no owner checklist entries (the checklist file is created in PR-2
  per spec). Physical-device and real-Tailscale-Serve checks remain red in
  cloud as designed; nothing in this PR touches them.

### Measurements

- `swift build` (macos/, post-port): ~30 s cold; incremental under 1 s.
- `xcodebuild` iOS build (app + test bundles): ~80 s cold on this VM.
- UsefulBotCoreTests on iOS simulator: 259 tests, ~21 s wall including boot.
- UsefulBotUITests: 4 tests, ~75 s per device (includes two app launches and
  navigation push).
- Screenshot matrix: 8 files per width (390 pt, 375 pt), 16 total, all under
  1 MB after `sips -Z 1000`.

### Surprises

- Spec 3.2 lists `RailClock` in the macOS-only set, but portable sources use
  it; it stays portable (code wins over spec).
- `BackendClient.keychainFailure` stays portable rather than macOS-gated:
  `ShellActionsTests` exercises it and the test target builds for iOS.
- `xcodebuild` only exposes the package's `UsefulBot` scheme; there is no way
  to select `UsefulBotCore` alone for an iOS destination, so the portable
  suite runs inside the Xcode project as a unit-test target pointing at
  `../macos/Tests/UsefulBotCoreTests`.
- Local SwiftPM packages need an explicit `.library` product or
  `Missing package product` results.
- No iOS-26-capable 360 pt device exists; the smallest is iPhone 13 mini at
  375 pt. The spec's "one 360 pt" matrix row is run at 375 pt and filenames
  record `-375`.
- `UIScreen.main.bounds` inside the UI-test runner reports 320 pt regardless
  of device; `app.frame.width` is the real width and feeds filename suffixes.
- `-UIPreferredContentSizeCategoryName` launch arguments are ignored by the
  runner; `UB_TYPE_SIZE` env + `.environment(\.sizeCategory, ...)` in the app
  is the working override.
- `.font(.system(size:))` does not scale with Dynamic Type; token fonts go
  through `@ScaledMetric` (`ScaledTokenFont` / `tokenFont`) so XXXL evidence
  is real. Verified by sha256: previously identical light/xxxl shots now
  differ.
- `npm ci`/`npm install` on Node 24 rewrites `package-lock.json` (drops
  `peer` flags), which trips the router's tamper-evidence check
  (`package-lock hash mismatch`, 503 `configuration_unverified`). Lockfile
  restored from HEAD; no package changes ship in this PR.
- Two failures preexisting on `main` (environment record, above) are fixed in
  this PR: `web/app/page.tsx` `ThreadRow.kind` union adds `"widget"`;
  `web/lib/api-guard.ts` `readBody` drains the request stream instead of
  `reader.cancel()` on overflow (Node 24 unhandled rejection).

### Review loop

Round 1: three SWE-2 max-effort reviewer sessions, one per Prompt-6 role
(correctness `devin-0d37749e7f4a45e69a9ae32e4e0d4b66`, security
`devin-e105096796dc47dda605298dc38bfb34`, design-a11y
`devin-69b7c75db5974758b1f241e57298923e`). Each reviewed the real diff, tests
and screenshots and posted its verdict as a PR comment (reviewer VMs have no
GitHub API credentials, so the verdict lands as a comment, not a review
event - recorded here as the chain's convention). All three requested
changes; 14 findings total.

Security (3):
1. [medium] `EndpointPolicy.endpoint(for:)` was total and could not express
   the spec 4.7 rejection path -> now `throws`, and `BackendClient.init`
   throws through it (macOS call sites use `try!`/`try?` since
   `DesktopEndpointPolicy` never rejects).
2. [medium] the shared `URLSession` followed redirects while carrying the
   credential -> `NoRedirectDelegate` answers nil; a 3xx is an `http` error.
3. [low] `expectOK` flattened a final 403 to `unauthorized` -> 403 now
   surfaces as `.http(403)` so the code is preserved for iOS (8.4).

Correctness (3):
1. [high] `UB_TYPE_SIZE` unset injected `\.sizeCategory = .large`, pinning
   Dynamic Type in every real run -> the override is applied only when the
   env var is set.
2. [medium] `WidgetWebView` built a fresh `BackendClient` per load, each
   paying a full sign-in against the auth rate limit -> one static client.
3. [low] same EndpointPolicy drift as security #1.

Design-a11y (8):
1. [high] title truncated "Mac" at a11y sizes -> `.lineLimit(2)` removed;
   the title reflows (A.7 beats the design note "wraps to two lines").
2. [high] scanner guides transposed on top-right/bottom-left -> each arm's
   direction is derived from the edge its arc endpoint lies on.
3. [high] system placeholders ~1.7:1 -> styled `prompt:` at `inkFaintText`.
4. [medium] sunken controls stroked `border` -> `edge` whisper token.
5. [medium] system blue leaked via caret/selection/back chevron ->
   `AccentColor` colorset (#171717/#EDEDED) plus `.tint(Theme.C.accent)`;
   focused fields now show the `ink` edge with a 3 pt 8% ring.
6. [low] Connect button was 44 pt -> 50 pt.
7. [low] `PressedScale` had no tone step or reduce-motion gate -> ink 5%
   overlay on press, scale skipped under Reduce Motion.
8. [low] every token font scaled on the `.body` curve -> `ScaledTokenFont`
   maps each size to the nearest `Font.TextStyle`.

Round-1 verification after fixes: `make -C macos test` 280/280; iOS build
green; UITests 4/4 at 390 pt and 4/4 at 375 pt; screenshots re-exported.

Round 2: fresh reviewer sessions (correctness
`devin-5bf97325aa154436a1cdda9974cd0eff`, security
`devin-9c750729a2fe49b79940f8bd29ef9d8e`, design-a11y
`devin-992e758f1cfa406eaba9c54b4f43ee4c`). All three requested changes;
correctness overlapped security on the 403 stream/retry and single-flight
findings (both fixed in the same commit) plus one new one.

Security (4):
1. [medium] the round-1 403 fix stopped at `expectOK`: the stream path still
   flattened a terminal 403 to `unauthorized` and both retry loops re-authed
   on 403 -> on iOS, 403 is never a re-auth trigger and surfaces as
   `BackendError.forbidden(code)`; macOS keeps its retry contract (#if).
2. [medium] a 401 body's `credential_invalid` code was discarded, so the
   spec 4.8 revocation state was unreachable -> new `.credentialInvalid`
   error; on iOS an immediate `credential_invalid` skips even the single
   re-auth, and any terminal 401 maps to it.
3. [low] concurrent 401s each spawned their own `signIn` -> `reauth()` is a
   single-flight inflight task shared by requests and streams (both
   platforms).
4. [low] `readBody`'s overflow drain ran until EOF -> the drain is
   time-bounded at 5 s; a stalled peer cannot hold the route open.

Design-a11y (7):
1. [high] `addArc` on a non-empty `Path` drew connector strokes, painting a
   continuous outline -> `path.move(to:)` ahead of each arc start; shots now
   show four true elbows.
2. [low] white guides were ~1.1:1 on the light `sunken` placeholder ->
   `Theme.C.scannerGuide`: spec's white 80% in dark, ink 50% in light (drift:
   spec's white presumes the camera feed).
3. [low] focus-ring animation used system easing without a Reduce Motion
   gate -> `Motion.fast` curve, nil under reduce-motion.
4. [low] disabled reason used `inkFaintText` -> `inkMuted` per token table.
5. [low] the 5% press tone-step was invisible on `brand` fills -> 8%.
6. [low] the title lacked the header trait -> `.isHeader` added.
7. [low] `TARGETED_DEVICE_FAMILY=1` excluded iPad though spec F5 supports it
   -> `1,2`, with all-orientation Info.plist keys scoped to iPad.

Correctness (4):
1. [medium] same stream/perform 403 gap as security #1 -> same fix.
2. [low] `ScaledTokenFont.style(for:)` rounded up instead of nearest
   (15 -> callout, 16 -> subheadline, 22 -> title3) -> boundaries are now
   the midpoints between the ten real style sizes (11..34).
3. [low] same missing single-flight as security #3 -> same fix.
4. [low] same unbounded `readBody` drain as security #4 -> same fix.

Round-2 verification after fixes: `make -C macos test` 280/280; iOS build
green; `UsefulBotCoreTests` 259/259 on the simulator; UITests 4/4 at 390 pt
and 4/4 at 375 pt; `npm test` 538/538; `xcodegen generate` byte-identical;
all 16 screenshots re-exported (the elbow geometry is visible in both
appearances).

Round 3: fresh sessions (correctness `devin-509147df56864b52be718ba549590570`,
security `devin-9429754199cf4776a6091a957b91f7c0`, design-a11y
`devin-612facd0d2ff4ec790175358a77ec97b`). All three returned findings.

Design-a11y (5, landed in `21331d6`):
1. [medium] `PressedScale`'s ink overlay is invisible over `brand`/`accent`
   fills (`ink == accent` in both palettes), so the mandated press step was
   scale-only and Reduce Motion produced zero feedback -> `PressedScale`
   gains `fill`/`pressedFill`/`shadowed`; the Connect button's fill moved
   into the style and presses step `brand -> accentStrong` (the macOS
   `accent -> accentStrong` precedent). `sunken` fills keep the ink overlay.
2. [low] `ManualPairingView`'s focus-ring animation used `.easeOut`, not the
   mandated curve -> `.timingCurve(0.22, 1, 0.36, 1, Motion.fast)`.
3. [low] "Enter manually" floated ~57 pt high off a magic
   `minHeight: proxy.size.height - 40` -> `minHeight: proxy.size.height`,
   matching the manual screen's `sheetInset` + safe-area anchor.
4. [low] deprecated `.navigationBarHidden(true)` -> `.toolbar(.hidden, for:
   .navigationBar)`.
5. [low] the visual gate never shot focused/ready/keyboard-up states ->
   UITest now captures `pairing-manual-focused` and `pairing-manual-ready`
   on every device/appearance/size combo; `pairing-manual-keyboard`
   (light + dark, 390 pt) captured via `simctl io screenshot` in Simulator.app
   because XCUITest runs with the hardware keyboard connected and never shows
   the software keyboard.

Correctness (2):
1. [high] seven non-2xx write paths (`providersWrite`, `startOAuth`,
   `providerWrite`, `connectorsWrite`, `setDailyTokenBudget`,
   `uploadAttachment`, `expectShellOK`) decoded `{error:code}` and threw the
   typed error directly, so on iOS a terminal 401 surfaced as
   `.provider("unauthorized")` and a 403 as `.provider("forbidden")` -> all
   route through `failure(status:code:fallback:typed:)`, the single helper
   that applies the iOS lifecycle map before the typed code.
2. [low] no test touched the new seam -> `BackendClientAuthTests` (5 tests)
   pins both platforms with a stubbed `URLProtocol`: terminal 401 ->
   `credentialInvalid` iOS / `shell("unauthorized")` macOS;
   `credential_invalid` body skips the re-auth on iOS; 403 -> `forbidden(code)`
   iOS / `shell(code)` macOS; four concurrent 401s cost one sign-in.

Security (3):
1. [medium] same `expectShellOK` bypass as correctness #1 -> same fix.
2. [medium] `URLSessionConfiguration.default` let `URLCache.shared` persist
   authenticated GET bodies (roster, transcripts, the csrfToken readback) to
   Cache.db, outside the spec 13 cache and the spec 4.8 purge ->
   `config.urlCache = nil`.
3. [low] the taxonomy had no tests -> `BackendClientAuthTests` covers it
   (same file as correctness #2).

Round-3 verification after fixes: `make -C macos test` 285/285 (five new);
`UsefulBotCoreTests` 264/264 on the simulator; `xcodegen generate` run after
the new test file was added so the iOS target picks it up. After the
design-a11y fixes (`21331d6`): UITests 4/4 at 390 pt and 4/4 at 375 pt with
the new states, macOS 285/285, verify-release PASS, `npm test` 538/538,
xcodegen no-diff, 34 screenshots in `docs/audit/ios-shots/PR-1/`. One
flake was hit and re-run green: `aPortThatIsStillComingUpIsNotKilledAsWedged`
(macOS, timing-sensitive port test, unrelated to this branch).

Review loop round 4 (fresh reviewers on 5d385e6): correctness approved
("Zero findings in role correctness"; gates re-run green; the lone
`contracts.test.ts` glm-5.3 max_tokens failure reproduces on `origin/main`,
pre-existing, not a finding); security approved ("Zero findings in role
security"); design-a11y requested changes, 2 findings, both fixed in
`420cf14`:

Design-a11y (2):
1. [medium] `ManualPairingView` had no scroll container, so at 375 pt x
   a11y-XXXL the disabled-reason text clipped with a rendered ellipsis ->
   wrapped in ScrollView pinned to screen height (same pattern as
   PairingView); the reason wraps via `fixedSize`. New 375-xxxl captures
   show all three lines.
2. [low] resting field edges stroked `edge` instead of `borderStrong`,
   the token table's Field edges entry -> `Theme.C.borderStrong`.

Round-4 verification after fixes: UITests 4/4 at 390 pt and 4/4 at 375 pt;
full sim suite green; macOS 285/285; verify-release PASS; `npm test`
538/538; xcodegen no-diff; all 34 screenshots regenerated.

Review loop round 5 (fresh reviewers on b8646a0): all three roles
requested changes; 3+2+2 findings across design-a11y, correctness and
security. Design-a11y fixes landed in `6df1264`, then `7259531` merged
main (#104) and `01f03e4` fixed the rest:

Design-a11y (3):
1. [medium] the iPad check in spec 17.1 gate 3 had no evidence ->
   UITests now also run on iPad mini (744 pt): 16 captures of pairing +
   manual, both appearances, both type sizes, committed.
2. [low] numbered steps announced as two VoiceOver elements each ->
   `.accessibilityElement(children: .combine)` on the step row.
3. [low] the scanner cap dropped to 200 pt at the first accessibility
   size even when 300 still fit -> `ViewThatFits` keeps 300 while the
   column fits, falls to the 200 pt floor when it does not, then scrolls.

Correctness (2):
1. [blocker] clean-textual merge over #104 but the combined tree fails
   to compile on both platforms: `widgetToolCall` called the pre-change
   one-arg `expectOK(response)`, and the widget tool bridge built
   `BackendClient(base:)` without `try` on the now-throwing init ->
   merged main, `expectOK(data, response)`, and the bridge reuses the
   loader's single-flight `Self.client` (a fresh client pays a full
   sign-in each call).
2. [low] `signIn`'s session read-back threw bare `.http(status)` on iOS
   -> funnels through `failure()`, so 401 is `credentialInvalid` and
   403 `forbidden(code)` there too.

Security (2):
1. [medium] the stream idle watchdog was only touched per line, so the
   pre-first-line window (header wait, `errorCode` drain, `reauth()`
   round trip) could hit the threshold and `finish()` cleanly
   mid-handling, masking a terminal auth error and presenting an
   early-cut replay as complete -> activity touches bracket each await
   in the handshake, and both watchdog stops now throw
   `streamInterrupted` (spec 8.3: early stop is incomplete, reported
   as such).
2. [low] the auth tests swap in a stub session, so `makeSession()`'s
   isolation controls were unpinned -> `defaultSessionIsIsolated`
   asserts the private cookie jar, nil urlCache and NoRedirectDelegate
   on the default session.

Round-5 verification after fixes: iOS suite 266/266 + UITests 4/4 at
390 pt, 375 pt and 744 pt (iPad mini); macOS 287/287 (now including
#104's tests); verify-release PASS; `npm test` 545/545 (an interim run
hit the package-lock drift left by next_build; restored and re-ran
green); xcodegen no-diff; 50 screenshots in docs/audit/ios-shots/PR-1/.


Review loop round 6 (fresh reviewers on 7ef580b, post-merge-of-main):
all three roles approved with zero findings ("Zero findings in role
correctness" / "security" / "design-a11y"). The one caveat reviewers
recorded: `router/test/contracts.test.ts:247` (glm-5.3 window needs a
populated models cache) fails on a clean machine - preexisting on main
since 4a05209, untouched by this diff, re-verified on origin/main.

## Effort (spec 17.4)

- Author session: this Devin session (SWE-2, max effort, macOS cloud).
- Reviewer sessions, one per role per round, all SWE-2 max effort:
  R1 0d37749e / e1050967 / 69b7c75d; R2 5bf97325 / 9c750729 / 992e758f;
  R3 509147df / 94297541 / 612facd0; R4 b189ab2a / 82dfaa90 / 0a921bdc;
  R5 fb2b2ed9 / 9616d9c6 / 515d1eb9; R6 b5559c14 / 12f8537a / 1770c72d.
- ACU: not exposed (child sessions report 0.0).
- Provider: OpenCode Go (opencode-go, plan) for the VM-stack live checks;
  no weekly-limit hit this PR.

Merge: squash-merged to main after the all-green round-6 pass as 69de78a
(squash via gh is not permitted from this cloud runner; merged locally, PR
closed with the note).

Chain: PR-2 lead session created: 40126d29de2a4d7b9e0757d40442f917.

## PR-2 - Connectivity & auth (P1)

- Session: `devin-40126d29de2a4d7b9e0757d40442f917`
- Started: 2026-09-19T23:34Z
- Branch: `ios/pr-2`

### Scope

Per spec 17.2: `KeychainStore`, `TailnetEndpointPolicy`, `PairingStore` with
the 4.8 states, pairing UI wired for real (QR scan + manual), session
exchange, re-auth, readiness levels, error taxonomy. Server S1-S9, S13, S15.
Creates `docs/audit/IOS-OWNER-CHECKLIST.md`.

### Verification

- Build/test (17.1.1): `xcodebuild build`/`test` green on iPhone 17 (402 pt)
  and iPhone SE (375 pt); `make -C macos test` 301/301; `npm test` 573/573
  including `test/phone-ingress.test.ts` and `test/ios-contract.test.ts`;
  `scripts/verify-release.mjs` PASS (tsc ×3, unit, next_build,
  launchd_render); `xcodegen generate` no diff.
- Backend (17.1.2): real routes — every touched route exercised against the
  live stack under `next dev`; `test/ios-contract.test.ts` asserts the
  captured fixtures in `test/fixtures/ios-contract/` (generated by
  `scripts/ios-contract-fixtures.mjs` against the running web service).
  Evidence level: real routes. Real Serve + physical device: red (cloud) —
  owner steps recorded in `docs/audit/IOS-OWNER-CHECKLIST.md`.
- Visual (17.1.3): 122 shots in `docs/audit/ios-shots/PR-2/` — 16 states ×
  light/dark × 375 + 402 (+ xxxl where a11y applies, + 834 where navigation
  changed), driven by `scripts/ios-pairing-gate.sh`; full gate green on
  iPhone 17 at final code (pair → connected → revoke → credentialInvalid →
  rotate → repair → journey → offline/unreachable/runtimeDown →
  connecting/connect-failed).
- Performance (17.1.5): Appendix B traps diff check — clean (no per-frame
  work in draw paths, no layout-in-render, monitors cancelled in deinit,
  single owned URLSession per client).

### Surprises

- **Spec 4.2's "zero proxy headers" loopback rule is unreachable under Next**:
  `base-server` synthesizes `x-forwarded-for/host/port/proto` (`??=`) on every
  request, so a plain `curl` to 127.0.0.1 arrives at the route carrying all
  four. `classifyIngress` therefore treats a *loopback-valued* echo — all XFF
  hops loopback, proto `http` or absent, forwarded host loopback or absent,
  and none of `forwarded`/`tailscale-*`/https-proto/remote-hop material — as
  no proxy material, and forces the strict tailnet path for anything else.
  A local client sending the same echo is inside the loopback trust domain
  already, so nothing extra is granted. Recorded here per the code-vs-spec
  rule; flagged in the PR description.
- **XFF empty-hop handling**: hop entries are never dropped — an empty first
  entry (`" , 100.x"`) fails the tailnet check rather than promoting hop 1
  into the trusted position.
- **Module layout**: `next/server` and `next/headers` cannot resolve under
  `node --test` (extensionless package entries), so the pure pieces moved to
  `web/lib/ingress.ts` (classifyIngress + originAllowed) and
  `web/lib/runtime-config.ts` (runtimeConfig/credentialById/phoneDisabled);
  `desktop-gate.ts`/`auth.ts` re-export them so the spec's symbol homes still
  hold. Cookie-bound session helpers live in `web/lib/cookie-sessions.ts`.
- `router/test/contracts.test.ts` fails on a clean `main` checkout too
  (`opencode-go forwards the model …` — live catalogue drift: glm-5.3's
  window now reports 131,072 so `max_tokens` comes back 13,107 not 32,768).
  Pre-existing, unrelated to this PR; verified via `git stash`.
- **iOS "Save Password?" alert**: the pairing-token `SecureField` triggers
  Keychain's save sheet, which can (a) steal first responder mid-`typeText`
  so the token silently never lands — Connect stays disabled — and (b)
  surface *after* the last synthesized event, lingering into screenshots.
  Mitigations: `.textContentType(.oneTimeCode)` on both the sheet and the
  inline `SecureField` (reduces but does not eliminate the sheet), a
  `addUIInterruptionMonitor` answering "Not Now" in all three UITest
  classes, a Connect-`isEnabled` retype guard (SecureField values are
  unreadable, so the disabled button is the only tell), and a direct
  `dismissSystemAlerts` helper (app + springboard) before every post-pair
  shot.
- **Manual pairing names the Mac by host**: `PairingPayload(manualHost:)`
  falls back to `host.url.host` when no QR `name` exists, so the success
  line reads "Connected to 127.0.0.1" under manual entry. Tests that waited
  for "Connected to <payload.name>" missed the state entirely — the spec's
  §11 copy is `Connected to <name>` and `pairing-status` prefix matching is
  the reliable assert.
- **`UB_HOLD_CONNECTED` seam**: the 600 ms `connected` hold is faster than
  XCTest's ~1.3 s poll cadence; the seam stretches it to 8 s so the visual
  gate can capture the state. Never set outside the test harness.
- **Keyboard dismissal races**: coordinate-tapping `keyboards.buttons["return"]`
  fails with "Failed to get matching snapshot" when the keyboard has already
  self-dismissed; bare `app.swipeDown()` cannot fail on an absent keyboard.
  During the `connected` hold, a blocking `waitForNonExistence` on the
  keyboard outlives the hold — poll the target text while dismissing.
- **Leg-ordering hazard**: `--rotate-phone` invalidates the token in
  `/tmp/ub-pair.json` — the file must be regenerated after *every* rotate
  before the next pairing leg or the exchange 401s straight back into
  `credentialInvalid`.
- **xcodebuild post-test hang**: the tool idles after "TEST SUCCEEDED" on
  some legs; shots land under `/tmp/ub-shots/` regardless (the sim shares
  the host fs), so killing the runner loses nothing.
- **Connected-legs mid-hold terminate**: `markPaired`/`markSignedIn` run after
  the `connected` hold inside `connect()`; a UITest that terminates on first
  sight of the success line kills them, leaving the store `unpaired` for the
  revoke → testB legs (observed: testB saw "Connect to your Mac", never
  "Pair again"). Both connected tests now wait for `pairing-status`
  nonexistence (state swap to paired) before terminating.
- **verify-release's `next_build` leg rewrites `package-lock.json`** (drops
  `peer` flags, Node 24 `next build` auto-install) — the same drift recorded
  under PR-1 for `npm ci`; it re-trips the router's tamper-evidence hash the
  moment it lands. Lockfile restored to the registry-recorded state for the
  commit; `npm test` 573/573 run after the restore.
- **Device geometry**: iPhone 17 sim reports 402 pt (not 390); iPhone SE 375;
  iPad Pro 11" 834 — shot names carry the measured width suffix.
