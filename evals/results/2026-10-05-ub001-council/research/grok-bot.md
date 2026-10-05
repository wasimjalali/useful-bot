# Grok Bot (SpaceXAI) dossier

Read on 2026-10-05. Official = x.ai / docs.x.ai / cursor.com. Press/blog = marked "press". Note: my fetch tool summarises pages through a small model, so wording quoted below is as returned; re-check any quote before putting it on screen.

## Summary table

| Field | Answer |
|---|---|
| Name / maker / status | Grok Bot, by SpaceXAI (xAI), cloud and billing run through Cursor. Beta since 2026-08-11. Version: unknown |
| Open source | No evidence of any repo. Closed (unknown officially, nothing found) |
| Models | xAI Grok models only (press). No BYO key or local models found. Grok 4.7 base model rolled out 2026-10-01 (press) |
| Pricing | No separate price. Included in paid Cursor plans (Pro $20, Pro+ $60, Ultra $200, Teams $40/user) or via SuperGrok / SuperGrok Plus / Heavy / X Premium+ link. Weekly usage, on-demand overage. Credit-based free trial |
| Platforms | macOS, Windows, Linux, iPhone/iPad, Android. Cloud computers in the US |
| Agents | Many bots (docs notes earlier: 50 bots+groups, 50 routines per bot), group chats, bot-to-bot messaging, skills, routines, memory, Primary Bot (2026-10-01) |
| Computer use | Yes, but on a cloud computer per account (browser, filesystem, terminal), not your Mac. Manual takeover for logins |
| Apps | Connectors + computer use for sites without APIs; Cursor plugins; MCP (press says custom MCP must be publicly reachable). Count: unknown |
| Data | Cloud only. US. Privacy Mode = no training. Not usable with Legacy Privacy Mode. One shared cloud computer per user |
| Control | Approval prompts, independent "Auto-review" model. Bot never has more access than its owner |
| Tagline | "Grok Bot is your team of always-on agents." |
| Weaknesses | Outages Aug 20-21, fast quota burn, shared-computer isolation, unbounded context, doc gaps (all press/community) |

## 1. Name, maker, launch, status
- Grok Bot by SpaceXAI; launched in beta 2026-08-11; "available to select subscribers; enterprise waitlist". Source: https://x.ai/news/introducing-grok-bot (read 2026-10-05; page date shown: not seen).
- Cloud computers run "in Cursor's infrastructure"; sign-in is a Cursor account. Source: https://docs.x.ai/grok-bot/overview and https://docs.x.ai/grok-bot/get-started (2026-10-05).
- Product still called "early beta" (press): https://www.digitalapplied.com/blog/grok-bot-ai-teammates-launch-cloud-computer-2026
- Primary Bot (proactive chief-of-staff style bot that routes to other bots) announced 2026-10-01 alongside Grok 4.7 (press, single source): https://progressiverobot.com/2026/10/02/primary-bot-grok-4-7-base-model-proactive-grok-bot . Not confirmed on an official page I could read.
- Version number: unknown.

## 2. Open source
Nothing found; no repo linked from official pages. Treat as closed, and say "unknown" if asked.

