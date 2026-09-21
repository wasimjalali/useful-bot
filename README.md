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

An install from before a credential existed (the reviewer token, `com.usefulbot.router.reviewer`, was added on 2026-09-15) picks it up with `setup-local.mjs --add-missing`, which mints only what is absent and keeps every other token. `--rotate` replaces all of them. Restart the services afterwards: the router reads the credential table at boot.

```sh
export PATH=/usr/local/bin:$PATH
/usr/local/bin/node scripts/service.mjs router
/usr/local/bin/node scripts/service.mjs web
make -C macos bundle
open "macos/dist/Useful Bot.app"
```

Web is `http://127.0.0.1:4320`. Chat needs eve as well (`service.mjs eve`) after the Go key is in Keychain. Sleeping the Mac is downtime.

Model providers are connected from the app: account popover, Providers. The list comes from the server catalogue in `shared/provider-catalog.ts`, one row per provider and mode. Subscription rows sign in with a device code (ChatGPT through Codex, GitHub Copilot) or take a coding-plan key (OpenCode Go, GLM Coding Plan, Kimi Code, Qwen Coding Plan, MiniMax and MiMo token plans, Command Code). API rows take a key, Local rows take a server URL. Claude and Google subscriptions are not offered because their terms forbid third-party use; both work with an API key. Connections live in `~/.useful-bot/providers.json`, the router picks the protocol per connection (OpenAI chat completions, Responses, Anthropic Messages), and Task models sets the chat model and the reviewer model with their reasoning level.

## Chat layout

What you say is a right-aligned bubble; what a bot says is a left-aligned white bubble, set apart from the white chat by its border and a soft shadow. Each message a bot posts in a turn is its own bubble, stacked close under the last, and the step row under them says what the bot is doing until the turn ends. Rows carry no clock: a centered rule marks Today, Yesterday or the date, and nothing else.

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

A run has an hour to finish, and is stopped if the session goes quiet for ten
minutes. Either way the turn is cancelled rather than left running, and the chat
says which happened. The service log names every routine start with its trigger
and bot, and every finish and failure with how long it took.

## Command-line tools

A shell line runs with the owner's own PATH and home directory, worked out once
per service from their login shell and cached (`shared/user-path.ts`, pinnable
with `UB_OWNER_PATH`). So a CLI they have installed and signed in to runs the
way it does in their terminal: Homebrew binaries, `~/.local/bin`, `codex`,
`claude`, `gh`. It is still not a login shell, stdin is closed, and the child's
environment is a short list rather than the service's own, so none of the app's
credentials reach it.

At Full access the sandbox profile also opens the state a tool keeps for
itself, because one that cannot read its token reports itself signed out and
one that cannot write a refreshed token loops. It opens it **per command, to
the tool that owns it**: a `codex` line reaches `~/.codex` and not the
keychain, a `claude` line reaches the keychain and not `~/.codex`, and a `cat`
line on the same posture reaches neither. The store is derived from the
program's own name (`~/.<name>`, `~/.config/<name>`, `~/.local/share/<name>`,
`~/.local/state/<name>`), so a CLI installed later needs no entry anywhere. A
line that is not one plain command, or whose program is named after a protected
store, is handed nothing. Every credential store the profile protects (`.ssh`,
`.aws`, `.npmrc`, `.env`, the keychains) stays refused in every mode, with no
exemption, and the text tripwire still refuses a line that names one.

**A grant cannot be scoped to a binary.** A seatbelt rule applies to everything
the line spawns, so naming a CLI opens its store to whatever that CLI then runs.
For a tool's own directory that is a fair trade: the blast radius is that tool's
own token, which is exactly what it was opened for. The login keychain is not,
because it holds every other application's secrets as well, so it is granted to
nothing and no row may name it.

What that means per tool, measured rather than assumed: a `codex` line reads
`~/.codex/auth.json` and a `claude` line reads `~/.claude/.credentials.json`,
each from its own line only — a plain `cat`, or the other tool's line, is
refused both. `gh` is the one that keeps its token solely in the keyring with no
file form, so an unattended `gh` reports itself signed out; on an approval card
it works, because an approved line runs unconfined. `install_cli list` reports
every sign-in either way, since that probe runs in the parent process outside
the profile.

Config that a tool reads and then executes is never writable, in any mode and
including inside a store just opened for its own CLI: `~/.claude/settings.json`,
`~/.codex/config.toml`, `~/.config/gh/config.yml`, `.git/hooks`,
`.github/workflows` and `~/.local/bin`. A hook planted in one of those runs
unconfined the next time the owner runs that tool themselves, which is the same
reason `.zshrc` has been refused here since the profile was written. Reading
them stays open, and `install_cli` is the one path that may put a program on the
owner's PATH.

`install_cli` lists the tools this app knows, where each resolves and whether a
sign-in is stored, and installs one by name from `agent/lib/cli-registry.ts`.
The install runs the registry's exact command: Read only refuses it, Auto puts
it on a card, Full access runs it. Anything outside that table is installed
through `bash`, where the owner reads the whole line.

