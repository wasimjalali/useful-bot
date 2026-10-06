# Other close competitors to Useful Bot (as of 2026-10-05)

Scope: everything beyond Grok Bot, Meta Muse, OpenAI Dots and OpenBot (covered by other agents).
All sources read on 2026-10-05. "Press" marks non-official sources. "Unknown" means I could not confirm it.
Method note: the fetch tool summarises pages, so exact wording is quoted only where a page returned it verbatim. GitHub numbers come straight from the public GitHub API (api.github.com), read 2026-10-05.

## Ranked shortlist (closest first)

1. **Hermes Agent + Hermes Desktop "Bot Mode" (Nous Research).** The closest match by a distance. Since v0.21.0 (2026-08-31) the Mac desktop app ships "a society of named agents with their own faces and group chats, where your bots talk to each other, and to you, like a team, not a toolbox." Each profile is a separate agent with its own model, memory, skills, cron jobs and API keys. It is MIT-licensed, model-agnostic (Claude, OpenAI, Gemini, Grok, Copilot, OpenRouter, Ollama, LM Studio, llama.cpp), supports MCP, runs scheduled jobs with memory, and can drive Mac apps in the background through the same cua-driver approach we use. Differences: it is Electron/React with a Python backend, not native; it started as a terminal tool; all bots share the same OS user so separation is "organizational rather than a genuine security boundary" (press). This is the one a viewer comparing "AI bot team on my Mac" will find first.

2. **OpenClaw (open-source foundation project).** The biggest open-source personal agent (391k GitHub stars, MIT). Runs a gateway on your machine, has a macOS menu-bar app plus Windows, Linux, iOS and Android apps, multiple isolated agents with per-agent model and auth, team presets (coordinator, researcher, writer, reviewer), 29+ chat channels, skills and MCP via plugins. Model-agnostic and free ("No subscription. No hosted tier. No token."). Weakness: well-documented security trouble (exposed instances, malicious ClawHub skills, a CVSS 8.8 CVE) and a messaging-first, gateway-first design rather than a Mac-first team UI.

3. **Claude Cowork in Claude Desktop (Anthropic).** Anthropic's consumer agent, GA on macOS and Windows since 2026-04-09, in beta on web and mobile since 2026-07-07 (press for the web date). Does file work, connectors, plugins, scheduled tasks, computer use and Dispatch from a phone. Three approval modes (manual, auto, skip) mirror our Read only / Auto / Full access idea. Locked to Claude models, requires a paid Claude plan, and per Anthropic's support page sessions run in an isolated environment on Anthropic's servers. One assistant, not a roster of bots with their own jobs.

4. **Perplexity Personal Computer for Mac.** Launched 2026-04-16 for Perplexity Max ($200/month). Always-on Mac agent that reaches local files, iMessage, Mail, Calendar and the browser, and can run "teams of AI agents" across 20+ models. Closed source, subscription only, models chosen by Perplexity. Included because it is the best-known paid "agent on your Mac" and shows the price contrast ($200/month versus bring your own subscription).

5. **Agent! for macOS (AgentiLoop).** The only other genuinely native Swift Mac agent: drives apps through Accessibility, AppleScript and Xcode, 23 LLM providers including local models and Apple Intelligence, MCP support, "no NPM, no Electron". Source-available (PolyForm Noncommercial), 642 stars, single-agent loop with parallel tabs rather than a bot team. Closest on "native Mac, any model", far from us on teams, memory per bot and app catalogue.

6. **Gemini Spark in the Gemini Mac app (Google).** Google's consumer agent: "a 24/7 AI agent that helps you navigate your digital life" (Google blog, 2026-05-19), on Mac since 2026-07-01 (TechCrunch, press). Beta, Google AI Ultra only ($100 or $200/month), English, 18+, supported countries (press says US only). Locked to Gemini, closed source, tied to Google apps and a short partner list. Needed on the shortlist because the brief asks about Google, but the least similar of the six.

Near-misses worth a line in the video research, but not in the six: **Munder Difflin** (MIT, 8.5k stars, team of coding agents on macOS/Windows/Linux, reuses your Claude Code, Codex, Gemini CLI and other subscriptions; coding-only, "floors" metaphor) and **Meta's Manus "My Computer"** (see rejected list).

---

