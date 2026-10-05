# Useful Bot launch video council, round 1

You are one of twelve independent advisors on the launch video for **Useful Bot**, a native macOS app that runs a team of AI bots on your Mac. Answer alone; in round 2 you'll critique the others' answers anonymously. Today is 2026-10-05.

## Read first (all in this folder)

1. `UB-001-research.md`: what Useful Bot really does (sourced fact sheet), the competitor research and the comparison table. **Section 1 lists what we may and may not claim. Treat it as binding.**
2. `screenshots/`: real screenshots of the app (clean demo profile, light and dark), described in the list below.
3. This brief.

## The goal

A launch video that makes the right people install Useful Bot, by showing what it does that the alternatives don't. Built in code with Remotion on real recordings of the app and its real brand. Deepgram text-to-speech voice-over, burned-in captions.

## Hard rules

- **Honesty.** Only claims in section 1 of the research doc. Never show unshipped features as available (no computer use, no browser agent, no "always on", no "first" or "only"). Cloud models and connected apps receive what you send them, so "nothing leaves your Mac" is false.
- **No music at all.** The owner can't use music (religious reason). Plan voice plus non-musical sound design only: UI clicks, soft whooshes, room tone, silence. Nothing melodic or rhythmic.
- **Real UI only.** Footage is recorded from the app. Anything recreated in code must use the app's real tokens, fonts and layout, never an invented UI.
- **Demo data only.** Synthetic bots, chats and accounts.
- **No em dashes in any copy** (captions, voice-over, on-screen text).
- **Formats:** 16:9 master, 75 to 90 seconds, plus a 9:16 cut. Captions burned in.
- **Competitors may be named in the research, but decide yourself whether the video should name any.** Keep it fair and sourced if you do.

## Facts the owner added

- Useful Bot should feel easy, like Grok Bot. Hermes Agent has a similar bot mode but is technical to set up. Ease is a real advantage; show it, don't sneer.
- The model on screen for real replies is the user's own **ChatGPT plan through OpenAI's official "Sign in with ChatGPT"**, shipping in 1.1.2 before filming. OpenCode Go and MiniMax may also be named. Local models are mentioned, not filmed: LM Studio with **Qwen3.8-27B** may appear in a recreated model row.
- Muse is US only (Canada per press). Dots Pro excludes the EEA, UK and Switzerland. Grok Bot's regions are unknown, so don't claim anything about them. Our line: no region lock of ours, provider rules apply, local models need no account.
- Voice: Deepgram Flux TTS. Shortlist (pick one and say why): **Wade** (US male, warm, confident), **Kit** (British male, friendly, energetic, listed for narration), **Cliff** (US male, deep, calm, narration), **Maeve** (Irish female, narration). Delivery is steered only by punctuation, pauses and an "expressivity" setting from -2 to +2 (beta). There's no SSML and no emotion tags.

## Brand and UI tokens

- Logo: the white mascot head (glasses, smile, a pink tongue `#FF8FA3`) on black `#000000`. Black is the approved background for the logo. Never draw a stand-in mark.
- Wordmark: Inter Semibold, -0.018em tracking, white on black. The app UI uses the system font (SF Pro).
- App light theme: canvas and rail `#F3F3F3`, surfaces and bot bubbles `#FFFFFF`, ink and accent `#171717`. Dark theme: canvas and rail `#0F0F0F`, surface `#171717`, bot bubble `#202020`, ink and accent `#EDEDED`. Neutral, near-monochrome UI. Colour comes from the bot avatars (40 pastel and deep tones, each the same glasses face).
- Radii: main stage 24, dialogs and cards 16, compact composer is a pill. Soft long shadows. Rail is 248 pt wide.
- An animated mascot SVG exists (`brand/motion/useful-bot-animated.svg`).

## Screenshots (`screenshots/`)

