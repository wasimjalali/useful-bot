# Pi engine: replace eve, one strong bot

Status: draft 1, 2026-10-24. Author: Opus 5.5 orchestrator. Hardening: see `COUNCIL.md`.
Plan and PR briefs: `PLAN.md`. Ground truth of today's code (file:line on `main` @ 9dc43a0f):
`app-map/agent.md`, `app-map/web-shared.md`, `app-map/swift.md`, `app-map/router-ops-tests.md`.
Read those before touching a file this spec names.

## 0. What this changes, in five lines

1. The agent runtime moves from Vercel's eve (0.54.3, pinned, 57 releases behind) to the Pi agent
   harness SDK (`@earendil-works/pi-coding-agent`, exact pin), hosted in our own Node process.
2. The app gets one engine-neutral chat protocol of our own. Chat history is served by the engine as
   ready rows; the Swift app stops replaying and folding eve's event journal.
3. The product goes from a team of specialist bots to one strong all-round bot, with an optional
   second one. Groups, sections, handoffs, fan-out and sub-agents are removed.
4. Everything that already works without eve stays: the router, the approval store, command risk,
   the seatbelt sandbox, memory, routines, Composio, our MCP client, media, auth.
5. Old chats are exported from eve before the cut-over and imported into Pi sessions.

## 1. Why

Evidence is in the 2026-10-24 analysis (this conversation's findings, summarised here):

- eve is a preview "for durable backend agents on Vercel". Every turn is a checkpointed workflow on
  a beta Workflow SDK. That replay design causes the worst failures on a single-user Mac: one
  failed turn retires the session (`409 session_not_active`), a replayed step that renders other
  bytes retires it too (`agent/memory/notes.ts:22-35`), sessions can be stranded on an eve upgrade,
  and open upstream issue #2876 wedges runs past about 6k events (we have 12.5k-event chats).
- Real eve bugs hit us and were fixed upstream only later: orphaned tool call after a length stop
  (0.70.2), compaction sending `temperature:0` (0.66.0), compaction retries (0.75.1), the chunk scan
  behind 5-second chat opens (0.83.2), a bundler scope bug.
- About 7,000 lines exist only to adapt eve (2,600 Node, 4,400 Swift), 103 commits touch them, and
  `scripts/patch-eve.mjs` edits eve's internals and blocks every upgrade.
- Disk: the daily app holds 1.5 GB of workflow files; the dev app 18,100 event files.
- Staying is not free either: 0.54.3 to 0.83.2 removes background tasks, `todo`, `load_skill`,
  microsandbox and the session-limit API we use.

Why Pi and not the alternatives (field survey, same date): the Claude Agent SDK is Claude-only and
proprietary; the Codex SDK speaks only the Responses API; opencode is a coding CLI with heavy
churn; Mastra and LangGraph are big frameworks we would have to adopt whole; the AI SDK used
directly would mean rebuilding session storage, compaction, overflow recovery and retries that Pi
already hardened. Pi is MIT, embeds in-process, stores sessions as an append-only JSONL tree, has
compaction with overflow and length recovery, steering and follow-up queues, a fail-closed
`tool_call` gate, provider retries that honour `retry-after`, and an OpenAI-compatible client
that accepts a custom `fetch`. OpenClaw, a personal assistant with memory, is built on it.

## 2. Design principles

From Anthropic's recent guidance ("When to fold subagents into your main agent loop", 2026-10-22;
"Harness design: 3 patterns", 2026-04; "Scaling Managed Agents with stable interfaces",
2026-04-08; "Effective context engineering") and our own incidents:

- **One loop, one context window.** A single agent with skills and on-demand tools. No sub-agents
  until an eval shows a single loop degrading from context bloat.
- **Tools grouped by user intent, 30 or fewer declared.** Tool choice degrades past 30 to 50
  definitions. Hard limits and approvals live inside tools, not in prompts.
- **Progressive disclosure.** Skills load on demand; MCP tools are found with `find_tools`.
- **The session log is the durable source of truth; the harness is replaceable.** Pi's JSONL tree
  is append-only, compaction and context edits never delete raw entries. The engine holds nothing
  essential in memory that the log cannot rebuild.
- **Prompt cache friendly.** Static content first (instructions, identity, tool list), dynamic
  updates as messages at the end. Do not change tools or model inside a run.
- **Typed tools for anything that needs a gate, a card or an audit.** Bash stays general, gated by
  the command-risk classifier.
- **Secrets never reach model-controlled processes.** Tools spawn with a whitelisted env.
- **Fail loud.** A failure is a visible row with a reason and a Retry, never a silent drop.

## 3. Target architecture

```
macOS app (Swift)
   |  HTTPS-free loopback HTTP, cookie session + CSRF (unchanged)
   v
web service (Next, API only)           router (unchanged role)
   |  /api/chats/*  proxied, NDJSON         ^  OpenAI-compatible chat, images, search
   |  internal bearer                       |  x-useful-* headers, selection frozen per run
   v                                        |
engine service (plain Node, NEW)  ----------+
   - Pi SDK sessions, one per open chat (LRU)
   - our tools (shim over Pi custom tools)
   - approvals store (unchanged file store)
   - transcript rows + live event bus
   - routine scheduler, system turns
   state: <stateRoot>/engine/sessions/<botId>/<chatId>.jsonl
```

Three processes stay three (router, engine, web), so the Swift supervisor keeps its shape. The
engine takes eve's port slot (4321 daily, 4421 dev). The router stays the only egress to model
providers, with its budgets, circuit breaker and provider adapters.

## 4. Decisions

Each decision has a default the implementing agents follow. The owner can override any of them.

