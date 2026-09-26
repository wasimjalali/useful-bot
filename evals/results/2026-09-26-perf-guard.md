# A performance guard for Useful Bot, 2026-09-26

## Question

Ten batches of performance work made chats open fast, but nothing stopped a later change from
quietly undoing it. Can one command measure the cases that matter, the same way every time, and
fail a change that makes them slower? And how slow is switching to a bot with a long chat, which
the owner still notices even on a warm app?

## What ran

- The guard itself: `perf/` (runner, 60 fps recorder, config, budgets, fixtures) and
  `macos/Sources/UsefulBotApp/PerfHarness.swift` (in-app scenario driver, off without its launch
  argument). Design reviewed first by GPT-6-Astra: `2026-09-26-perf-guard-design-consult.md`.
- Machine: Apple M1, macOS 26.6.2, on AC. Load average 4 to 6 from other apps throughout.
  Web service on a fresh production build, checked by the preflight.
- Fixtures, built once on DeepSeek V4.1 Flash (High) and locked in `perf/fixtures.lock.json`:

  | Bot | Events | Rows | Shape |
  |---|---|---|---|
  | Perf Short A / B | 65 / 75 | 6 | three one-line answers |
  | Perf Long Tools | 3,445 | 35 | 16 turns of shell calls (the owner's Drive Admin has 3,504 and 36) |
  | Perf Long Replies | 14,407 | 26 | 13 long markdown answers with tables and code |

- Runs, each with its own folder beside this file:
  - `2026-09-26-perf-check-0402-a7cd66b`: first trial (`check --quick`, empty budgets).
  - `2026-09-26-perf-baseline-0408-a7cd66b`: the baseline, 1,139 s, 20 cold launches, 30
    returns to each long chat. Budgets come from this.
  - `2026-09-26-perf-check-0429-a7cd66b`: `check --quick` on a build with a deliberate 400 ms
    main-thread block in `AppModel.select`, to prove the guard fails a real regression.
- Cost: about 45 fixture turns on DeepSeek V4.1 Flash, billed to the owner's provider account
  (not metered here), plus the Astra consult on the Codex subscription.

## Numbers (baseline, ms)

| Case | Visual median | Visual worst | Main-thread stall worst |
|---|---|---|---|
| Cold launch to first chat | 2,351 | 6,739 | 51 |
| First open, tool chat (snapshot) | 354 | 442 | 219 |
| First open, markdown chat (snapshot) | 6,041 | 6,606 | 4,692 |
| First open, tool chat, no snapshot | 8,750 | 11,716 | 7 |
| First open, markdown chat, no snapshot | 11,987 | 29,041 | 14,642 |
| Warm switch, short chats | 609 | 903 | 126 |
| Warm return, tool chat | 342 | 912 | 739 |
| Warm return, markdown chat | 8,634 | 13,194 | 9,835 |

Visual is select to the last frame the chat column changed.

## What it found

1. **The owner's complaint is real, and it's the markdown, not the length.** Returning to a
   long chat of big markdown answers takes 8.6 s at the median. The frame sheet shows the old
   chat frozen on screen for 4 to 6.6 s, with not even the rail highlight moving, then a blank,
   the mascot and the chat. A tool-heavy chat of similar size returns in 0.34 s.
2. **Without a snapshot, long chats blow the 10 s landing cap.** That's every first open after
   a rebuild. The markdown chat hit the cap on all 5 launches.
3. **Each turn on a long chat is slower than the last.** Building the markdown fixture, turn N
   took about 35·N seconds (33 s for turn 1, 433 s for turn 11) for answers of the same size.
   Something in the send path does work proportional to the whole history on every turn.
4. **Owner-visible glitches seen along the way:** an empty white bot bubble above a running tool
   step, and an approval card that stayed on screen after Stop.

## Does the guard catch a regression?

Yes. With a 400 ms block injected into every switch, `check --quick` failed on the first open of
the tool chat (778 ms against a 450 ms budget) and the warm return to it (881 ms against 430 ms),
among others. It did **not** fail the short-chat switch (684 ms against 750 ms): that budget came
from a noisy baseline median of 609 ms, where the first trial had measured 238 ms. Budgets set on
a loaded machine are loose. Re-baseline on a quiet machine to tighten them.

## Conclusion and what changed

- `npm run perf:check` now guards eight cases. `CLAUDE.md` requires it before merge for changes
  to the app, shared code, agent, router or web, with the record committed.
- The markdown-chat freeze, the no-snapshot cap and the per-turn slowdown are open items in
  `docs/audit/PERFORMANCE.md`. Their budgets hold today's numbers so they can't get worse, and
  get tightened by the fix.
- The method is packaged as the global `perf-regression-guard` skill for other repos.