| File | What it shows |
|---|---|
| 01-first-run-light.png | Welcome screen: logo tile, "Welcome to Useful Bot", "A team of AI helpers that works on your Mac. Your chats and keys are stored here.", Get started |
| 02-connect-light.png | First run step "Connect": subscriptions (ChatGPT, GitHub Copilot, OpenCode Go, 6 more) and API keys (Anthropic, OpenAI, OpenRouter, 12 more), Skip for now. The ChatGPT row changes to the official sign-in in 1.1.2. Copilot must not be shown in the video |
| 03-connect-providers-expanded.png | Same step with all API and local providers listed |
| 04-after-skip.png, 04-home-dark.png | Home with the Generalist selected: "Connect a model to start", starter prompts ("Find what's taking up space on my Mac", "Create a copywriter bot for my brand"...), composer with Project, access level (Auto) and Model chips |
| 05-connectors-light.png, 05-connectors-dark.png | Connectors dialog: Excalidraw added, Composio key field (official MCP servers such as Notion add here too; the Notion tool grid exists but isn't in these shots) |
| 06-bot-pane-light.png, 06-bot-pane-dark.png | Bot pane on the right: avatar, name, the bot's instructions, Routines with Create routine |
| 07-settings-light.png, 07-settings-dark.png | Bot settings pane: profile name and label, 30 avatar colours, Instructions (Edit), Routines, Memory ("Nothing remembered yet. Generalist saves notes as you work together."), Notify when finished |

The rail header reads "Useful Bot Dev" and an account badge reads "WJ" because these come from the development build. Final footage will show "Useful Bot" and demo identity.

## Answer with exactly these headings (1,500 words max)

1. **Audience and the one feeling.** Who the video is for, and the one thing they should feel and believe at the end.
2. **Three differentiators.** Our three strongest differences against Grok Bot, Muse, OpenAI Dots and OpenBot (and Hermes Agent if it matters), each citing the row of the research doc that supports it.
3. **The demo.** The single real workflow, start to finish, that proves those three best. It must be possible today in the app with demo data.
4. **Arc and motion design.** Pace, transitions, 2D or 3D moments, typography, how the mascot is used, and the sound design (no music).
5. **Voice.** Which Deepgram voice, expressivity setting, speed, and delivery notes.
6. **Scene list.** A table: timecode, on-screen action (real UI or recreated), caption, voice-over line. 75 to 90 s for 16:9, then one line on how the 9:16 cut differs.
7. **Avoid.** Claims, clichés and anything that makes us look like the others.

Write plain markdown. No em dashes.


---

# UB-001-research.md (full text)

# UB-001 research: product truth and competitors

Prepared 2026-10-05 for the Useful Bot launch video. Version shown: 1.1.1 (build 450), plus the official ChatGPT sign-in shipping in 1.1.2 (UB-015 part, PR #187) before filming. Research by nine Sonnet 5.5 agents, checked by Opus 5.5. Raw dossiers with every source URL are in `evals/results/2026-10-05-ub001-council/research/`. Facts carry the date they were read (2026-10-05) unless marked.

Status words: **official** = the vendor's own page, docs, repo or store listing. **press** = third-party coverage. **unknown** = no source found, never filled in by guess.

## 1. What we can honestly claim

Strong, sourced, and different from most of the field:

1. **Any model, including ones you already pay for.** Sign in with a subscription, paste an API key, or point it at a local runtime (LM Studio, Ollama, Custom). Grok Bot, Muse, Dots, Claude Cowork, Gemini Spark and Perplexity are each locked to their maker's models. Subscription routes we may name on screen: ChatGPT (after 1.1.2 moves it to OpenAI's official open-source flow), OpenCode Go, MiniMax Token Plan. See section 4 for the routes we must not show.
2. **It runs on your Mac and stores your chats and files there, with no account of ours.** Grok Bot, Muse and Dots run on a cloud computer the vendor owns. Caveat in every use: cloud models and connected apps receive what you send them.
3. **Open source, AGPL-3.0.** Public at github.com/wasimjalali/usefulbot. Grok Bot, Muse, Dots, Cowork, Spark and Perplexity are closed. OpenBot (openbot.run) and Agent! are source-available under PolyForm Noncommercial, not open source.
4. **You choose how much each bot may do: Read only, Auto or Full access, with approval cards.** OpenBot runs agents with full access and no per-action approval (its own README). Others have approvals of their own kinds (Dots custom rules, Muse Sentinel, Hermes Smart/Manual/Off), so the claim is the clear three-level model and the card, not "only we ask".
5. **A team of bots, each with its own job, instructions, memory and model,** a Generalist that proposes new bots and groups, group chats of 2 to 6 bots, sub-agents in parallel, routines (daily, weekly, once).
6. **Apps through Composio and any official MCP server** (Notion's official MCP verified with 44 tools on 2026-10-04), each shown with its tools, plus Excalidraw drawings in chat.
7. **Easy to start, like Grok Bot.** Two-step first run: Welcome, then "Connect a model to start" with sign-in or key (FirstRunView.swift:713-732). The owner's point: Hermes Agent has a bot mode but is technical to set up. Claim the ease by showing it, not by naming Hermes.
8. **No region lock of ours.** Muse is US (Canada reported by press). Dots Pro excludes the EEA, UK and Switzerland. Safe line: "A download for your Mac, no account of ours. Where it works depends on the AI provider you connect, and local models need no account at all."

Do not claim:

- "First" or "only" for bot teams, open source or model choice. Hermes Agent (MIT, 251k stars) has Bot Mode with named bots, group chats, any model and local models. OpenClaw (MIT) has multi-agent teams.
- Computer use, controlling the Mac's screen, or a browser agent. UB-006 is not shipped; bots have `web_search` and `web_fetch` only. Muse, Hermes, OpenClaw, Cowork, Perplexity and Agent! all control a computer.
- "Works while your Mac sleeps" or "always on". Grok Bot, Muse and Dots run in the cloud; we don't.
- "Nothing leaves your Mac", "available worldwide", "no telemetry" as an absolute, any Grok Bot region status, "10 bots at once" as a benchmark (it's a concurrency limit, not a measured result), Intel, Windows, iPhone, notarized.
- Gmail or Drive "in one click": catalogue apps need the user's own Composio key first.

## 2. Comparison table

Only claims sourced on both sides. Full sources per cell are in the dossiers.

| | Useful Bot 1.1.1 | Grok Bot (xAI) | Muse (Meta) | Dots (OpenAI) | OpenBot (openbot.run) | Hermes Agent (Nous) |
|---|---|---|---|---|---|---|
| Source | Open, AGPL-3.0 | Closed | Closed | Closed | Source-available, PolyForm Noncommercial | Open, MIT |
| Models | Any: subscriptions, API keys, local | xAI only (press) | Meta Muse Spark only | OpenAI GPT-6 Astra only (official) | Any, via CLIs, keys, Ollama, LM Studio | Any, incl. local |
| Reuses what you pay for | Yes: subscriptions or your keys | Cursor or SuperGrok plans only | No | ChatGPT Pro or Business Premium only | Yes, via CLI plans | Partly (Claude Max, SuperGrok, Copilot) |
| Price of the app | Free (AGPL) | In Cursor from $20/mo, SuperGrok | Free tier, $20, $100/mo | In Pro ($100 to $500/mo), Business Premium | Free | Free |
| Platforms | macOS 14+, Apple silicon | Mac, Windows, Linux, iOS, Android | iOS, Android, web, Mac | ChatGPT desktop, web, mobile, Slack, Teams | Mac, Windows, Linux (Electron) | Mac, Windows, Linux (Electron) |
| Native Mac app | Yes (SwiftUI) | unknown | unknown | ChatGPT desktop app | No (Electron) | No (Electron) |
| Where work runs | Your Mac | Vendor cloud computer (US) | Meta cloud VM, plus Mac computer use | OpenAI cloud computer, optional local | Your computer | Your computer |
| Where data lives | Your Mac | Vendor cloud | Meta cloud | OpenAI cloud | Your computer | Your computer |
| Team of bots | Yes, groups of 2 to 6, sub-agents | Yes, group chats | One agent | One dot at launch | Yes | Yes, Bot Mode |
| Computer use | No (planned) | Yes, cloud computer | Yes | Yes, cloud, optional local | Optional, local | Yes, local |
| App connections | Composio catalogue + official MCP | Connectors, MCP | Dozens of partners | 4,000+ ChatGPT plugins | Plugins, MCP | MCP |
| Control | Read only / Auto / Full access + approval cards | Approval prompts, Auto-review model | Sentinel approvals | Custom rules per action | None per action (full access) | Smart / Manual / Off |
| Regions | No lock of ours; provider rules apply | unknown | US (+ Canada, press) | Pro: not EEA, UK, CH | No stated limit | No stated limit |

Also close, not in the main table: **OpenClaw** (MIT, multi-agent, poor security record), **Claude Cowork** (Claude models only, paid plan, computer use), **Gemini Spark** (Google AI Ultra, $100 or $200/mo, Gemini only, US-first), **Perplexity Personal Computer** ($200/mo Max, press only), **Agent! for macOS** (native Swift, any model, single agent, noncommercial license).

## 3. Taglines (for contrast)

- Grok Bot: "Grok Bot is your team of always-on agents." (official)
- Muse: "The World's First Personal AI Agent Built for Everyone" (official)
- Dots: "frontier intelligence that have your back" (press quote)
- OpenBot: "Persistent AI teammates on your own computer. Run Codex, Claude, Gemini and Grok with the plans you already pay for, or your own model." (official)
- Hermes Agent: "The Agent That Grows With You" (official)
- Useful Bot welcome screen today: "A team of AI helpers that works on your Mac. Your chats and keys are stored here."

## 4. Subscription routes: what may appear on screen

| Route | Verdict | Why |
|---|---|---|
| ChatGPT | Show and name, after 1.1.2 | OpenAI's official Sign in with ChatGPT for open-source apps (2026-09-29); 1.1.1 uses the Codex CLI client, which is why UB-015 moves it |
| OpenCode Go | Show and name | "Use with any agent" (opencode.ai/docs/go) |
| MiniMax Token Plan | Show and name | Built "to be used across third-party harnesses" (MiniMax, search snippet) |
| Kimi Code, MiMo Token Plan | Show without naming | Documented for named coding tools only |
| GLM Coding Plan, Qwen Coding Plan, Command Code | Don't show | Vendor terms restrict third-party or backend use (logged as UB-015) |
| GitHub Copilot | Don't show | Officially supported only in OpenCode |
| Anthropic, Google | API key only | No subscription route exists; never show "Claude subscription" |

## 5. Voice, sound and tooling findings

- **Deepgram:** Flux TTS (`/v2/speak`, GA August 2026) has an `expressivity` setting (-2 to +2, beta); Aura-2 is the fallback. No SSML, no emotion tags, no word timestamps (captions get timings from Deepgram speech-to-text on the audio). About $0.045 per 1k characters; five full takes cost about $0.32 and fit the $200 new-account credit. Commercial use allowed; don't present the voice as human. Shortlist: Wade, Kit, Cliff, Maeve (Flux).
- **Remotion:** official Claude Code plugin with 12 skills (`remotion-dev/skills`), free for 3 or fewer employees (owner confirmed). The Remotion MCP is deprecated. Packages: transitions, motion-blur, captions, lottie, three.
- **No music (owner rule):** non-musical sound effects only, from Freesound (CC0 filter), Pixabay SFX or Sonniss, each auditioned so nothing melodic or rhythmic slips in. Avoid kits that bundle music generation.

---

# Appendix A: Useful Bot 1.1.1 fact sheet (sourced)


Scope: main at 973a981 (shipped 2026-10-04). Repo: /Users/wasimjalali/Desktop/useful-bot. Prepared 2026-10-05, read only.
Paths are relative to the repo unless absolute. Status key: SHIPPED = in main at 973a981 and reachable in the macOS app UI (or the public site/repo for non-app claims). PLANNED = not built. PARTIAL = built with a stated limit. UNVERIFIED = no source I could find.

Live checks I ran today (unauthenticated GET only):
- github.com/wasimjalali/usefulbot is public, license agpl-3.0 per GitHub API, last push 2026-10-04T20:53:27Z.
- github.com/wasimjalali/useful-bot-releases latest release is v1.1.1, published 2026-10-04T20:52:30Z. Assets: Useful-Bot-macOS.dmg (138,400,529 bytes), Useful-Bot-macOS.zip (132,876,842), appcast.xml, install.sh.
- bot.usefulbuild.com answers HTTP 200 and has no `data-release="soon"` on `<html>`, so the live page shows the Download and install-command state, not "Coming soon" (CSS rule site/public/index.html:63-64).

---

## 1. Claims table

### A. Open source and distribution

| # | Claim | Status | Source |
|---|---|---|---|
| A1 | Open source under GNU AGPL-3.0 | SHIPPED | LICENSE:1-2 (GNU AFFERO GPL v3); README.md:8, 290-296 |
| A2 | A commercial license is sold separately for companies that want to build on it without AGPL terms (contact hello@usefulbuild.com). No price is published anywhere. | SHIPPED (price UNVERIFIED) | README.md:292-296; CONTRIBUTING.md:3-5; docs/plan/LAUNCH-PLAN.md:165-168 |
| A3 | Public source repo is github.com/wasimjalali/usefulbot, one snapshot commit per release, not this repo's history | SHIPPED | docs/distribution.md:124-137; docs/plan/LAUNCH-PLAN.md:170-173, 201-204; live GitHub API check above. Snapshot for 1.1.1 ("usefulbot #9") is only in memory notes: UNVERIFIED in repo docs, but the repo's pushed_at is 2026-10-04 20:53Z, 1 minute after the release |
| A4 | The private working repo is NOT the public one. The video must not show this repo, its history or the untracked screenshots in its root (real chats, owner email) | Constraint | docs/distribution.md:126-128; docs/plan/LAUNCH-PLAN.md:171-172 |
| A5 | macOS only. Needs macOS 14 or later | SHIPPED | macos/bundle/Info.plist:13 (`LSMinimumSystemVersion` 14.0); macos/Package.swift:6; README.md:38; docs/distribution.md "Limits" |
| A6 | Apple silicon only. Installer refuses Intel. No Intel, Windows, Linux, iOS or Android build | SHIPPED (limit) | scripts/install.sh:21 ("needs a Mac with Apple silicon (M1 or later)"); scripts/build-runtime.mjs:40 (`darwin-arm64` Node); docs/distribution.md "Limits" |
| A7 | Two ways to install: DMG download, or `curl -fsSL https://github.com/wasimjalali/useful-bot-releases/releases/latest/download/install.sh \| sh` | SHIPPED | README.md:44-49; site/public/index.html:295-299; live release assets above |
| A8 | The app is ad-hoc signed, NOT notarized, no Apple Developer ID. A browser-downloaded DMG needs a one-time System Settings > Privacy & Security > Open Anyway. The curl install carries no quarantine flag so it opens without that stop | SHIPPED (friction) | docs/distribution.md:3-5, 91-93, "DMG file itself is not signed or notarized" (~line 36); site/public/index.html (text "The DMG needs a one-time OK in System Settings > Privacy & Security > Open Anyway") |
| A9 | The DMG opens as a classic drag-to-Applications window; first launch from elsewhere offers "Move Useful Bot to Applications?" | SHIPPED | docs/distribution.md:20-30, 95-115; macos/Sources/UsefulBotApp/MoveToApplications.swift |
| A10 | Sparkle updates, checked automatically every 6 hours, each update verified against the app's EdDSA signing key | SHIPPED | macos/build-app.sh:209-214 (`SUScheduledCheckInterval` 21600, `SUEnableAutomaticChecks`); docs/distribution.md:1-5, "The signing key"; macos/Sources/UsefulBotApp/Updater.swift; privacy page "Updates" |
| A11 | Free to download and use. The repo states "Anyone may use, change and share it" and the public repo description says open source. No paywall, account or subscription for Useful Bot itself in the repo. You still pay your own model provider (and image/connector costs) | SHIPPED (no explicit "free" price statement on the site; inferred from AGPL + no pricing code) | README.md:292; agent/skills/about-useful-bot/SKILL.md:9 ("use, change and share it for free"); no billing code in repo (rg for stripe/paywall: none) |
| A12 | Version/build: 1.1.1, build 450 (build number = commit count), released 2026-10-04 from main 973a981 | SHIPPED | Product Log UB-003 history entry 2026-10-04T20:55; docs/distribution.md:"build number"; GitHub release v1.1.1 |

### B. Model agnostic (every route in shared/provider-catalog.ts)

All rows are in `PROVIDER_CATALOG` (shared/provider-catalog.ts:76-788). In the app they appear under Connect with groups "Subscription", "API", "Local" (macos/Sources/UsefulBotApp/ProvidersPaneView.swift:20, 167-197) and in first run (FirstRunView.swift:193-218, 720-723).

Subscription sign-in (device code or browser flow, no key):

| Route | Status | Source |
|---|---|---|
| ChatGPT (Plus/Pro) via Codex device-code sign-in; protocol OpenAI Responses | SHIPPED | provider-catalog.ts:83-129 (baseUrl chatgpt.com/backend-api/codex, hint "ChatGPT Plus or Pro through Codex sign in.") |
| GitHub Copilot via GitHub device-code sign-in | SHIPPED | provider-catalog.ts:154-196 |

Coding-plan keys (kindLabel "Subscription", but the user pastes a plan key; not an OAuth sign-in):

| Route | Source |
|---|---|
| OpenCode Go (plan key) | provider-catalog.ts:202-219 |
| GLM Coding Plan (Z.ai) | provider-catalog.ts:225-240 |
| Kimi Code | provider-catalog.ts:266-281 |
| Qwen Coding Plan (Alibaba ModelStudio) | provider-catalog.ts:304-322 |
| MiniMax Token Plan | provider-catalog.ts:347-362 |
| MiMo Token Plan (Xiaomi) | provider-catalog.ts:387-404 |
| Command Code (plan key; model ids and reasoning are marked UNVERIFIED in a code comment) | provider-catalog.ts:429-449 |

API key routes (kindLabel "API"):

| Route | Source |
|---|---|
| OpenAI API (also image models gpt-image-1, gpt-image-1-mini, dall-e-3) | provider-catalog.ts:129-147 |
| Z.ai API (images glm-image, cogview-4) | provider-catalog.ts:241-258 |
| Moonshot AI | provider-catalog.ts:282-298 |
| Qwen (DashScope) | provider-catalog.ts:323-341 |
| MiniMax | provider-catalog.ts:363-381 |
| Xiaomi MiMo | provider-catalog.ts:405-423 |
| Anthropic (Claude, via API key only; Anthropic Messages protocol) | provider-catalog.ts:450-477 |
| Google (Gemini API key from AI Studio, OpenAI-compatible endpoint) | provider-catalog.ts:477-499 |
| xAI Grok (images grok-imagine-image) | provider-catalog.ts:500-524 |
| DeepSeek | provider-catalog.ts:525-548 |
| OpenRouter (one key, many models, includes Claude; has image models) | provider-catalog.ts:549-583 |
| Vercel AI Gateway | provider-catalog.ts:584-608 |
| Cloudflare Workers AI (account id + token) | provider-catalog.ts:609-636 |
| OpenCode Zen | provider-catalog.ts:637-662 |
| Ollama Cloud (hosted, NOT local) | provider-catalog.ts:663-682 |

Local routes (kindLabel "Local"; user enters a server URL, no key):

| Route | Source |
|---|---|
| Ollama, default URL http://localhost:11434/v1 | provider-catalog.ts:683-703 |
| LM Studio, default URL http://localhost:1234/v1 | provider-catalog.ts:704-727 |
| Custom provider, any OpenAI-compatible server (name, URL, optional key). Shown as "Add custom provider" at the bottom of Connect | provider-catalog.ts:728-757; ProvidersPaneView.swift:~190-195, 212-235 |

Supporting model claims:

| Claim | Status | Source |
|---|---|---|
| Claude and Google SUBSCRIPTION sign-in is deliberately not offered (their terms forbid third-party use); both work with an API key | SHIPPED (limit) | README.md:93 |
| The site/README line "Models: ChatGPT, GitHub Copilot, Claude, Gemini, OpenRouter and more, or a local model" means Claude and Gemini via API key, not sign-in | Wording trap | README.md:39 vs provider-catalog.ts:450-499 |
| Local model: conversation stays on the Mac apart from web search, image generation, connected apps, `review` with a cloud reviewer, or a handoff to a bot on a cloud model | SHIPPED | agent/skills/about-useful-bot/SKILL.md:12 |
| Live model lists are fetched from each connected provider (and public details from models.dev) | SHIPPED | provider-catalog.ts `listsModels`; site privacy page "model provider you connect" |
| Local-model usage is reported (stream usage asked for LM Studio/Custom), so compaction and the Usage pane work. Evidence: 15 of 15 streamed requests reported usage with Qwen3-4B on llama.cpp (was 35 of 36 null) | SHIPPED (UB-012, 1.1.1) | evals/results/2026-10-04-ub012-local-usage.md ("Results"); router/src/upstreams/opencode.ts |
| Honest local-model quality note: an 8B local model at its real window was evaluated; read the write-up before claiming it is "good enough day to day" | Caution | evals/results/2026-10-03-ub009-local-8b.md |

### C. "Use what you already pay for, or bring your own key" (UI)

| Claim | Status | Source |
|---|---|---|
| First run, step 1 of 2 "Connect a provider": group "Sign in with a subscription" (featured ChatGPT, GitHub Copilot, OpenCode Go; "More subscriptions") then "Or use an API key" (featured Anthropic, OpenAI, OpenRouter; "More providers"). "Skip for now" until one is connected | SHIPPED | macos/Sources/UsefulBotApp/FirstRunView.swift:197-198, 713-732 (headings at 720-723) |
| Sign-in sheet: "Sign in to <provider>". Browser opens, user enters a code. Copy says "Useful Bot never sees your password" | SHIPPED | FirstRunView.swift:954-960 |
| API key sheet "Connect <provider>" with "API key" field; local needs only a server URL | SHIPPED | FirstRunView.swift:1144-1175; ProvidersPaneView.swift:561-660 (`showsKeyField` false for local) |
| Settings > Providers pane: Connect popover grouped Subscription / API / Local, connected rows with Disconnect, "Task models" (chat model and reviewer model with reasoning level) | SHIPPED | AppSettingsView.swift:6-40 (tabs General, Providers, Computer, Usage, Feedback, About); ProvidersPaneView.swift:20, 46, 147-163, 295, 321 |
| Pick the model per bot | SHIPPED (see D3) | shared/shell-store.ts:1277-1283 |

### D. A team of bots

| # | Claim | Status | Source |
|---|---|---|---|
| D1 | Each bot has its own name, job/instructions (field is `description`, "Instructions" in the UI, cap 8,000 chars), avatar, own chat, memory and routines | SHIPPED | shared/shell-store.ts:37 (`DESCRIPTION_MAX` 8000); macos/Sources/UsefulBotApp/SettingsPaneView.swift:5-9, 48, 320-330 (sections Profile, Instructions, Routines, Memory, notify row) |
| D2 | Memory: bots keep their own notes across chats. Tools `memory_upsert`, `memory_read`, `memory_search`, `memory_delete`. Each prompt loads the 6 newest notes in full (each body capped at 1,200 chars) and up to 50 more as titles (80 chars), whole block capped at 6,000 chars; older notes open with `memory_read`. Owner sees them under Memory in bot settings ("N notes"), refreshed every 4 s | SHIPPED | agent/tools/memory_upsert.ts, memory_read.ts, memory_search.ts, memory_delete.ts; shared/notes-block.ts:13-18; agent/instructions.md:50-52; MemorySectionView.swift:25-31, 56-61. Notes written after reading outside content are flagged and shown without body (notes-block.ts:36-45) |
| D3 | Per-bot model (UB-002): each bot keeps its own model/connection/effort; a pick on bot B does not move bot A; a running turn stays on the model it started with, the change applies next turn. Evidence: 7/7 calls of a turn stayed on GLM while chip moved to Kimi; overlapping bots ran DeepSeek and Kimi at once | SHIPPED (1.1.0) | shared/shell-store.ts:1253-1283 (`withBotSelection`); agent/agent.ts:157-165 (frozen selection); evals/results/2026-10-01-ub002-model-switching.md "Scenarios and results" rows 1, 3, 4, 6; Product Log UB-002 Shipped 1.1.0. Anthropic/OpenAI prompt caching is unit-tested only, not live (same file, "Not covered live") |
| D4 | The built-in Generalist is pinned at the top on first launch, named "Generalist", description is its starter instructions ("main assistant on this Mac ... also help them build a small team of bots") | SHIPPED (UB-010) | shared/shell-store.ts:234-239, 261-272, 296-310 (seed store, pinned true) |
| D5 | The Generalist (only the main bot) can PROPOSE new bots: `propose_bot` writes a profile card; the owner must confirm ("Add teammate" / "Not now"). It never creates a bot itself. Same for groups ("Create group"). Always a card, even in Full access | SHIPPED | agent/tools/propose_bot.ts:16-30; agent/tools/propose_group.ts:9-20; ProposalCardView.swift:51, 86; agent/instructions.md:40 |
| D6 | Bots hand work to each other: `send_to_bot` messages a teammate and waits (180 s default wait) for the reply; replies land in both transcripts | SHIPPED | agent/tools/send_to_bot.ts:11-17; agent/instructions.md:9 (peer rule) |
| D7 | Group chats: 2 to 6 bots per group; the main bot orchestrates untargeted group turns and is never a member; `post_to_group` fans one message out after owner confirmation. UI: "Create group chat" in the New Bot picker and a Members section in group settings (count n/6) | SHIPPED | shared/shell-store.ts:32 (`GROUP_MAX_MEMBERS` 6); propose_group.ts:11, 38 comments; post_to_group.ts:9-14; PickerViews.swift:93; RootView.swift:681-745; SettingsPaneView.swift:505-509, 568-575 |
| D8 | Many bots working at once: up to 10 model requests in flight app-wide, one per bot session at a time, so ten bots can each run a step simultaneously. When full the app says "Ten bots are already working. Try again in a moment." (router waits it out up to 60 s per attempt) | SHIPPED | shared/policy.ts:89 (`MAX_ACTIVE_UPSTREAM` 10); router/src/concurrency.ts:8-20; macos/Sources/UsefulBotCore/EveStream.swift:334; docs/audit/SCOREBOARD.md:593-621 (Round 5). I found no recorded benchmark of 10 bots at once beyond the Round 5 unit and live notes ("466 node tests, 254 Swift tests") |
| D9 | Sub-agents in parallel are ON in 1.1.1. eve's built-in `agent` and `task_cancel` tools are active (no disabling files in agent/tools/), the Generalist prompt tells bots to "Split sizeable, independent work into parallel `agent` runs", the app shows a collapsible sub-agent card per launching turn (live step, timer, report, failure with Retry). Re-enabled by PR #179 (98fb78a, ancestor of HEAD), shipped in 1.1.0. Older docs/notes saying "disabled on main until PR 2" are superseded | SHIPPED (UB-011) | agent/instructions.md:56-58; `ls agent/tools` has no agent.ts/task_cancel.ts; docs/plan/UB-009-AGENT-CONTEXT-PLAN.md:200 ("both tools are back on since 2026-10-03"); `git merge-base --is-ancestor 98fb78a HEAD` true; macos/Sources/UsefulBotApp/SubagentCard.swift; evals/results/2026-10-03-subagent-stall.md. Caveats: sub-agents inherit the bot's permission, cannot change notes/settings (SUB_AGENT_BLOCKED, agent/lib/permission.ts:120-140). Reports are batched by eve until siblings finish (subagent-stall.md "Live checks"). No explicit cap on how many sub-agents a bot may launch found: UNVERIFIED. A stall incident (5 critics, silent chat for 2 days) was found and fixed in 1.1.0 |
| D10 | Routines: a recurring instruction owned by one bot; schedules daily, weekly (chosen days) or one-shot; wall-clock time in an IANA zone; up to 50 routines per bot, up to 10 schedules each, last 20 runs kept; instruction up to 4,000 chars; runs enter the bot's own chat; "Test run" button (works even when paused); a missed window after sleep catches up with one run; a run is stopped after 1 hour, or 10 minutes silent; bots can create/update/delete routines via tools (creating or rescheduling asks first) | SHIPPED | README.md:105-124; shared/routines-store.ts:28-30, 32, 36-54 (schedule kinds); ChatDetailsPaneView.swift:149-156, 404; SettingsPaneView.swift:365-406; agent/tools/create_routine.ts, run_routine.ts, update_routine.ts, delete_routine.ts, list_routines.ts; agent/instructions.md:28. A scheduled run only works while the Mac is awake and the app services are running ("Sleeping the Mac is downtime", README.md:91) |
| D11 | Notifications: per-bot "Notify when <bot> finishes" toggle, off by default | SHIPPED | SettingsPaneView.swift:410-446; shared/shell-store.ts seed `notify: false`. Product Log notes this was "unverified" in an earlier memory note (ub009-bot-context-direction); treat the banner as owner-checked before filming |
| D12 | Rail: pin, hide, sections, unassigned; New Bot + search by the traffic lights | SHIPPED | RailView.swift:6, 40-45; shared/shell-store.ts (sections, pinned, hidden) |
| D13 | Bot character: circular white-head avatar with bright colour options; head floats and blinks while working; respects Reduce Motion. Face lives in avatar-face.svg | SHIPPED (PR2) | README.md:288; brand/README.md:93; macos/Sources/UsefulBotApp/BotFaceLayer.swift:143-253; docs/plan/PR2-BOT-CHARACTER.md; evals/results/2026-09-28-pr2-bot-face.md |

### E. Apps (connectors, MCP, OpenAPI, widgets)

| # | Claim | Status | Source |
|---|---|---|---|
| E1 | Composio catalogue connectors (Gmail, Calendar, Drive, Slack, Notion, GitHub, Linear and the rest). IMPORTANT: the user must bring their OWN Composio API key (paste once in Connectors; "Get a key at composio.dev"). There is no built-in Composio account. "Hundreds more" is Composio's catalogue size, which the repo caches but does not state as a number | SHIPPED (needs own Composio key) | README.md:185-212; RootView.swift:1163-1172 ("Composio API key", link to platform.composio.dev); agent/skills/connect-apps/SKILL.md "No Composio key"; site privacy page "with your own Composio key" |
| E2 | Connectors dialog from the "Connectors" pill at the foot of the rail: catalogue grid + one "Added" grid for apps AND MCP/OpenAPI servers, each with logo and real state; clicking opens an in-dialog detail page with its tools and Disconnect (servers also Refresh/Reconnect) | SHIPPED (UB-003, 1.1.1) | RailView.swift:327; RootView.swift:777 (`ConnectorDetailPage`), 1022-1128 (`ConnectorsDialog`, "Added"); ConnectorTile.swift:3; README.md:185-193 |
| E3 | Apps with no Composio app (TikTok, X, Spotify) show "Needs your own app" and a form for your own developer-app credentials | SHIPPED | RootView.swift:1562; README.md:195-204 |
| E4 | A bot can ask for an app it lacks: `connector_catalog` then `propose_connector` puts a "Connect app" card above the composer; once authorized the bot resumes | SHIPPED | agent/tools/connector_catalog.ts, propose_connector.ts; README.md:220-226 |
| E5 | Writes ask in Auto; destructive actions (delete, remove, archive, revoke) ALWAYS ask even in Full access; Read only refuses writes. Reads run in every mode | SHIPPED | README.md:213-219; agent/instructions.md:40; agent/skills/connect-apps/SKILL.md "What asks the owner". Note: instructions.md:40 says "Every MCP server or OpenAPI call asks in Auto and is refused in Read only" |
| E6 | Official MCP servers connect directly (outside Composio), OAuth 2.1 with discovery, dynamic client registration, PKCE and RFC 8707 resource indicator; a connection is "ready" only after MCP initialize and tools/list succeed; honest states: Needs sign-in, Sign-in expired, Can't reach server, Tools unreadable, Couldn't list tools. Bot finds tools with `find_tools` and they mount for its next step | SHIPPED (UB-003, 1.1.1) | README.md:231-274; shared/mcp-oauth.ts; shared/connections-store.ts; agent/tools/connection_tools.ts; Product Log UB-003 (Shipped 1.1.1) |
| E7 | Notion's official MCP server verified live on 2026-10-04: 44 tools, a search ran | UNVERIFIED in repo docs. Source is the owner-session memory note release-1-1-1.md and untracked screenshots ub003-11-notion-card.png, ub003-12-notion-call.png, ub003-18-notion-call.png in the repo root (these may show real data; check before filming) | /Users/wasimjalali/.claude/projects/-Users-wasimjalali-Desktop-useful-bot/memory/release-1-1-1.md |
| E8 | Tella (the original UB-003 trigger) does NOT work: Tella accepts tokens only from partner apps; its row stays at "Needs sign-in" | Do not show as working | README.md:252-254; memory release-1-1-1.md |
| E9 | OpenAPI connections: supported (eve mounts them; `connection_search`), owner-approved list in ~/.useful-bot/connections.json, secrets in Keychain | SHIPPED (backend + Connectors list). No consumer-friendly UI flow to add an arbitrary OpenAPI doc was checked; a bot proposes it via a card (`propose_connection`) | README.md:231-236, 256-258; agent/tools/propose_connection.ts; agent/skills/connect-apps/SKILL.md path 2 |
| E10 | Excalidraw is pre-connected (seeded by setup): ask a bot to draw, it appears as an interactive drawing in the chat; Edit opens it full screen, "Open in Excalidraw" exports to excalidraw.com; drawings saved as .excalidraw files in the Library | SHIPPED | scripts/setup-local.mjs:496-503; shared/connections-store.ts:54; README.md:236-243, 101-103; agent/instructions.md:54; macos/Sources/UsefulBotApp/WidgetWebView.swift:90, ExcalidrawPreview.swift. Excalidraw's server sees the drawing request (privacy page "Drawings and MCP servers") |

### F. What a bot can actually do (tools today)

Tool inventory = agent/tools/*.ts plus eve built-ins (`todo`, `ask_question`, `load_skill`, `agent`, `task_cancel` per scripts/tool-schema-size.mjs:37).

| # | Claim | Status | Source |
|---|---|---|---|
| F1 | Shell: `bash` runs in a macOS sandbox profile with the owner's PATH and home; default timeout 30 s, ceiling 30 min; credential paths (.git, .env, secrets, .ssh) refused in every mode | SHIPPED | agent/tools/bash.ts:100-200; README.md:126-183; agent/instructions.md:44-48 |
| F2 | Files: `read_file`, `list_dir`, `write_file` inside an attached folder (or under home when none). The owner attaches a folder from the composer "+" menu ("Photos and files", folder option) | SHIPPED | agent/tools/read_file.ts, list_dir.ts, write_file.ts; ComposerView.swift:705-710, 357 |
| F3 | Run command-line tools the owner has installed (codex, claude, gh, etc.) and install known CLIs via `install_cli` (registry: codex, claude, opencode, gemini, gh, wrangler, vercel); installs ask in Auto, run in Full access, refused in Read only | SHIPPED | agent/lib/cli-registry.ts:54-113; README.md:174-178 |
| F4 | Web search is built in, no key needed; backend is Firecrawl keyless search through the local router, up to 5 results per call; site says "free to use, with a daily allowance". The allowance number is UNVERIFIED | SHIPPED (allowance UNVERIFIED) | agent/tools/web_search.ts:9-22; router/src/search.ts:112 (`provider: "firecrawl-keyless"`); site/public/index.html:351; privacy page "Web search sends the search words to Firecrawl" |
| F5 | Web page fetch (`web_fetch`): https page as markdown/text/html, 5 MB cap, content treated as untrusted | SHIPPED | agent/tools/web_fetch.ts:10-24 |
| F6 | Image generation (`generate_image`): needs an image-capable provider key (OpenAI, Z.ai, xAI or OpenRouter have image model lists); without one the bot says so; costs real money at the provider; refused in Read only. Images saved to the Library | SHIPPED (needs key) | agent/tools/generate_image.ts:12-20; provider-catalog.ts:143, 255, 519, 571 |
| F7 | HTML pages: a bot that writes a .html file gets it listed in the Library as a "page", with a chat preview card and "Open in browser" | SHIPPED | agent/tools/write_file.ts:12, 59; macos/Sources/UsefulBotApp/PageRow.swift |
| F8 | Library (account menu under the owner's photo): every generated image and drawing as real files under ~/Documents/Useful Bot/<Bot>/<YYYY-MM>/; filter by kind and bot, search by prompt; Open, Show in Finder, Copy, Open chat, Move to Trash; Locate/Regenerate for missing files | SHIPPED | README.md:101-103; LibraryView.swift:39-81, 493; RailView.swift:348 |
| F9 | Attachments: up to 5 files per message, 1 MiB each, text up to 64 KiB; drag and drop or "Photos and files"; images need a model that can see | SHIPPED | shared/attachments.ts:1-3, 60; ComposerView.swift:332, 501-546, 710; agent/instructions.md:46 |
| F10 | `review`: asks a pinned reviewer model to find defects in supplied text (read-only). Reviewer alias; "reviewer credential" past notes said unprovisioned in some installs | SHIPPED (PARTIAL, depends on a configured reviewer model) | agent/tools/review.ts:15-25; ProvidersPaneView.swift:46 "Task models" |
| F11 | `todo` planning list, `ask_question`, `load_skill` (skills: about-useful-bot, connect-apps) | SHIPPED | agent/instructions.md:20, 22; agent/skills/ |
| F12 | Bot can manage the team: `list_bots`, `update_bot_profile`, `delete_bot`, `clear_history`, `rail_action`. delete_bot and clear_history ask in Auto | SHIPPED | agent/tools/; agent/instructions.md:38, 40; agent/lib/permission.ts:44-52 |
| F13 | **No browser control tool.** There is no Playwright/browser-automation tool. Web access is web_search + web_fetch only (read pages, no clicking). A bot can only drive a browser indirectly if the owner has a CLI installed and Full access | SHIPPED fact (absence) | `rg -i "playwright\|puppeteer\|browse" agent/tools agent/instructions.md agent/agent.ts agent/skills` found nothing |
| F14 | **No computer use / screen control.** Zero references to cua-driver, "computer use" or screen control in agent/, shared/, router/src, web/, macos/Sources, scripts/ or the site (`rg -i "cua\|computer.use"` over those paths: no hits). UB-006 "Capability-first computer use through CUA Driver" is status Captured (backlog only, "does not change current prompts or authorize installation"). The Settings > Computer tab is only a status pane ("This Mac", "Local execution: On, Writes and shell still need your approval"); it is not computer use | PLANNED only (UB-006) | /Users/wasimjalali/Desktop/Useful Bot Product Log.html JSON, UB-006; macos/Sources/UsefulBotApp/AppSettingsView.swift:309-342 |

### G. Control: Read only / Auto / Full access

Permission is set per bot in the composer's Permission menu (labels Read only, Auto, Full access; macos/Sources/UsefulBotApp/ComposerView.swift:910-917). The default shown is Auto (BackendModels.swift:36-41 default case).

| Level | What it allows | Source |
|---|---|---|
| Read only | Nothing changes. Reads and read-only shell lines run (sandbox refuses any write); every write, install, image, memory/rail/routine change, group post and handoff is refused (`workspace_read_only`); catalogue app writes and all MCP/OpenAPI calls refused | agent/instructions.md:36, 40; agent/tools/bash.ts:109-113; agent/lib/permission.ts:44-79 |
| Auto | Reads run anywhere. In an attached folder, everyday writes and commands run without a card; deletes, history rewrites, privilege escalation, inline code (`python -c`, `curl \| sh`) and anything outside the folder ask. No folder attached: only reads and new files skip the card, anything that changes a file asks. Catalogue writes ask; every MCP/OpenAPI call asks. `delete_bot` and `clear_history` ask | agent/instructions.md:37, 40; agent/tools/bash.ts:116-147; agent/lib/permission.ts:44-52 |
| Full access | No execution cards, EXCEPT the wipe card: a remover aimed at a disk, volume, home or top-level folder, or disk formatting. Credential stores stay refused in every mode. Still always cards: new bots, profile changes, groups, group posts, new connections, destructive connector actions | agent/instructions.md:38, 40; agent/tools/bash.ts:127-146 (`wipeRisk`); agent/lib/command-risk.ts:500-525; README.md:136-147 |

| Claim | Status | Source |
|---|---|---|
| Approval cards: one card approves exactly one action, bound by hash of the exact command/arguments; "approved" typed in chat is not permission; if permission or folder changes while a card is open, the approval is refused | SHIPPED | agent/instructions.md:42; agent/tools/bash.ts:114-122, 164-185; README.md:216-219 |
| Cards dock above the composer with options on the same block | SHIPPED | README.md:99 |
| UI wording trap: Settings > Computer says "Local execution: On / Writes and shell still need your approval", which is not true at Full access | Inaccuracy in the app | AppSettingsView.swift:327-338; contrast agent/instructions.md:38 |

### H. Native Mac app and local storage

| Claim | Status | Source |
|---|---|---|
| Native SwiftUI Mac app (not Electron/web). The browser UI was removed 2026-09-28; `web/` is only the local API | SHIPPED | CLAUDE.md "Surfaces and priority"; macos/Sources/ |
| Chats, bots, memory, instructions, routines, images sent and files the bots make are stored on the Mac, in ~/.useful-bot (shell, routines, providers, connectors, connections, media index), files in ~/Documents/Useful Bot/<Bot>/<YYYY-MM>/, release runtime in ~/Library/Application Support/Useful Bot/app; Unsent messages under Application Support | SHIPPED | site/public/privacy/index.html "What stays on your Mac"; shared/stack.ts:35-36, 100; docs/distribution.md:66-72; README.md:101-112 |
| Secrets: the app's local tokens and secrets for MCP/OpenAPI connections are in the macOS Keychain (`com.usefulbot.*`; connections as `com.usefulbot.connection.{id}`). Model provider keys/sign-ins and the Composio key are NOT in the Keychain: they sit in files only the user can read (`~/.useful-bot/providers.json`, `connectors.json`, mode 0600) | SHIPPED (nuance) | shared/stack.ts:35, shared/keychain.ts:41-46; shared/providers.ts:215, 434 (0o600); README.md:206-207, 235; privacy page "Model provider keys and sign-ins are stored on your Mac in files only your user account can read ... kept in the macOS Keychain" |
| Services run locally on loopback (127.0.0.1:4319-4321); no cloud service of ours; no account system | SHIPPED | README.md:60, 91; docs/distribution.md:68 ("Nothing leaves the Mac"); privacy page "We have no copy and no account system" |
| What leaves the Mac: (1) the conversation to the model provider you connect (incl. attachments, tool results), (2) catalogue apps via Composio, MCP/OpenAPI servers directly, (3) web search words to Firecrawl, (4) Excalidraw's server when drawing, widget code may load from esm.sh, (5) logos from Composio's logo server, (6) update checks to GitHub, (7) feedback you choose to send | SHIPPED | site/public/privacy/index.html "What leaves your Mac, and why"; agent/skills/about-useful-bot/SKILL.md:11 |
| Tracking: none. No analytics, telemetry or crash reporting | SHIPPED (owner policy statement, no code path found) | privacy page "What we don't do"; site/public/index.html "Tracking None"; I found no analytics SDK in macos/Package.resolved scope (not exhaustively audited: UNVERIFIED as an absolute) |
| Feedback is the only thing sent to Useful Build: Settings > Feedback posts to a Cloudflare Worker + D1 (feedback.usefulbuild.com/v1/feedback): message, type, optional reply email, random install ID, optional app/macOS/chip info; raw IP never stored (salted HMAC) | SHIPPED | macos/build-app.sh:220-222; services/feedback/README.md:1-30; docs/distribution.md "Feedback"; evals/results/2026-09-28-feedback-worker-e2e.md; AppSettingsView.swift:9 (Feedback tab) |
| Daily token/request budgets are user-configurable in Settings > Usage (UB-008) | SHIPPED (1.1.0) | AppSettingsView.swift:358-403; Product Log UB-008 |
| Usage pane shows requests/tokens by model (works for local models since 1.1.1) | SHIPPED | evals/results/2026-10-04-ub012-local-usage.md "Usage pane" |

### I. Other things a launch video can honestly show

| Item | Status | Source |
|---|---|---|
| Fast chat open. Recorded perf check on 8427895 (pre-release for 1.1.1, machine reported as "Apple M4"): cold launch median 993 ms (n=10, worst 1,170 ms); warm return to a chat median 230 ms (replies) / 182 ms (tool-heavy) (n=30); warm switch median 192 ms; cold first open of a chat median 244 ms. Result: PASS. Note the run header says "git 8427895 with uncommitted changes", and ran on the dev app | SHIPPED | evals/results/2026-10-04-perf-check-2232-8427895/README.md (table + "Result: PASS") |
| Perf work history: idle CPU 29% to 1%; opening a 3,504-event chat from over 4 min to 4 s (older audit, Sept 2026) | SHIPPED (historic, pre-1.0) | docs/audit/PERFORMANCE.md (table near line 480-495) |
| Inline thinking handled: models that emit `<think>` blocks have them folded out of the chat bubble into the working row (router split). Verified frame by frame, 0 of 2,962 OCR'd frames showed raw thinking | SHIPPED | evals/results/2026-09-25-inline-think.md "What changed" and "Runs" |
| Chat polish: each bot message is its own bubble; step row says what the bot is doing; centred Today/Yesterday dividers; plain URLs and bare domains are clickable (UB-005); a send refused before reaching the bot stays as "Not sent" with Retry/Edit/Dismiss (UB-013) | SHIPPED | README.md:97-99; ChatView.swift:650-656, 1233; Product Log UB-005, UB-013 |
| First-run flow: Welcome ("A team of AI helpers that works on your Mac. Your chats and keys are stored here.") then Connect a provider then pick a model (2 steps) | SHIPPED | FirstRunView.swift:478-482, 713-732, 1376 |
| Starter prompt chips in empty chat (example: "Rename my screenshots by date") | SHIPPED | ChatView.swift:2439-2440 |
| Local-only demo of a bot on LM Studio/Ollama | SHIPPED | provider-catalog.ts:683-727 |
| Site shots in the repo (safe, public assets): site/public/shots/chat.png, bots.png, models.png, connectors.png, routines.png | SHIPPED | README.md:10-32 |

### J. Planned / not available (do NOT show as available)

| Item | Status | Source |
|---|---|---|
| Computer use / controlling the Mac's screen (UB-006, CUA Driver) | PLANNED, Captured, no code | Product Log UB-006; zero code hits (see F14) |
| Dynamic provider subscription usage/limits indicator in the composer (UB-007) | PLANNED | Product Log UB-007 (Captured) |
| `read_file` returning SHA-256 for safe edits (UB-014) | PLANNED | Product Log UB-014 (Captured); agent/tools/read_file.ts unchanged |
| iPhone / mobile app | PLANNED (not shipped; ios/ project and specs exist, README "3 phone: deferred") | README.md:70; CLAUDE.md "Mobile app. Planned, not built yet"; docs/spec/IOS-APP-SPEC.md |
| Web UI / browser version | REMOVED 2026-09-28 | CLAUDE.md "No web UI" |
| Intel Macs, Windows, Linux | Not supported | scripts/install.sh:21 |
| Tella MCP | Does not work (vendor refuses self-registered clients) | README.md:252-254 |
| Claude or Google subscription sign-in | Not offered by design | README.md:93 |
| Notarized/Developer-ID signed app (no Gatekeeper prompt for DMG) | Not done | docs/distribution.md:3-5 |
| Cloud/virtual computer for bots | Deferred (Grok-Bot parity doc) | docs/plan/GROKBOT-AGENT-CAPABILITIES.md:3 |
| Browser automation tool | Does not exist | see F13 |
| Voice (Useful Voice) / Brain (Useful Brain) | Separate Useful Build products, NOT part of Useful Bot | site/public/index.html footer "Products" |

---

## 2. Product Log (UB-001 to UB-014) status

Source: /Users/wasimjalali/Desktop/Useful Bot Product Log.html, JSON script block, updatedAt 2026-10-04T20:55:00Z, nextId 15.

Shipped in 1.1.1 (build 450): UB-003 (official MCP connections, Connectors grid and detail page), UB-012 (local models report token usage), UB-013 (refused send stays as Not sent bubble).

Shipped earlier in 1.1.0 (build 413, so also in 1.1.1): UB-002 (per-bot models, frozen turns, cache), UB-004 (dev app isolated from daily app; internal), UB-005 (clickable URLs), UB-008 (user-set daily token/request budgets), UB-009 (concise Generalist prompt and bot context), UB-010 (Generalist pinned at top on first launch), UB-011 (sub-agents: visible progress, reliable hand-back).

Not shipped (Captured): UB-001 (this launch video; target "Launch week, recorded on 1.1.1"), UB-006 (computer use via CUA Driver), UB-007 (usage/limits indicator in composer), UB-014 (read_file SHA-256).

UB-001 guardrail text (owner): "show credible current capabilities, not unshipped backlog features as available" and "avoid promising that all subscriptions or all regions are supported."

---

## 3. Notes and caveats for the video

1. Website state: live page is in release state (download button, install command). The README/site line "Download for Mac" points to the DMG, which needs the one-time Open Anyway click. Showing the curl install avoids that screen.
2. "Connect Gmail, Calendar, Drive and hundreds more" requires the viewer to create a Composio account and paste an API key first. Do not imply one-click Gmail without that step. MCP servers (Excalidraw built in, Notion verified in owner session) do not need the Composio key.
3. "Use the model you already pay for" is strictly true for: ChatGPT Plus/Pro (via Codex sign-in), GitHub Copilot, and coding-plan keys (OpenCode Go, GLM, Kimi Code, Qwen, MiniMax, MiMo, Command Code). It is NOT true for Claude.ai or Google AI subscriptions (API key only). Another agent is checking vendor terms for the ChatGPT/Copilot sign-in routes; I only list routes.
4. "Sub-agents" are real and visible (card with live steps) but are model-driven: the bot decides to launch them. Reports arrive batched. A models-only demo with a weak model may not delegate unless asked; the dev notes say GLM 5.3 Flash needed "Call the tool named agent three times".
5. "Ten bots at once": the system supports 10 concurrent model requests, one per bot. There is no recorded 10-bot benchmark or video-ready measurement; the only evidence is the Round 5 audit and unit tests (docs/audit/SCOREBOARD.md:593-621). Say "several bots working at once", or film it live, rather than quoting a number you cannot source.
6. Speed numbers that ARE recorded: evals/results/2026-10-04-perf-check-2232-8427895/README.md (table above). These are UI landing times in milliseconds, not model speed. Quote them as chat-open and launch times only.
7. Untracked screenshots in the repo root (pr*.png, ub*.png, subagent-*.png and others) are working captures of the owner's Test Bot and may contain real data. The public-repo snapshot script excludes eval images for that reason (docs/distribution.md:137-139). Re-record footage in a clean profile rather than reusing them.
8. Dev vs daily app: all live recording must be in Useful Bot Dev (`~/Applications/Useful Bot Dev.app`, CLAUDE.md "Verification"). Never the daily app.
9. Open items at release time that affect what you can honestly show: Codex review credits exhausted (process only), Sparkle offers 1.1.1 to the daily app on its next check, Test Bot (dev) still carries a PINEAPPLE line in its instructions from UB-009 evals (memory note release-1-1-1.md), so reset it before filming.
10. Privacy line "We never see your chats" is accurate for Useful Build; the model provider, Composio, Firecrawl and Excalidraw do see what a request sends them (privacy page). Do not say "nothing leaves your Mac" unqualified, and do not say "no data leaves" while a cloud model is connected.
11. Settings > Computer tab text claims shell and writes always need approval, which is wrong at Full access. Avoid filming that tab, or pair it with an accurate caption.