## Record 1: Hermes Agent / Hermes Desktop (Nous Research)

| Field | Finding | Source (read 2026-10-05) |
|---|---|---|
| 1 Name, maker, launch, status, version | Hermes Agent by Nous Research. GitHub repo created 2025-07-22. Desktop app shipped June 2026 as a public preview (press, unverified against an official post). Bot Mode shipped built in, default on, in v0.21.0 on 2026-08-31 ("The Pantheon Release"). Latest release v0.21.5 (tag v2026.9.24), 2026-09-24, not marked pre-release. The desktop docs call it mature; the app updates itself via electron-updater. | https://api.github.com/repos/NousResearch/hermes-agent (repo created_at); https://api.github.com/repos/NousResearch/hermes-agent/releases (v0.21.0 to v0.21.5 dates, body of v2026.8.31); https://hermes-agent.nousresearch.com/docs/user-guide/desktop; https://github.com/nousresearch/hermes-agent/blob/main/apps/desktop/README.md; press for June date: https://medium.com/@tentenco/hermes-agent-desktop-app-everything-you-need-to-know-about-nous-researchs-self-improving-ai-agent-3cb59bd31e5f |
| 2 Open source | Open. MIT. https://github.com/NousResearch/hermes-agent. 251,395 stars, 53,985 forks. Last push 2026-10-05T18:05Z. | https://api.github.com/repos/NousResearch/hermes-agent |
| 3 Models | Agnostic. Anthropic (OAuth with Max plus extra credits, or API key), OpenAI (API or via GitHub Copilot), Google Gemini and Vertex, xAI Grok (API key or SuperGrok / X Premium+ OAuth), DeepSeek, Qwen, MiniMax, Kimi, Nous Portal (300+ models), OpenRouter, any OpenAI-compatible endpoint. Local: Ollama, vLLM, SGLang, llama.cpp, LM Studio. Own keys: yes. Per-chat model switching in the desktop app. | https://hermes-agent.nousresearch.com/docs/integrations/providers; https://hermes-agent.nousresearch.com/docs/user-guide/desktop |
| 4 Pricing | App is free and MIT. Optional Nous Portal for hosted models: Free $0 (free models only), Plus $20/month ($22 credits), Super $100/month ($110 credits), Ultra $200/month ($220 credits). Reuses existing subscriptions in part: Claude Max OAuth, SuperGrok/X Premium+ OAuth, GitHub Copilot, and Codex-style OpenAI sign-in is referenced in release notes (exact ChatGPT-subscription reuse: unknown). "No account is needed to run the base app." | https://hermes-agent.nousresearch.com/ ; https://hermes-agent.nousresearch.com/desktop ; providers page above |
| 5 Platforms | Desktop: macOS 12+ (bootstrap installer Apple Silicon only; Intel via signed, notarized darwin-x64 bundle or `hermes desktop`), Windows 10/11, Linux. Also CLI, TUI, web dashboard, and gateways to Telegram, Discord, Slack, WhatsApp, Signal, Email. Not native: Electron and React with a bundled Python backend (press for the Electron/React wording; the README confirms electron-updater and bundled Python 3.14). No regions stated. iOS/Android: none found. | https://hermes-agent.nousresearch.com/desktop ; https://github.com/nousresearch/hermes-agent/blob/main/apps/desktop/README.md |
| 6 Agent abilities | Multiple agents via profiles, each with its own config, model, memory, SOUL.md personality, skills, cron jobs, API keys and gateway. Bot Mode: named agents with avatar faces, shared roster, Discord-style group chats with @-mentions, `hermes peer` bot-to-bot DMs stored in each bot's Bot Chat. Sub-agents (`delegate_task`) with live steering, 10 concurrent children by default. Cron with memory and continuity. Self-written skills (agentskills.io standard). Persistent memory, FTS5 session search. No stated cap on bots or jobs (unknown). | https://api.github.com/repos/NousResearch/hermes-agent/releases (v2026.8.31 body); https://hermes-agent.nousresearch.com/docs/user-guide/profiles; https://github.com/nousresearch/hermes-agent |
| 7 Computer use | Yes, on your own Mac. Background mouse and keyboard control (cursor does not move, window not raised) using a CuaDriver identity that needs Accessibility and Screen Recording. Works with any tool-capable model. Also drives its own in-app browser. Phone calls and texts: not as a core feature; messaging gateways only. | https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use (title seen in search; summary via search result, press-level detail on SkyLight use is from a DEV post); release notes v2026.8.31 |
| 8 App connections | MCP is the mechanism. The desktop has a merged MCP and catalogue page with health checks, usage overlay and `hermes://` deep links to install a server with confirmation. Count of apps: unknown. Composio: not found. Custom MCP: yes. | release notes v2026.8.31; https://github.com/NousResearch/hermes-agent |
| 9 Data | Local first. Config and sessions in `HERMES_HOME` (default `~/.hermes`). Cloud features only if you sign in to Nous Portal (privacy policy at portal.nousresearch.com/privacy, not read). Model prompts go to whichever provider you choose. Profiles give no filesystem sandboxing. | https://hermes-agent.nousresearch.com/docs/user-guide/desktop ; https://hermes-agent.nousresearch.com/desktop ; profiles page |
| 11 Positioning | Site: "The Agent That Grows With You". GitHub: "The agent that grows with you". Release notes: bots "like a team, not a toolbox". | https://hermes-agent.nousresearch.com/ ; https://api.github.com/repos/NousResearch/hermes-agent |

