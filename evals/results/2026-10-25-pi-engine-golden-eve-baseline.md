# Pi engine golden eval: the eve baseline (2026-10-25)

## Question
Before Useful Bot swaps its agent engine from eve to Pi (PR 3), how well does today's eve engine do
on ten everyday tasks? The same ten tasks run again on Pi after the swap, with the same model, so
the two runs compare like for like.

## What ran
- **App:** Useful Bot Dev built from `main` at `f6cb14c6` (PR 2b merged; eve engine), on Wasim's Mac.
- **Model:** DeepSeek V4.1 Flash (`deepseek:api`, `deepseek-flash`), effort Max, permission Auto.
- **Harness:** `evals/golden/`, UI-driven and engine-neutral. It clicks New chat, types, clicks Send,
  approves or denies cards and reads the reply from the accessibility tree through `cua-driver`, in
  the background. Each task gets a fresh scratch folder under `~/UsefulBotGolden/<run-id>/`.
- **Checks:** deterministic checks per task (files, memory notes, routines), plus an Opus judge
  scoring each task 0 to 3 against its rubric (`judge.md`).
- **Judge setup:** an Opus subagent that read only `judge.md` and the ten inputs. Headless `claude -p`
  couldn't sign in from the harness shell (`--bare` skips the Keychain), so the judge wasn't fully
  clean: it carried the global agent rules in its context. The Pi run should use the same setup.
- **Tasks:**
  1. count files;
  2. bash with approval;
  3. approval denied;
  4. web search with a cited URL;
  5. memory save;
  6. memory recall in a new chat;
  7. a weekday routine;
  8. the DeepWiki connector;
  9. a clarifying question;
  10. a six-turn chat editing an HTML page.

  Tasks 5 and 6 use a codename derived from the run id, so recall can't pass on older notes.

## Runs (all kept in `evals/golden/runs/`)
| Run | Result | Why it isn't or is the baseline |
|---|---|---|
| `2026-10-25-eve` | 10/10 checks, judge 9/10, $0.063 | Harness bug: reply capture dropped code blocks and scrambled order. t10 "failed" on a code-block reply the screenshot shows was correct. |
| `2026-10-25-eve-r2` | invalid, $0.077 | Harness bug: the reader clicked away and back to force a redraw. On eve that swaps the bot's live session, so t01 read the wrong chat and t10 lost its context after turn 1. Fixed by rereading in place. |
| `2026-10-25-eve-r3` (+ `-r3-t07`) | **baseline** | t07 was rerun alone because a routine left over from r2 made the bot skip creating a duplicate. That was sensible behaviour, but the check expects a new routine. |

## Baseline numbers (r3, with t07 from the rerun)
| Task | Checks | Judge | Wall (s) | Cost (USD) |
|---|---|---|---|---|
| t01 files | pass | 2 | 9.1 | 0.0024 |
| t02 bash, approve | pass | 3 | 4.0 | 0.0050 |
| t03 approval denied | pass | 2 | 10.9 | 0.0037 |
| t04 web search | **fail** (no URL) | 0 | 9.7 | 0.0031 |
| t05 memory save | pass | 3 | 5.8 | 0.0050 |
| t06 memory recall | pass | 2 | 1.0 | 0.0011 |
| t07 routine (rerun) | pass | 2 | 14.2 | 0.0045 |
| t08 DeepWiki | pass | 3 | 15.4 | 0.0069 |
| t09 question | pass | 3 | 4.6 | 0.0026 |
| t10 six-turn chat | pass | 2 | 97.4 | 0.0389 |
| **Total** | **9/10** | **mean 2.2** | **172.1** | **0.0732** |

- **Wall time:** measured from the Send click to idle, summed over a task's turns.
- **Cost:** from the router's usage records at DeepSeek's published V4.1 Flash prices (`prices.json`,
  source https://api-docs.deepseek.com/quick_start/pricing/, fetched 2026-10-25). It's an upper bound,
  because the router records no cache hits.
- **Time to first work:** recorded, but uninformative (0.0 s on every turn). The Send click returns
  after about 2.6 s of pointer animation, by which time work is always visible.

## What the runs show about eve
- Approvals hold. The denied delete wasn't retried, and the bot said plainly it hadn't run.
- Memory works across chats. The recall named the right codename, but no memory activity label
  showed, so the evidence for where it came from is the wording.
- Web search is flaky. r1 and r2 fetched the page and cited a URL; r3 answered from what looks like
  memory, with no fetch label and no URL. One miss in three runs.
- Long chats hold context when the harness doesn't interfere, but each edit rewrites the whole file.
- Mild verbosity costs points: extra lines in t01 and t06 dropped them to 2.

## What changed because of it
- The harness gained an in-place reread, code-block capture and a Send-anchored clock.
- It must never switch chats mid-task on eve. The README records why.
- Before every run, delete routines left by earlier runs. The harness logs the ids it created.
- The Pi run reuses this harness and judge setup unchanged, after PR 3 merges. Compare against r3.

## Cost of producing this
DeepSeek usage across all runs: $0.063 + $0.077 + $0.063 + $0.0045 (plus the t01 smoke test, under
$0.01), so about $0.21. Judge runs used the Claude subscription.
