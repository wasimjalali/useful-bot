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

Adversarial review runs through Muse Spark in opencode
(`opencode run -m opencode-go/muse-spark-1.3-contributor --variant max`), not through
`/code-review` and not through parallel Opus subagents. A clean Spark pass counts as the PR
review: fix what it finds, then merge, rebuild the app and install it from local `main`.

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
