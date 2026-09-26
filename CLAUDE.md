# Useful Bot: working rules

Project rules for coding agents. The global rules in `~/.claude/` still apply; this file
governs what they leave open, and wins where the two disagree.

## Surfaces and priority

This product is the macOS app. Everything else serves it.

1. **macOS app** (`macos/`). The primary surface, and the one that gets the design effort,
   the verification screenshots and the first fix. A feature is not done until it works here.
2. **Mobile app.** Planned, not built yet. Design decisions that would be expensive to undo
   on a phone are worth thinking about now; nothing else about mobile is in scope until it
   starts.
3. **Web UI** (`web/`). Secondary. It follows the macOS app rather than leading it, and it is
   fine for it to trail a release behind. Port a change here when it is cheap or when asked,
   and say so plainly when it has not been ported.
4. **CLI.** Not a concern. Do not build new CLI surfaces or spend design effort on one.
   Existing CLI and script entry points stay as they are: there is no need to remove them.

When a change touches more than one surface, do the macOS work first and completely.

## Change management

Adversarial review runs SWE-2 in the Devin CLI, at the tier the diff calls for
(`devin -p --model swe-2-max|high|medium --permission-mode dangerous --prompt-file <file>`),
plus one Opus 5.5 reviewer (up to two Opus reviewers for a large diff) in parallel, each on the areas it
suits. Not Muse Spark or GLM in opencode, not `/code-review`. SWE-2 has a 262k context:
save the diff to a file, name the exact files and line ranges, tell it to make one tool call
at a time, and never ask it to review "the branch"; a pass should take minutes. Check
out the branch under review first: the reviewer reads the files, and a diff against code
that is not in the tree wastes the pass. Use `dangerous`: in print mode nothing can answer a
prompt, so `auto` and `smart` both refuse tool calls (`smart` has refused a plain file read)
and the reviewer gives up mid-pass. Never accept a bare empty array, ask for the list
of what it dismissed and why. A clean pass from every reviewer counts as the PR review: fix what it finds,
review again, then merge, rebuild the app and install it from local `main`.

This arrangement expires on 2026-10-15; ask Wasim what to move to rather than falling back.

## Verification

A UI change is verified with a real screenshot of the running macOS app, not with tests
alone. Any live check that sends a message goes to the bot named "Test Bot": pick it in
the rail, or create it first if it is missing. Never send a test turn to any other bot;
those hold real conversations. `/Applications/Useful Bot.app` is the installed copy people
use; rebuilding means `npm run build:app` then `ditto` into `/Applications`.

`build:app` also builds the web service. The installed app serves that build only while the
sources under `web/`, `shared/`, `agent/`, `router/src` and `brand/source` still hash to what it
was built from; after an edit there the launcher falls back to `next dev` until the next
`build:app` (see `scripts/web-mode.mjs`). The web service has to be restarted to pick either
one up. Build the web service through `build:app`, not bare `next build`: Next's TypeScript
auto-install rewrites `package-lock.json`, and the router refuses a changed lockfile.

## Performance guard

A change that touches `macos/`, `shared/`, `agent/`, `router/src` or `web/` runs `npm run perf:check`
on its own `build:app` before merge (about 15 minutes; it quits and relaunches the app in the
background) and commits the record it writes under `evals/results/`. A breach is fixed, or the
budget in `perf/budgets.json` is raised in a reviewed edit that says why; a re-run never erases a
breach. The fixture bots ("Perf ...") are frozen: never send to them. See `perf/README.md`.
