# OpenBot (openbot.run) dossier

Read on 2026-10-05. All facts from public pages only. No login, no download, no app run.

## Which OpenBot is this

openbot.run links to https://github.com/nightly-labs/openbot (site HTML, read 2026-10-05) and X account https://x.com/OpenBot_. The GitHub repo's homepage field points back to https://openbot.run/. So the company/repo is nightly-labs (org on GitHub). One WebFetch summary of the site named the maker "Synthetify Labs"; I could not confirm that string in the page HTML, so treat the maker as "nightly-labs (GitHub org)", Synthetify Labs unconfirmed. Blog author: Norbert Bodziony.

Other projects sharing the name (GitHub API read 2026-10-05):
- CopilotKit/OpenBot: unrelated. MIT, 6,073 stars, created 2026-08-17, site copilotkit.ai/openbot. "AI coworkers that each get a computer of their own", bring any AG-UI agent.
- meetopenbot/openbot: unrelated. MIT, 342 stars, created 2026-01-29, site getopenbot.com, "OS for Agents", last push 2026-07-07.
- regnull/openbot: unrelated. Python, self-hosted team of bots, MIT, 27 stars.
- qiaobochi040726-source/openbot: a fork of regnull/openbot (created 2026-10-05), not related to openbot.run.
- Forks of nightly-labs/openbot (jatmn, millionwords, leodknuth, woosal1337, suhz and more): plain forks, same code.

## Summary table

| Field | Answer |
|---|---|
| Name / maker | OpenBot, nightly-labs (Synthetify Labs per one unverified read) |
| Launch | Repo created 2026-08-12; intro blog post 2026-09-14 |
| Status / version | "Development preview"; v0.30.0 released 2026-10-05 (releases roughly daily to weekly) |
| Source | Source-available, not open source by OSI: PolyForm Noncommercial 1.0.0 (versions up to 0.1.11 were Apache-2.0). 354 stars, last push 2026-10-05 |
| Models | Agnostic via CLIs: Codex, Claude Code, Gemini, Grok, OpenCode, Cursor, Cline, plus OpenAI-compatible endpoints, Ollama, LM Studio |
| Pricing | Free to download; uses your existing provider plans. Optional accounts and Stripe billing exist (what is billed: unknown) |
| Platforms | macOS 13+ (Apple silicon and Intel), Windows 10/11 x64, Linux x64/arm64 AppImage. Electron app, not native |
| Agents | Multiple persistent agents, agent-to-agent messaging, shared channels, queues, skills, memory, routines (script-triggered) |
| Computer use | Optional, on your own computer via bundled cua-driver; embedded browser agents control |
| Connections | Plugins/marketplace (Aave, Canva, Notion, Figma, Linear, Paper), MCP referenced; exact count unknown |
| Data | Local in ~/OpenBot (SQLite); prompts go to your chosen provider; optional accounts on Cloudflare |
| Permissions | None per action: agents run danger-full-access, approvalPolicy never, after one first-launch consent |
| Tagline | "Persistent AI teammates on your own computer. Run Codex, Claude, Gemini and Grok with the plans you already pay for, or your own model." |
| Weakness | No approval cards, preview status, unsigned Windows build, noncommercial license |
| Video | None found |

## Full sourced notes

### 1. Name, maker, dates, status
- Name OpenBot. Page title "OpenBot: Run a team of AI agents on your computer". Source: https://openbot.run/ (read 2026-10-05, site content dated Sep 2026).
- GitHub repo created 2026-08-12, pushed 2026-10-05. Source: https://api.github.com/repos/nightly-labs/openbot (read 2026-10-05).
- Latest release v0.30.0 2026-10-05; prior v0.29.0 2026-10-02, v0.28.0 2026-10-02, v0.27.0 2026-10-01, v0.26.0 2026-09-30. Source: https://github.com/nightly-labs/openbot/releases (via API). Commit messages show Claude Opus 5.5 co-authoring, so they build with AI agents.
- Intro post "Introducing OpenBot: A Shared Workspace for AI Agents", 2026-09-14, by Norbert Bodziony: https://openbot.run/news/introducing-openbot. Calls it free, open-source, "does not train its own model".
- README calls it a "development preview". Source: https://github.com/nightly-labs/openbot.

### 2. Source and license
- LICENSE is PolyForm Noncommercial 1.0.0; commercial licensing sold separately; versions up to 0.1.11 remain Apache-2.0. Source: https://github.com/nightly-labs/openbot (LICENSE file read via API, README). GitHub detects it as "Other".
- 354 stars (read 2026-10-05). Stack: Electron, SolidJS, TypeScript, Bun. The site and blog say "open source", which the license does not meet strictly. Useful for our video: we are AGPL-3.0, which allows commercial use.