Permissions (field 10, extra): approval modes Smart (default, a second LLM judges risk), Manual, Off; hardline blocklist that no mode overrides; YOLO toggle in the status bar; pairing codes for gateways. Source: https://hermes-agent.nousresearch.com/docs/user-guide/security.
Weaknesses (field 12, press): Bot Mode is "a UI and coordination layer, not a new safety system"; no audit log or admin console; spawn-storm and state.db bugs reported (https://www.therundown.ai/tools/hermes-agent and https://zentor.ai/blog/hermes-agent-desktop-review in search results, not opened).

## Record 2: OpenClaw

| Field | Finding | Source |
|---|---|---|
| 1 | OpenClaw, created by Peter Steinberger (now at OpenAI; project moved to an independent 501(c)(3) foundation, OpenAI supports it). Repo created 2025-11-24, renamed Clawdbot, Moltbot, then OpenClaw on 2026-01-30 (press). GA. Latest release 2026.9.8 on 2026-10-03; LTS-style 2026.8.35 on 2026-10-02. macOS build 2026.9.6 needed a re-spin on 2026-09-24 after a launch crash. | https://api.github.com/repos/openclaw/openclaw (+ /releases/latest); https://github.com/openclaw/openclaw/releases; https://openclaw.ai ; press: https://www.cnbc.com/2026/02/15/openclaw-creator-peter-steinberger-joining-openai-altman-says.html ; https://en.wikipedia.org/wiki/OpenClaw |
| 2 | Open. MIT. https://github.com/openclaw/openclaw. 391,430 stars, 82,275 forks. Last push 2026-10-05T18:04Z. | GitHub API |
| 3 | Agnostic: Claude, OpenAI/GPT and Codex, Gemini, OpenRouter, local models (Ollama, LM Studio), failover chains, API key rotation. Site says "hosted, subscription-backed, gateway, or local models" and mentions ChatGPT account sign-in. Claude-subscription reuse: unknown. Own keys: yes. | https://openclaw.ai ; https://docs.openclaw.ai/concepts/model-providers |
| 4 | Free. "No subscription. No hosted tier. No token." You pay your model provider. | https://openclaw.ai |
| 5 | macOS 15+ (v2026.9.8, Apple Silicon or Intel), Windows 10/11, Linux (AppImage, deb), iOS and Android native apps (since June 2026), CLI. macOS app is a menu-bar companion with Quick Chat and a Dashboard; whether it is native Swift: unknown. No regions stated. | https://openclaw.ai ; https://docs.openclaw.ai/platforms/macos |
| 6 | Multiple isolated agents in one gateway, each with its own workspace files (AGENTS.md, SOUL.md, USER.md), auth profiles, model registry and sessions; routing by "bindings" from channel accounts. Bundled team preset: coordinator, researcher, writer, reviewer with bounded delegation. Sub-agents, cron, persistent memory, skills via ClawHub. Group chat in the Mac app: unknown. | https://docs.openclaw.ai/concepts/multi-agent ; https://openclaw.ai |
| 7 | Yes, on your machine: the Mac app is a node with screen and camera capture, computer control and `system.run`, behind macOS permission prompts; browser use; voice. Phone calls: unknown. | https://docs.openclaw.ai/platforms/macos |
| 8 | 29+ chat channels (WhatsApp, Telegram, Discord, Slack, iMessage, Signal, Teams and more) plus Gmail, GitHub, Obsidian, Spotify and others via skills and plugins. MCP through the mcporter skill; Composio via plugin or MCP (press-level: https://composio.dev/content/how-to-use-composio-mcp-with-openclaw). | https://openclaw.ai ; https://github.com/openclaw/openclaw |
| 9 | Local. "State, memory, and credentials live on your hardware." Default install sends a daily version check; optional telemetry, both disableable. | https://github.com/openclaw/openclaw ; https://openclaw.ai |
| 11 | "The AI that really does things. Any OS. Any Platform. The lobster way." | GitHub API description |

Permissions: exec approval prompts for Mac-hosted commands; per-agent tool profiles (read-only, no shell, full); DM pairing by default; docs state it is "not a hostile multi-tenant security boundary" (https://docs.openclaw.ai/gateway/security).
Weaknesses (press): 135,000 exposed instances, 341 of 2,857 ClawHub skills found malicious, CVE-2026-25253 (CVSS 8.8) (https://www.digitalocean.com/resources/articles/openclaw-security-challenges, https://blog.cyberdesserts.com/openclaw-malicious-skills-security/, via search; not opened).

## Record 3: Claude Cowork (Claude Desktop, Anthropic)

| Field | Finding | Source |
|---|---|---|
| 1 | Claude Cowork inside Claude Desktop. Research preview 2026-01-12 (Max, macOS), Pro on 2026-01-16, GA on macOS and Windows 2026-04-09 (search snippets of Anthropic pages). Web and mobile beta from about 2026-07-07 (press). Dispatch (task from phone) and computer use launched 2026-03-23. Desktop app version in changelog: v2.9939.4 on 2026-09-27. | https://claude.com/docs/cowork/changelog ; https://claude.com/blog/dispatch-and-computer-use ; https://support.claude.com/en/articles/13345190-getting-started-with-cowork ; press for web date: https://tech-insider.org/au/claude-cowork-web-mobile-launch-2026/ |
| 2 | Closed. Proprietary. | n/a (no repo found) |
| 3 | Locked to Anthropic models (Mythos, Fable, Opus, Sonnet, Haiku; Sonnet 5.5 and Opus 5.5 added Sept 2026). No personal BYO key or local models. Managed organisations can route inference through a gateway (changelog mentions an Azure AI Foundry gateway setting), which is an enterprise feature. | https://claude.com/product/cowork ; changelog above |
| 4 | Needs a paid Claude plan. Pro $17/month billed annually ($20 monthly), Max 5x $100, Max 20x $200, Team $20/seat, Enterprise custom. Free plan has no Cowork. Sources disagree on whether Pro includes Cowork: the support article says desktop Cowork is on "all paid plans"; one pricing page summary said no. Treat Pro as included (support article is the more specific source) but re-check before publishing. Heavy use burns limits fast (press). Uses a Claude subscription only, not other vendors' subscriptions. | https://claude.com/product/cowork ; https://claude.com/pricing ; https://support.claude.com/en/articles/13345190-getting-started-with-cowork |
| 5 | Desktop: macOS and Windows (Electron; app requires macOS 13+ since 2026-09-08). Web and mobile in beta. Chrome side panel for Max and Team. Native: no (Electron). Regions: none stated on the consumer pricing page. | changelog ; support article |
| 6 | One assistant that works on tasks. Plugins (Legal, Finance, custom), scheduled tasks (`/schedule`, "runs unattended"), memory, sub-agents (changelog lists them for Code sessions; Cowork: unknown), projects. No bot roster or group chat. | https://claude.com/product/cowork ; changelog |
| 7 | Yes. Cowork can use your screen (click, type, open apps) "only as a last resort" after connectors and browser; Claude in Chrome. Whose computer: yours, via the Desktop app, which must be awake. Phone calls and texts: no. | https://claude.com/product/cowork ; https://claude.com/blog/dispatch-and-computer-use |
| 8 | Connectors marketplace (Microsoft 365, Amplitude and more; total count unknown) and MCP. Custom MCP: yes (`/mcp`, `mcpToolTimeoutSec` in changelog). | product page ; changelog |
| 9 | Per Anthropic's safety article, "Cowork tasks run in the cloud" in an isolated temporary environment on Anthropic servers, reaching your folders only via the Desktop app. The changelog shows both an on-device workspace and cloud-synced tasks, and a search snippet describes a local VM, so the exact split is unclear. Consumer chats are used for training only if you allow it (up to 5 years retained if allowed, else 30 days). | https://support.claude.com/en/articles/13364135-use-cowork-safely ; changelog ; https://www.anthropic.com/news/updates-to-our-consumer-terms (via search) |
| 11 | "The work behind your best work." | https://claude.com/product/cowork |

Permissions: Manual, Auto (safety review), Skip; deletion always asks; "You remain responsible for all actions taken by Claude." Weaknesses: usage limits (press), prompt-injection warning from Anthropic's own safety page.

## Record 4: Perplexity Personal Computer for Mac

Perplexity's own pages returned 403 to my fetch, so this record leans on press. Mark every line press.

| Field | Finding | Source (press) |
|---|---|---|
| 1 | Perplexity Computer launched 2026-02-26 (cloud, Max only). Personal Computer for Mac launched 2026-04-16 for Max subscribers and the waitlist. Wider rollout to Pro and Enterprise reported in May: unverified. | https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at ; https://9to5mac.com/2026/04/16/perplexitys-personal-computer-ai-assistant-feature-launches-on-mac-for-subscribers/ ; https://www.macrumors.com/2026/04/16/perplexity-personal-computer-for-mac/ ; https://finance.biggo.com/news/202605100043_Perplexity_Personal_Computer_Mac_App (search result only) |
| 2 | Closed. | n/a |
| 3 | Perplexity picks the models: reported 19 then "over 20" frontier models orchestrated (Claude Opus 4.6 orchestrating, Gemini for research, Grok, GPT-5.2 at launch). No BYO key or local models found. | VentureBeat ; MacRumors |
| 4 | $200/month Perplexity Max. Not on the $20 Pro plan at launch. Own subscription only. Free tier: unknown for this feature. | MacRumors ; 9to5Mac |
| 5 | Mac (macOS 14 Sonoma+), recommended on a Mac mini for 24/7. iPhone can start tasks. Perplexity Mac app is native per TechCrunch 2024 (https://techcrunch.com/2024/10/24/perplexity-launches-a-native-mac-app); whether Personal Computer is native: unknown. Regions: unknown. | MacRumors ; 9to5Mac |
| 6 | Deploys teams of agents; no named roster or per-bot memory reported. Scheduled and always-on tasks. Bot limits: unknown. | MacRumors ; VentureBeat |
| 7 | Yes, on your Mac: local files, iMessage, Mail, Calendar, native apps and browser; triggered by pressing both Command keys. Cloud Computer (non-Mac) uses a Perplexity sandbox. | 9to5Mac ; VentureBeat |
| 8 | Unknown count. Mechanism: Perplexity's own connectors plus local app access. Custom MCP: unknown. | n/a |
| 9 | Files "created in a secure sandbox"; actions "auditable and reversible", kill switch (MacRumors). Where model calls are processed: Perplexity servers and model vendors; retention and training: unknown. | MacRumors |
| 11 | Quote from launch coverage: Computer "unifies every current capability of AI into a single system" (VentureBeat, press). Perplexity's own tagline: unknown. | VentureBeat |

## Record 5: Agent! for macOS (AgentiLoop)

| Field | Finding | Source |
|---|---|---|
| 1 | Agent! by AgentiLoop.ai (earlier repo path macos26/agent, redirects). Repo created 2026-03-11. Latest release v1.1.87.287 on 2026-10-01; a 1.1.88.288 pre-release was listed 2026-10-04. (The releases page text showed the year 2024; the GitHub API shows 2026, so I trust the API.) | https://api.github.com/repos/AgentiLoop/Agent (+ /releases/latest); https://github.com/AgentiLoop/Agent/releases |
| 2 | Source-available, not open source: PolyForm Noncommercial 1.0.0 for the code; compiled binaries reserved to AgentiLoop.ai for commercial use. GitHub shows license as "NOASSERTION". https://github.com/AgentiLoop/Agent. 642 stars, 69 forks, last push 2026-10-04T20:11Z, 1,414+ commits. | https://github.com/macos26/agent ; GitHub API |
| 3 | Agnostic: 23 providers including Claude, OpenAI, Gemini, Grok, DeepSeek, Mistral, Ollama, LM Studio, vLLM, OpenRouter, Qwen, Hugging Face, Z.ai, plus on-device Apple Intelligence. Own keys and local models: yes. Subscription reuse: unknown. | https://github.com/macos26/agent |
| 4 | Free to use per README; commercial use of the binaries is reserved. No price list found: unknown. | https://github.com/macos26/agent |
| 5 | macOS 14.6+ only, Apple Silicon and Intel, native Swift (Swift 6.4 per README). Signed and notarized releases. | https://github.com/macos26/agent |
| 6 | Self-verifying task loop, goal-driven `/auto` mode, parallel tabs, persistent memory, "multi-agent coordination" (README wording, depth unknown). No named bot roster found. | README ; releases page |
| 7 | Yes, your Mac: Accessibility API, AppleScript, JXA, Xcode, privileged shell (user or root through a helper), voice, iMessage remote access. | README |
| 8 | MCP server support; no app catalogue count found. | README |
| 9 | Runs locally. A search-result summary of the project says no telemetry and no subscription (secondary; verify before quoting). Provider calls go to your chosen vendor. | https://lobehub.com/mcp/macos26-agent (search result) |
| 11 | "One app. Any AI. Total command over your Mac." | https://github.com/macos26/agent |

Permissions: needs Full Disk Access, Accessibility, Automation and a privileged helper approved over XPC; a "Jev guard" and read-before-edit gates are mentioned in releases. Approval cards per action: unknown.

## Record 6: Gemini Spark in the Gemini Mac app (Google)

| Field | Finding | Source |
|---|---|---|
| 1 | Gemini app for Mac launched 2026-04-15, free, macOS 15+ (Gemini release notes). Gemini Spark announced 2026-05-19 with the I/O subscription changes, phones in June, on Mac 2026-07-01, beta. | https://gemini.google/release-notes/ ; https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions/ ; press: https://techcrunch.com/2026/07/01/gemini-spark-googles-agentic-assistant-is-now-available-on-mac/ |
| 2 | Closed. | n/a |
| 3 | Gemini models only. No BYO key or local models found for the consumer app. | Google blog |
| 4 | Spark is included with Google AI Ultra, $100/month or $200/month (the top plan was cut from $250 to $200). Not in Pro. Reuses a Google subscription only. | Google blog (via search result); TechCrunch gave no price |
| 5 | Mac app: macOS 15+, native status unknown. Windows app launched 2026-09-10. Spark on Mac: English, ages 18+. Regions: Google's blog said US only at launch; a later search result says "supported countries". Treat as US-first, unconfirmed. | Gemini release notes ; Google blog ; TechCrunch |
| 6 | One agent ("your personal AI agent"), 24/7, multi-step tasks, remote tasks between phone and Mac "soon" (press). No multiple bots, groups or per-bot memory reported. | Google blog ; TechCrunch |
| 7 | On Mac it works with files on the computer (sort files, turn invoices into a budget sheet). Browser/computer control beyond that: unknown. Chrome "Auto Browse" is the Mariner successor (Project Mariner closed 2026-05-04, press: https://www.androidheadlines.com/2026/05/google-shuts-down-project-mariner-ai-agent.html). | TechCrunch |
| 8 | Google Workspace, Tasks, Keep plus Canva, Dropbox, Instacart, OpenTable, Zillow Rentals (press). Mechanism: Google's own partner integrations. Custom MCP: unknown. | TechCrunch |
| 9 | Not covered in the pages I read: unknown. | n/a |
| 11 | "a 24/7 AI agent that helps you navigate your digital life, takes action on your behalf" | Google blog |

Permissions: TechCrunch gives no detail; unknown.

---

## Considered and rejected

- **Munder Difflin** (HarnessMD, MIT, 8,470 stars, v0.5.5): closest of the rejects (multi-agent, reuses your Claude Code, Codex, Gemini CLI and other subscriptions, local first, Mac/Windows/Linux, Free plus Pro $20/month or $150/year launch price). Rejected because it orchestrates coding CLIs, not general-purpose bots with jobs, memory and app connectors. Sources: https://munderdiffl.in/ ; GitHub API. Keep it as the "closest coding-only cousin".
- **Agent Teams AI** (777genius, AGPL-3.0, 2,231 stars, v2.17.1 2026-09-28): desktop kanban for teams of coding agents, 200+ providers. Coding only. https://agentteams.live/ ; GitHub API.
- **Goose** (Block, now Agentic AI Foundation, Apache 2.0, 54,959 stars, v1.53.0 2026-10-02): free BYOK desktop and CLI agent for macOS, Linux, Windows. Single agent, coding-first, no bot team. GitHub API ; press: https://thenewstack.io/block-goose-agentic-foundation/
- **Manus "My Computer"** (Meta, launched 2026-03-16 on macOS and Windows): local desktop agent, subscription, Meta's own model stack, every terminal command needs approval (press: https://thenextweb.com/news/meta-manus-my-computer-desktop-ai-agent, https://9to5mac.com/2026/03/17/metas-manus-launches-my-computer-to-turn-your-mac-into-an-ai-agent/). Rejected because Meta's Muse agent is already covered by another agent and Manus is locked to Meta's models. Price unknown.
- **OpenAI Codex app / ChatGPT agent**: OpenAI Dots covers the OpenAI side.
- **NanoClaw, ZeroClaw, nanobot** (OpenClaw-style MIT agents): terminal or Docker, no Mac app, tiny audience (listed at https://munderdiffl.in/blog/openclaw-alternatives/, 2026-10-05; not researched further).
- **BoltAI, Raycast AI, Msty, LM Studio, Jan, Enchanted, AnythingLLM**: native or local Mac chat clients with BYOK and MCP, not agent teams (BoltAI https://boltai.com/; Raycast Pro/Advanced AI pricing via search; local-AI ranking https://blog.buildbetter.ai/best-personal-ai-agents-that-run-locally-on-your-mac-in-2026-2/). Raycast credits tiers are press-level and unconfirmed.
- **Apple Siri on macOS 27 with third-party agents** (WWDC26, ChatGPT, Gemini, Claude inside Siri; Xcode agent MCP): an OS platform, not an agent product, and coverage I found is press only (http://martiancraft.com/blog/2026/06/wwdc-26-recap-siri-grows-up-apple-intelligence-goes-everywhere-and-agents-move-Into-xcode/). Worth a "watch" note for the video, since Apple shipping a built-in agent hub changes the "native Mac" story.
- **Project Mariner** (Google): shut down 2026-05-04, folded into Gemini Agent and Chrome Auto Browse (press: https://www.digitaltrends.com/computing/google-pulls-the-plug-on-project-mariner-the-ai-agent-that-browsed-the-web-like-a-human/).
- **Claude Code, Codex CLI, Cursor, Antigravity**: developer tools, outside "bot team for everyone".
- **OpenAGI** (source-available always-on daemon, ranked first in a June 2026 Mac list): single daemon, only press coverage, not verified. https://blog.buildbetter.ai/best-personal-ai-agents-that-run-locally-on-your-mac-in-2026-2/

## What this means for the video (short)

- Hermes Desktop Bot Mode already shows "named bots with faces in group chats on your Mac, MIT, any model". Do not claim "first" or "only" for bot teams, open source or model choice. Real differences to verify before claiming: native macOS (Hermes is Electron), Read only / Auto / Full access levels with approval cards (Hermes uses Smart / Manual / Off command approvals), per-bot jobs with Composio plus official MCP, and a consumer-friendly first run.
- Cowork, Perplexity and Spark are the "pay a vendor, locked to its models" group. Prices to cite, each from the sources above: $20 to $200 (Claude), $200 (Perplexity Max), $100 to $200 (Google AI Ultra).
- OpenClaw sets the reputational bar to avoid: its security record is the thing viewers will ask about, so the permission levels are the story.

## Gaps I could not close
- Perplexity official pages (403): all Perplexity facts are press.
- Hermes Desktop original launch post and exact preview date (press only, June 2026); Hermes privacy policy and Nous Portal data handling not read.
- OpenClaw Mac app: native or not, and group chat support, unknown.
- Claude Cowork: local VM versus Anthropic cloud conflict, and Pro inclusion conflict, as noted.
- Gemini Spark regions (US only versus supported countries).
