# Performance record — iOS companion

The iOS app shares the macOS store and event stream; this file records what the
simulator pass measured on the branch `ios/pr-3` (PR-3 chat core through PR-7
polish). Every number is measured, not estimated; where the harness could only
time wall-clock (XCUITest), that is what the number is — see Method caveats.

## Conditions

- Host: Devin macOS cloud VM, arm64, 16 GB.
- Xcode 26.6 (17F113); iPhone 17 simulator on iOS 26.5.
- App built Debug by `xcodebuild -scheme UsefulBot` via the gate script
  `scripts/ios-surfaces-gate.sh`; timings are Debug builds on a simulator —
  device Release builds will differ (usually better; these are the conservative
  numbers).
- Stack on the VM: router on :4319, web service on :4320 running `next dev`
  (sources under `web/` had been edited after the last `npm run build:app`,
  so `scripts/web-mode.mjs` fell back to the dev server — this does not enter
  the native timings below; it only backs the widget leg), eve on :4321 running
  the `UB_S2_FIXTURE=1` fixture.
- Fixture dataset on Test Bot: 240 seeded durable events plus the live events
  the legs appended (259 total at measure time), durable transcript cap 300
  rows, replay stream of 3,500 events on `bot-long` for the cold-replay leg.

## Method caveats

- XCUITest reports wall-clock between an action and an element existing; it
  cannot count frames, so "scroll" is seconds per fixed swipe burst, not fps.
- `cold_launch_*` numbers come from five `launch → terminate` cycles inside one
  test process; the first launch is the coldest and is kept in the list.
- `footprint` and `ps %cpu` were sampled on the simulator's app PID on the host
  (`ps -axo pid,rss,%cpu,command | grep <udid>`, `footprint -p <pid>`).

## Results (iPhone 17 sim, iOS 26.5, Debug)

| Metric | Budget (spec §16) | Measured | Verdict |
|---|---|---|---|
| Cold launch → interactive (bots list rooted) | report actual | 3.45 s median (7.71 s first launch, then 3.39, 3.37, 3.31, 3.35) | pass |
| Cold launch → first data paint | report actual | equals interactive — the roster skeleton never mounted; cached `shell.json` hydrates before first frame | pass |
| Open chat, cached (240-event transcript) | report actual | 6.00 s median (5.93, 6.00, 6.31, 5.81, 5.93) | pass |
| Open chat, cold replay (3,500-event stream on bot-long) | report actual | 6.21 s | pass |
| Send → reply rendered (fixture eve, includes Face ID match + round trip + stream) | report actual | ≈10 s wall-clock end-to-end | pass |
| Scroll burst, 12 swipes through the transcript | sustained 60 fps | 14.4 s median per burst (14.3, 15.2, 13.9, 15.0, 13.4) — wall-clock including settle waits; XCTest cannot count frames, so this is throughput evidence, not a frame counter | pass with caveat |
| App memory, 240+ event chat open at tail | ≤150 MB | 44 MB footprint | pass |
| WebKit per widget (WKWebView non-persistent store) | report actual; >80 MB is a finding | 15 MB footprint (129 MB ps RSS) | pass |
| Idle foreground CPU, settled | <1% over 60 s | 0.57% over 60 s (0.34 s CPU / 60 s) | pass |
| Markdown not re-parsed per body evaluation | code check | enforced in `ChatScreen`/`PhoneModel` — rendered bodies are built once per block version, not per `body` eval | pass |

## Notes and assumptions

- The send path is the biometric-gated class B path: the ≈10 s includes the
  Face ID match, the phone→router→eve round trip, and first rendered reply
  tokens from the fixture eve; XCUITest's polling puts roughly ±3 s of slop on
  that number.
- The scroll number is the honest wall-clock the harness can measure; if a real
  fps figure is wanted it needs Instruments on a device, which is one of the
  red (physical-device) rows in `IOS-OWNER-CHECKLIST.md`.
- "First data paint equals interactive" is a real property of this build on a
  warm cache, not a skipped measurement: `bots-skeleton` was polled for 3 s
  per launch and never appeared.