| # | Decision | Default taken | Why |
|---|---|---|---|
| D1 | Engine | Pi SDK `@earendil-works/pi-coding-agent`, exact version pinned (1.4.0 at writing), in a new plain Node process `agent/server.ts` | in-process control, no RPC child per bot |
| D2 | Host Pi inside Next or a separate process | Separate process | Next dev duplicates modules per route and hot-reloads; long-lived sessions need a stable process |
| D3 | Model path | Keep the router. Pi talks `openai-completions` to it through a registered provider that delegates to Pi's built-in client with our `routerFetch` | router holds providers, OAuth, budgets, adapters; keeps one egress |
| D4 | Pi built-in tools, extensions, discovery | All off. Custom tools only, custom `ResourceLoader`, in-memory settings, no `~/.pi`, no AGENTS.md discovery | our guards (seatbelt, command risk, path checks) must not be bypassed |
| D5 | Bots | One default bot ("Useful", id `bot-useful`) plus at most one more. Cap 2 | owner's call: one strong all-round bot is enough |
| D6 | Extra existing bots | Archived at migration: hidden from the rail, data kept, chats exported to Markdown, routines paused. Restore swaps with the second slot | no user data deleted |
| D7 | Sub-agents | Removed (eve `agent`, `task_cancel`, all cards, runs, child streams) | Anthropic guidance; our biggest bug source |
| D8 | Groups, sections, pins, hide, handoffs, fan-out, cross-bot send, bot proposals | Removed | meaningless with 1-2 bots |
| D9 | Chats per bot | Keep "New chat" and recents (multiple Pi sessions per bot) | cheap; Pi session = chat |
| D10 | Transcript | Server-materialised rows from the Pi session (single source). Overlay rows (images, pages, widgets, notes, cards, failures) become `custom` entries in the same session | kills the text-matching merge, ReplayGate, snapshots |
| D11 | Live updates | Per-chat NDJSON event stream with `seq` and engine `epoch`; client refetches rows on gap or new epoch | simple resume, no replay |
| D12 | Approvals | Keep `approvals.json`, the hash binding, the two routes and the 1.5 s poll. Engine expires stale pending cards at boot | already engine-neutral and proven |
| D13 | Questions | `ask` tool writes a question row, emits `input.requested`, ends the turn; the answer is the owner's next message (as today) | no parked durable waits needed |
| D14 | Sends during a running turn | Pi follow-up queue; `message.queued` event; tag in the UI until it starts | matches eve `turnPolicy: "queue"` |
| D15 | Mid-turn crash | No durable resume. On engine boot, a turn that was running is closed with a failure row "Interrupted" and Retry | Pi has no mid-turn resume; eve's replay is what we are removing |
| D16 | MCP | Keep our own MCP client, OAuth, Keychain auth, `find_tools` and the `<connectionId>__<tool>` naming; register picked tools as Pi custom tools | widgets and budgets depend on it; Pi's MCP extension would duplicate OAuth |
| D17 | OpenAPI connections | Dropped (eve-only). Existing entries show "No longer supported, add it as an MCP server" | eve feature with no Pi counterpart |
| D18 | Routines | Scheduler moves into the engine (20 s timer, runs while the app runs, as today) | removes the handoff and tick coupling |
| D19 | Connect-card resume | Web calls the engine's system-turn endpoint instead of queueing a handoff | handoff queue is removed |
| D20 | Tools dropped | `list_bots`, `rail_action`, `delete_bot`, `propose_bot`, `propose_group`, `post_to_group`, `send_to_bot`, `update_bot_profile`, `clear_history`, `review`, `list_models`, `plant_read`, eve `agent`, `task_cancel` | multi-bot, unprovisioned, or covered by the UI |
| D21 | Tools merged | memory (4 to 1), routines (5 to 1), Composio apps (4 to 1) | group by intent |
| D22 | Old chats | Last eve release exports every chat through eve's stream API to `<stateRoot>/export/eve-chats/`; the Pi release imports the kept bots' current chats and writes a Markdown archive of all chats. Fallback: offline reader of eve's `devalue` chunk files | eve's store is the only copy of old turns |
| D23 | `.eve/` data | Never deleted by the app. Settings offers "Remove old engine data" after a successful import | no deleting user data without the owner |
| D24 | Reasoning effort | Pi thinking level `off`; the router applies effort from the selection (unchanged) | router already owns effort |
| D25 | Delivery | Stacked: router compat and single-bot simplification land on `main` first (eve still running); the engine swap ships as one feature branch; migration and release last | each landing keeps the app working |

## 5. Engine service

### 5.1 Process, port, auth, health

- Entry `agent/server.ts`, run as `node --experimental-strip-types agent/server.ts` by
  `scripts/service.mjs engine` (mode name `engine`; `eve` is gone). Binds `127.0.0.1:<enginePort>`.
- Ports: rename `evePort` to `enginePort` in `shared/stack.ts` and `UB_EVE_PORT` to
  `UB_ENGINE_PORT`, keeping the numbers 4321 and 4421.
- Auth: every request needs `Authorization: Bearer <UB_ENGINE_TOKEN>`. The token is the existing
  Keychain secret `channel.desktop`, passed by `service.mjs`. Host header must be `127.0.0.1[:port]`
  and any `Origin` header is refused (same rule as the router).
- Health: `GET /health` returns `{ok, stack, epoch, pi: "<version>"}` without auth (Swift
  `HealthReading` reads `stack`).
- Env for Pi: `PI_OFFLINE=1`, `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0`, plus in-memory settings
  `enableInstallTelemetry: false`, `cacheWarming: "off"` (cache warming sends paid idle requests).
- The engine never reads `process.env` secrets other than its own token and
  `UB_ROUTER_DESKTOP_TOKEN`. Tools keep spawning with the whitelisted env (`agent/tools/bash.ts`).
- Shutdown: SIGTERM aborts every running session (`session.abort()`), flushes rows, exits within
  10 s (supervisor sends SIGKILL after that).

### 5.2 Pi embedding

One `EngineHost` singleton owns:

- `modelRuntime = ModelRuntime.create({ authPath, modelsPath })` with both paths under
  `<stateRoot>/engine/pi/` (no credentials stored; the router token is passed per request).
