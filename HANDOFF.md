# Cursor handoff

Date of handoff: 2026-09-13. Everything described here is on `main` and was verified
live before this file was written. Read this first, then `docs/spec/PLAN-FINAL.md`
and `docs/spec/SPEC.md` for the full contract.

## What this app is

Useful Bot is Wasim's local personal agent. It replaces Hermes, Grok Bot and
OpenClaw eventually, but it is not a Hermes replacement until the seven-day trial in
the spec passes. Stack: Vercel **eve 0.54.3** agent framework, a TypeScript loopback
router for model traffic, a Next.js chat UI, and a Swift WKWebView macOS shell.

Rules that are permanent:

- Local-only. Loopback binds. No Vercel hosting. Tokens never leave the Mac.
- Interpreter is `/usr/local/bin/node` (Node 24.11.1). Login-shell `node` is v22,
  do not use it.
- No em dashes anywhere.
- Never commit to `main` directly; branch + PR + merge. Conventional commits.
- Never read `.env*`, `~/.local/share/opencode/auth.json`, `~/.codex/auth.json`,
  Keychain values or `secrets/`.

## What is running right now

All three services were up and verified when this file was written:

```sh
export PATH=/usr/local/bin:$PATH
# router on 127.0.0.1:4319
/usr/local/bin/node scripts/service.mjs router
# eve on 127.0.0.1:4321
/usr/local/bin/node scripts/service.mjs eve
# web on 127.0.0.1:4320
/usr/local/bin/node scripts/service.mjs web
# macOS app
make -C macos bundle && open "macos/dist/Useful Bot.app"
```

Keychain items exist: `com.usefulbot.device.desktop`,
`com.usefulbot.router.desktop`, `com.usefulbot.router.ops`,
`com.usefulbot.channel.desktop`, and Wasim pasted the OpenCode Go key into
`com.usefulbot.opencode-go` himself. `scripts/setup-local.mjs` writes the token
Keychain items and `~/.useful-bot/config.json` (digests only, never values).

The webview now has an Edit menu, so copy/paste works in the app.

## Merged so far (PRs 1-9)

| PR | Content |
|---|---|
| 1-2 | Docs baseline, plan + four-model counsel + spec; Phase 0 spikes S0-S3 (eve channel auth 9/9, OpenCode Go aliases 12/12, sandbox non-VM) |
| 3 | Loopback router, hashed caller tokens, duplicate-request 409, workspace tools, launchd templates, `service.mjs` |
| 4 | Next chat UI + Swift WKWebView shell with origin allowlist |
| 5 | Memory store (markdown + FTS5), durable session owners in policy.sqlite, reviewer subagent, `web_search` tool |
| 6 | Local run path; README setup sequence |
| 7 | Moved the Next app out of `agent/channels/web` to `web/` (eve was compiling Next routes as channels and failing to boot) |
| 8 | Useful Brain design language: rail + stage shell, tokens, ChatSearchDialog, ChatComposer, Useful Bot mark, generated AppIcon.icns, Edit menu |
| 9 | Tailwind was missing; `flex`/`h-screen`/`size-*` were all inert. Fixed with `@tailwindcss/postcss` + `@theme inline` |

## The one functional gap: real assistant replies

A turn reaches eve and is accepted (Wasim's "hi" created session
`wrun_01M...` and the UI showed "Turn accepted."), but the UI never renders the
model's answer. Two root causes, both already identified:

1. **agent.ts fixture mode.** `agent/agent.ts` picks its model from
   `process.env.UB_S2_FIXTURE`. The service currently does NOT set that, so
   `requireModel()` takes the real path: `createOpenAICompatible` with
   `UB_ROUTER_DESKTOP_TOKEN` from Keychain against `http://127.0.0.1:4319/v1`.
   Verify this chain works from inside eve; if the model call fails, the
   eve dev logs under `.eve/logs/` show why (likely `UB_ROUTER_DESKTOP_TOKEN`
   was not inherited: `service.mjs` eve mode sets it from Keychain, check it is
   actually in the spawned env).