The default command timeout is 30 seconds and the ceiling is 30 minutes, so a
coding CLI working through a task can finish. A timeout returns the output that
arrived with `timedOut: true` instead of failing the tool, and the child runs in
its own process group so a timeout or a Stop takes down what the line started.

## Connectors

Connectors let a bot act in the owner's apps (Gmail, Google Calendar, Slack,
Notion, GitHub, Linear and the rest of Composio's catalogue). Open Connectors
from the rail, paste a Composio API key once, then Connect an app: the hosted
sign-in opens in the browser and the row turns Connected when Composio reports
the account active. Disconnect revokes it.

The key lives in `~/.useful-bot/connectors.json` (mode 0600) with the Tool
Router session id and a cache of connected apps. App tokens themselves stay in
Composio's cloud, keyed to a random user id this app generates once. The app
catalogue (names, slugs, logos, no connection state) is cached for a day in
`~/.useful-bot/composio-catalogue.json`, so the dialog pages and searches it
locally; delete the file to force a refresh.

The agent reaches apps through four tools. `connector_search` finds tool slugs
for a use case in the connected apps. `connector_execute` runs one. A read runs
at once; a write shows an approval card in auto and runs without one in full
access; a destructive action (delete, remove, archive, revoke) always shows a
card; read only refuses writes. The card carries the app, the tool and every
argument, hashed like a shell line, so what is approved is exactly what runs.

A bot can also ask for an app it doesn't have yet. `connector_catalog` searches
the whole catalogue, connected or not, and `propose_connector` puts a Connect
app card above the composer. Authorize opens the hosted sign-in; the card waits
(Reopen if the tab was lost, ten minutes before it times out), turns Connected
when Composio reports the account active, and the bot gets a turn to continue
what it was doing. MCP variants ("Notion MCP" beside "Notion") list in the
dialog and the catalogue too; connect whichever fits the job.

Design and research: [docs/plan/CONNECTORS-COMPOSIO.md](docs/plan/CONNECTORS-COMPOSIO.md).
Live check: `/usr/local/bin/node spikes/s4/probe.mjs` after the key is pasted.

## MCP and OpenAPI connections

Apps outside the Composio catalogue connect as eve MCP or OpenAPI servers.
The owner-approved list lives in `~/.useful-bot/connections.json` (mode 0600).
Secrets go in Keychain (`com.usefulbot.connection.{id}`), never in the JSON.
`setup-local.mjs` seeds Excalidraw (`https://mcp.excalidraw.com/mcp`, no auth).
A bot that needs a server not in the catalogue raises a Connect server card;
Authorize or a pasted key adds the row and the bot resumes. Drawings from
Excalidraw render in the macOS chat as an MCP App widget. Edit opens it full
screen over the window (Done or Escape returns), and Open in Excalidraw
exports it to excalidraw.com in the browser. The app's own tool calls go
through `POST /api/connections/widget/[id]/call`, limited to tools the server
marks for its app. The web UI does not port this card.

A server's tools are not all mounted for every turn. An OpenAPI spec is, and
so is an MCP server the owner pinned to a handful of tools (Excalidraw's two,
so a drawing needs no lookup first). Anything larger waits: `find_tools`
searches the cached listings in `~/.useful-bot/connection-tools.json` and
records what it handed over, and a `step.started` resolver mounts those under
`<connectionId>__<toolName>` for the next model call, inside the same turn.
A tool it mounts is gated by the posture alone, not by the tool's name: Read
only refuses, Auto asks, Full access runs. A Composio slug is Composio's to
write, so reading a verb off it says something; an MCP server writes its own
tool names, so a `list_items` that deletes would have read as a read.

Budgets keep the router's walls out of reach, because a turn that hits one is
refused with a non-retryable error and eve retires the session. The router
counts schemas and bytes, so both are budgeted, on the connect (which is
refused before a row or a credential is written), on the mounted set (clamped
every turn, whatever is in the store) and on what one session may pick up.
`test/tool-cap.test.ts` does the arithmetic, so lowering a wall or adding an
agent tool trips CI rather than a live turn.

## Brand assets

The approved mascot package, usage guidelines and visual comparison are in [brand/README.md](brand/README.md) and [brand/preview.html](brand/preview.html).

```sh
npm ci --prefix scripts/brand-tools
npm run brand:build
npm run brand:check
```

Use the Node 24 runtime above. Brand tooling has its own lockfile to preserve the router's verified root dependency lock. The build creates `useful-bot-brand-assets.zip`; see [BRAND_ASSET_REPORT.md](BRAND_ASSET_REPORT.md) for the output inventory and verification results.

The macOS bundle takes its app icon, logos, head-only bot avatars and native animation layers from `brand/`. Rebuild with `make -C macos bundle` after regenerating assets. Bot settings offer bright head colors with transparent surroundings. The app plays the full mascot animation at launch and a subtle head float/blink while working, respecting Reduce Motion. Old command-card icons and shape-based avatar renderers have been removed.