- `settingsManager = SettingsManager.inMemory({...})`:
  `compaction` per model (see 5.7), `retry: { enabled: true, maxRetries: 2 }`, provider retry
  `maxRetries: 0` (our `routerFetch` waits and the router refuses a repeated request id),
  `cacheWarming: "off"`, `enableInstallTelemetry: false`, `defaultTools: []`.
- A custom `ResourceLoader`: `getExtensions` returns only our inline engine extension (5.3, 5.6,
  5.9), `getSkills` returns our two skills from `agent/skills/`, `getAgentsFiles` returns none,
  `getPrompts`/`getThemes` empty, `getSystemPrompt` returns our assembled static prompt (5.6).
- Sessions: `createAgentSession({ cwd: <stateRoot>/engine, agentDir: <stateRoot>/engine/pi,
  model, thinkingLevel: "off", modelRuntime, resourceLoader, tools: [], customTools,
  sessionManager, settingsManager })`. `cwd` is fixed so Pi never groups by folder or discovers
  project files. The bot's workspace folder is ours to apply in tools, not Pi's `cwd`.
- `sessionManager`: file-backed, `SessionManager.create(cwd, <stateRoot>/engine/sessions/<botId>)`
  with our chat id as the Pi session id (UUID v4).
- Pool: at most 4 live `AgentSession`s; idle ones (no run for 15 min, not the open chat) are
  disposed and reopened from file on next use. A running session is never evicted.
