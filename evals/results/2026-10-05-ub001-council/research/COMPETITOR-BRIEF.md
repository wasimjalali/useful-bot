# Competitor deep dive brief (UB-001 launch video research)

Today is 2026-10-05. We make Useful Bot: a native macOS app (open source, AGPL-3.0) that runs a
team of AI bots on your Mac. Each bot has its own job, instructions, memory and model; it works
with any model provider (subscriptions you already pay for, API keys, or local models via LM
Studio / Ollama); it connects to apps (Composio catalogue and any official MCP server); it has
Read only / Auto / Full access permission levels with approval cards. We need honest, sourced
facts about one competitor so a launch video can say what we do that they don't.

## Rules
- Official sources first: the vendor's own site, docs, pricing page, terms, blog, GitHub repo,
  release notes, app store listing. Use press (TechCrunch, Bloomberg, MacRumors, 9to5Mac, CNBC)
  only to fill gaps, and mark it as press.
- Every fact gets a source URL and the date you read it (2026-10-05) plus the date the source was
  published or last updated, if shown.
- If something is unknown or the sources disagree, say "unknown" or show both. Never guess.
- Don't log in to anything, sign up, or pay for anything. Public pages only.
- Plain text, no em dashes.

## Record these fields (each with sources)
1. Name, maker, launch date, current status (beta / GA), current version if shown.
2. Open or closed source. If open: license, repo URL, stars, last commit date.
3. Model choice: locked to one vendor's models, or agnostic? Which models/providers exactly?
   Can you bring your own key? Local models?
4. Pricing: every tier with price and what it includes. Does it reuse subscriptions you already
   pay for (ChatGPT, Claude, Grok, Copilot etc.) or your own API keys? Free trial / free tier?
5. Platforms: macOS, Windows, Linux, iOS, Android, web. Native or web wrapper? Regions
   (US-only? eligible markets?).
6. Agent abilities: multiple bots/agents? Agent teams, sub-agents, group chats, routines /
   schedules, memory, skills. Limits (how many bots, routines).
7. Computer use: does it control a computer? Whose computer (a cloud VM it owns, or your Mac)?
   Browser use? Phone calls, texts?
8. App connections: how many apps, which mechanism (own connectors, MCP, Composio, plugins),
   any custom MCP support.
9. Where data is stored and processed: cloud, on device, which company's servers; retention;
   training on user data; privacy policy points that matter.
10. Permissions and control: approval flows, autonomy levels.
11. One-line positioning in their own words (quote their tagline).
12. Notable weaknesses or controversies reported (with sources), e.g. privacy backlash,
    outages, price complaints, region locks.
13. What their marketing / launch video emphasises (if there is one): link it, describe its
    structure, length, style, and claims. This informs how our video should differ.

## Output
Write the dossier as markdown to the file path given in your task, with a short summary table at
the top (field -> one-line answer) and the full sourced notes below. Then reply with a 10-line
summary and the file path.