### 3. Models
- Providers: Codex, Claude Code, Gemini, Grok, OpenCode, Cursor, Cline; custom OpenAI-compatible endpoints and custom ACP agents; detects local Ollama and LM Studio servers. Source: https://openbot.run/ and README.
- It runs each vendor's own CLI (downloads and manages CLI versions or uses your install); auth uses each provider's login flow. So it reuses subscriptions through those CLIs. Source: README.
- Agents keep continuity when you switch provider (site claim).

### 4. Pricing
- "Free", users pay only their provider plans. Source: https://openbot.run/download ("free to download").
- PRIVACY.md mentions Stripe billing data (subscription state, plan, price) for the central account service, so some paid tier exists, likely hosted servers/team features. Tiers and prices: unknown, not found on public pages. Source: https://raw.githubusercontent.com/nightly-labs/openbot/main/PRIVACY.md.

### 5. Platforms
- macOS 13+ DMG (notarized), Windows 10/11 x64 installer (not code-signed per README), Linux AppImage x64/arm64. Source: https://openbot.run/download.
- Electron, so a web-tech wrapper, not native. Mobile and browser clients are mentioned in PRIVACY.md (mobile, browser client for remote access); details unknown.
- Linux limits: no voice prompts; remote desktop only on X11 not Wayland. Regions: no restriction stated.

### 6. Agent abilities
- Multiple agents each with own name, instructions, avatar, workspace; agent-to-agent messages, handoffs, file sharing; shared desktop channel chats with one task owner and Stop/Resume/Reassign/Archive controls; FIFO message queue with pause/resume/cancel. Sources: README, https://openbot.run/.
- Memory: channel memories with revisions; routines. Skills: agents create SKILL.md skills into a shared library, enabled per agent; marketplace skills. Source: README.
- Routines are event-driven: a local script can wake an agent via a 127.0.0.1 listener, off by default, 30 runs per agent per hour, 4,000 char payload. No time-based scheduler documented. Source: https://raw.githubusercontent.com/nightly-labs/openbot/main/docs/automation.md. The blog says recurring tasks are a use case; conflict with docs unresolved.
- No documented cap on agent count.

### 7. Computer use
- Optional Computer Use on macOS, Windows, Linux via bundled `cua-driver` run as its own child process (needs Screen Recording and Accessibility on macOS). It controls the user's own computer, not a cloud VM. Embedded browser agents can control and inspect. Remote desktop access to a shared host. No phone calls or texts documented. Source: README. (Same cua-driver we use for testing.)

### 8. App connections
- Plugin ecosystem named on site: Aave, Canva, Notion, Figma, Linear, Paper. Count and mechanism unknown. MCP is referenced (MCP server credentials, MCP bearer tokens) but not detailed. Sources: https://openbot.run/, PRIVACY.md, README. Slack event relay also mentioned in PRIVACY.md.

### 9. Data and privacy
- Workspaces, conversations, files, browser data stay on the computer under ~/OpenBot, SQLite openbot.db. Prompts and web content go to the chosen provider. Source: https://openbot.run/, README.
- Optional account: email, account ID, avatar, team memberships, remote host records, Stripe billing state; on Cloudflare Workers and D1; avatars public by URL. Team data over WebRTC DataChannels, TURN via project coturn.
- Product analytics via self-hosted OpenPanel (analytics.openbot.run), events include UI actions, tool usage, routine runs, no message content; "no automatic retention limit"; hosted server records kept indefinitely after deletion. Document has no last-updated date. Does not state anything about provider training. Source: PRIVACY.md (read 2026-10-05).

### 10. Permissions
- "Agents currently run with `danger-full-access` and `approvalPolicy: never`... without per-action confirmations after the explicit first-launch consent." Source: README. No Read-only / Auto / Full tiers and no approval cards. This is the sharpest contrast with Useful Bot.

### 11. Positioning
- "Persistent AI teammates on your own computer. Run Codex, Claude, Gemini and Grok with the plans you already pay for, or your own model." (https://openbot.run/download, same on home page). Home title: "Run a team of AI agents on your computer".

### 12. Weaknesses and controversies
- Unrestricted agent access by design (above). Preview status. Windows build unsigned. Noncommercial license while marketed as open source. Analytics retention unlimited. No third-party reviews or press found in search (2026-10-05); search results about "OpenBot" were mostly the CopilotKit project. Unknown whether any outage or backlash exists.

### 13. Marketing / video
- No launch video found on the site or in the README. Site has a social image (https://openbot.run/openbot-social.png) and a blog post. X account https://x.com/OpenBot_ not read. Positioning is text-first: team of agents, your plans, local data. Claims to counter: "open source" (noncommercial license), "your own computer" (we also run local), no permission controls.

## Not verified
Pricing tiers, plugin count, Synthetify Labs link, X posts, changelog page contents, any video.
