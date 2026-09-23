# Useful Bot iOS build log

Append-only per-PR record of the cloud build (spec §17.4). Measured numbers and
estimates are never mixed; anything not instrumented is labelled an estimate or
marked "not exposed". Publishable by construction: no secrets, no personal
identifiers, no tailnet addresses, no device names.

## Running totals

| Metric | Total |
|--------|-------|
| PRs merged | 2/8 |
| Total wall time | ~6.1 h (PR-1 session) |
| Review rounds | 6 |
| Findings (blocker/high/medium/low) | 1/6/14/27 |
| Token spend | not exposed |

The header counters for wall time, rounds and findings were written at the
PR-1 merge and were not rolled forward when PR-2 merged. They still describe
PR-1 only. PR-2's rounds live in its entry; this session does not reconstruct
them into the header. PRs merged is corrected to 2/8 because `ddb0005` is on
main.

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
  and iPhone SE (375 pt); `make -C macos test` 302/302; `npm test` 573/573
  including `test/phone-ingress.test.ts` and `test/ios-contract.test.ts`;
  `scripts/verify-release.mjs` PASS (tsc ×3, unit, next_build,
  launchd_render); `xcodegen generate` no diff.
- Backend (17.1.2): real routes — every touched route exercised against the
  live stack under `next dev`; `test/ios-contract.test.ts` asserts the
  captured fixtures in `test/fixtures/ios-contract/` (generated by
  `scripts/ios-contract-fixtures.mjs` against the running web service).
  Evidence level: real routes. Real Serve + physical device: red (cloud) —
  owner steps recorded in `docs/audit/IOS-OWNER-CHECKLIST.md`.
- Visual (17.1.3): 156 shots in `docs/audit/ios-shots/PR-2/` — 21 states ×
  light/dark × 375 + 402 (+ xxxl where a11y applies, + 834 where navigation
  changed), driven by `scripts/ios-pairing-gate.sh`; full gate green at
  final code on both phones and the iPad subset (pair → connected → revoke
  → credentialInvalid → rotate → repair → expiry banner → journeys ×4 →
  offline/unreachable/runtimeDown banners → signed-out variants →
  connecting/connect-failed → offline pairing).
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
- **iOS 26 `.topBarLeading` clips to the first subview**: a custom
  `HStack { badge; Text("Useful Bot") }` rendered only the badge — the nav-bar
  title silently vanished. `.fixedSize()` on the stack keeps the title
  past the badge; verified in `bots-paired-*` shots.
- **XCTest polling starves the MainActor**: with `UB_HOLD_CONNECTED` at 8 s,
  `markPaired`/`persist()` run on MainActor after the hold; constant element
  queries starve that continuation past a 15 s wait. `_ = waitForBotsRoot`
  discarded the timeout, so `app.terminate()` banked `unpaired` and the next
  leg (revoke → testB) failed on "Pair again" with zero requests reaching
  the server. Both connected legs now `XCTAssertTrue(waitForBotsRoot(_, 40))`
  so the leg that actually broke fails, not a downstream one.
- **`shared/web-sessions.ts` mkdir lock contention**: a re-sign-in POST can
  take ~15 s under `withLock` spin (`LOCK_TIMEOUT_MS` 8000, 15 ms tries) —
  post-sign-in and `Pair again` waits widened to 30 s. Harness, not product.
- **Credential-expiry banner** (spec 11 fourth row): `expiryWarnedFor` is
  keyed to the credential's `expiresAt` Date so rotation/re-pair warns
  again; `UB_CREDENTIAL_EXPIRY_DAYS` seam sets the window at both
  `markSignedIn` sites for the gate's `bots-expiring` legs.
- **`web:dev` restart without `UB_ROUTER_CONFIG` fails silently open for
  tokens**: `runtimeConfig()` returns null when the env var is absent,
  `deviceCredentials()` is then empty, and every Bearer 401s `{ok:false}`
  — the app reads it as `credentialInvalid`. The gate's
  `capture_web_env` exists for exactly this; a bare `npm run web:dev`
  needs the var passed explicitly.
- **A second concurrent gate run races the shared stack**: an orphaned
  script (its launcher died, the script survived) kept driving rotate/
  revoke/web-stop while a fresh gate ran — flags under `/tmp/ub-*` and
  the services are singletons. Check `pgrep -f ios-pairing-gate` before
  starting one; a stale run's `/tmp/ub-web-down` et al. poison shots.
- **Cold-boot race after the autofill write**: the restrictedBool payload
  is written while the sim is shut down, so the first leg's xcodebuild
  arrives mid-boot and dies `Mach error -308 (ipc/mig) server died`. The
  gate now boots the sim itself and settles 5 s past `Booted` before leg
  A.
- **Stale stall stub on :59999**: a leftover `node -e` listener made the
  fresh stub EADDRINUSE; the leg still passed because a never-answering
  listener is the stub's whole behaviour — but the flag was already
  touched, so a stale one can mask a real failure to start it.
- **`DynamicTypeSize.isAccessibilityCategory` is not in this SDK**:
  the wrap decision switches on `.accessibility1`–`.accessibility5`
  explicitly.
- **Scanner guide color deviates deliberately** (design spec 1.1 item 5):
  white@80% presumes a dark camera feed, but on the simulator — and on a
  denied camera, the state every automated run produces — the square is
  the light `sunken` placeholder where white@80% is ~1.1:1 (invisible).
  `Theme.C.scannerGuide` is dark white@80% / light ink@50% (≈3:1 on
  `sunken`); the live-camera path still gets the spec color in both
  appearances. Recorded here per the code-vs-spec rule.
- **The gate's "dev stack running" prereq is real**: a run against a dead
  :4320 makes leg A fail as "Can't reach your Mac" on screen — read the
  stack before blaming the app. `setup-local`'s credential operations are
  local-file, so `payload()` passes either way; `lsof -ti tcp:4320` is
  the true tell.
- **Devices re-pair pushes the real pairing flow**: `credentialExpiring`
  drives both the banner's seven-day window and the warning value; the
  row's destination is `PairingView` itself, and a landed `.connected`
  dismisses back to Devices (`phase` returns to `.idle` so a second
  re-pair is never born dead).

### Review loop

Round 1: three SWE-2 max-effort reviewer sessions, one per Prompt-6 role
(correctness `devin-9548202ee2714e22a8d94e4b5ef90467`, security
`devin-9e787bfdda48401ca7c39a40dc0b57ee`, design-a11y
`devin-7fe6a1000b234f799b4aa5b514abab58`). All three requested changes;
23 findings total — correctness 7, security 5, design-a11y 11. Headline
fixes: unique per-mint credential ids so `--rotate-phone` kills the rotated
row's sessions (security blocker); `signIn()` attaches the live cookie so
POST destroys the session it replaces; `/api/status` apiVersion absent or
malformed fails closed to `runtimeDown`; `OwnerGate` returns the real
tri-state verdict; the missing fourth banner row (credential-expiring) and
the nav-bar title clip shipped; connected-leg asserts fix the silent-unpair
race. All landed in `424a709`.

Round 2: fresh reviewer sessions on `424a709` (correctness
`devin-8797052f36654407a4adaeb74196135a`, security
`devin-c611046fef3c4d54adce78c4f439594e`, design-a11y
`devin-46650d56fea748c2b16cab37b99efb2f`). Security approved clean;
correctness requested changes (5 findings), design-a11y requested changes
(8 findings). Fixes:

- `collectTailnet` canonicalizes `--tailnet-origin`/stored
  `tailnet.httpsOrigin` to the same rule `shared/runtime.ts`'s loader
  applies — trailing slash, explicit `:443` and case normalize; http,
  paths, queries, credentials and non-443 ports fail
  `tailnet_origin_invalid` instead of writing a config every request then
  401s against (correctness 1, medium).
- `GET /api/auth/session` re-resolves `session.credentialId` and
  `phoneDisabled()` on every call (the same check every gated route
  performs); a dead row destroys the session and answers 401
  `credential_invalid` with a cleared cookie. New recorded exchange
  `auth.get-session-revoked` pins it (correctness 2).