- Concurrency: one run per chat. Two bots can run at the same time. Pi's codemode is not loaded
  (its worker cap and starvation issue #11350 do not apply).

### 5.3 Model path through the router

- Register a native provider `useful-router` from the engine extension:
  - `api: "openai-completions"`, `baseUrl: http://127.0.0.1:<routerPort>/v1` (never `localhost`:
    the router refuses it), API key = `UB_ROUTER_DESKTOP_TOKEN`.
  - Models: one Pi model per catalog entry `(connectionId, modelId)` from `shared/providers.ts` +
    `shared/live-models.ts`, id `"<connectionId>/<modelId>"`, with `contextWindow`, `maxTokens`
    (the router's output cap for that model), `input` (`image` only if the catalog says vision),
    `reasoning: false`, zero cost (the router meters spend). Published through `refreshModels`
    and refreshed when the providers store changes.
  - `compat`: `supportsStore: false`, `supportsDeveloperRole: false`,
    `supportsReasoningEffort: false`, `maxTokensField: "max_tokens"`,
    `supportsUsageInStreaming: true`, `supportsLongCacheRetention: false`,
    `sendSessionAffinityHeaders: false`, `supportsStrictMode: false`,
    `supportsOpenAIGrammarTools: false`, `supportsMidConvoSystemMessages: false`.
  - `stream`/`streamSimple` delegates to Pi's built-in `openai-completions` implementation with
    `fetch: routerFetch(ids, selection)` and an `onPayload` that sets `model: "workhorse"`.
- `routerFetch` (`agent/lib/router-fetch.ts`) keeps its contract: on every HTTP attempt it stamps
  `x-useful-session-id` (stable UUID from the chat id), `x-useful-turn-id` (the run's turn id), a
  fresh `x-useful-request-id`, and `x-useful-selection` (base64url `{connectionId, modelId,
  effort, speed}`), and waits out router 429s (`global_concurrency_limit`, `caller_rate_limit`,
  `upstream_rate_limited`). It also records the last router error `{status, code, retryAfterMs,
  resetsAt, message}` per turn in a side table, which the engine uses for `turn.failed` (Pi's
  `errorMessage` text is not parsed for codes).
- Selection is frozen per run: the host resolves the bot's selection once at run start
  (`botSelection(bot, store)`, today's rule), calls `session.setModel()` only between runs, and
  hands the frozen selection to `routerFetch`. A pick made mid-run applies to the next run.
- Effort and speed ride in the selection header; Pi's thinking level stays `off`.
- Model-calling tools (`web_search`, `generate_image`) keep calling the router directly with the
  same ids.

### 5.4 Chats and sessions

- A chat is one Pi session file: `<stateRoot>/engine/sessions/<botId>/<chatId>.jsonl`.
- Chat index: `shell.json` keeps per bot `chatId` (current chat, replaces `sessionId`) and
  `recents` (up to 40 `{chatId, botId, title, preview, updatedAt}`), using the existing shell
  store locking. No `previousSessionIds`, `continuedSessionId`, lineage or carry-over.
- New chat: engine creates the session on the first message; `chatId` is minted by the engine.
- Clear history = new chat (the old file stays as a recent). No "delete chat" in v1.
- Session name: Pi `session_info` is set from the first owner message (first 60 chars).
- The engine is the only writer of session files and of chat rows. Web writes rows through the
  engine (5.12).

### 5.5 Turn lifecycle

A **turn** is one owner message (or routine or system prompt) and all work until Pi settles.
The host mints `turnId` (UUID v4) per turn and keeps `chatId -> runningTurn`.

1. **Admit.** Refuse before Pi sees anything when: the bot's model is unavailable
   (`model_selection_unavailable`, `provider_route_retired`), an image goes to a text-only model
   (`model_no_vision`), the instructions exceed 8,000 chars, or the fixed envelope does not fit the
   window. The envelope is measured from the real `session.systemPrompt` and the active tool
   schemas, not from eve constants. Refusals return a typed 409/400 to the app (as today).
2. **Stamp.** Write the workspace grant `{chatId, path, permission, selection}` (tools read it, as
   today), compute the per-turn context message (5.6), freeze the selection.
3. **Start.** `session.prompt(text, { images })` when idle. When a turn is running, an owner
   message goes to `session.followUp(text)` and the app gets `message.queued`; it becomes a turn of
   its own when Pi starts it.
4. **Stream.** Pi events map to protocol events (6.3).
5. **Settle.** On `agent_settled`: `turn.completed`, or `turn.cancelled` if aborted, or
   `turn.failed` when the last assistant message has `stopReason` error. Only `agent_settled`
   ends a turn (`agent_end` can be followed by retry or compaction).
6. **Cancel.** `POST /chats/:id/cancel` calls `session.abort()`, expires the chat's pending
   approval cards (`ApprovalStore.expireSession`), emits `turn.cancelled`.
7. **Failure.** The session is never retired. `turn.failed` carries `{code, detail, retryAfterMs,
   resetsAt, messageKept: true}` from the router side table, else `{code: "engine_error"}` with
   Pi's message. A failure row is persisted as a `custom` entry (`ub.failure`) so it survives a
   reload.
8. **Retry.** Re-run the last owner message without duplicating it: branch the session to the
   parent of the failed turn's user entry (`sessionManager.branch`) and prompt the same text, so
   the failed attempt stays in raw history on an abandoned branch and the transcript shows one
   owner bubble. Retry is allowed only for the newest failed turn and only after any router
   cool-down (`retryAfterMs`).
9. **Interrupted.** At boot, any chat whose last turn has a `ub.turn-start` custom entry without a
   matching settle entry gets a `ub.failure` row with code `interrupted` and Retry. Pending
   approval cards from an older epoch are expired (`invalidateOnRestart`, which has no production
   caller today).

The host writes `ub.turn-start {turnId, origin, clientId}` and `ub.turn-end {turnId, outcome}`
custom entries so turns are reconstructable from the file alone.

### 5.6 Prompt and context

- **System prompt (static, cached):** `agent/instructions.md` rewritten for one all-round bot,
  under 950 words (keep the test), then the skills list, then the bot block: `You are NAME.` plus
  the owner's instructions fenced as today (`shared/context-blocks.ts` "Your bot", cap 8,000
  chars). It changes only when the owner edits the bot. Remove "Running the team", the group
  block, "another bot is a peer", sub-agent and handoff text.
- **Per-turn context (dynamic, last):** "This turn" (owner name, date at day granularity and time
  zone, permission label, folder or "no folder", model label) and the notes block
  (`shared/notes-block.ts`, unchanged renderer). Delivered from `before_agent_start` as a hidden
  `custom_message` (`display: false`, customType `ub.context`), only when its text differs from the
  last one sent in this chat's active branch, and always again after a compaction. This keeps the
  cached prefix stable.
- **Untrusted content** keeps the existing fences (`shared/untrusted.ts`) and the per-turn
  outside-content taint (`agent/lib/outside-content.ts`, root/child marks removed).
- Notes no longer need replay-stable bytes: delete the operation-id digest store under
  `memory/recall/`.

### 5.7 Compaction

- Pi's automatic compaction, per model: `reserveTokens = max(4096, floor(0.25 * window))`,
  `keepRecentTokens = min(20000, floor(0.25 * window))`. That reproduces today's "compact at 75%"
  and fits a 32k window (8,192 reserve, 8,192 kept).
- Summary model: the chat's own frozen selection through the same provider. Our
  `session_before_compact` handler only logs (replaces `agent/hooks/compaction-log.ts`) unless a
  later eval shows Pi's summary losing facts.
- Overflow or early length stop: Pi's one compact-and-retry recovery stays on.
- Events: `compaction_start` maps to `activity {kind: compacting}`, `compaction_end` to
  `compaction.done` and a quiet row.
- After compaction the per-turn context message is sent again (5.6).

### 5.8 Tools

**Shim.** `agent/lib/tool.ts` exports `defineTool({ description, inputSchema, execute })` with
today's shape, so tool files change only their import line. It converts the zod schema to JSON
Schema (`z.toJSONSchema`) for Pi's `parameters`, parses input with the zod schema inside `execute`
(keeps `lenient-null` coercions), and passes a context:

```ts
type ToolCtx = {
  chatId: string; botId: string; turnId: string; callId: string;
  abortSignal: AbortSignal;
  session: { id: string; turn: { id: string } };   // compat for existing tool code
  appendRow(row: ChatRow): void;                     // writes a ub.row custom entry + event
};
```

Errors thrown from `execute` become Pi error results (the model sees them). Results are returned
as `content` text plus `details` (for rows and search chips).

**Final tool set (declared to the model):**

| Tool | From | Notes |
|---|---|---|
| `bash` | `bash.ts` | seatbelt profiles, command risk, approval cards unchanged |
| `read_file`, `write_file`, `list_dir` | as today | path guards, 16 KB read cap, atomic gated writes, `.html` pages |
| `web_search` | as today | router `/v1/search`; result `details.searchResults` drives chips |
| `web_fetch` | rewritten | eve's implementation goes; ours keeps SSRF checks (`shared/connection-url.ts` rules), redirects, 5 MB cap, HTML to Markdown, untrusted fence |
| `memory` | merges 4 | `action: search | read | save | delete`, same store and caps |
| `routine` | merges 5 | `action: list | create | update | delete | run` |
| `apps` | merges `connector_catalog`, `connector_search`, `connector_execute`, `propose_connector` | `action: find | tools | run | connect` |
| `connect_server` | `propose_connection` | MCP only (D17) |
| `find_tools` | `connection_tools.ts` | picks MCP tools; picked tools register as Pi tools named `<connectionId>__<tool>` and activate next model request |
| `generate_image` | as today | |
| `install_cli` | as today | |
| `todo` | rewritten | state in tool-result `details`, Pi's branch-aware pattern |
| `ask` | new | question row + `input.requested`, returns `terminate: true` |
| `load_skill` | new | returns a skill's full text by name (our two skills) |

That is 16 declared tools plus at most 40 picked MCP tools (`MAX_SESSION_TOOLS`). Every tool keeps
its existing caps and approval behaviour.

**Picked MCP tools:** registered with `pi.registerTool` at first pick and activated with
`setActiveTools` between model requests (never mid-request). The pick list is stored per chat in
`connection-tools.json` keyed by `chatId`.

### 5.9 Approvals and questions

- Tools keep raising cards in `approvals.json` and waiting in-process (`waitUntilNotPending`,
  250 ms poll). The app keeps polling `GET /api/approvals` and posting decisions. No change in
  Swift for approvals beyond dropping `rootSessionId`, `subagent` and `originLabel`.
- `approvalActor` becomes `{chatId, turnId, callId, botId}`.
- Engine boot expires pending records from older epochs, so no ghost cards.
- Cancel expires the chat's cards.
- An extra `tool_call` gate in the engine extension blocks any tool name that is not in our
  registered set (defence in depth; fail closed).
- **Questions:** `ask {prompt, options?, allowFreeform?}` writes a `ub.question` row, emits
  `input.requested {requestId, kind: "question", ...}`, and terminates the turn. The owner's next
  message (button label or typed text) resolves it: the engine emits `input.resolved` before the
  new `turn.started`.
- Session-limit prompts disappear (no per-session input cap; the router's daily budgets guard
  spend).

### 5.10 Connections, Composio, widgets

- Composio: unchanged stores and client; tools merged into `apps`.
- MCP: unchanged store, OAuth, Keychain auth, `callMcpTool` HTTP client, per-call gate
  (`mcpToolGate`), 24 KB result cap, auth-failure marks.
- `find_tools` index and scoring unchanged; per-session picks re-keyed to `chatId`.
- Widgets (MCP apps): detection keeps the `<connectionId>__<tool>` name plus `ui://` meta. The
  engine emits `tool.call {widget: {connectionId, toolName, arguments}}`; the app persists through
  `POST /api/agent/widget` as today, which now appends a `ub.row` through the engine.
- Eager OpenAPI mounting is deleted (D17).
- Tool-budget guards written against eve's "retire on 400" (`MAX_TOOL_SCHEMAS`,
  `MOUNTED_TOOL_BUDGET`, tool byte weighing) stay: the router still refuses oversize tool arrays.
  `MAX_MESSAGE_COUNT` stays as a router limit; Pi compaction keeps chats well under it.

### 5.11 Routines and system turns

- Scheduler in the engine: every 20 s, `pendingRoutines(now)`, one routine per bot, at most 2 at
  once, claim with the existing store functions (`claimDueRoutine`, `claimManualRun`).
- A routine runs in the bot's current chat with `origin: routine`. Before its prompt the engine
  adds a hidden `ub.context` message: "Scheduled run of the routine NAME. Nobody is watching: do
  not ask questions or wait for cards." A note row "Routine NAME ran." precedes it.
- Budget: 1 hour per run, 10 minutes without events aborts it. Result recorded with
  `appendRoutineRun`.
- If the chat is busy, the routine waits up to 10 minutes for idle, then is recorded as skipped.
- System turns (`POST /internal/bots/:botId/system-turn {text, rowNote}`) are used by connect-card
  resume (D19), with `origin: system`.
- The app's `/api/agent/tick` keeps only the connect pumps (`pumpConnects`, `pumpConnections`,
  `seedDefaultConnections`) and the orphan sweep; `pumpHandoffs` and `pumpRoutines` leave.

### 5.12 Transcript rows

The engine materialises the chat's **active branch** into rows. Rows are the only thing the app
renders; it never sees Pi entries.

| Row kind | Source entry |
|---|---|
| `user` | message entry, role user (text, attachments listed by name and type) |
| `assistant` | message entry, role assistant, text blocks only (thinking hidden; inline `<think>` already split by the router) |
| `note` | `ub.row {kind: note}` (routine ran, connected, compaction) |
| `failure` | `ub.failure {turnId, code, detail, retryAfterMs, resetsAt}` |
| `question` | `ub.question` (open until the next user message) |
| `image`, `page`, `widget` | `ub.row` with ids into the media and widget stores |
| `card` | `ub.row {kind: card, proposalId}` (connect app or server) |

- Tool calls, tool results and thinking are not rows (today's UI shows them only as the working
  label). They stay in the session file.
- Each row has a stable `id` (the entry id), `turnId`, `at` (entry timestamp) and `seq` position.
- The engine caches rows per open chat in memory, built once from the JSONL file and appended to as
  entries arrive. A row list for a 12k-entry chat must build in under 150 ms (perf budget, 14).
- `GET /chats/:id/rows?before=<rowId>&limit=60` pages backwards; the newest page carries
  `{rows, tailSeq, epoch, running: {turnId, partialText, activity} | null, queued: [...],
  openQuestion}`.

## 6. Chat protocol v1

All paths below are on the web service under `/api`, cookie session and CSRF as today; the web
proxies them to the engine with the engine token. Request and response bodies are JSON unless
stated.

### 6.1 Requests

| Method + path | Body | Result |
|---|---|---|
| `GET /api/chats?botId=` | | `{current: chatId|null, recents: [...]}` |
| `POST /api/chats` | `{botId}` | `{chatId}` (new empty chat, becomes current) |
| `GET /api/chats/:chatId/rows?before=&limit=` | | page (5.12) |
| `GET /api/chats/:chatId/events?after=<seq>&epoch=<epoch>` | | NDJSON, stays open |
| `POST /api/chats/:chatId/turns` | `{clientId, text, attachments: [...], retry?: boolean}` | 202 `{turnId}` or `{queued: true, clientId}`; typed refusals 400/409 `{code, message}` |
| `POST /api/chats/:chatId/cancel` | | 200 |
| `POST /api/chats/:chatId/open` | | marks it current for the bot |
| `GET /api/engine/status` | | `{epoch, bots: [{botId, running, waitingOnOwner, replyReady}]}` for the rail |

`clientId` is a client UUID echoed on `message.user`, so the optimistic bubble binds by id, not by
text. Attachments are the existing upload results (`/api/attachments`), sent as structured parts;
no `[file: ...]` echo lines.

### 6.2 Events

Envelope: `{seq, epoch, at, chatId, turnId?, type, ...}`. `seq` is per chat, gapless and
monotonic within an epoch; `epoch` is the engine boot id. On connect the engine sends
`stream.ready {tailSeq, running}` first; a client that sees a `seq` gap or another `epoch`
refetches rows.

| Type | Fields | UI |
|---|---|---|
| `stream.ready` | `tailSeq`, `running: {turnId}|null` | boundary between fetched rows and live events |
| `turn.started` | `turnId`, `origin: owner|routine|system`, `clientId?` | working row on, timer starts |
| `message.user` | `rowId`, `clientId?`, `text`, `attachments` | binds or appends the owner bubble |
| `message.queued` | `clientId`, `text` | queued tag under the bubble |
| `message.delta` | `rowId`, `delta` | streams the assistant bubble |
| `message.final` | `rowId`, `text` | authoritative text |
| `activity` | `kind: thinking|tool|compacting|retrying`, `tool?`, `detail?` | working label |
| `tool.call` | `callId`, `name`, `widget?` | live widget |
| `tool.result` | `callId`, `searchResults?` | search chips |
| `row` | full row | note, image, page, widget, card rows as they are written |
| `input.requested` | `requestId`, `kind: question`, `prompt`, `options`, `allowFreeform` | question card |
| `input.resolved` | `requestId` | card leaves |
| `compaction.done` | `rowId` | quiet note row |
| `turn.completed` | | working row off |
| `turn.cancelled` | | working row off |
| `turn.failed` | `code`, `detail`, `retryAfterMs?`, `resetsAt?`, `messageKept`, `rowId` | failure row with Retry |

### 6.3 Pi event to protocol mapping

| Pi | Protocol |
|---|---|
| prompt accepted (host) | `turn.started` |
| `message_start` user | `message.user` |
| `queue_update` (follow-up added) | `message.queued` |
| `message_update` `text_delta` | `message.delta` |
| `message_update` `thinking_delta` | `activity thinking` (throttled to one per 500 ms) |
| `tool_execution_start` | `activity tool` + `tool.call` |
| `tool_execution_end` | `tool.result` |
| `message_end` assistant | `message.final` |
| `compaction_start` / `compaction_end` | `activity compacting` / `compaction.done` |
| `auto_retry_start` | `activity retrying` |
| `agent_settled` | `turn.completed` / `turn.cancelled` / `turn.failed` |

## 7. Web service changes

| Area | Change |
|---|---|
| `web/app/eve/**`, `web/lib/eve-session-auth.ts`, `shared/eve-proxy.ts`, `shared/eve-stream.ts`, `shared/continuation-brief.ts` | delete; keep `parseTurnMessage`, `turnHasImages`, attachment validators in a new `shared/turn-input.ts` |
| `web/app/api/chats/**` (new) | proxy to the engine, streaming passthrough for events, same guards (`requireOwner`, CSRF, rate limits, 8 MB body cap) |
| `web/lib/agent-exec.ts` | delete engine calls (`runEveTurn`, `readHandoffStream`, `sessionEventIds`, `readStreamRange`, `cancelEveTurn`, `channelJwt*`), handoff and routine pumps; keep connect pumps and orphan sweep |
| `/api/agent/tick` | connect pumps and sweep only; returns `{inFlight}` |
| `/api/agent/state` | delete (rows come from the engine) |
| `/api/agent/widget` | store widget, then append the row through the engine |
| `/api/status` | probe `GET <engine>/health` instead of `/eve/v1/health`; field `engine` replaces `eve` |
| `/api/shell` | roster reduced to 1-2 bots: keep select, rename, updateBot (instructions, model, permission, workspace, notify, avatar), newChat, openRecent, setWorkspace, setPermission; delete groups, sections, pin, hide, move, fan-out, sendToBot, bot/group/profile proposals |
| `/api/approvals` | drop bot resolution through session bindings, `rootSessionId`, `subagent` |
| `/api/bots/context` | recompute from the engine (`GET <engine>/bots/:id/context`) |
| `/api/reviewer` | delete (no caller) |
| `shared/handoffs.ts`, `agents-send.ts`, `threads.ts`, `subagent-stops.ts`, `bot-face.ts`, `session-bindings.ts` | delete (`session-bindings`: chats are owned by their bot directory, no binding file) |
| `shared/agent-store.ts` | keep proposals for connectApp/connectServer and idempotency reserves; delete threads/events (moved to session rows), bot/group/profile/fan-out proposals |
| `shared/workspace-store.ts` | grants keyed by `chatId`, written by the engine |
| `shared/admission.ts` | measure from the engine's real prompt and tool schemas |
| `shared/policy.ts` | drop `POLICY_EVE_VERSION`; keep budgets |

## 8. Router changes

- `validateCompletion`: accept `max_completion_tokens` as an alias; clamp max tokens to the model's
  output cap instead of refusing above 4096; clamp before the reservation.
- Accept and drop `store`, `reasoning_effort`, `prompt_cache_key`, `prompt_cache_retention`
  (insurance against a wrong compat flag); map role `developer` to `system`.
- Reasoning history: `withoutReasoning` and `rewrapThinkHistory` also handle `reasoning`,
  `reasoning_text` and `reasoning_details`; validate those fields.
- Delete `router/src/tool-finish.ts` and its uses **in the engine-swap PR only** (eve needs it
  until then; Pi fails truncated tool calls on purpose).
- Keep `discardSamplingKeys`, inline think, limits, circuit, concurrency, adapters, payload probe.
- Add `scripts/restamp-registry.mjs` that writes `sha256(package-lock.json)` into both
  `shared/registry.json` entries; every dependency change runs it in the same commit.

## 9. macOS app changes

Full file table with line counts: `app-map/swift.md` section 5.2 and 6.2.

- **Rewrite:** `StreamProjection` (EveStream.swift 920-2433) becomes `ChatProjection`: rows from
  `GET rows` plus the live events of 6.2 (target under 450 lines). Keep and move `JSONValue`,
  `SearchChip`, `TurnActivity` (prune tool labels to our 16 tools), `TurnFailure` copy,
  `SendFailure`, `OwnerQuestion`, `LiveWidget`, `parseSearchChips` (fed by `searchResults`).
- **BackendClient:** replace the eve section (about 600 lines) with the 8 chat requests and the
  NDJSON reader keyed by `seq`/`epoch`.
- **AppModel:** rewrite the chat core (send, follow, reload, retry, cancel, queue, questions,
  background bots) for 1-2 bots; delete stash, prewarm, snapshot, sub-agent, handoff and pump code.
- **Delete:** `ReplayGate.swift`, `ChatSnapshot.swift` (and prewarm), `SubagentRuns.swift`,
  `SubagentCard.swift` (Core and App, keep `WaitingCard` only if a non-question request survives;
  it does not, so delete), `Threads.swift` (keep `defaultBotId`), `ChatAttribution.swift`,
  `AvatarStackView.swift`, eve-only tests (`app-map/swift.md` 7.1).
- **Simplify:** rail becomes a 1-2 bot switcher with the account row; drop sections, pinned grid,
  hidden, row menu move/pin. Chat view drops sub-agent cards, handoff/post strips, group header,
  "never got this message", continuation divider. Keep the queued tag (D14). Picker: "New chat"
  only plus recents in the search palette. Settings: drop group fields. Proposal cards: connect
  kinds only. Create-bot dialog: allowed while fewer than 2 bots, no groups.
- **Supervisor:** `ServiceMode.eve` becomes `.engine`, health `/health`, port name `enginePort`,
  stray-process pattern `agent/server.ts`. Service order router, engine, web.
- **Perf harness:** marks move from replay to rows fetch (`rows_first_paint`, `rows_done`).

## 10. Product changes the owner will see

- One bot, "Useful", in the rail; a second can be created (cap 2). Extra old bots appear under
  Settings > Archived bots with their exported chats.
- Chats open from rows, without the replay pause.
- A failed turn never kills the chat; Retry continues the same chat.
- Sub-agent cards, group chats and bot-to-bot messages are gone.
- Old OpenAPI connections show a note to re-add them as MCP servers.
- Approvals, questions, routines, connectors, images, pages, widgets, memory and model picking
  look and work as today.

## 11. Data and migration

### 11.1 Export (last eve release, PR M1)

- On launch, once per bot chat (current and recents), the web service reads the eve session
  through the existing stream reader and writes:
  - `<stateRoot>/export/eve-chats/<botId>/<sessionId>.ndjson` (raw events, as eve sent them)
  - `<stateRoot>/export/eve-chats/<botId>/<sessionId>.md` (owner and bot turns, dates, tool names)
  - `index.json` with `{botId, sessionId, title, turns, firstAt, lastAt, exportedAt}`.
- Runs in the background at low priority, resumable, idempotent by session id. A Settings line
  shows progress. Never touches `.eve/`.

### 11.2 Import (Pi release, PR M2)

- For each kept bot's current chat (and recents up to 10), build a Pi session file from the
  export: owner and assistant text messages in order, tool activity folded into the assistant
  text as a one-line note ("Used: bash, web_search"), images and pages as `ub.row` entries,
  compaction summaries as a leading hidden `ub.context` "Earlier in this chat" message when the
  chat exceeds the new model's window.
- If no export exists (a user skipped the eve release), read eve's chunk files directly
  (`.eve/.workflow-data/streams/chunks/strm_*_user/chnk_*.bin`, `devalue` format, ordered by ULID)
  with the same converter; verified against the dev app's 314 MB store before release.
- Imported chats get a quiet note row "Imported from the earlier engine".
- Markdown archive of every chat stays in `~/Documents/Useful Bot/Archive/` for the owner.
- Archived bots (D6): `shell.json` keeps them with `archived: true`; routines paused; memory kept.
- Stores carried unchanged: `config.json`, `providers.json`, `models-cache.json`,
  `chatgpt-signin.json`, `limits.json`, `router/usage.sqlite`, `memory/`, `routines.json`,
  `connections*.json`, `connectors.json`, `media.json`, `widgets/`, `web-sessions.json`.
- Dropped after import: `handoffs/`, `subagent-stops.json`, `session-owners.json`,
  `policy.sqlite`, `agents.json` threads (proposals and reserves kept).
- Migration is idempotent and logged to `<stateRoot>/engine/migration.json`.

## 12. Security

- Pi built-in tools, extensions, skills discovery and context files are all disabled (D4); a
  `tool_call` gate refuses unknown tool names.
- Tools are unchanged where it matters: seatbelt profiles (`agent/lib/sandbox.ts`), command risk,
  credential tripwires, path guards, planted-config refusal, whitelisted child env, untrusted
  fences, outside-content taint, approval hash binding, boot epoch.
- Add `<stateRoot>/engine/` to the protected app-state names (`shared/stack.ts`
  `mentionsAppState`, sandbox deny lists) so the bot cannot read or write its own transcripts or
  Pi config.
- Engine binds loopback only, bearer token, Host check, no Origin.
- Pi phone-home off (5.1). The engine makes no network calls except to the router, MCP servers
  the owner connected, Composio, and `web_fetch` targets.
- `pi-tui` native prebuilds ship in `node_modules`; they are signed with the ad hoc deep sign
  today and must be handled when notarization starts.

## 13. Ops, build, dependencies

- `package.json`: remove `eve`, `just-bash`, `ai`, `@ai-sdk/openai-compatible`, the `postinstall`
  and the `s1` script; add `@earendil-works/pi-coding-agent` (exact). Run the registry restamp.
- Delete `scripts/patch-eve.mjs`, the eve cases in `scripts/verify.mjs`, `POLICY_EVE_VERSION`,
  `scripts/tool-schema-size.mjs` eve imports (rewrite for our tools).
- `scripts/service.mjs`: `engine` mode as in 5.1; `EVE_TELEMETRY_DISABLED` goes.
- `shared/launchd-render.ts`: label `com.usefulbot.engine`.
- `scripts/build-runtime.mjs`: tracked list loses `patch-eve.mjs`; `npm ci --omit=dev` now carries
  Pi's tree (net disk roughly neutral: about 150 MB out, 149 MB in).
- `RuntimeInstall.swift`: keep excluding `/.eve/` for one release; engine data lives under the
  state root, not the install root.
- `perf/config.json` `ownProcesses`: the engine command line.
- `AGENTS.md`: shared resources list (ports, engine), the eve paragraphs, the dev-app runtime note.
- `README.md`: engine section.

## 14. Verification

**Engine contract tests** (node test runner, fake router upstream, run in the engine PR before any
UI work; these prove the Pi behaviours this spec depends on):

1. `routerFetch` sends a fresh request id on each HTTP attempt, including Pi agent-level retries.
2. Pi's request body passes the router's validation with the compat of 5.3 (golden payload test).
3. A length stop after a tool call does not orphan a tool result; the next request is accepted.
4. Compaction never splits a tool call from its result (router `invalid_tool_history`).
5. The compaction summary call does not collide with `session_busy`.
6. Retry by branching leaves one owner message in the active branch.
7. Kill the engine mid-turn; on boot the chat shows an `interrupted` failure row and Retry works.
8. Follow-up queue order with three quick sends.
9. Zod schemas with `lenient-null` coercions survive Pi's parameter validation (if Pi validates
   before `execute`, the shim publishes a permissive schema and validates in `execute`).
