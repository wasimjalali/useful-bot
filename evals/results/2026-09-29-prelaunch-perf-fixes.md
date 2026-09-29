# Pre-launch perf fixes: the long markdown chat, 2026-09-29

## Question

Opening "Perf Long Replies" (12 long markdown answers with tables and code, then a 1,500-word
answer) took about 1.3 s to land and then froze the main thread about 900 ms, against about
0.3 s for the tools chat. Three read-only audits proposed causes:

- **A.** The slim first paint's finish (`finishFirstPaint`, 34 ms after landing) mounts the rest
  of the 20,000-character window in one transaction. Proposed: mount it one message a frame.
- **B.** Per-bubble markdown layout is expensive: `Grid` tables probe every cell, and
  `.textSelection(.enabled)` adds cost. Offscreen: 170 ms per 10.5k answer, 83 ms with
  tables as plain `Text`.
- **C.** PR #154's `.fixedSize(horizontal: false, vertical: true)` on the eager transcript stack
  made the no-snapshot replay about 440 ms slower.

Which of these hold in the real app, and what fixes them without regressing behaviour?

## What ran

- Mac: Apple M1, macOS 26.6.2, AC power. Web service in production mode, restarted after each
  `npm run build:app` (Node 24.14.0).
- Every variant: `npm run build:app`, then `perf/run.sh check --quick` (2 cold opens, 1
  no-snapshot open, 6 warm returns per long chat). Final build: full `npm run perf:check`.
- Records, one per run, beside this file: `2026-09-29-perf-check-<HHMM>-<sha>/`. The quick
  runs 1845 to 1911 were built from uncommitted variants of `e1b27bc`, listed below.
- The rejected A patch is kept as `2026-09-29-prelaunch-perf-fixes/rejected-incremental-first-paint.patch`.
- Cost: local compute only, about 1.5 hours of the Mac.

## Numbers (Perf Long Replies, ms; quick runs are n = 2 cold, 1 no-snapshot, 6 warm)

| Run | Variant | Cold open app | Cold open stall | Warm return app | Warm return stall | No-snapshot app |
|---|---|---|---|---|---|---|
| 1840 | Baseline, `e1b27bc` | 1311 | 923 | 1371 | 908 | 5478 |
| 1845 | A: rest of window one message a frame | 1406 | 757 | 1385 | 780 | 5481 |
| 1851 | C: `fixedSize` on the stack removed | 1407 | 914 | 1385 | 907 | 5395 |
| 1857 | Probe: no text selection, tables as plain `Text` | 334 | 135 | 314 | 165 | 12861 (cap) |
| 1902 | Probe: text selection kept, tables as plain `Text` | 342 | 196 | 340 | 191 | 12860 (cap) |
| 1911 | B: tables on a cached `TableLayout` | 501 | 318 | 506 | 319 | 4136 |
| **1936** | **Final full check, `e0d66e9` (B + landing fix), n = 5/5/30** | **496** | **327** | **496** | **340** | **4221** |

Final full check (1936), all cases: **PASS**, no busy samples.

| Case | App median before (1840) | App median after (1936) | Stall worst before | Stall worst after |
|---|---|---|---|---|
| cold_first_open_replies | 1311 | 496 | 923 | 327 |
| warm_return_replies | 1371 | 496 | 908 | 340 |
| cold_no_snapshot_replies | 5478 | 4221 | 1 | 4 |
| cold_first_open_tools | 280 | 277 | 137 | 147 |
| warm_return_tools | 269 | 274 | 135 | 146 |
| cold_no_snapshot_tools | 1605 | 1493 | 55 | 78 |
| cold_launch | 845 | 855 | 1 | 2 |
| warm_switch_short | 204 | 209 | 40 | 51 |

Visual medians moved the same way: cold open replies 1513 to 571, warm return replies 1574 to 568.

## What we learned

- **A was a symptom, not the cause.** Mounting one message a frame only cut the stall to about
  760 ms: each step re-laid out the whole eager stack, and its markdown, whatever it added. It
  also made the transcript visibly jump on every step (the tools chat's frame sheet in 1845 shows
  the rows shifting; its visual time went from 300 to 1,245 ms). Rejected.
- **C made no difference in the app** (5,478 vs 5,395 ms, one sample each, noise). The
  `fixedSize` stays, since it fixes the bubble truncation bug. The "440 ms slower since c450c11"
  is within run-to-run spread today (full-run medians 5.5 to 5.6 s at both).
- **B is the cause, and it is `Grid`, not text selection.** In the app, tables as plain text
  took the open from 1.3 s to 0.34 s with selection kept; dropping selection too only saved
  another 8 ms. So text selection stays exactly as it was. `Grid` sized every cell by probing it
  at several widths, nested inside the bubble's own probes.
- **The fix:** `TableLayout`, a custom `Layout` that measures each cell once for its line width
  and once per column width, and caches the result per offered width. Same look: columns hug
  their content while the table fits, share the width fairly and wrap once it does not, header
  band even. It gets about 80% of the plain-text gain while keeping real tables.
- **A pre-existing landing bug surfaced.** With layout this fast, the no-snapshot open of the
  replies chat landed by the 10 s cap in both probe runs. Logging the landing loop showed the
  scroll to the `bottom` marker moving nothing, check after check, with the view 2,224 to
  2,580 points above the bottom. It happened on the unchanged branch too (1 of 3 launches). One
  scroll to the newest block unsticks it, and the marker is reached from there: 5 of 5
  debug launches, then 5 of 5 in the full check, settled.

## Verification

- Swift tests: 447 passed.
- Screenshots of the built app, repo root: `prelaunch-perf-replies-newest.png` (newest answer),
  `prelaunch-perf-replies-table.png` (two tables with wrapped cells, rules and header band,
  prose flowing under them with no overlap), `prelaunch-perf-replies-select.png`,
  `prelaunch-perf-short-chat.png` (a short chat's earlier bubbles whole after the last reply
  landed: no truncation).
- Text selection: the `.textSelection(.enabled)` modifier is unchanged and table cells are the
  same `Text` views inside it. A background double-click put the insertion point in the text,
  but a background window shows no selection highlight, so a drag-select-and-copy in the
  foreground was not checked by hand.

## What changed

- `eb0a0ad` perf: markdown tables on a cached `TableLayout` instead of `Grid`.
- `e0d66e9` fix: a replayed long chat lands when the bottom-marker scroll stalls.
- Budgets not touched. The replies cases now sit far under theirs (cold open app median 496 vs
  a 1,690 budget); tightening them is a separate reviewed edit.