- `callbackOriginAllowed`'s comment now records that under Next the
  request URL is always the bind host, so the loopback branch is what
  admits the Serve-proxied return — the tailnet comparison stays as the
  rule for any stack that preserves the request URL (correctness 3, drift
  in the same class as §4.2's XFF note).
- `PairingCoordinator.signOut()` ends `phase = .idle` — a stale `.failed`
  read as a fresh error on the signed-out screen (correctness 4).
- `PhoneReadiness`'s `pathUpdateHandler` compares before assigning
  `isOnline` (Appendix B: no unconditional publishes) (correctness 5).
- Lists sit on `canvas`, one tone under surfaces (§1.0): Bots list and
  Devices swapped off `surface`; the retry label in the offline banner
  takes the 44 pt hit floor; Devices' host value scales via
  `ScaledMetric(.footnote)` and wraps to two lines at accessibility sizes
  instead of truncating; `statusPill` uses `phoneChatMeta`; the empty
  state adopts the §1.0 title treatment (`emptyTitle` 28 semibold, tight
  tracking, left-aligned) (design-a11y 2/3/4/5/8).
- The denied-camera block grows in both axes, so the XXXL "Open Settings"
  label can never break mid-word as "Open Settin/gs" (design-a11y 7).
- Shot hygiene (design-a11y 1/6, high): the gate writes the simulator's
  `restrictedBool.allowPasswordAutoFill=false` payload cold-boot before
  leg A, and `shot()` polls the full window answering late alerts; both
  connected shots pin the scroll position first so the paired list never
  lands mid-scroll.

Round 3: fresh reviewer sessions on `2ae311a` (correctness
`devin-6e3310bbec0040a58ab49e499a2ba7e2`, security
`devin-2c6f667cc75d47319ef84b3afb32825d`, design-a11y
`devin-6a232769a8794c31a64f3d057c15d63b`). Security approved clean for the
second consecutive round; correctness requested changes (6 findings + 1
nit), design-a11y requested changes (12 findings). Fixes:

- `deviceTokenMissing` is terminal on iOS, not `macUnreachable` forever
  (correctness 1, high): the Keychain item is
  `WhenPasscodeSetThisDeviceOnly` + non-syncable while the `paired` record
  is plain UserDefaults — a new-iPhone restore or a removed passcode
  orphans the record. `exchangeSession`, `probeReadiness` and `connect`
  now map it to `credentialInvalid` (paths that survive: re-pair, unpair)
  with iOS remediation copy ("This iPhone lost its pairing token. Pair
  again from your Mac."); `keychainLocked`/`keychainCancelled` stay
  transient. `markCredentialInvalid` call sites also reset `phase` to
  `.idle` so a stale `.connected` never reads as "Connected to …" on the
  revoked screen.
- Spec 1.2 Error row (correctness 2): a failed `/api/shell` while the Mac
  is reachable now renders the inline error line + Retry (`loadError`),
  and `loaded` flips only on a *successful* fetch — the empty state can
  never masquerade a failure. New `UB_FAIL_SHELL` seam + two gate legs
  capture it (`bots-load-error-*`).
- §8.5 foreground resync (correctness 3): `UsefulBotApp` watches
  `scenePhase`; `.active` calls `sceneBecameActive()` → `probeReadiness()`
  + `resyncAt` stamp, and the Bots list re-fetches `/api/shell` on it.
- S13 limiter key (correctness 4, medium): per-source bucketing keyed on
  caller-chosen headers let a sprayer rotate buckets and saturate the
  global cap, locking out the real phone. Tailnet keys on the
  Serve-attested `tailscale-user-login` (falling back to the last XFF
  hop); loopback uses a single constant bucket — there is no trustworthy
  caller identity off-loopback and honest collapse beats spoofable
  separation.
- `connect()` re-entry guard (correctness 5): a second scan or Connect
  tap during `.connecting`/the 600 ms `.connected` hold returns early —
  the same hold now disables the manual forms' controls too
  (design-a11y 6).
- S9 at mint (correctness 6): `POST /api/auth/session` rejects a `phone`
  credential with `credential_invalid` while `phoneEnabled` is false —
  closing the mint-vs-use gap where a session could be minted that every
  gated route would kill. Recorded exchange `auth.post-phone-disabled`
  pins it.
- Eve comment drift (nit): the `[...path]` route comment now describes
  the real rule (owner sessions of either profile; a bare credential
  never mints).
- Devices section headers (design-a11y 1): custom `fieldLabel` 13 medium
  `inkMuted` headers instead of iOS 26's large group style.
- Devices credential-expiring state (design-a11y 2): the expiry value
  goes `warning` inside the seven-day window with a "Re-pair from your
  Mac" row under it that pushes the real pairing flow; new
  `devices-expiring-*` shots.
- Status pill vocabulary (design-a11y 3): `ready` → "Connected"
  (`success`); `macUnreachable`/`noNetwork` → "Unreachable" (`warning`);
  `runtimeDown` → "Runtime down" (`warning`); nil-before-first-probe →
  neutral "Checking" — `danger` is reserved for refused/destructive.
- Loading anatomy (design-a11y 4): the skeleton gains the "Connecting to
  <Mac>" status line + `inkFaint` dot, the pinned-card skeleton and the
  section-title bar.
- "New bot" is inert until PR-6 (design-a11y 5): the create sheet is
  design 1.7/PR-6 scope — the button now renders disabled-with-reason
  ("Bot creation arrives with the chat update.") instead of silently
  minting an unnamed bot.
- Scanner freezes while paused (design-a11y 7): `stopRunning()` on pause —
  the preview layer holds its last frame and no frames reach detection.
- 360 pt + iPad split-view captures (design-a11y 8): iPhone 12 mini sim
  added for the full 360 pt leg set; spec §10's iPad shape is now real —
  `NavigationSplitView` with the Bots list as the rail equivalent and a
  "Select a bot" detail — pairing/sign-in/credentialInvalid stay
  full-width; the 834 subset regenerates in the split layout.
- Offline banner clock (design-a11y 9): sub-minute relative times render
  "just now" instead of "in 0 sec.".
- Signed-out reason placement (design-a11y 10): the disabled reason sits
  directly under the Sign in button it explains, not above the stack.
- Scanner guides color (design-a11y 11): recorded as a deliberate
  deviation under Surprises rather than shipped white@80%.
- Bot row anatomy (design-a11y 12): `chatName` semibold at the
  `phoneRowMinHeight` 60 pt floor.

Round 3 verification after fixes (head `43a0965`, rebased on `049af9a`):

- `npm test` 579/579 (`main` grew by four tests since the last run;
  `auth.post-phone-disabled` fixture + assertion in place).
- `make -C macos test` 303/303.
- Pairing gate green end-to-end on all four devices: iPhone SE (375 pt,
  iOS 27), iPhone 17 (402 pt, iOS 26.5), iPhone 12 mini (360 pt-class leg —
  see Surprises), iPad Pro 11 (834 pt, iOS 26.5). The 402 run flaked once at
  `testB_RevokedCredentialInvalidates` (store read back `unpaired` after a
  clean connected leg — cfprefsd-level persistence loss under multi-sim
  memory pressure, reran clean; not a code path, evidenced by the web log
  showing the revoke never reached `POST /api/auth/session`); all other legs
  and the rerun passed first try.
- `scripts/verify-release.mjs` PASS (tsc ×3, unit, next_build,
  launchd_render); `package-lock.json`/`web/next-env.d.ts` restored.
- Rebase on `049af9a` (PRs #107-#109): one real conflict in
  `BackendClient.makeSession` — kept `main`'s ephemeral jar
  (`httpShouldSetCookies = true`, fixes the signed-in-then-401 desktop
  regression) alongside this PR's per-request opt-out and manual
  `ub_session` header carry; `defaultSessionIsIsolated` now pins the merged
  posture. `shared/policy.ts` phone budget and `requireOwner` in the
  routines run route survived semantically intact.

### Surprises (post-round-3)

- **iPhone 12 mini is not a 360 pt device on this image**: under both
  iOS-26.5 and iOS-27.0 runtimes the simulator's framebuffer is native
  1080×2340 but UIKit reports 375×812 to the app (`app.frame.width` == 375;
  XCUIScreen captures render at 1124×2436). A literal 360 pt capture is not
  producible with the device set this toolchain offers; the narrow-width
  evidence is the 375 pt class (SE on iOS 27, mini compat render identical).
  Recorded per the code-vs-spec rule; the `-375` shots now come from the
  mini run.
- **`next dev` cold start raced a TypeScript auto-install**: a `web:dev`
  restart began `yarn add typescript` inside `web/` (the known lockfile
  trap) when `node_modules` was momentarily inconsistent; it settled
  harmless, but it briefly made eve's module bundler read an empty
  `package.json` mid-write. Both recovered; nothing committed.

Round 4: fresh reviewer sessions on `7ead69e` (correctness
`devin-c9a43e47ec40488e8353a8b54908d1e7`, security
`devin-42abeb403efe420e90108a3d9d446603`, design-a11y
`devin-5338cf4c50104775b510f19379bde7d0`). Security: **Approve, zero
findings**. Correctness: **Request changes — 1 finding (low)**. Design-a11y:
**Request changes — 1 finding (medium)**.

Fixed (head pending):

- Generic-catch phase stomp (correctness 1): `exchangeSession`'s catch-all
  ran `probeReadiness()` then set `phase = .failed` unconditionally — when
  the probe itself landed `credentialInvalid`, the `.failed` copy
  ("Can't reach your Mac") stomped the terminal verdict and PairingView
  rendered it first. Now `.failed` only applies when the probe did not
  settle the terminal state.
- SE column overflow (design-a11y 1): the 300 pt scanner cap keyed on
  `height > 640`, but the full pairing column is ~740 pt — on the SE
  (375×667) "Enter manually" and, in credentialInvalid, "Unpair" sat below
  the fold. Cap now flips at the real column height (>= 740), and the
  camera-denied block drops its square-minimum under the same rule so the
  field column + footer fit at 667 pt. Regenerated evidence:
  `pairing-empty-*-375`, `pairing-camera-denied-*-375`,
  `pairing-credential-invalid-*-375` all show the footer on screen.
- Gate coverage gap found while fixing it: the PairingUITests shots were
  stale manual-run output — the six legs are now part of
  `ios-pairing-gate.sh` (last, since they reset the store).

Round 4 verification after fixes (iPhone SE 375×667, iOS 27):

- Full pairing gate green end-to-end; PairingUITests 6/6 standalone.
- `npm test` 579/579, `make -C macos test` 303/303 unchanged (Swift-only
  diff).

Round 5 (verdicts: security Approve, correctness Approve, design-a11y Request changes — 3 findings) + post-R5 merge:

- Trailing Retry under text (design-a11y 1+2): `loadErrorRow` and the
  readiness banner kept Retry trailing at every size; at accessibility
  sizes it now drops under the copy per design 1.0/A.7. Shared
  `DynamicTypeSize.ubIsAccessibilitySize` (this SDK has no
  `isAccessibilityCategory` member) — the DevicesView wrap check uses it
  too instead of its own switch.
- Devices non-ready evidence (design-a11y 3): the offline, unreachable and
  runtime-down banner legs now also open the Devices screen and capture its
  status pill (`devices-{offline,unreachable,runtime-down}-*` on 375/402/834);
  the offline leg adds an xxxl pass for the banner's drop-under copy
  (`bots-offline-light-*-xxxl`).
- UITest flake chased to ground on iPhone 17 / iOS-26.5 (3 consecutive
  testA failures + testConnectedPairScreen): `scrollDismissesKeyboard
  (.interactively)` never dismissed the keyboard on that sim, and at 402 pt
  the camera-denied column is tall enough that Connect sits under the
  keyboard — the raw coordinate tap landed on it silently. The harness now
  presses the keyboard's Return key to dismiss (swipe kept as fallback) and
  `pairThroughManualEntry` verifies the attempt left the status line before
  retrying. Green on a fresh-erased sim afterwards.
- Merged main @1ddfa19 (#110): conflicts were `.gitignore` (both additions
  kept) and the `package.json` test list (main's cli-tools.test.ts + this
  branch's phone-ingress/ios-contract both kept).
- Environment note for the suite, not a code fix: `test/cli-tools.test.ts`
  "no line reaches the keychain" is env-dependent — it needs a used-gh
  machine (`~/.config/gh` present). Fails on a clean main worktree in this
  VM too; `mkdir -p ~/.config/gh` restores the precondition. Recorded, not
  papered over.

Round 5 verification after fixes:

- Pairing gate green on all three widths: iPhone SE 375×667 (iOS 27),
  iPhone 17 402×874 (iOS 26.5, after sim erase), iPad Pro 11 834 (iOS 27).
- `npm test` 599/599 (cli-tools env precondition restored),
  `macos/test.sh` 303/303.
- Shots: 231 committed under docs/audit/ios-shots/PR-2/.

Round 6: fresh reviewer sessions on `d656742` (correctness
`devin-d8cee3b3ab7d4fbaa98df519fa636978`, security
`devin-3263d05ca2c94152829ae8bc18905362`, design-a11y
`devin-17896d811d33481cb619e09576e6108e`). All three requested changes —
7 findings (correctness 3, security 1, design-a11y 3). Fixed in `128cfb9`
plus the gate-hardening commit that follows it:

- Lifecycle writes are generation-gated (correctness 1): `signOut()` bumps
  `dataGeneration` the way `unpair()` already did — a sign-in whose
  exchange was still in flight can no longer re-land `.paired` after the
  user's sign-out committed. Pinned by a PhonePairingTests unit test.
- Re-pair resync (correctness 2): a successful `connect()` stamps
  `resyncAt`, so a mounted Bots list re-fetches after a different-Mac
  re-pair; `refresh()` also generation-gates stale `shell()` responses and
  stale errors against `dataGeneration`.
- §8.4 backoff on 429 (correctness 3): `probeReadiness()` treats a 429 as
  "the Mac answered" — `lastContact` stamps, the level is untouched, one
  re-probe runs a window later and never reschedules itself.
- Pushed re-pair nav (design 1): re-pairing from Devices pushes the flow
  inside the stack with a real back affordance; Unpair / Sign-out /
  Re-pair rows disable while a connect is in flight.
- Connected-shot hold (design 3): `UB_HOLD_CONNECTED` takes seconds; the
  legs hold 15 s and capture inside a 1.5 s alert window so the success
  line survives to the shot; `testExpiryBanner` captures the pushed
  re-pair surface too.
- The security finding and the remaining design item shipped in the same
  `128cfb9` file list (SignedOutView copy row, connected-leg asserts).

Round 6 gate debugging (three distinct root causes found and fixed):

- Session-mint storm (two layers): (a) `sceneBecameActive`/`probeReadiness`
  could fire `status()` while the launch `exchangeSession` was still
  minting — the 401 raced `reauth()` into a *second* mint, and the server's
  `destroySession` retired the first one's cookie mid-flight; a transient
  SecItem miss inside the same path then banked `credentialInvalid`.
  `BackendClient.ensureSession()` gives bootstrap and re-auths one shared
  flight, plus a 150 ms retry on the keychain read. (b) Deeper, found on
  the iPad leg: single-flight alone does not stop *sequential* mints — N
  probes fired before the first mint lands each 401, each re-auths after
  the prior mint completes, and each mint destroys the session a sibling
  request just adopted (`mint 200 → status 401` repeating in the web log,
  one caller's post-reauth 401 eventually banking `credentialInvalid`).
  `reauth(unlessRotatedFrom:)` fixes it: the 401 handler snapshots the
  cookie the failed request carried and skips the mint when the jar has
  already rotated past it.
- cfprefsd flush race: `persist()` returns on the daemon's ack but the
  plist's disk write is async, and each leg's reinstall migrates whatever
  file exists at that instant. Two observed corruptions: `unpaired`
  carried into the revoke leg (testB opened on the fresh-pairing screen)
  and `signedOut` carried into the runtime-down leg. Sleeps were a guess —
  the fix is `wait_banked <state>` in the gate, which polls the live
  container's plist with PlistBuddy until the expected `pairing.state` is
  on disk before the next leg installs. (An in-test equivalent was tried
  first and removed: iOS test bundles have no `Process`, and the runner's
  host-fs view doesn't reach `~/Library` — host-side polling is the only
  deterministic place.)
- Stale-gate contamination: orphaned `ios-pairing-gate.sh` processes
  (reparented to launchd after their launcher shells died) kept executing
  leg sequences — one's `start_eve` fired mid-`testExpiryBanner` on a
  later run and its `--revoke-phone` window cut across another's legs.
  `pkill -f ios-pairing-gate.sh` + `pkill -f 'xcodebuild.*only-testing'`
  now precede every launch.
- iPad detail-column push dead-end: `NavigationSplitView`'s detail column
  held a bare `Text`, so `DevicesView`'s `.navigationDestination` had no
  stack to push into — "Re-pair from your Mac" rendered but the pairing
  flow never presented (iPad-only; the phone path uses one
  `NavigationStack`). The detail column now wraps its placeholder in a
  `NavigationStack`, so sidebar destinations and their nested pushes
  carry nav chrome (and the back affordance the leg asserts).

Round 6 verification after fixes:

- Pairing gate green end-to-end on iPad Pro 11 834pt (run r6m, all 13
  legs — `testExpiryBanner` Devices→re-pair push verified).
- iPhone 17 402pt green (run r6n, all legs).
- iPhone SE 375pt green (run r6n).
- `npm test` 599/599, `make -C macos test` 303/303 on head `1c482cb`.
- Shots curated to the §17.5 cap: 60 committed at canonical
  `<screen>-<state>-<light|dark>` names, every state in both
  appearances (`pairing-repair` included), plus variant evidence
  for the §17.1.3 check types (XXXL, 375-class, 834 split-view).

Round 7: fresh reviewer sessions on `1c482cb` (correctness
`devin-933080ec3fc14555b25e82b411771f6c`, security
`devin-cc0e96fc5f37489aa56a6a8a18690fc2`, design-a11y
`devin-444048a49ef9427281974239dd0b7be6`). Verdicts: security
approves, zero findings; correctness requests changes (3);
design-a11y requests changes (5). Fixes, all verified below:

- `PairingCoordinator.connect()`: the `phase = .connected` write
  was the one ungated post-await write — a completed unpair's
  `.idle` got stomped and the busy gate at the top then refused
  every retry (permanent wedge). The write is now generation-gated
  like every other post-await write in the function; stale exits
  write nothing because the bumpers already landed `.idle`.
- `BackendClient.reauth(unlessRotatedFrom:)`: the `if let`
  guard only skipped the mint when the jar had rotated to a
  *different* cookie — a cleared jar (nil, sign-out landing between
  send and 401) still minted a session on a pairing the user just
  signed out. The comparison now covers nil: `sessionCookie !=
  sentCookie` skips the mint either way.
- `ManualPairingForm` busy state: `connecting` now covers
  `.connecting` and `.connected` — the 600 ms connected pulse no
  longer re-enables the submit button.
- `BotsListView` expiry banner latch: `expiryBannerShown: Bool`
  persisted across a re-pair, hiding the warning on the new
  credential. Replaced with `expiryBannerShownFor: Date?` keyed to
  `credentialExpiresAt`, with a nil guard.
- Shot curation evidence: the 60-cap curation had dropped all
  §17.1.3 variant evidence. The committed set is back to exactly
  60 and now carries the required variety — `bots-offline` and
  `bots-load-error` XXXL captures, `pairing-empty` at 375, and
  `devices-paired`/`pairing-repair` at 834 (the nav-touching
  split-view) — at the cost of `pairing-manual` (covered by
  `pairing-manual-focused`/`-ready`) and `bots-loading-dark`
  (light kept).
- `PairingView.deniedBlock`: the square-cell `minHeight: side`
  floor clipped the credential-invalid state's taller copy at
  compact heights; the floor is exempt when `isInvalid` is the
  root state.
- `loadErrorRow` Retry is the §3.4 secondary recipe (sunken fill,
  edge stroke, PressedScale, 44 pt) instead of a bare text button.
- `ManualPairingForm` fields carry the same focused-ring overlay
  as the standalone `ManualPairingView` (ink edge + 8 % ring).

Round 7 verification after fixes (on the next head):

- iOS `xcodebuild build-for-testing` clean (iPhone 17 destination).
- `make -C macos test` 303/303 on the R7 working tree.
- Pairing gate green end-to-end on all three widths (run r7a):
  iPhone 17 402pt, iPhone SE 375pt, iPad Pro 11 834pt.
- `npm test` 599/599 on the same tree.

Landed as `7d4ce3e`. Round 8: fresh reviewer sessions on
`7d4ce3e` (correctness `devin-9930f2937d5b43d29959825be4730aa6`,
security `devin-922b4b925d8d4300adf7d19d1e3ddeaa`, design-a11y
`devin-8fc5b5a087c94c9ba8569bb085c27b0d`). All three returned
request-changes — security 1 finding, correctness 2,
design-a11y 9. Design findings 1–7 fixed in code or evidence;
finding 8 (focus ring) implemented; finding 9 deferred with the
substitution recorded below.

### PR-2 Round 8

- `BackendClient` sign-out race matrix closed (security): a
  stale request's re-auth, or an armed retry racing `signOut`,
  could mint a session into the jar sign-out had just cleared.
  New protocol: `signOutEpoch` bumps once per `signOut`;
  `exchangeClosed` latches at the top of `signOut`/`unpair` and
  stays latched until `reopenExchange()` (called by the
  explicit `exchangeSession()`) or `signIn()`; `signOut()`
  drains `reauthTask` before the epoch bump and DELETE so an
  in-flight mint can't ride under it; `performSignIn()`
  snapshots the epoch at entry and retires a minted cookie when
  the epoch moved mid-flight; `reauth(unlessRotatedFrom:
  signedOutSince:)` skips minting when the cookie or epoch no
  longer matches what the caller sent.
- Coordinator ordering (correctness): `signOut()`/`unpair()`
  now flip the store transition (generation bump) before
  `await client?.signOut()`, so a stale task observing the
  store can't re-enter `ensureSession` through the old state;
  `probeReadiness` opens with `guard store.state == .paired`.
- Unknown `apiVersion` refused per S15/§19 (correctness):
  `MacReadiness` gains `.unsupportedVersion`; `probeReadiness`
  maps an unrecognised `apiVersion` to it ("Your Mac runs an
  unsupported version" banner + "Unsupported version" pill)
  instead of silently treating the stack as unreachable.
  BackendErrors now map to `.runtimeDown` (status answered,
  probe failed) while transport errors keep `.macUnreachable`,
  and `lastContact` stamps before the version guard.
- Manual pairing pushed-screen `.failed` slot restored
  (design 1): the denied-inline form already rendered the
  inline error; the pushed `ManualPairingView` now shows the
  same copy under Connect.
- Offline status-line copy uses `inkMuted` (design 3): §1.1
  pins the status line to inkMuted; `danger` was leaking in for
  the offline copy.
- Banners carry the §4.3 `lift` shadow (design 4): `.cardLift`
  on the readiness/expiry banner cards.
- Focus-visible ring implemented (design 8): `ubFocusRing()` —
  2 pt `accent` stroke, 2 pt offset, `Radius.xs` corners,
  gated on `isFocused` — applied to 15 button sites across
  Pairing, Manual, SignedOut and Bots/Devices.
- SecureField evidence path (design 2): XCTest screenshots
  censor `isSecureTextEntry` content — the field renders masked
  bullets on device but the PNG ships blank. Verified by
  experiment: a `simctl io` framebuffer capture of the same
  composed state shows 18 masked bullets, so this is a capture
  limitation, not a rendering bug. Filled-token states
  (`pairing-manual-ready`, `-connect-failed`, `-connected`,
  `-connecting`) now capture host-side: the test writes a
  `.hold-<name>` sentinel and waits for `.done-<name>`; a
  watcher in `ios-pairing-gate.sh` answers with a
  `simctl io <udid> screenshot` that overwrites the censored
  PNG. Without the watcher the XCTest file stands as fallback.
- Evidence coverage (design 5–7, 9): `pairing-credential-
  invalid` now iterates both appearances; `pairing-camera-
  denied` gains the XXXL pass; `bots-loading-dark` returns to
  the committed set; new legs capture `pairing-manual-failed-*`
  (a refused loopback port against a 43-A token), `devices-
  unpair-confirm-*` (the Unpair confirmationDialog), and
  `pairing-manual-ready` XXXL. Unpair's confirm rides the
  shipped `confirmationDialog` — the spec's FloatingSheet
  component isn't built yet; recorded here as the substitution
  and evidenced rather than left uncaptured.

Round 8 verification after fixes (on the next head):

- iOS `xcodebuild build-for-testing` clean (iPhone 17
  destination).
- `make -C macos test` 303/303 on the R8 working tree.
- `npm test` 599/599 on the same tree.
- Pairing gate green end-to-end on all three widths (run r8a):
  iPhone 17 402pt, iPhone SE 375pt, iPad Pro 11 834pt —
  including the new hold/watcher legs, camera-denied XXXL,
  and the unpair-confirm capture.

Landed as `f3a1a73` + `505497b` + `7b00f63`. Round 9: fresh
reviewer sessions on `7b00f63` (correctness
`devin-b43080ba332c4419b45ebe56a9dbb76f`, security
`devin-b03c542528034a58b87c17801d069664`, design-a11y
`devin-32c578403ccc494da4875b9d1815082d`). All three returned
request-changes: design 1 low, security 2 low, correctness 5
(1 medium, 4 low).

### PR-2 Round 9

- `retireMintedSession` sent the cleared/stale `self.csrf`
  (security finding 1, correctness finding 1): the DELETE
  deterministically 403s against a session that isn't its own.
  The retire now carries the MINTED session's `csrfToken` —
  parsed from the un-consumed POST body, with a read-back
  against the minted cookie when older servers don't echo it.
- `connect()` dropped `next` un-retired on stale-generation
  exits (security 2, correctness 2): both generation-guard
  exits now `await next.signOut()`, and the catch paths use a
  hoisted `pendingClient` — a `signIn` that throws after its
  POST minted still sees its session die server-side.
- `sendBytes` read `signOutEpoch` after the send (correctness
  3): captured before the await so the returned epoch is the
  one the request actually observed.
- `probeReadiness` mapped any `BackendError` to `runtimeDown`
  (correctness 4): gate refusals — `.unauthorized`, and
  `.forbidden("credential_invalid"|"not_phone")` — now land the
  terminal `credentialInvalid` verdict instead of misreporting
  a dead credential as a runtime outage; the generation guard
  still swallows a sign-out mid-probe.
- Empty-state title "Create your first bot" carries
  `.isHeader` (design finding): VoiceOver rotor Headings
  navigation reaches it.
- Race-machinery coverage (correctness 5): four new tests in
  `BackendClientAuthTests` — the closed exchange refuses a
  re-auth after `signOut`, `signIn` re-opens it, the retire
  DELETE provably carries the minted session's own cookie +
  CSRF (the stub holds the mint open while sign-out lands),
  and a mid-flight 401 never mints past a moved epoch.

Round 9 verification after fixes:

- iOS `xcodebuild build-for-testing` clean (iPhone 17).
- `make -C macos test` 307/307 (the four new race tests pass).
- Pairing gate green on `c8d5a01` at 402pt (all legs) — the
  coordinator change touches live legs.

Landed as `c8d5a01`. Round 10: fresh reviewer sessions on
`c8d5a01` (correctness `devin-1dfef3477c0d49b4aabdd568946c394c`,
security `devin-609a845ca1e64fea96419aed61f64302`, design-a11y
`devin-5acf867307ab4335938c0bf254da4ae0`). Correctness approved
zero-finding; design-a11y requested changes on 3 findings.

### PR-2 Round 10

- `PathMonitor` published nothing the UI could hear (design
  finding 1, high): the coordinator held it as a plain `let`,
  views observe only the coordinator, so `isOnline` flips never
  re-rendered — a regain left the pairing screen stuck offline
  and the bots list never showed/cleared the §11 banner. The
  coordinator now forwards `monitor.objectWillChange` into its
  own, so every `coordinator.monitor.isOnline` read is live.
- Dropped-state accounting (design finding 2): the 60-cap table
  below is the complete emitted-vs-committed record.
- Devices lifecycle rows greyed alone during `connectBusy`
  (design finding 3, low): the section footer now reads
  "Finishing the current connection first." in `inkMuted` while
  a connect runs.

#### Shot curation ledger (31 emitted states, 60-cap committed)

The gate emits every state at 375/402/834 plus a11y-XXXL on
touched screens (~255 PNGs per width run); the §17.5 cap keeps
60. Committed = both appearances unless listed. Dropped slots,
with the redundancy that priced them out:

Width suffixes: `-375`/`-834` are the non-default widths;
`-xxxl` is the a11y-XXXL override at that width. "375/834
pair" = the light and dark captures at both non-default
widths. Variant lists are exact for the runs that produced
them.

| Emitted state | Committed | Dropped emitted variants — why |
|---|---|---|
| bots-empty | light, dark | 375/834 pair — list reflow covered by devices rows |
| bots-expiring | light, dark | 375/834 pair — banner mechanics identical to bots-offline |
| bots-load-error | light, dark, light-xxxl | 375/834 pair; xxxl-dark + xxxl-375/834 — banner + Retry identical to light |
| bots-loading | light, dark | 375/834 pair — skeleton geometry identical to bots-empty |
| bots-offline | light, dark, light-xxxl | 375/834 pair; light-xxxl-375/834 — banner identical at every width |
| bots-paired | light, dark | 375/834 pair; xxxl all — roster rows are text on canvas; iPad nav covered by devices-paired-light-834 |
| bots-repaired | light, dark | 375/834 pair — bots-paired + banner, both committed separately |
| bots-resigned-in | light, dark | 375/834 pair; xxxl all — banner identical to bots-offline |
| bots-runtime-down | light, dark | 375/834 pair — banner identical to bots-offline |
| bots-unreachable | light, dark | 375/834 pair — banner identical to bots-offline |
| devices-expiring | light | dark + 375/834 pair — LabeledContent rows; warning tint is appearance-independent |
| devices-offline | light | dark + 375/834 pair — banner identical to bots-offline (committed both) |
| devices-paired | light, dark, light-834 | 375 pair; dark-834; xxxl all — 834-light covers iPad nav evidence |
| devices-runtime-down | light | dark + 375/834 pair — banner identical to bots-runtime-down (committed both) |
| devices-unpair-confirm | light, dark, light-834 | 375 pair; dark-834 — popover chrome is system-drawn, contents identical |
| devices-unreachable | light | dark + 375/834 pair — banner identical to bots-unreachable (committed both) |
| pairing-camera-denied | light, dark, light-xxxl | 375/834 pair; xxxl-dark + xxxl-375/834 — one reason row identical to light |
| pairing-connect-failed | light, dark | 375/834 pair — error row identical to pairing-offline |
| pairing-connected | light, dark | 375/834 pair; xxxl all — success row identical to pairing-connecting |
| pairing-connecting | light, dark | 375/834 pair — spinner row identical across states |
| pairing-credential-invalid | light, dark | 375/834 pair — banner identical to other credential states |
| pairing-empty | light, dark, light-375 | dark-375; 834 pair; xxxl all — first screen keeps both appearances + narrow width |
| pairing-manual | — | all — superseded by manual-focused/-ready/-failed (same form populated) |
| pairing-manual-failed | light, dark | 375/834 pair — error row identical to manual-ready |
| pairing-manual-focused | light | dark + 375/834 pair; xxxl all — focus ring on `accent` is appearance-independent |
| pairing-manual-ready | light, dark, light-xxxl | 375/834 pair; xxxl-dark + xxxl-375/834 — filled form identical to light |
| pairing-offline | light | dark + 375/834 pair — "You're offline" identical to signed-out-offline/bots-offline |
| pairing-repair | light, dark-834 | dark-402; 375 pair; light-834 — iPad push evidenced in dark at 834 |
| signed-out | light, dark, light-xxxl | 375/834 pair; xxxl-dark + xxxl-375/834 — copy + button identical to pairing-empty |
| signed-out-error | light | dark + 375/834 pair — reason line identical mechanics to pairing-offline |
| signed-out-offline | light | dark + 375/834 pair — identical to pairing-offline |

Every dropped variant exists in the gate output for the
round it ran on (uncommitted working set); the committed set
keeps at least one dark representative of every *distinct
component* — banner rows, status pills, reason lines, scanner
mask, popover, focus ring, mono host — so appearance parity is
evidenced per component, not per screen. Round 11 moved
`pairing-empty` to light+dark (the first screen had no dark
evidence); `devices-paired-light-834-xxxl` was the slot freed.

### PR-2 Round 11

Seven findings; correctness asked changes on three, security
approved clean, design-a11y asked changes on four.

- `readiness` went stale on path transitions (correctness 1,
  high): a drop while `.ready` left the bots list banner-free
  and a regain under `.noNetwork` left the banner standing —
  the level only moved when a probe happened to run. The
  coordinator now subscribes `monitor.$isOnline` (drop-first,
  so the init value can't fire): a fall demotes the level to
  `.noNetwork` at once, a regain re-derives it through
  `probeReadiness()` — and only while `paired`, since the
  pairing surfaces read `monitor.isOnline` directly.
- `--revoke-phone` answered the wrong terminal over tailnet
  (correctness 2, high): `classifyIngress` consulted
  `config.tailnet` only while `phoneEnabled` held, so the
  enrolled signature the record still carries classified
  `unknown` → 403 `ingress` — a refusal the phone cannot tell
  from a runtime outage. Classification now reads the record
  unconditionally (it survives the flip; only authorization
  is keyed on `phoneEnabled`), so the gate/session routes
  reach `phoneDisabled()` and answer `credential_invalid` —
  the §4.8 terminal — on mint and use alike. Two new contract
  cases pin both (`auth.post-phone-disabled-tailnet`,
  `status.phone-disabled-tailnet`), plus an ingress unit test.
- `connect()` wrote the candidate to the Keychain before
  validation (correctness 3, high): a same-origin re-pair
  leaves `dataGeneration` untouched, so in the write→sign-in
  window an in-flight re-auth on the *live* client minted
  against the unvalidated token — a 401 then walked
  `markCredentialInvalid` on a healthy pairing. The sign-in
  now validates through `InMemoryDeviceTokenStore`
  (new in `DeviceTokenStore.swift`, shared with macOS) and the
  shared item is written only on success; the incumbent still
  rides `rollbackToken()`, now exercised only on post-write
  stale exits, and a store failure retires the mint and
  restores the incumbent before reporting
  `.failed("The token could not be stored in the Keychain.")`.
- Bot rows floated on a `.secondary` list fill (design 1,
  medium): the committed shots showed the seam against canvas.
  Rows now carry `.listRowBackground(Color.clear)`.
- `.focusRing()` drew nothing at every call site (design 2,
  high): the modifier read `\.isFocused`, the env key filled
  by the nearest focusable ancestor — dead state, so §1.0's
  2 pt `accent` ring never rendered. Rewritten on `@FocusState`
  + `.focused($focused)`; the ring is real now.
- Three symbols broke A.1's one-weight rule (design 3, low):
  `.medium` on the Devices gear, the expiring-banner glyph and
  the Devices key glyph — all now `.regular`.
- The shot ledger overclaimed (design 4, medium): the R10
  table asserted committed variants the 60-cap set does not
  hold (`bots-paired`/`bots-resigned-in` at 834/xxxl, among
  others). Regenerated mechanically by diffing the emitted
  `/tmp/ub-shots/` set (canonicalized, `-402` stripped) against
  the committed dir — the table is now exact.

Gates re-run on this head: `npm test` 602/602 (599 + the two
contract assertions + the ingress case), `swift test` 307/307,
iOS `build-for-testing` clean, pairing gate re-run on all
three widths after the commit (connect ordering and the
monitor-driven level are pairing-gate territory).

#### Process amendment (owner-directed, mid-round-12)

The owner asked why PR-2's loop is slow (~24 h wall) and approved a
speed pass over the review protocol, applied to REVIEW-PROMPTS.md so
PR-3+ inherit it:

- Severity gates rounds: blocker/high/medium request changes; lows
  batch into one pre-merge cleanup commit instead of spending a round
  each.
- Reviewer sessions are reused across rounds of a PR (fresh per PR) —
  kills the per-round cold start and the 5-session cap churn.
- Gate re-runs scope to the round's touched surface; pairing-gate
  widths parallelize only after the script gains per-run stack
  isolation (ports/config/tmp paths) — the shared 4320/4321 stack's
  lifecycle legs mutate config every run shares, so R12 stays
  sequential.
- design-a11y reviewers run normal effort; correctness/security stay
  max. A devin_review pass rides each round where available.

Merge strategy asked and answered: keep per-PR squash merges to main.
The chain touches shared core (macos/Sources, web/lib) that concurrent
desktop work also touches — an integration branch would concentrate
every iOS↔desktop conflict into one final ungated merge.

Also fixed while R12 reviewers ran: the UI helpers' status reads were
a stale-snapshot race (`exists` then `label` snapshots twice; the
pairing screen unmounting between them throws "No matches found" —
the faster connect() path surfaced it). All five sites now read
through `matching(predicate:)`, which evaluates identifier + label
inside one snapshot.

### PR-2 Rounds 12-14 (heads cae74d2 → 2bf8cfa)

Round 12 ran under the amended rules: the same three reviewer
sessions were reused (messaged the new head, no fresh cold start).

- Non-credential 403s on the readiness probe collapsed into
  `.runtimeDown` (correctness 1, low): a tailnet signature mismatch
  while paired asserted an eve-probe failure that never ran and
  claimed "settings still work" while every owner route refused.
  `probeReadiness` now maps `ingress`/`forbidden`/`origin`/`csrf`
  403s to `.macUnreachable` (spec 7.2) with `diagnostics: .answered`
  — a refusal proves the chain carried.
- Readiness banner glyph painted `danger` on every level
  (design 1, medium): §1.0 reserves `danger` for refused/destructive;
  the level banner now paints `warning`, agreeing with the Devices
  statusPill.
- Devices had no §1.15 Diagnostics group under `macUnreachable`
  (design 2, medium): added between Expiry and Actions — Resolved /
  TLS / HTTP `ok`-`bad` pills fed by `ReachabilityDiagnostics`, a new
  shared-core type classifying the probe's `URLError` layer
  (DNS → all bad; TLS errors → resolved-ok/TLS-bad/HTTP-bad;
  not-connected → all bad; other transport → HTTP-bad only;
  edge refusals → `.answered`).
- `statusPill` conflated `noNetwork` and `macUnreachable` into
  "Unreachable" (design 3, low): split — `.noNetwork` reads
  "Offline", `.macUnreachable` keeps "Unreachable".
- The resigned-in shot fired before the toolbar mounted (design 4,
  low): the journey now waits on the Devices gear before capture —
  and the wait caught a REAL defect the shot had masked: after
  `signedOut → paired` the roster rendered with no nav bar at all
  (title and gear absent in the framebuffer shot, not just the a11y
  tree). Swapping the root's type inside a persistent NavigationStack
  never mounts the new root's toolbar on iOS 26; an `.id(state)`
  rebuild made it worse (stack's toolbar and pushes inert). Each
  auth state now owns its `NavigationStack` subtree — sign-in
  remounts the roster with full chrome, and sign-out tears down the
  pushed Devices screen with its stack.
- `reachabilityDiagnostics` had no coverage (correctness low):
  the classifier moved to `ReachabilityDiagnostics.classify` in
  shared core (outside the iOS gate) so `swift test` reaches it —
  new `ReachabilityDiagnosticsTests` suite, 6 cases green.

Environment note: `next dev` auto-installed `typescript` via yarn
mid-run while `node_modules/typescript` was absent; the transient
package.json write poisoned turbopack's compile cache and 500'd
every route until `web/.next/dev` was cleared and the stack
restarted. Two unrelated timing-sensitive node tests flaked under
the concurrent load (`cli-tools` partial-output race, an
`agent-tools` <1 s elapsed assert) — both green in isolation.

R12 verdicts: security approve, correctness 1 low, design 2 medium +
2 low. R13 verdicts at cae74d2: all three approve, zero findings
(design posted as session text, transcribed to the PR). R14 delta
verdicts at 2bf8cfa (nav-stack fix + classifier move): all three
approve, zero findings — the first full clean round on the merge
head. Gates on 2bf8cfa: `make -C macos test` 313/313 (includes the
new classifier suite), iOS build clean, pairing gate green on all
three widths — 402, 375 and 834 each passed all 36 legs incl. the
resigned-in journey now carrying chrome. The 60-shot set was
re-emitted on the final head (devices-unreachable now shows the
Diagnostics group; bots-resigned-in shows the nav bar).

MERGED: squash commit `ddb0005` on `main`, PR #106 closed with the
round record. The phone test credential was rotated after the run;
the reviewer sessions were slept for the cap.

## PR-3 - Chat core (P2)

- Lead: Grok 4.7 in Cursor, local worktree
- Started: 2026-09-21T18:43Z
- Branch: `ios/pr-3` at `9c041a2` (origin/main). No PR-3 code existed; this
  entry is the skeleton written before implementation.
- Worktree: a local checkout under the owner's Desktop (`useful-bot-ios`).
  The main checkout is not used.

### Local environment (spec 17.0, owner's Mac)

Recorded at start. The cloud record above stays as history; this is the
machine that builds PR-3.

- Host: owner's Mac, Apple Silicon, macOS 26 (darwin 25.6.0)
- Xcode: `xcodebuild` is not available. `xcode-select` points at Command Line
  Tools. A package receipt for Xcode 26.6 exists, and `/Applications/Xcode.app`
  does not. Simulator destination is therefore not yet recorded. Gate stays
  red until a real `xcodebuild -version` and `xcrun simctl list devices
  available` can be written here. Not skipped.
- Swift (Command Line Tools): 6.3.3 (swiftlang-6.3.3.1.3)
- Node: v24.11.1 at `/usr/local/bin/node` (the version `scripts/service.mjs`
  accepts). The shell default on PATH is v22.23.1 and is not used for the
  stack.
- XcodeGen: not installed at start.

### Scope (plan, before code)

Spec 17.2 P2: bots list with device-local selection, transcript (durable and
live merge, day dividers, markdown, folding, working row, search chips),
composer send and cancel with the §8.4 confirming state, cursor protocol
(§8.3), poll loop, dark mode. Server S11 (`touchChat` compare-and-set) and
S14 (pump coalescing). Performance baselines on the long fixture chat.

Design spec screens: 1.2 Bots list (full anatomy), 1.3 Chat including the
composer, model and effort sheet, permission chip, folder chip (read-only),
mention list, confirming and conflict states. Approval cards, attachments
and widgets stay in PR-4 and PR-5. Class B (the composer's lock on a
`full_access` bot) lands with the composer, because an ungated send would
violate §4.4; class A stays with the cards in PR-4. Assumption recorded
under Surprises once the code exists.

Search field on the bots list opens the spec §9.1 search (name, label,
description, section, recent titles). The PR-7 pass still owns the
accessibility audit of that sheet.

### Checkpoint (code on the branch, not merged)

Xcode.app is not on this Mac (`xcode-select` is Command Line Tools; a receipt
for Xcode 26.6 remains). `xcodebuild` and the simulator gate are **red**.
Not skipped. `swift test` cannot load the `Testing` module from the Command
Line Tools, so the macOS test gate is red for the same reason. `swift build`
of the macOS package (the library, not the tests) completed with no errors.

Implemented and unit-tested without the simulator:

- S11: `touchChat` compare-and-set. Absent `expectedSessionId` keeps the Mac's
  unconditional write. Present, including null, 409s with `sessionId` when it
  does not match. `test/shell-store.test.ts` covers match, mismatch, and null.
- S14: `CoalescedPump` allows one running pump and one waiter. A third caller
  is `coalesced`. The tick returns `{ coalesced: true }` only when both the
  handoff and routine pumps refuse another chain. `test/pump-coalesce.test.ts`.
- `newChat`, `createBot` and `createGroup` take `preserveSelection`. The phone
  sends it so those writes do not move the Mac's selected bot. The Mac omits
  it, so its behavior is unchanged. Assumption: the existing actions wrote
  `selectedBotId`, which would fail the PR-3 two-client gate.
- Class B (one Face ID check per foreground activation) is in the composer.
  Class A confirm is used only for a permission escalation. Approval cards
  stay in PR-4. Assumption recorded because an ungated `full_access` send
  would violate §4.4.
- Phone model: device-local selection, poll compare-before-assign, replay
  collected then published once, confirming state that reads the tail and
  does not resend.

Node for the tests: v24.11.1 at `/usr/local/bin/node`. XcodeGen 2.46.0.
`xcodegen generate` run twice; the second run did not change the project.

Not done on this Mac: simulator build, screenshots, the long-fixture baseline
numbers, the live Test Bot round trip, `swift test`, review, merge.

### Owner amendment (2026-09-21, local lead)

The owner directed that every step which needs the iOS simulator, `xcodebuild`,
or Xcode's `Testing` module waits for a closing Devin macOS cloud session.
Those steps stay red here and are listed below. They are not skipped. Local
work continues through the remaining PRs: code, node tests, and anything that
does not need the simulator. A Cursor cloud agent was not used; the owner
judged it would not have the simulator either.

### Deferred to the Devin cloud session

Each row is a check this Mac could not run. The closing session runs them
against the commits named here.

| Commit | Section | What the cloud session runs |
|--------|---------|------------------------------|
| `79e9d91` | PR-3 chat core | `xcodebuild build` and `xcodebuild test` on the simulator; `make -C macos test`; shots for the bots list and chat in light and dark, 390 and 360, one XXXL, iPad split; long-fixture baseline into `docs/audit/PERFORMANCE-IOS.md`; a Test Bot send that streams; two-client check that selection does not cross and a session does not fork |
| (this commit) | PR-4 asks, S10 | Same build and test gates. Shots of the approval card states (pending, approving, approved, denied, expired, resolved, changed), light and dark. `xcrun simctl biometric` match, cancel, and failure. Scripted approve and deny. Provenance visible on the card (bot, directory, full preview) |

S10 is in `57242a5`: an approval records `botId`, `botName`, `sessionId`, and
`cwd` when it is raised, and `listPending` keeps that snapshot after the bot
is renamed. `peekShell` is used so the lookup does not write the shell.
`approval_not_pending` now answers 404, which is the phone's "resolved
elsewhere" state. Node tests for provenance, compare-and-set, and pump
coalescing passed on Node v24.11.1.

### PR-5, PR-6, PR-7, PR-8 (code on ios/pr-3, simulator deferred)

- PR-5: widget host HTML takes `platform`, `width`, and `height` (S12). The
  phone fetches that page itself and loads it in a non-persistent web view.
  Navigation off `about:` is cancelled, including the paired host and local
  addresses. Photos are drawn down to a JPEG under the attachment cap,
  including HEIC through `UIImage`. Text files stop at 64 KB.
- PR-6: phone settings cover appearance, routines, memory, usage, and
  connectors. Adding a routine is class A. The macOS settings pane gains
  Devices: Show pairing QR reads the Keychain item and hides it after 60
  seconds. Rotate and revoke are named as `scripts/setup-local.mjs` flags and
  are not launched by the app, because the installed app does not contain
  that script and a guessed path would touch the login Keychain.
- PR-7: appearance follows the device setting already stored for the Mac's
  picker. Search, reduce-motion working labels, and offline send reasons were
  already in the chat core. A full VoiceOver and Dynamic Type audit is a
  simulator pass.
- PR-8: this log is the hardening record that can be written without the
  simulator. The closing PR is the simulator, screenshot, biometric, and
  long-chat measurement pass for every row in the table above plus the ones
  below.

| Commit | Section | Cloud session |
|--------|---------|----------------|
| PR-5 commit | attachments and widgets | Widget shot, attachment round trip, WebKit memory note, proof that a widget navigation to the paired host is cancelled |
| PR-6 commit | management and Devices | Settings shots, Devices QR shot with the token cropped out of any publication, routine create behind Face ID |
| PR-7 commit | polish | XXXL and Reduce Motion shots already required above, repeated on these screens |
| PR-8 | closing PR | Run every row in this table. Do not treat an earlier "red" as skipped. |

The follow-up commit on `ios/pr-3` finishes the PR-3 list (pinned, sections,
unassigned, hidden, rename, move, new chat, delete) and the PR-4 ask surface
(proposal confirm and dismiss, owner questions, Safari sheet for a connect
redirect). Approve, delete, proposal confirm, and a permission raise use
`OwnerGate`, so a cancelled Face ID does not send. Deny stays ungated.

Simulator checks for that commit, same closing PR: shots of the sectioned
bots list, the proposal card, the owner-question card, and the Safari sheet,
light and dark. No new measured numbers until that session.

Adversarial review of `ios/pr-3` (local sub-agents, not a Devin session) is
green on the code that does not need a simulator. Correctness, security, and
design each returned no remaining critical or high findings after the fixes
on this branch. Shell-store tests passed, including `openRecent` keeping the
other client's selection. The macOS package builds. Simulator, screenshots,
biometrics, and long-chat numbers stay in the closing PR.

### Simulator pass environment record (cloud VM, 2026-09-21)

- Xcode 26.6 (17F113). `xcodebuild -downloadPlatform iOS` was required
  before the simulator destinations enumerated (iOS 26.5 platform 23F77,
  8.52 GB); `-runFirstLaunch` alone did not register the platform.
- Runtimes present: iOS 26.5 (23F73, plus downloaded 23F77) and iOS 27.0
  (24A434).
- Node v24.20.0 at `/usr/local/bin/node` (constraint ≥24.11.1 <25),
  npm 10.8.3. `package-lock.json` sha256 unchanged through `npm ci`
  (`e82e2b98c058d061497eb135afcbbc8e789630404e38c47c4198db9ddd737356`).
- macOS 26.5.2 (25F84) arm64.
- Devices used: iPhone 17 iOS 26.5 (D0B64A8A-D5F1-4668-8FFC-A86B400AF527,
  primary), iPhone 12 mini iOS 26.5 (D2E21043-1DDB-41B4-AD7A-80C35E21B089)
  and a fresh iPhone 13 mini (7D33930B-7271-4729-8365-4BB13CBC6B16) for the
  narrow-width legs — both mini device types render a 1124-px framebuffer
  under iOS 26.5, so the narrow shots are recorded at 375 pt, the narrowest
  width the runtime produced; iPhone 17 iOS 27.0
  (8E780854-5816-4435-AD8F-8098DF847EB5), iPad Pro 11-inch (M5)
  (ACBFDBB9-8A81-42D3-B391-A6A1A578D5D1) for the split legs.
- `simctl biometric` does not exist on Xcode 26.6. Enrollment and
  match/non-match are driven through the sim-side BiometricKit bridge:
  `defaults write com.apple.BiometricKit enrolled true` +
  `pearlIDEnrolled true`, `notifyutil -s com.apple.BiometricKit.enrollmentChanged`,
  then `notifyutil -p com.apple.BiometricKit_Sim.pearl.match|.nomatch` at the
  prompt. Verified against the Simulator.app binary's notification names.

### Simulator pass results (cloud VM, 2026-09-21/22, head under ios/pr-3)

Gate: `scripts/ios-surfaces-gate.sh` drives pairing, seeding, the fixture
eve, the mcp-stub/probe servers, and one xcodebuild UI leg per check.

All legs green on the final build: BotsList (light/dark), Chat
(light/dark), ChatAccessibility (XXXL), PerfColdLaunch, PerfChatOpenCached,
PerfChatOpenColdReplay, PerfScroll, LongChatPerf, TwoClientPreserveSelection
(plus a host-side `selectedBotId` stability read), ApprovalPending / Deny /
Approve / BioFailure / BioCancel / Approving / Resolved / Changed / Expired,
Widget (nav-probe listener stayed at 0 hits), AttachPhoto, TextFileCap,
Settings, RoutineCreate, ProposalCard, ProposalConfirm, SafariSheet
(light+dark), ReduceMotion, OwnerQuestion (light+dark), LiveSend. Repeated
on iPhone mini (375 pt) and iPad Pro 11 (834 pt, split) for the shot rows.

Measured numbers live in `docs/audit/PERFORMANCE-IOS.md`; shots in
`docs/audit/ios-shots/PR-3` … `PR-7` at 1x. The Devices QR shot is
`devices-qr-masked.png` — the token-bearing raw capture is not committed.

#### App fixes the pass surfaced

- Composer was not keyboard-avoiding: the hardware keyboard occluded Send on
  the simulator, so a live send could never be tapped. Fixed in
  `ChatScreen`/`PhoneModel`.
- Docked ask cards could stack unbounded and crush the transcript to zero
  height. `ChatScreen` now shows one expanded card plus a collapsed "N more
  waiting" row per the docked-asks law, with `repinBudget` raised so a long
  tail still pins.
- Transcript scroll view carries `.accessibilityIdentifier("transcript")` so
  tests target it instead of `scrollViews.firstMatch` (the roster's own list
  was eating the query).

#### Harness/infra fixes and surprises

- The owner-question leg stamps a throwaway eve session onto `bot-test` in
  `shell.json`; the stamp persisted across legs and diverted later chat and
  send legs into the wrong session. The seed script now saves the prior id
  (`/tmp/ub-question-prev`) and the gate restores it right after the
  question legs.
- `xcodebuild` stalls ~10 min per failing leg collecting `simctl diagnose`
  output; killing that subprocess frees the leg.
- The installed web service ran `next dev` for this pass (per
  `scripts/web-mode.mjs`, sources edited after the last `build:app`); noted
  in PERFORMANCE-IOS.md, none of the native timings depend on it.
- Keychain ACL prompt on the Mac's "Show pairing QR" needed the VM's login
  password; the QR itself is masked out of the published shot.
- Docked-ask accumulation: repeated seeds left ~25 pending proposals plus
  the lapsed `apr_exp` card on bot-test, and the dock's priority order
  (approvals > questions > proposals) meant an Expired card held the single
  expanded slot so the connect card never expanded. Harness fix: a
  `clear-asks` ctl (empties the approvals store + dismisses pending
  proposals) now runs before each Safari-sheet leg — the same crowding rule
  the gate already applies to approval seeds.
- Safari-sheet ceiling: `SFSafariViewController` only presents when the Mac
  returns `redirectUrl`. connectApp goes through Composio
  (`authorizeConnector` → `connectors_no_key` without an API key) and
  connectServer OAuth discovery is pinned to public HTTPS
  (`assertPublicHttpsUrl` refuses loopback metadata). Neither can be
  satisfied on this stack, so no sheet can present here. The legs instead
  assert the gated contract — the biomatch+Confirm path runs and a refused
  confirm must leave the card pending, never settle silently — and the
  `safari-sheet-*.png` shots capture that end state (card up, "Connectors
  No Key" status visible). Owner re-check with a real key goes on the
  checklist.

#### Review rounds (SWE-2 three-role loop)

##### Round 1 — head `6806b1d`

Three fresh SWE-2 reviewer sessions on `6806b1d` (no PR exists for
`ios/pr-3`; reviewers report via structured output, findings triaged
here). Verdicts: correctness request_changes (4H/7M/3L), security approve
(3L), design-a11y request_changes (3H/19M/7L). Every blocker/high/medium
and every low fixed in one batch; the one false positive is recorded.

Correctness highs: session-conflict adopt/discard/replay on the phone
projection; sessionEnded restores projection+draft with an ended marker
and New-chat affordance; attachments are per-bot (were global);
RoutineEditorSheet exists — weekly day circles, daily, once+date,
validated time, Active toggle, delete/run-now, next-run line.
Correctness mediums: `lost(claimSession:false)` echoes resolves and
replays the adopted session; `updateDraft` scoped per bot;
PhoneWidgetSlot measures the real row via onGeometryChange and takes its
height from scrollView.contentSize (dead 390 fallback gone); standalone
"still catching up" line when a turn fails without failedText;
PhoneSettingsSubscreens write through (providers/connectors/usage, all
class-A behind OwnerGate); composer '+' opens the add-to-message sheet
(recents strip + Photos/Camera/Files + Connectors push). One false
positive: newChat is class A by the owner brief — gated by design.

Security lows: `BiometricGate.confirm()` deleted (nil-on-cancel
footgun); gate script rm's the pair file on cleanup; a personal path in
this log genericized.

Design-a11y highs: bundled BotFace mascot artwork (brand avatar sets +
motion layers in Assets.xcassets, palette/motion JSON in Resources);
the `.combine` on approval card actions swallowed Deny/Approve — removed
(remaining combines are leaf rows); cardLift applied to pinned cards,
approvals entry, approval/proposal/question cards, mention list, bubble
lift. Mediums covered approval end-state pills + "Ask again", provenance
(anatomy: avatar 20pt, folder glyph, long-press path, mono-13 preview),
secondary-action tone-fill, ReadinessBanner anatomy, conflict toast +
sessionEnded/Resume + working elapsed>5m, GlobalSearchSheet
grouping/highlight/recents/offline, ModelSheet picked-state/search/
token-segmented effort, permission-sheet tiles, the add-to-message sheet,
PendingApprovalsView grouped-by-bot + countdown, widget host lift/Reload/
crash recovery, settings groups + pushed subscreens, bot-settings
Profile/Avatar/Memory groups + Clear conversation + Show all, routine
rows (schedule/state pill/chevron), PastConversationsView transcript
Continue, pending-approvals lifted card, and a mid-line fenced-code
parser fix in ChatMarkdown (opens a real code block when a closer exists
below; pinned test in ChatMarkdownCacheTests). Lows batched as one
cleanup: composer/chip/divider, inline code mono 15, breathing avatar,
failed-turn edge, mention list, toolbar isHeader, Devices tokenFont,
working-folder sheet.

Real bug found by the reshoot pass, not a reviewer: `.sheet(item:)`
anchored to a `List` Section inside a presented sheet collapses the
parent sheet on iOS 26 — tapping "New routine" in Bot settings dismissed
the whole settings sheet. `RoutineEditorRequest` state is now hoisted to
the host views (ChatScreen bot settings, PhoneSettingsView) which attach
the sheet at their own root; the section reloads via `onChange` on
dismissal. `testRoutineCreate` passes on the rebuilt app.

Re-run scope (the round's diff touches roster, chat, asks, settings,
routine, widget, attach, safari legs): every surface leg re-ran —
testBotsList, testChat, testChatAccessibility, all nine approval legs,
testWidget, testAttachPhoto, testTextFileCap, testSettings,
testRoutineCreate, testProposalCard, testProposalConfirm,
testSafariSheet(+Dark), testOwnerQuestion(+Dark), testReduceMotion,
testTwoClientPreserveSelection, testLiveSend — all green on the fix
build.

Screenshot refresh: every docs shot on a touched surface was re-taken
post-fix. The roster-state set (offline/loading/empty/load-error/
paired/resigned-in/unreachable/runtime-down/expiring, light+dark, xxxl
variants) needed cold launches landing on the roster — the app restores
into the last chat via `phone.selectedBotId`, and deleting the key did
nothing until two tooling bugs were fixed: `plutil -remove` treats the
dot in `phone.selectedBotId` as a key-path separator (escape: `-remove
'phone\.selectedBotId'`), and `cfprefsd` inside the sim serves the cached
domain and rewrites the plist after file edits (SIGKILL it via
`launchctl kill 9 user/501/com.apple.cfprefsd.xpc.daemon` before the
edit, delete `Library/Saved Application State`, then launch).
Unreachable/runtime-down used the live web/eve bounce choreography; all
services restarted and verified listening. `bots-repaired-*` stays at
its earlier vintage — the surface is the same roster evidenced fresh by
`bots-paired`/`bots-resigned-in`; re-running a re-pair leg only re-cuts
the same pixels.

##### Round 2 — head `f272aca`

Three fresh SWE-2 reviewer sessions on `f272aca`. Verdicts: correctness
request_changes (2H/6M/9L), security request_changes (1M/2L),
design-a11y request_changes (3H/16M/10L). Every blocker/high/medium
fixed before this entry; lows batched into the same cleanup.

Correctness highs: `follow()` never reconnected after a dropped eve
stream — it now loops a 2s reconnect bounded by
`still(botId, token, generation)` like the Mac's AppModel.followSession;
a warm resume of a quiet chat judged `tailMissing` forever — the tail
check now uses `tailBox` so a chat whose last event predates the window
is live, not stuck.

Correctness mediums: `threadState` is re-fetched on refresh cadence, not
only in `open()`; `post()` no longer resends on any 503 — it decodes the
body and retries only `approvals_lock`/`busy` conflicts; provider
`startFlow` OAuth is gated through OwnerGate ("Sign in to a provider");
proposal-status completion polling (spec 9.4) watches Composio/proposal
Safari flows; pure-name search matches no longer drop groups
(`items.isEmpty` fell to `group == nil`); `ChatMarkdown.midLineFence` no
longer treats prose like "the ``` marker" as a fence — a whitespace-
leading tail or non-lang charset declines the fence (pinned test).

Correctness lows: failed sends restore `attachments` alongside text on
every path; echo resolution is position-anchored (no false-resolve on a
duplicated earlier message); `loadCursor`/`saveCursor` persist the
replay cursor so relaunch isn't a cold replay; `open()` clears
`updating` on a generation bail (permanent skeleton gone); `cancelSend`
no longer wipes an open question before the cancel lands; `newChat`/
`clearThread` clear `chat.error` + `catchUpIncomplete`; unprovenanced
cards still dock; `BotRoutinesSection.load()` surfaces errors;
`matchingRecents`/`searchHits` dead code removed.

Security: OAuth start gated (same fix as C2-M5); remaining lows folded
into the cleanup.

Design-a11y highs: Create-bot/group/section/Rename/Move/Delete confirm
flows are FloatingSheet anatomy per spec 1.7 (avatar preview, color
swatches, Label/First brief, Cancel/primary, "Add a name" reason); the
send-lock badge reads on a contrast disc; routine day circles carry day
names + selected trait. Mediums: FloatingSheet component itself (8pt
sides/bottom, Radius.xl, grabber, title+close, overlay scrim) with the
smallest-detent anatomy on confirms; chat readiness strip flat sunken
with lastFetchAt; approval countdown on TimelineView; mention list
scrolls at a11y sizes; permission footer names the bot; past-
conversation Continue uses token type; model rows stop weight-jumping;
camera row shows its disabled reason; Connect/"Save key" is primary;
search highlighting drops fixed-.body injection; routine Save disabled
reason renders; run history is navigable with "No runs yet."; proposal
detail no longer truncates at XXXL; roster context menu gains Settings
+ Move-to-section submenu; ProgressView spinners replaced with skeleton
rows; settings gains Language ("System"), "Change photo", "Operator
name". Lows: Devices gear duplication, cwd a11y hint copy, delete-
confirm copy, OAuth code 20pt+minScaleFactor, unpair copy keeps "Your
bots stay on your Mac.", effort label tone, TokenToggle, skeleton brand
curve, role-picker sunken picked row, folder-sheet copy.

Real bug found by the gate, not a reviewer: `.fit`-detent floating
sheets hug content via `fixedSize(vertical:)` — a `List` reports ~0
ideal height and the card collapsed to its header ("Add to message"
opened as a 91pt sliver; Photos row laid out below the screen edge,
never hittable). `List` content can't hug, so the attach picker runs at
`.medium` and Move-to-section at `.medium`; `.fit` stays for VStack
content only.

Harness fixes this round (not app bugs): `seedfor` clears the approval
store per leg — a still-pending leftover could take the dock's single
expanded slot and resolve under a later leg's tap; the widget hunt taps
"Show earlier" (the 300-event thread pushes the widget event above the
transcript window) with a 45s deadline; `tapButton` prints every match's
frame on a hittable-miss.

Re-run scope: every leg the diff touches plus the failed legs —
testBotsList, testChat, testChatAccessibility, all nine approval legs,
testWidget, testAttachPhoto, testTextFileCap, testSettings,
testRoutineCreate, testProposalCard, testProposalConfirm,
testSafariSheet(+Dark), testOwnerQuestion(+Dark), testReduceMotion,
testTwoClientPreserveSelection, testLiveSend, LongChatPerf, PerfColdLaunch,
PerfChatOpenCached, PerfChatOpenColdReplay, PerfScroll — all green on
the fix build.

##### Round 3 — head `f3a4cb0`

All three roles returned `request_changes`; fixes are the round-3
commit. Correctness: the blocker — the send stream loop detached so an
awaited send parked the UI and stalled resync — is reattached; the
high, `echoDelivered` resolving on an echoed earlier message, is now
fold-tolerant; medium: every post-response writer (transcript merge,
approval adopt, question card, proposal adopt) checks `dataGeneration`
before mutating, so a stale poll can't write into a fresh chat; lows:
`spawnFollow` live-read detached and `setForeground(false)` cancels the
poll task plus `biometrics.resetActivation()`.

Security: remote `AsyncImage` provider logos dropped for monograms
(one-host rule — the phone never fetches third-party art); OAuth start
URL validated https + no user-info before handoff; the connect-status
poll cancels on disappear; `PhoneWidgetSlot`'s dead `blockedHost` check
removed — the blanket cancel already covers every non-`about:`
navigation including the paired host (the probe stays at 0 hits);
markdown `.link` spans route through `openURL` into the Safari sheet
with the same non-local http(s) check the Mac uses.

Design-a11y: the failed-send card collapses to one VO element; session
chips (model/mode) stack vertically at a11y sizes via `AnyLayout`;
routine day picker is a `LazyVGrid`; the composer carries the spec'd
bottom gradient + raise shadow; approval and proposal card footers wrap
at a11y sizes; `TokenSegmented` goes vertical at a11y; bubble caps use
`containerRelativeFrame` (18%/10%); `createsBlocked` shows the reason;
the mention list announces "N of M"; grouped floating sheets paint the
canvas background; section headers use the section token; profile
fields use token fonts; remaining lows folded into the cleanup.

Round-3 infrastructure findings (environment, not app bugs):

- Two gates ran concurrently ~11 min apart; competing xcodebuild
  invocations on one sim caused runner force-quits ("Termination
  requested by simulator host"), early-bootstrap kills, and biomatch
  train races — the true root cause of the perf/approval FAIL streak.
  Single clean gate: all legs pass. One gate at a time, always.
- After `simctl shutdown`+`boot` the simulator's biometry is locked
  pending passcode: `evaluatePolicy(.deviceOwnerAuthentication)` mounts
  a passcode sheet (coreauthd: `MechanismPasscode`, `biometry
  available: 0`), and pearl.match/nomatch posts do nothing on the
  keypad. Fix: Simulator.app → Features → Face ID → Enrolled toggle off
  then on — a fresh post-boot enrollment restores Face ID sheets.
  (`xcrun simctl biometric` does not exist in Xcode 26.6.)
- An `only`-mode gate leaves its cmd watcher alive after legs finish;
  it kept consuming `/tmp/ub-cmd-*` and racing the next gate's watcher
  — killed before each run now.
- The bot-test fixture thread is capped at 300 events; the seeded
  widget event sinks as live-send/question legs append, ending deeper
  than the test's scroll budget. The gate now re-seeds a fresh widget
  event at the thread tail per run (`seed-widget`), matching the
  per-leg approval seeding.
- `xcodebuild` stalls ~10 min per failed leg collecting `simctl
  diagnose` output; `pkill -f 'simctl diagnose'` frees the leg without
  losing the FAIL record.

Test-harness updates matching the shipped design (not app changes):
`testRoutineCreate` asserted the inner `NavigationStack`'s nav bar, but
the floating sheet now hides it and carries the title in its own header
— the leg asserts the header's Done button instead; and after Save the
Routines section sits below the fold, so the leg scroll-hunts the new
row like the "New routine" hunt. `testWidget` keeps its 45 s hunt but
now starts from a tail-seeded row.

Re-run scope (legs the round-3 diff touches): testChat,
testChatAccessibility, all nine approval legs, testApprovalExpired,
testWidget, testAttachPhoto, testTextFileCap, testSettings,
testRoutineCreate, testProposalCard, testProposalConfirm,
testSafariSheet(+Dark), testOwnerQuestion(+Dark), testReduceMotion,
testTwoClientPreserveSelection, testLiveSend, plus the five perf legs —
all green across gates 32-34 on the fix build (`make -C macos test`
322/322 after the PairingStore/PhoneCacheRoot changes). 46 shots
regenerated into docs/audit/ios-shots on the fix build.

## Round 4 (2026-09-22, head 7db1d74)

All three roles returned request_changes on 7db1d74. Findings, fixes and
verification below.

### Correctness (max effort) — 2M + 7L, all applied

- M1 send/deliver draft race: `deliver` read the live `draft` var after
  the biometric await — a bot switch mid-prompt snapshotted (and then
  overwrote) the wrong bot's draft. `send` now captures `draftAtSend`
  before the async hop and passes it through.
- M3 `lost()` had no generation guard: it mutates chat state after the
  caller's replay read — now takes the caller's `generation` and guards
  on `current(generation)` first. All nine call sites pass it.
- L2 sweep: six catch arms wrote `actionError` without a generation
  guard (newChat, continuePast, createBot, confirmProposal,
  dismissProposal, createGroup) — guarded. `deliver` cleared staged
  attachments ABOVE the generation guard — moved below. `saveComposer`
  captured no generation — captured and guards the write.
- L4 `streamRead`'s iOS branch mapped only 401/403 — 404/409 now throw
  `BackendError.sessionEnded` so a retired session reads correctly.
- L5 `deliver`'s BackendError switch had no credential arms — added
  `.credentialInvalid`/`.unauthorized`/`.deviceTokenMissing` →
  `pairing?.markCredentialInvalid()` plus the lost-send recovery.
- L6 `newChat`/`clearThread` reset missed fields — now also reset
  `windowStart`, `durable`, `attachments`, `updating`, and bump
  `streamGeneration`.
- L7 `PhoneCache`: `cursor-*.json` (and drafts) never joined the use
  ledger so nothing evicted them — all three file kinds now track bytes
  by file name through the shared budget, with a one-time migration
  dropping stale raw-id entries. `safe()` folded `_`→`-` (colliding
  ids) — now collision-free `_<hex>` escaping.
- L9 test coverage: the extracted pure helpers
  (`TranscriptBlocks.continuationIds`, `ChatAttribution.metaLabel`)
  already carry pinned cases in TranscriptBlocksTests /
  ChatAttributionTests — no new tests needed; recorded rather than
  duplicated.

### Security (max effort) — 4M + 4L, all applied

- `attachedOrigin` recorded at pair time; `attach()` resets state when
  the origin changes and restarts the poll loop. `reset()` clears the
  past-conversation surface and the new fields.
- `OwnerGate` now fronts `saveComposer`; `continuePast` guards on the
  generation captured after the gate; `open()` no longer reads
  `proposalsByBot` above the guard; `act()` returns Bool so callers can
  bail before mutating; `clearThread` guarded.
- `ubattach-` staging writes through the app container only;
  `PairingStore.purgeData()` sweeps leftover `ubattach-` temp files.

### Design-a11y (normal) — 4H + 16M + ~23L, all applied

High: stacked reorder inside ChatScreen; continuationIds spacing;
grouped-list canvas recipe; send sheen honouring the brand curve.

Mediums: chips FlowRow wrap, skeleton 1.6s pulse, mention list with
keyboard nav, `tokenGroupHeader` shared helper rolled across every
grouped List (settings, subscreens, routines, model sheet, devices,
bot settings), prompt-style placeholders everywhere a field's label
was the placeholder, constant row weight + `checkmark.circle`
selection marker, Connectors drawn-pill, PastConversationView
principal toolbar + 0.90/0.82 frames, `SecondaryAction(danger:)`,
roster subtitle labels, `RowButtonStyle` across every full-width row
press (corner radius .md default, sunken tone step on press).

Lows: cwd long-press reveal, card inner padding, stepper
adjustable labels, "Cached N min ago" marker, VO row hints, hidden
list separators, dropped the literal "Pinned" header, standalone
WORKING state, skeleton timingCurve, small danger Remove pill,
"Waiting for you to finish in Safari" copy, SecondaryAction tone
step, pinned row padding, folder chip, `interruptedRow` (Interrupted
+ Resume → `phone.resume`), empty-state tracking, mid-line code
block, link targets, 14 pt lock badge, delete-danger confirm,
TokenToggle disabled recipe, swatch hit targets.

### Real app bug found by the gate (round-4 fix batch)

- Saving a routine kicked the user out of chat to the bots list:
  `RoutineEditorSheet.close()` called env `dismiss()` inside a
  floating-sheet overlay — the action resolved to the pushed
  ChatScreen's nav destination and popped it (plus the settings
  sheet). `close()` now only calls `onClose()`; a comment blocks
  reintroducing an env dismiss in overlay-hosted sheets.
  testRoutineCreate was green at gate34 by flake luck, then failed
  deterministically once the hunt ran — XCUI failure screenshot
  showed the app back on the bots list.

### Harness fixes (not app changes)

- `testRoutineCreate` hunted on `.exists`: the editor's own Name-field
  value flickers through the AX tree as a staticText while the sheet
  dismisses, exiting the hunt early — the loop now requires
  `isHittable`, which a covered/stale element fails, so it scrolls
  until the real row is on screen.
- `testWidget` flake (45s hunt ends with no webview in the tree):
  failed once at gate36, passed clean at gate37 on the same build —
  probe stayed at 0 nav hits either way.

### Re-run scope

Full gate (gate36) on the round-4 fix build — every leg green except
testWidget (flake, passed at gate37) and testRoutineCreate (the
dismiss pop, fixed and passed at gate39). `make -C macos test`
322/322 after the BackendClient change. `xcodebuild build` clean.
46 shots regenerated into docs/audit/ios-shots on the fix build.

## Round 5 (2026-09-22, head 664cbca)

### Correctness (max effort) — request_changes, 1H + 1M + 3L, all applied

- **H** — `BackendClient.swift` streamRead mapped 404/409 →
  `BackendError.sessionEnded` only in the macOS `#else` branch, so iOS could
  never raise it: a retired session left `follow()` re-polling a 404 every 2 s
  forever and `open()`/`replay()` pinned "This chat is still catching up."
  The iOS guard now maps 404/409 the same way, and `replay()` marks
  `chat.sessionEnded` (ended row per §8.4) instead of stoppedEarly.
- **M** — `PhoneModel.open()`'s nil-session branch (pointer cleared remotely
  by a second client's new chat/clear) only stopped `updating`; §8.3 requires
  discarding the projection. It now resets projection/cursor/windowStart/
  sessionEnded/failedText/confirming/catchUpIncomplete/showWorking/error and
  bumps `streamGeneration` — matching the local newChat/clearThread paths.
- **L×3** — `agent-exec.ts` wraps `pumpRoutinesOnce` in `async` so a future
  synchronous throw rejects through the pump instead of escaping the route;
  `dropUnsent` calls removed on stale-generation paths (nothing local may be
  written back after re-pairing); `PhoneCache.safe()` escapes became
  fixed-width so the "collision-free" claim is true for any scalar.

### Security (max effort) — approve, no blocker/high/medium; 5 lows applied

- `shared/mcp-app-host.ts`: CSP_ORIGIN validation now rejects
  loopback/private/ULA/CGNAT literals via the `isPublicDomainName` host check
  used by connectRedirectAllowed — an MCP server cannot declare private
  origins into its widget's CSP.
- `web/app/api/routines/[id]/route.ts`: `PUT` exported as an alias of `PATCH`
  (spec §5.1 route matrix lists PUT; both ends already agreed on PATCH).
- Safari-sheet shots renamed `safari-sheet-gated-pending-*`: this stack has
  no connectors key, so the connect confirm is refused and the card stays
  pending — the filenames now reflect the refused-confirm state shown.
- Remaining lows folded into the same files (no separate surface change).

### Design-a11y (normal) — request_changes, 1H + 14M + 3L, all applied

- **H** — string-labelled `Button("T"){}` + `PressedScale(fill:)` paints the
  brand fill behind the label text only (Confirm/Approve read as narrow pills).
  Every primary action moved to the label-frame pattern
  (`Button { } label: { Text(…).frame(maxWidth: .infinity, minHeight: H) }`):
  approval card Confirm/Approve, settings Sign-in/Connect/Save-key,
  "Continue this conversation".
- **M** — FloatingSheet used the `lift` token; new `popShadow` modifier applies
  the spec's `pop` shadow (y 24 / blur 56 / spread −28 / 28%) to sheet cards.
- **M** — search-hit chips: 32 pt visual kept, hit target raised to 44 pt
  (`minHeight: 44` + `.contentShape(Rectangle())`).
- **M** — five `Section("Title")` headers → `tokenGroupHeader` (Profile,
  Avatar, Memory in BotProfileSection; Members in CreateGroupSheet; Recent in
  GlobalSearchSheet).
- **M** — title-string placeholders → `prompt:` + `inkFaintText`
  (Paste key, catalog.hint, Operator name).
- **M** — connector row rebuilt to spec 1.13: Connect = small primary
  (36 pt visual inside 44 pt target, PressedScale), Disconnect /
  Connecting-disabled = compact `SecondaryAction`; the row stacks vertically
  at accessibility sizes.
- **M** — connector status copy pinned: "Waiting for approval in the
  browser", timed-out "Still not connected. Try again.", disabled reason
  "Finish the other sign-in first"; a failed connector shows its state again
  after the sheet dismisses.
- **M** — connector loading state = 4 spec-anatomy skeleton rows (logo tile,
  name bar, button block) driven by a new shared `.skeletonPulse` modifier
  (phaseAnimator 1.0↔0.45, 1.6 s timingCurve, static under Reduce Motion);
  the same pulse drives Bot Memory, Routines, Usage, the widget loading tile
  and the new branded boot skeleton (replaces the system ProgressView).
- **M** — group anatomy: `AvatarStackView` ported (roster 20 pt/maxVisible 2,
  chat header 18/2, group-settings identity 36/3) via `groupMemberBots`;
  group settings now read stack + Profile (Name) + Members + Delete group,
  and member add/remove rides `patchBot(memberIds:)` through the new
  GroupMembersSection + pushed picker (no nested sheet — iOS 26 collapse rule).
- **M** — past-conversation bubble caps: user 82 %, bot 90 %; composer chips
  sit 6 pt under the field (nested VStack, outer spacing 8).
- **M** — paste-key rejection paints the danger stroke; Memory/Routines
  subscreens surface load errors with Retry.
- **L×3** — approval header label token railName → fieldLabel; compact
  `SecondaryAction` variant; boot splash accessibility label.

### Harness fixes (not app changes)

- `openChat` roster hunt: alternating swipes only covered ±1 viewport —
  Test Bot sits several screens away at XXXL. The hunt now sweeps one
  direction to the end, then the other (testChatAccessibility).
- `testApprovalResolved`: the ctl decide raced the 2.5 s ask poll — the card
  resolved before Approve could be hit. The leg now taps Approve under
  `UB_DECIDE_DELAY_MS` first so the phone's own POST 404s after the store
  decision — the decide-404 path is exercised deterministically.
- `testWidget`: the hunt scrolled only toward older rows while the seeded
  widget event is the transcript's tail — scrolled away once, the row left
  the lazy stack permanently. It now sweeps toward the tail first (also the
  on-screen hunt for the shot).
- `testSafariSheet`: XCUI snapshot-evaluation timeout, then a stale-row tap —
  environment flake, green on rerun with no app change.

### Environmental note

- `test/cli-tools.test.ts` "no line reaches the keychain" reads the real
  `$HOME`: this VM's first `gh` invocation wrote `~/.local/state/gh` with no
  `~/.config/gh`, so the conditional assertion fired mid-suite. Created the
  conventional `~/.config/gh` (what `gh` itself makes on first real use)
  instead of touching the owner's test; suite + verify-release green.

### Re-run scope

Full gate (gate30) on the round-5 fix build plus targeted reruns (gate31/32):
every leg green, widget nav-probe 0 hits. `npm test` 650/650,
`verify-release.mjs` PASS, `make -C macos test` 322/322, `xcodebuild build`
clean. 48 shots regenerated; PERFORMANCE-IOS.md re-measured on this build.

## Round 6 (2026-09-23, head 51648f8)

### Correctness (max effort) — request_changes, 1H + 1M + 4L, all applied

- **H** — `BackendClient.stream`'s iOS branch mapped any stream-open
  404/409 → `sessionEnded`, and `replay()`/`follow()` latched it sticky on
  the first hit. But eve funnels every stream-open failure through the same
  404 — including the transient window where the run exists but its
  readable is not open yet — so one 404 is not an ended signal. `replay()`
  now retries a bounded 12 strikes before marking §8.4's ended row, and a
  successful replay clears a latch a transient earlier failure set;
  `follow()` carries the same `endedStrikes` counter instead of latching
  on first error.
- **M** — group member pickers (`BotsListView` group editor,
  `BotProfileSection` member picker) offered the default bot and
  already-hidden bots as addable members. Candidates now filter
  `kind == "bot" && !hidden && id != live.id && id != Threads.defaultBotId`.
- **L×4** — `Controls.groupMemberBots` resolved members through the
  routing/mention filter, dropping hidden members from membership views;
  it now resolves `memberIds` verbatim like the Mac's helper (the
  mention/routing filter stays in `Threads.groupMembers`).
  `BotProfileSection` toggle/remove captured a render-time `members`
  snapshot, so two quick edits could drop the second; both now re-resolve
  the live roster at action time. `PhoneModel.confirmProposal` silently
  dropped refused redirect URLs — the card now surfaces the refusal copy
  the Mac shows. `shared/connection-url.ts`'s `isPublicDomainName` missed
  alternate IPv4 notations (0x7f000001, 0x7f.0.0.1, 2130706433): WHATWG
  parsing folds them onto a dotted quad the regexes never see, so the host
  must now round-trip through `new URL` and the normalized form is
  re-checked.

### Security (max effort) — approve, no blocker/high/medium; 5 lows applied

- Folded into the same batch: the hex/short-form IPv4 URL hole above
  (shared with correctness), plus minor hardening/copy fixes inside the
  touched files.

### Design-a11y (normal) — request_changes, 6M + 15L, all applied

- **M** — Providers: "Add provider", task-model rows and catalog rows took
  `.disabled(blocked != nil)` but `blocked` was never rendered — writes
  were grey with no reason. The reason now renders in `inkMuted` under the
  disabled groups (§1.0 "never grey alone").
- **M** — Provider OAuth terminal statuses: `self.flow = nil` removed the
  section carrying `pollStatus`, so `expired`/`failed` reverted the button
  to "Sign in" and the reason vanished. The flow now survives a terminal
  status — the reason stays visible and the action reads "Try again".
- **M** — Model sheet: Effort `TokenSegmented`, Speed `TokenToggle` and the
  Speed segmented row stayed enabled while blocked; their `saveComposer`
  bindings never checked readiness, so taps silently no-op'd. All three
  now take `.disabled(blocked != nil)` (the reason line already renders).
- **M** — Bot settings "Avatar" is now the spec'd face-picker anatomy: a
  labeled grid of 44 pt swatches with color names (FacePalette labels) and
  a 72/80 pt identity preview, replacing the unlabeled 36 pt horizontal
  scroll; the copy matches NewBot's "Avatar color" group.
- **M** — Group Members: Remove at the two-member floor and picker guards
  at the caps silently ignored taps. Unchecked rows at the cap now render
  the reason and refuse the tap visibly.
- **M** — Chat empty state now renders §1.3's onboarding card on a fresh
  bot (no job title + no description + empty transcript + no open
  proposals): "Fill the form" opens bot settings, "Skip" dismisses
  per-device (`ub-onboarding:<botId>`).
- **L×15** — writesBlocked reason moved under the disabled rows it gates;
  model-sheet and connector key fields take the focus `ink` stroke
  (`borderStrong` idle); widget skeleton paints `border` blocks not a
  `sunken` fill; widget failure copy "could not be loaded" (Mac parity);
  boot skeleton recomposed to the bots-list anatomy; working row shows
  elapsed time from the first minute; past-conversation header 17 pt
  semibold + offline cache-age subtitle; roster Search row 40 pt tall and
  ordered above the pending-approvals entry; `unsupportedVersion` reason
  uses the banner's own words ("Your Mac runs an unsupported version");
  Devices row pill no longer collapses offline into "Unreachable";
  "Use for chat" takes `SecondaryAction` chrome; AvatarStack "+N" badge is
  `tokenFont` (Dynamic Type) and `LabeledContent` values render `inkMuted`
  via a `TokenLabeledContentStyle` at the app root.

### Environmental notes

- **Simulator Face ID enrollment did not survive the VM restore.** The
  prefs plist still read `enrolled=1`, but SpringBoard's biometric daemon
  booted with live `pearl.enrolled=0`, so LA sheets fell back to
  "Enter iPhone Passcode" and every `pearl.match` post was ignored —
  `testApprovalApprove` failed twice (light+dark) before the toggle was
  re-set in Simulator → Features → Face ID → Enrolled. Legs after the
  fix pass. `testApprovalApprove` re-run separately.
- **The `~/.config/gh` recurrence:** the round-5 env note repeated —
  a post-restore `gh` invocation re-created `~/.local/state/gh` without
  `~/.config/gh`, re-firing the conditional cli-tools assertion. Same fix
  (`mkdir -p ~/.config/gh`); verify-release all PASS.
- **/tmp session helpers rebuilt** after the restore (ctl + question
  session) — recovered from the persisted overflow dumps, verified against
  the live stores.

### Re-run scope

Full gate on the round-6 fix build (gate29) plus a targeted re-run
(gate30): every leg green — all 24 surfaces legs including the 10
approval states, widget (nav-probe 0 hits), attachments, settings,
routine, proposals, Safari sheet, owner-question, reduce-motion,
two-client and live-send. `testApprovalApprove` and `testWidget` failed
inside gate29 for environment reasons (lost Face ID enrollment; stub
dead before its leg) and pass on re-run; the widget leg also required a
test-string update — it was still waiting on the old "opened." copy the
copy fix changed. `npm test` 650/650, `verify-release.mjs` PASS,
`make -C macos test` 322/322, `xcodebuild build` clean, `xcodegen`
no-diff. 59 shots regenerated from this build — the round-6 design
review's stale evidence (`proposal-card-{light,dark}`,
`safari-sheet-gated-pending-light`) is refreshed.

## Round 7 (2026-09-23, head 7a822a5)

### Correctness (max effort) — request_changes, 1H + 3M + 3L, all applied

- **H** — `createBot` stored `label = name` when the create sheet's Label
  field was blank, killing §1.3's onboarding card for every phone-created
  bot on both surfaces: `shared/shell-store.ts` stores the label verbatim
  and `showOnboarding` requires an empty label, so the card could never
  render. The phone now sends the label verbatim — `label: label ?? ""`
  (PhoneModel.swift:523) — matching the Mac client and the server
  contract.
- **M** — `dismissOnboarding` wrote `UserDefaults` only, which
  `@Observable` never tracks; "Skip" left the card up to a poll cycle.
  The Mac's in-memory `onboardingDismissedFor` set is restored —
  `showOnboarding` consults the set (persisted to UserDefaults as
  before), so dismissal invalidates the body immediately.
- **M** — replay's `.sessionEnded` retry budget was 4 strikes (~5 s) vs
  follow()'s 12 (~26 s), although both comments cite the same eve
  behavior — a transient stream-open 404 window > ~5 s could latch
  `chat.sessionEnded` on a live session and suppress `spawnFollow`. Both
  paths now share `endedStrikeBudget = 12`.
- **M** — widget crash auto-reload was a no-op: `onProcessGone` refetched
  the deterministic host page into the same string, and `updateUIView`
  only calls `loadHTMLString` when `coordinator.loaded != html` — so a
  terminated web view stayed blank forever (`failed` never set, the spec's
  "could not be loaded" copy + Reload never rendered). `onProcessGone`
  now clears `coordinator.loaded` first, so the reload is unconditional.
- **L×3** — a cancelled OAuth poll could stamp terminal-state copy onto a
  fresh flow (cancel landing mid-`pollOAuth` → `catch` wrote
  `terminalStatus` after `startFlow` reset it); the catch now guards
  `!Task.isCancelled`. ModelSheet's Effort/Speed used `.disabled`, which
  gates interaction but leaves `TokenSegmented`/`TokenToggle`'s `enabled`
  recipe at full strength — they now take `enabled: blocked == nil`
  (duplicate of design M4). `deliver()`'s optimistic echo could flicker
  out behind an in-flight replay — the echo now bumps `streamGeneration`
  so a pre-send replay fails `still()` instead of publishing a pre-echo
  projection.

### Security (max effort) — approve, zero blocker/high/medium/low reported

### Design-a11y (normal) — request_changes, 6M + 11L, all applied

- **M** — `OnboardingCardView`'s "NEW BOT" eyebrow rendered `inkFaint`
  (≈2.5:1, decorative-only per §4.2 + adjudication #24); now `inkMuted`.
- **M** — "Fill the form" hit target was 36 pt; now 44 pt floor.
- **M** — `PhoneConnectorsView` disabled Remove key / Save key /
  Disconnect / Connect on `blocked` but rendered the reason nowhere
  (§1.0 "never grey alone"). `blocked` now renders under the key form
  and under the connector rows.
- **M** — `TokenToggle`/`TokenSegmented` draw their disabled recipe from
  an `enabled` parameter that env `.disabled(...)` never flips, so the
  model sheet's blocked Effort/Speed rendered full-strength while inert.
  All three now take `enabled: blocked == nil` (same root cause as
  correctness L6).
- **M** — `CreateField` (New bot/group/section/Rename sheets) had no
  focus tracking — the edge stayed `edge` 1 pt. Now `@FocusState` +
  §1.7's `ink` stroke with the 3 pt `ink@8%` ring.
- **M** — Defaults "Model"/"Permission" rows omitted the trailing
  chevron §1.5 item 4 requires (the cue distinguishing them from the
  read-only "Working folder"). Both rows now share a `defaultsRow`
  helper with the `chevron.right` phoneChatMeta/inkFaint convention.
- **L×11** — text rows kept full ink/danger while disabled: Clear
  conversation / Delete bot (`danger`), New chat / Defaults rows (`ink`),
  Devices Sign out / Unpair, Delete routine — all now take the
  quieter-fill pattern (`? ink/danger : inkFaint`, `? danger : inkFaint`).
  GroupMembersPickerView at the 6-member cap dimmed unchecked rows but
  left them tappable with the reason detached in a bottom inset; rows
  are now `.disabled` with "Group is full" rendered beside the row.
  Docked approval card cwd/preview mono was `phoneChatMeta` 12 pt; now
  `proposalBody` 13 pt per §1.3, matching PendingApprovalsView. Bot
  context-menu order corrected to §1.2's Pin / Rename / Move to section /
  Settings / Hide / New chat / Delete. Face-grid labels used a raw
  `tokenFont(10)`; now `phoneRailLabel` (the iPhone readable floor).
  Settings-group error rows grew the §1.0 Error anatomy (danger glyph +
  one `inkMuted` sentence + secondary-chrome Retry): BotProfileSection
  memory, BotRoutinesSection list + editor, PhoneSettingsSubscreens key
  form + providers. Key `SecureField` overlay `Radius.sm` → `Radius.md`
  (fields are Radius.md). Composer "+" kept `ink` while disabled; now
  `inkFaint` glyph + `sunken.opacity(0.6)` circle like the sibling chips.
  Bot-settings sheet rendered trailing "Done" AND the stock X close;
  `FloatingSheet` gained a `showsClose` parameter and the sheet keeps
  "Done" only (§1.5's named affordance). rolePicker sheet contents were
  ungated mid-sheet — "None"/model rows and the effortPicker now take the
  `blocked` gate + reason like catalogSheet.

### Verified-clean / pass areas (not re-hunted)

Correctness: replay `.sessionEnded` resets, follow() endedStrikes reset
semantics, confirmProposal refused-redirect → actionError, group picker
filters, `shared/connection-url.ts` round-trip, ProviderConnectView
terminalStatus retention, PhoneProvidersView.blocked, UsefulBotApp boot
skeleton, TokenLabeledContentStyle inner-wins, PairingCoordinator
generation guards, PhoneCache eviction/safe-name,
GlobalSearchSheet.highlighted. Design: boot skeleton, widget skeleton +
"could not be loaded" copy, OAuth terminal + Try again, Devices pill
vocab, unsupportedVersion reason, Use-for-chat SecondaryAction, +N
tokenFont, TokenLabeledContentStyle at root, roster order, equal-width
actions, avatar picker, focus strokes.

### Re-run scope

Full surfaces gate on the round-7 fix build (gate31) plus targeted
re-runs (gate32, gate33): all 26 non-perf legs green — bots list, chat,
chat accessibility, two-client preserveSelection, all 10 approval
states, widget (nav-probe 0 hits), attach photo, text-file cap,
settings, routine create, proposal card + confirm, Safari sheet
light+dark, owner-question light+dark, reduce motion, live send.
Three legs failed inside gate31 on sim-side flakes — XCUI snapshot
timeouts / `kAXErrorServerNotFound` stalls on testSettings +
testReduceMotion, and a 12 s seed-window race on testApprovalExpired
(app automation-setup idled ~11 s past the seed TTL, so the record had
lapsed before the first approvals fetch — the app marks `.expired`
locally on cards it has already seen) — each passes on re-run
(testApprovalExpired alone on a rested sim). `xcodebuild build` clean;
the round-7 diff is iOS-only, so server gates (npm test, verify-release)
and `make -C macos test` were not re-run. 43 shots refreshed from this
build. The diff also required breaking ChatScreen's `body` into helpers
(`dockedAsks`, `chatToolbar`) — the type checker had begun timing out
on the enlarged expression; no behavior change. Onboarding card, model
sheet, connectors, and avatar picker still have no shot legs — their
fixes are code-verified only.

## Round 8 (2026-09-23, head bc7269d)

### Correctness (max effort) — approve, zero blocker/high/medium; 3 lows applied

- OAuth poll `guard !Task.isCancelled` now also sits after the
  successful `try await` — a superseded poll returning a buffered
  response post-cancel can no longer stamp stale `pollStatus`/
  `terminalStatus` (or `onClose`) onto the fresh flow.
- `replay()` rebuilds `tailBox` inside the `.sessionEnded` retry arm —
  a stale `x-eve-stream-tail-index` from a failed attempt could linger
  into `advertisedTail` and over-report (conservative direction only).
- `WidgetWebView.makeUIView` seeds `coordinator.loaded = html` — the
  first `updateUIView` no longer re-loads identical markup once.

### Security (max effort) — approve, zero blocker/high/medium; 3 lows applied

- "Open in Safari" now routes through the same validation `startFlow`
  uses (`https` + no userinfo, `verificationUrlComplete` →
  `verificationUrl` fallback) via a shared `oauthSafariURL` helper —
  the button can no longer offer a cleartext/exotic URL the auto-open
  refused.
- `assertResolvedPublic` (`shared/connection-url.ts`) resolves
  `{all: true}` and validates every record — a host answering mixed
  public+private A records can no longer pass the check-then-use race.
- iOS now calls `client.cancelOAuth(pollId:)` on sheet dismiss —
  a dropped device flow is cancelled server-side instead of living
  until expiry (Mac parity).

### Design-a11y (normal) — request_changes, 3M + 5L, all applied

- **M** — Bot-settings "Done" (now the sheet's sole close affordance)
  carried a ~20 pt hit area; `.frame(minWidth: 44, minHeight: 44)` like
  RoutineEditor's Cancel/Save.
- **M** — The "N more waiting" row sat between the mention card and the
  composer; moved ahead of `mentionVisible` so the mention card stays
  docked directly above the composer per §1.3.
- **M** — Providers and Connectors load-error rows had no retry path;
  both carry the §1.0 Error anatomy's `SecondaryAction(compact:)` Retry
  (glyph + `inkMuted` sentence + action, 44 pt).
- **L×5** — Create/rename sheet "Cancel" buttons `.frame(minHeight: 44)`;
  Defaults "Model" value joins `modelLabel · effortLabel` per §1.5 item
  4; identity-block avatar tap gets `.accessibilityLabel("Edit avatar")`
  (BotFace is accessibilityHidden); Composio key `SecureField` gets the
  §1.7 `sunken` fill under its stroke; member remove `minus.circle`
  quiets to `inkFaint` at the two-member floor.

### Re-run scope

`xcodebuild build` green; every gate leg the diff touches re-run and
green on one pass: testBotsList, testChat (dock-order + Done-frame
change), testApprovalPending, testApprovalExpired, testWidget
(loaded-seed), testSettings (error-Retry rows + SecureField fill +
OAuth helpers), testReduceMotion (chat/bots re-shots). The
`connection-url.ts` change is server-side, so npm test (650/650) and
`verify-release.mjs` (all PASS) re-ran too; `make -C macos test` was
not re-run (no macos/ diff this round). Shots refreshed for the
affected surfaces (bots list, chat, approval pending/expired,
settings, widget, reduce-motion). The OAuth "Open in Safari"/cancel
paths have no simulator leg — device-flow helpers are code-verified
only, same caveat as prior rounds.

## Round 9 (2026-09-23, head 817e05f) — clean round, lows batched

All three roles returned **approve** with zero blocker/high/medium —
the exit condition is met. Lows found this round are fixed in the
cleanup commit that follows this record.

### Correctness (max effort) — approve, 3 lows

- Verified-clean: tailBox rebuild semantics, all-records validation
  fail-closed posture, cancelOAuth teardown + Mac parity, oauthSafariURL
  filter, post-await isCancelled guards, widget loaded-seed, dockedAsks
  order, error-Retry rows, 2-member floor, 44 pt Cancels, §8.3/§8.4
  contracts, Appendix B traps, second-client concurrency.
- **L** — AAAA records bypassed the resolved-IP validation
  (`family:4`): fixed — `lookup({all:true})` now validates every A and
  AAAA answer; new `isBlockedV6` refuses loopback/unspecified, ULA
  fc00::/7, multicast ff00::/8, link-local fe80::/10 + site-local
  fec0::/10, NAT64 64:ff9b::/96, v4-mapped/v4-compatible, 6to4 and
  Teredo embeds. Public v6 still passes.
- **L** — the `setConnectionLookup` test seam wrapped a single string
  so the multi-record branch was unreachable in CI: widened
  `LookupFn` to `Promise<string[]>`; all call sites updated; added a
  mixed-record test (public A + private AAAA → url_resolved;
  public A + public v6 → pass).
- **L** — OAuth poll `default:` showed raw status text and `denied`
  degraded to a connectivity error: statuses now mirror
  `AppModel.pollOAuthOnce` — `denied` → terminal "That sign-in was
  denied.", `error` → streak-limited transient (6, same as the Mac)
  then "The sign-in server is not answering. Try again.", `slow_down`
  folds into pending, unknown → "Could not finish sign-in."

### Security (max effort) — approve, 1 low

- Verified-clean: pairing payload/token validation, Keychain
  accessibility class, ephemeral transport + csrf + no-redirect,
  WebView policy (nonPersistent, about:-only, no script handlers, CSP),
  biometric class-A/B gating, injection/markdown/links, attachments.
- **L** — the same AAAA-bypass finding as correctness's #1; the single
  fix covers both.

### Design-a11y (normal) — approve, 2 lows

- Verified-clean: all 8 round-8 fixes confirmed at 817e05f (Done 44 pt,
  mention card re-anchored, error Retry anatomy, Cancel frames,
  model·effort row, Edit-avatar label, sunken SecureField, member-cap
  glyph); surrounding sweep — inkFaint legality, sheens, tokenFont,
  scrim, sheet chrome, VO labels, mention-card a11y, disabled-reason
  coverage.
- **L** — mention highlight inset was horizontal-only: now
  `.padding(6)` per §1.3 "inset 6 pt".
- **L** — mention card had no close-on-focus-loss path: composer
  blur now sets `mentionDismissed`, same semantics as Escape.

### Re-run scope

npm test 651/651, verify-release all PASS (connection-url + test
sites changed), `xcodebuild build` green, and the two Swift-touched
legs re-run green: testChat (mention highlight/focus) and
testSettings (poll-status copy). No macos/ diff → `make -C macos
test` not re-run. Chat + settings shots refreshed.