## 3. Models
- Official pages I read do not list models. Press (https://www.vellum.ai/blog/official-grok-bot-breakdown, search snippet, not opened in full) says it runs xAI models only; cannot swap in Claude, GPT, Gemini or local. Treat as press-reported, likely true given it is an xAI product.
- Grok 4.7 base model rollout 2026-10-01 (press, above).
- BYO key / local models: nothing found, none documented.

## 4. Pricing
- Official: "Included with every paid individual Cursor plan", Cursor Teams, and via linked SuperGrok / SuperGrok Plus / SuperGrok Heavy. Usage resets weekly. https://docs.x.ai/grok-bot/overview (2026-10-05).
- Cursor plans page: https://cursor.com/help/grok-bot/plans (2026-10-05). Access via Cursor Pro/Pro+/Ultra, Teams (every member), SuperGrok tiers, X Premium+ (by linking). Two meters: weekly usage included, then on-demand billed through Cursor if enabled. Plans do not stack: linking SuperGrok to a Cursor plan gives no extra, highest tier wins. Free trial is credit-based (not time-limited), spent by agent steps and tokens.
- Cursor pricing page: https://cursor.com/pricing (2026-10-05). Hobby (free) no Grok Bot mentioned; Individual from $20/mo lists "Grok Bot access"; Teams $40/user/mo; Enterprise custom with "access, network, and audit controls for Grok Bot". Weekly allowances per tier are NOT published there.
- Prices Pro $20, Pro+ $60, Ultra $200, Teams $40 per user: press search summary (https://cellcog.ai/blog/grok-bot-cursor-pro/); matches $20 and $40 on the official page. Pro+/Ultra price not verified officially.
- Launch was reportedly Ultra-only ($200), widened on 2026-08-26 (press).
- Does not reuse ChatGPT/Claude subscriptions; reuses Cursor or SuperGrok / X Premium+ only.

## 5. Platforms and regions
- macOS (Apple silicon and Intel), Windows (x64, Arm64), Linux (x64, Arm64), iPhone, iPad, Android. https://docs.x.ai/grok-bot/overview . Press: iOS 18+, Android on Google Play 2026-09-02, Linux by 2026-09-09 (https://cellcog.ai/blog/grok-bot-problems/ search snippet).
- Native vs web wrapper: unknown (not stated). Cursor desktop app is Electron-based in general, not confirmed for this app.
- Computers run in the US; residency commitments need account team. https://docs.x.ai/grok-bot/security
- Regional eligibility / country locks: unknown.

## 6. Agent abilities
- Official: bots are "AI teammates with names, jobs, and context that compounds over time"; parallel multi-bot work with inter-bot coordination; group chats; learn workflows by demonstration and save as skills; voice messages, dictation, voice chat; keeps running with laptop closed. https://docs.x.ai/grok-bot/overview
- Routines: schedule or event triggered (Slack, GitHub); up to 50 routines per bot; 20 run records kept per routine. https://docs.x.ai/grok-bot/skills-routines-and-automations
- "Teach a task": record browser interactions up to 10 minutes. Same page.
- Memory: bots keep working preferences and summaries. https://docs.x.ai/grok-bot/bots
- Share bot templates by public or team-only link. Same page.
- Limit of 50 bots+groups per account, groups of 2-6 bots: from our own 2026-09-13 notes (docs/plan/GROKBOT-AGENT-CAPABILITIES.md), not re-confirmed this session.
- Context: each bot is "one unbounded thread"; Cursor staff confirmed no fresh sessions, manual compaction or context meter (press/community, https://cellcog.ai/blog/grok-bot-problems/, last reviewed 2026-09-07).

## 7. Computer use
- Each account has a shared persistent cloud computer with browser, filesystem, terminal. Bots use connectors where possible, computer use otherwise. Docs admit "A site can still block automation, expire a session, or require a human step." User can take manual control via "Agent Computer" for passwords/2FA. https://docs.x.ai/grok-bot/overview , /get-started
- Does NOT drive your own Mac (official pages describe cloud computer only).
- Phone calls / texts: not mentioned in anything I read; unknown.

## 8. App connections
- Official launch page: works with platforms lacking APIs or MCP; mentions CRM, Gmail, product UIs. https://x.ai/news/introducing-grok-bot
- Mechanisms (press, https://www.vellum.ai/blog/official-grok-bot-breakdown snippet): skills, Cursor plugins, connectors, MCP; enterprise connectors Gmail, Calendar, Drive, OneDrive, Outlook, Teams, SharePoint, Salesforce. Custom MCP must be publicly reachable or tunneled (press). Number of apps: unknown.
- Connector tokens are not stored on the computers; credentials stay with the member. https://docs.x.ai/grok-bot/security

## 9. Data
- Requires cloud data storage; does not work with Legacy Privacy Mode. https://docs.x.ai/grok-bot/get-started
- Shared cloud computer per account, strict isolation between users; not between bots. Docs say not to use separate bots as security boundaries (press summary of docs). https://docs.x.ai/grok-bot/overview
- Privacy Mode prevents training on customer data; data deleted or returned within 30 days after termination (enterprise context). https://docs.x.ai/grok-bot/security
- Consumer retention and training defaults: unknown from what I read.

## 10. Permissions
- Approval prompts for consequential actions; independent Auto-review model checks shell commands, plugin calls, automation changes. A bot can never hold more access than its owner. Enterprise: network allowlists, audit logs, 90-day Action Recording, OpenTelemetry, SSO/SCIM. https://docs.x.ai/grok-bot/security
- Named autonomy levels like ours (Read only/Auto/Full): not found.

## 11. Positioning
"Grok Bot is your team of always-on agents." https://x.ai/news/introducing-grok-bot . Also: "AI teammates you can give real work to. Bots have their own computer." (YouTube description, https://www.youtube.com/watch?v=F1_0Lkp16Rc via search snippet). Testimonial quotes on page: "eight arms like an octopus" (Vincent, Growth).

## 12. Weaknesses (press/community, not official)
Source: https://cellcog.ai/blog/grok-bot-problems/ (published 2026-08-23, reviewed 2026-09-07), plus https://www.callmissed.com and https://www.therundown.ai/tools/grok-bot (search results, not opened).
- Aug 20-21 outage: shared computer stuck, all bots down, confirmed by Cursor staff.
- Quota burn: one user used 42% of the weekly allowance on day one with six agents.
- Doc/billing confusion over SuperGrok Heavy vs Ultra bundling.
- Shared computer = one hijacked agent threatens every account; prompt-injection worry.
- Unbounded context per bot.
- Primary Bot: no published controls to disable proactive behaviour (progressiverobot, press).

## 13. Launch video
- Official "Introducing Grok Bot": https://www.youtube.com/watch?v=F1_0Lkp16Rc . I could not read the page; length, structure and style: unknown. Embed on x.ai shows no detail. Other videos (press/third party): https://www.youtube.com/watch?v=M9CrMFfsuB8 , https://www.youtube.com/watch?v=rkigdXf-52I (workshop). Someone should watch the official one before we lock our script.
- Messaging themes from the page: always-on, own computer, signs into your tools, works while you are away, team of bots.

## Where we can differ (facts only)
Open source AGPL vs closed; any model/subscription/local vs xAI only; runs on your Mac vs their cloud computer; named permission levels; no Cursor or SuperGrok subscription needed. Verify each against the sources above before claiming.

## Gaps to close
Official model list; official weekly allowances; open-source status confirmation; launch video details; phone/text abilities; regions.