2. **The UI hardcodes the placeholder.** `web/app/page.tsx` `send()` appends
   `{ role: "assistant", text: "Turn accepted." }` instead of reading the eve
   event stream. The eve HTTP session API is
   `POST /eve/v1/session` (create) and `GET /eve/v1/session/:id/stream` (SSE).
   The fix: after send, open the SSE stream, parse delta events, append real
   text chunks to the assistant message. Curl the stream once with a Bearer JWT
   signed the same way `signChannelJwt` in `scripts/service.mjs` does, to see the
   exact event shape before coding the parser.

## Remaining PRs, in order

GitHub numbering: PR 10 was the docs handoff (merged). Streaming replies is GitHub **PR 11**.

1. **PR 11: stream real assistant replies.** Wire the eve NDJSON stream into the UI. Gate: send in the app, see a real answer, cancel mid-turn stops within 2s, reload resumes `?session=`. Merge this before the shell PR if the shell is stacked on it.
2. **Multi-bot light-theme shell UI.** Grok Bot IA plus Cursor create patterns, Useful Brain tokens, light theme first. Rail: search, compact rows, section headers including Unassigned, pin cards, selected state, footer account. Bot context: pin, move, rename, hide/delete with confirm. Create bot / group chat. Per-bot settings. Persist `~/.useful-bot/shell.json`. Deferred: composer modes, marketplace, Cmd+K polish, dark theme, routines scheduler.
3. **Memory in the chat.** Surface a Memory view that lists notes (`audience: "desktop"`) and a "remember this" flow. The upsert tool already requires approval; make the approval card render in the chat from a pending-approvals poll (`web/app/api/approvals/[id]/route.ts`).
4. **Search + reviewer in the chat.** `web_search` tool calls router `/v1/search` (keyless Firecrawl). Show results as chips. "Ask reviewer" runs the pinned reviewer subagent with the turn's text.
5. **launchd templates in-repo.** Render the three plists in `ops/launchd/` with the substitute script; `plutil -lint` or equivalent first. Do not install onto a cloud Linux VM or a Mac that is not the owner's. Note `service.mjs` eve currently runs `eve dev` because `eve start` needs `eve build` output that conflicts with the web subapp.
6. **Release verification.** Full verify suite, screenshots and a screen recording of the final UI. The seven-day usage trial begins after this lands on `main`.

Then the deferring list from earlier PRs: 10k-note memory soak, Tailscale/phone
(Phase 3), the `product-price-monitor`-style pricing checks. None of these block
daily use.

## Verification loop Wasim expects

- Every change: `npx tsc --noEmit` (root + `router/tsconfig.json`), `npm test`
  (22 cases), `next build web`, `make -C macos test` (Swift), and for UI work an
  actual screenshot of the running app (`computer_use` capture app="Useful Bot"
  mode=vision), never a claim without the picture.
- PRs merge after review; adversarial/security review on auth, tokens, Keychain
  or approvals changes is mandatory. Cursor can be that reviewer with a
  multi-angle pass on those files.
- The web UI has Tailwind now. If a layout is broken, first check the browser at
  `http://127.0.0.1:4320` (same bug would show there too).
- Useful design law and Useful Brain tokens are in `web/app/globals.css` and the
  components; do not invent a second visual language.

## Gotchas learned the hard way

- eve walks everything under `agent/`. Never put Next route files back under
  `agent/channels/web`.
- Subagent `agent.ts` needs a non-empty `description` or eve refuses to boot.
- A custom `LanguageModel` on `defineAgent` must carry
  `modelContextWindowTokens` or eve exits at compile (Gateway metadata lookup).
- `eve start` needs `eve build`; use `eve dev --no-ui` for dev, that is what
  `service.mjs` does.
- `opencode run` auto-rejects any tool call outside the repo. Do not dispatch
  executor agents for work that must touch /tmp.
- The macOS app is WKWebView: page content is invisible to DOM tools; verify
  with `computer_use` vision captures only. Synthetic keystrokes need
  `delivery_mode="foreground"` and sometimes one retry.
- `iconutil` needs the absolute path to the `.iconset` directory; `make-icon.sh`
  resolves it via `SCRIPT_DIR` after `cd`s.
- Last-session model handoff state: this session ended on glm-5.3-flash via
  opencode-go; Grok 4.6 via xai-oauth is the user's default for review-class
  work, DeepSeek v4.1 flash via opencode-go was the agreed executor before
  the usage limit hit.