10. A `tool_call` for an unregistered name is refused.
11. No outbound connection other than the router (fake) during a full turn (Pi offline flags).
12. Row materialisation of a synthetic 12k-entry session under 150 ms.

**E2E** (Useful Bot Dev, Test Bot, `verify/<branch>/`, repeatable script plus mac-app-verify
screenshots and 30 fps recordings): a medium-hard scenario in one chat:
attach a folder, ask for a multi-step job that runs bash (one command needs approval, approve it),
writes an HTML page, searches the web, draws with Excalidraw (widget), generates an image, saves a
memory note; switch the model mid-chat; send a second message while the first turn runs (queue);
force a router 5xx (fake upstream connection) and Retry; push the chat past a 32k window so it
compacts; kill the engine mid-turn and relaunch; run a routine manually; open a 12k-row imported
chat. Artifact: JSON report of every step with timings, the session files, screenshots, frame
sheets.

**Eval** (Anthropic's "build a small end-to-end eval first"): 10 golden tasks for the all-round
bot (tool choice, approvals respected, memory use, a routine, a connector, a question, a long
chat), run once on eve before the swap and once on Pi after, same model, graded by rubric.
Write-up `evals/results/<date>-pi-engine-golden.md` with cost, latency, pass rate.

**Perf:** rebuild the four perf fixture bots as Pi sessions with the importer (no paid turns),
re-lock, re-baseline; budgets for chat open, switch and launch must hold or be raised in a
reviewed edit that says why.

## 15. Keep, adapt, delete (summary)

- **Keep as is:** router (minus 8), `command-risk.ts`, `sandbox.ts`, `run-command.ts`,
  `workspace.ts`, `cli-registry.ts`, `connector-risk.ts`, `memory.ts`, `notes-block.ts`,
  approvals store, routines store, Composio, MCP client and OAuth, media and widgets stores, auth
  stack, Keychain, stack, dir-lock.
- **Adapt:** every tool file (import line, ctx), `router-fetch.ts`, `router-identity.ts`,
  `permission.ts`, `outside-content.ts`, `write.ts`, `turn-snapshot.ts` (`buildSnapshot` body only),
  `context-blocks.ts`, `admission.ts`, `shell-store.ts`, `agent-store.ts`, `workspace-store.ts`,
  `connection-tools*.ts`, web routes in 7, Swift files in 9.
- **Delete:** `agent/agent.ts`, `agent/channels/`, `agent/connections/registry.ts`,
  `agent/hooks/`, `agent/sandbox/`, `agent/memory/notes.ts` (renderer moves),
  `session-model.ts`, `channel-auth.ts`, `session-owners.ts`, `active-bot.ts`,
  `openapi-approval.ts`, `web-fetch-fence.ts`, `plant_read.ts`, the 8 multi-bot tools, `review.ts`,
  `list_models.ts`, `clear_history.ts`, `update_bot_profile.ts`, the web and shared files in 7,
  the Swift files in 9, eve-only tests.

## 16. Risks

| Risk | Mitigation |
|---|---|
| Pi API churn (5 minor releases in 3 weeks, embedder breaks) | exact pin; all Pi calls behind `agent/engine/pi-host.ts`; upgrade only in its own PR with the contract tests |
| Pi changes direction (Earendil owns it; parts may go source-available) | MIT core pinned; adapter keeps a swap to the AI SDK possible |
| Pi's defaults assume a coding agent | D4 turns them all off; contract test 11 |
| Losing eve's mid-turn durability | D15: visible interrupted row and Retry; tools are idempotent where it matters (image and proposal reserves kept) |
| Old chats lost | D22 export before cut-over, offline fallback, Markdown archive, `.eve/` never deleted |
| Router refuses Pi's requests | router changes in 8, golden payload test |
| Compaction quality differs from eve | eval tasks include a long chat; custom summariser hook ready |
| Two-bot cap disappoints existing users | archive keeps everything; restore swaps |
| Big-bang Swift rewrite | protocol is small and fixed first; rows endpoint testable with fixtures before the engine lands |

## 17. Glossary

- **Chat:** one Pi session file. **Turn:** one prompt until Pi settles. **Row:** a rendered
  transcript item. **Epoch:** engine boot id. **Selection:** `{connectionId, modelId, effort,
  speed}` frozen per turn.
