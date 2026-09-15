# Useful Bot

Local-first personal agent on [eve](https://github.com/vercel/eve) 0.54.3. Private repository. Not a Hermes replacement until the seven-day trial in the spec passes.

## Runtime

- Interpreter: `/usr/local/bin/node` (Node 24.11.1). Login-shell `node` on this machine is v22 and must not be used.
- Package manager: npm, exact versions in `package.json`.
- Bind: loopback only. No Vercel hosting.

## Phase status

| Phase | Status |
|---|---|
| 0 spikes S0-S3 | merged (#2) |
| 1.1-1.2 router and agent core | merged (#3) |
| 1.3 macOS surface | merged (#4) |
| 2 daily usefulness | merged (#5) |
| 3 phone | deferred |

## Run locally

```sh
export PATH=/usr/local/bin:$PATH
/usr/local/bin/node scripts/setup-local.mjs
```

That writes Keychain items and `~/.useful-bot/config.json` digests. Reveal the device token in Keychain Access (`com.usefulbot.device.desktop`). Install the OpenCode Go key as `com.usefulbot.opencode-go` yourself. This repo never prints those values.

```sh
export PATH=/usr/local/bin:$PATH
/usr/local/bin/node scripts/service.mjs router
/usr/local/bin/node scripts/service.mjs web
make -C macos bundle
open "macos/dist/Useful Bot.app"
```

Web is `http://127.0.0.1:4320`. Chat needs eve as well (`service.mjs eve`) after the Go key is in Keychain. Sleeping the Mac is downtime.

## Chat layout

The two sides are asymmetric on purpose. What you say is a right-aligned bubble; what a bot says is set on the chat background at the full column width, so code blocks and tables get real room. Rows carry no clock: a centered rule marks Today, Yesterday or the date, and nothing else.

Anything a bot needs an answer to (an approval, a proposed bot or group) docks above the composer with its options on the same block, rather than scrolling away up the transcript.

## Routines

A routine is a recurring instruction one bot runs on a schedule. Create and edit
them in the chat details pane (the info button in the chat header). Schedules are
weekly, daily or one-shot, stored as wall-clock time in an IANA zone, so 09:00
stays 09:00 across a DST change.

Routines are stored in `~/.useful-bot/routines.json` and fire from the same tick
the handoff pump uses, so nothing extra has to run. A run enters the bot's own
chat as a turn and its outcome is kept in the routine's run history. Sleeping the
Mac means a missed window catches up with one run, not one per window missed.

Test run ignores the pause switch. Pausing stops the schedule, not the button, so
a paused routine can still be tried by hand; the run does not consume the next
scheduled slot either way.

## Connectors

Connectors let a bot act in the owner's apps (Gmail, Google Calendar, Slack,
Notion, GitHub, Linear and the rest of Composio's catalogue). Open Connectors
from the rail, paste a Composio API key once, then Connect an app: the hosted
sign-in opens in the browser and the row turns Connected when Composio reports
the account active. Disconnect revokes it.

The key lives in `~/.useful-bot/connectors.json` (mode 0600) with the Tool
Router session id and a cache of connected apps. App tokens themselves stay in
Composio's cloud, keyed to a random user id this app generates once.

The agent reaches apps through two tools. `connector_search` finds tool slugs
for a use case in the connected apps. `connector_execute` runs one. A read runs
at once; a write shows an approval card in auto and runs without one in full
access; a destructive action (delete, remove, archive, revoke) always shows a
card; read only refuses writes. The card carries the app, the tool and every
argument, hashed like a shell line, so what is approved is exactly what runs.

Design and research: [docs/plan/CONNECTORS-COMPOSIO.md](docs/plan/CONNECTORS-COMPOSIO.md).
Live check: `/usr/local/bin/node spikes/s4/probe.mjs` after the key is pasted.

## Brand assets

The approved mascot package, usage guidelines and visual comparison are in [brand/README.md](brand/README.md) and [brand/preview.html](brand/preview.html).

```sh
npm ci --prefix scripts/brand-tools
npm run brand:build
npm run brand:check
```

Use the Node 24 runtime above. Brand tooling has its own lockfile to preserve the router's verified root dependency lock. The build creates `useful-bot-brand-assets.zip`; see [BRAND_ASSET_REPORT.md](BRAND_ASSET_REPORT.md) for the output inventory and verification results.

The macOS bundle takes its app icon, logos, head-only bot avatars and native animation layers from `brand/`. Rebuild with `make -C macos bundle` after regenerating assets. Bot settings offer bright head colors with transparent surroundings. The app plays the full mascot animation at launch and a subtle head float/blink while working, respecting Reduce Motion. Old command-card icons and shape-based avatar renderers have been removed.
