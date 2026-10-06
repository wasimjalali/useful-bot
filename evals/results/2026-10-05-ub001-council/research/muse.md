# Competitor dossier: Muse (Meta's personal AI agent)

Read 2026-10-05. Method: web search plus page summaries (WebFetch returns model-written summaries, not raw page text, so quotes below are as reported by the fetch tool; re-check any quote before putting it on screen). Official = Meta-owned page. Press = marked.

## Summary table

| Field | Answer |
|---|---|
| 1. Name, maker, status | Muse, Meta Platforms. Announced and released 2026-09-08. Rolling out (limited capacity), no "beta" label found. Mac app "Muse-1.0" disk image; the download page link also mentions "6.0" (unclear which is the version) |
| 2. Open source | No. Closed. Meta's Muse Code/Model API docs exist for developers, but the Muse app is not open source (no repo found) |
| 3. Models | Muse app runs on Meta's Muse Spark only. No model picker, no BYO key, no local models found (press-level on "no choice", see notes) |
| 4. Pricing | Free tier (limit unpublished), Power $20/mo (500M tokens/week), Maximum $100/mo (3B tokens/week). Does not reuse other AI subscriptions |
| 5. Platforms | iOS, Android, web (muse.ai), WhatsApp, Mac app (direct download), AI glasses "coming". US only at launch |
| 6. Agent abilities | One personal agent per user (customisable name, avatar, style). Memory, works after app closes, scheduled tasks. No multi-bot team in the consumer app found |
| 7. Computer use | Yes, two kinds: (a) its own cloud Linux VM with browser ("Muse Secure VM"); (b) Mac computer use on your Mac with Screen Recording and Accessibility permission. Phone calls: tested with humans behind them, feature rolled back |
| 8. App connections | "Dozens" of partner connectors (Shopify, Walmart, Best Buy, Notion, GitHub, Box, Instacart, Stripe Link...), plus custom MCP connectors (press/third-party, verify) |
| 9. Data | Dedicated per-user cloud VM on Meta infrastructure is the system of record. Training on user interactions by default, opt-out in settings. Not shared with Meta ad systems (Meta's claim) |
| 10. Permissions | "Sentinel" agent approves all egress and connector actions; asks user via app UI; grants one-time, session, task, time-bounded or perpetual |
| 11. Tagline | "The World's First Personal AI Agent Built for Everyone" |
| 12. Weaknesses | Amazon blocked it (2026-09-21); human call-center callers behind AI phone calls (Reuters, rolled back); Mac zero-day (Patrick Wardle, patched in ~1 day); per-person profile pages (Gizmodo, 2026-10-05); Meta privacy history; US only; training on by default |
| 13. Marketing | Launch video on Facebook "Introducing Muse, your personal AI agent from Meta that gets things done across every part of life" (CTA muse.ai/join); length and structure not verified |

## Important for Useful Bot positioning

Muse is NOT only a cloud agent. It shipped a Mac app with computer use on the user's own Mac (September 2026), so "a Mac agent" alone is not a difference. Differences that hold per sources: Muse is locked to Meta's model and cloud, closed source, US only, trains on interactions by default (opt-out), one agent per user. Useful Bot is local, open source, multi-bot, any model.

## Full notes

### 1. Name, maker, launch, status
- Muse, by Meta Platforms. Announced 2026-09-08. Official: https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/ (read 2026-10-05, dated Sept 2026).
- Availability quote (official): "rolling out in the US on iOS, Android, and muse.ai, and coming soon to AI glasses".
- Meta Help Center: "Muse and Muse subscriptions are currently being tested in limited capacity and are not yet available everywhere." https://www.meta.com/help/subscriptions/1021145227643680/ (read 2026-10-05, date not shown).
- Connect 2026 (late Sept) additions: voice mode that works in the background while you talk, designable voice, Muse Realtime Avatar, glasses integration, Mac computer use "available now", dedicated email address for Muse, Muse Charm keychain device. Official: https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/ and https://www.meta.com/blog/meta-connect-2026-everything-we-announced/ (the second was seen in search results only, not fetched). The fetch summary of the first page listed the email address, glasses, partner connectors and Charm, but I did not see Mac computer use on that page itself; the Mac claim came from the search result text for the Meta Connect blog. Treat as official-but-unverified-on-page.
- Press says "topped US app download charts" (press, search snippet, no URL fetched).
- Wikipedia: https://en.wikipedia.org/wiki/Muse_(AI_agent) (press-level, tertiary).

### 2. Source
- No open-source repo found for the Muse app. Developer docs exist at https://dev.meta.ai/docs/overview (Meta Model API and Muse Code). Not checked for licence. Treat the Muse app as closed.

### 3. Models
- Official: "Powered by Muse Spark, Meta's most capable model to date, built for real-world agentic work" (about.fb.com intro page).
- Muse Spark introduced April 2026 (official: https://ai.meta.com/blog/introducing-muse-spark-msl/, from search results, not fetched).
- Third-party access: Muse Spark is also sold as an API (Meta Model API, https://dev.meta.ai/docs/overview) and on Google Cloud Vertex partner models (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/meta). The brief mentions opencode; I did not verify that.
- Is the Muse app locked to Meta models? Meta's pages name only Muse Spark and show no model picker, BYO key or local model option. A third-party site (myclaw.ai, press-level) says "fixed product path on Muse Spark with no model choice". Conclusion: locked to Meta's models as far as any source shows; Meta has not stated "locked" in so many words. Mark: likely, not officially stated.
- BYO key applies to the developer API, not the Muse app.

### 4. Pricing
- Official Help Center: Power $20/month with 500 million tokens weekly; Maximum $100/month with 3 billion tokens weekly; free tier with usage limits, exhaust it and subscribe or wait for reset. Subscribers 18+, in a supported country, with a Meta account. Auto-renews monthly. Buy via muse.ai or mobile app. https://www.meta.com/help/subscriptions/1021145227643680/ (read 2026-10-05).
- Free tier size: Meta has not published a number on the help page. A press site claims 100M tokens a week from Zuckerberg's launch post (unverified, press).
- Official wording: "free for most of what people need, with subscription plans for people who want to do more".
- TechCrunch (press, 2026-09-08): free, Power $20, Maximum $100; checkout via Link by Stripe. https://techcrunch.com/2026/09/08/meta-debuts-its-muse-ai-agent-will-consumers-trust-it/
- Wikipedia says Meta plans revenue through transaction fees rather than ads (tertiary; unverified).
- Reuses other AI subscriptions: no sign of it. Costs are Meta tokens.

### 5. Platforms and regions
- iOS, Android, web muse.ai, WhatsApp (official). Mac app: direct download from https://ai.meta.com/muse/download (official; fetch summary: "Muse for Mac OS", offered as macOS download, also says iPhone and Android apps "free").
- Mac requirements Apple Silicon M1+ and macOS 15+: from press search results only (unverified; the official page summary listed no requirements).
- Native vs wrapper: unknown. Not stated in sources.
- Regions: US at launch (official intro page, TechCrunch). Help Center says supported countries only.
- Windows, Linux: none found.

### 6. Agent abilities
- Official: remembers "what matters to a person", can "make suggestions unprompted"; "keeps working after people close the app, and comes back when something changes or when it needs approval". Customisable name, avatar, communication style (Wikipedia, tertiary).
- Scheduled tasks and connectors are described as the two core primitives (third-party dev blog, press-level: https://dev.to/ying_liao_0a481102ff971b4/automating-real-work-with-muse-connectors-scheduled-tasks-58co).
- Multi-agent: the "lead session spawns child agents" description is from the Muse Code coding harness docs (https://dev.meta.ai/docs/muse-code/extending, search snippet), which is a developer tool, not the consumer Muse app. Consumer app: no multi-bot or group-chat feature found. Unknown.
- Skills: SKILL.md under .agents/skills/ is Muse Code, not the consumer app.
- Limits on number of agents or routines: unknown.
- Hourly process builds "a page for every person in the user's life" (researchers via Gizmodo, press, 2026-10-05): https://gizmodo.com/metas-muse-is-collecting-information-on-everyone-in-your-life-2000821697

### 7. Computer use
- Cloud: "Muse Secure VM", a dedicated Linux computer in Meta's cloud with its own browser, storage, CPU, memory. Official intro page; details from unite.ai (press).
- Mac: controls apps on your Mac "with permission". Official download page: "organizes files, fills out forms, and pulls from Messages, Calendar and Notes, all with your permission". Press says first setup screen asks for Screen Recording and Accessibility, Full Disk Access optional; sensitive actions like deleting files or sending messages need approval (press: unite.ai, BetaNews, MarkTechPost, not independently confirmed on Meta pages).
- Browser use: yes, in the VM; integrated browser shows activity in real time (Wikipedia).
- Phone calls: marketed. Reuters (via explainx.ai and TheNextWeb, press) reported contractors placed calls in tests, success 95 to 98 percent with humans; Meta said lack of disclosure was a mistake and rolled the feature back. Texts: email address for Muse announced; WhatsApp as a chat channel. SMS: unknown.
- Glasses: coming "in the coming months"; over 100 styles by year end (official Connect post).

### 8. App connections
- Official Connect post: partners added include Walmart, Best Buy, Sephora, Gap, Wayfair, Shop Pay, PayPal, Instacart, Notion, GitHub, Box, full Shopify catalogue; Expedia coming soon. Intro post: Link by Stripe for checkout; Shop Pay and 1Password support coming.
- Count: "dozens" (official phrase as reported). No exact number.
- Custom MCP: reported by third parties (Postiz, Tru Commerce, DEV blog), saying Meta does not review custom connectors and MCP tools bypass sandboxing. Press-level; verify on a Meta page before claiming.

### 9. Data
- Official safety post (Meta research, read 2026-10-05): https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse
  - "Your dedicated VM is the system of record for everything you put in Muse." Credentials stored in the per-user VM.
  - Training: "trajectories are sanitized to remove key personally identifiable information before being used in training"; user can opt out in settings.
- Intro post: "Muse doesn't share a person's conversations or the data in their VM with Meta's ad systems"; users "can opt out of their interactions being used to train Meta's AI models". So training is on by default.
- Planned "Muse Confidential VM" later in 2026 with user-held keys (press: unite.ai, Wikipedia). Not available yet.
- Retention period: unknown.
- Mac app: data processed in Meta's cloud VM; what stays local is unknown.

### 10. Permissions
- Sentinel is "the sole permission authority for approval to perform actions with connectors to third-party services and for all egress over the network" (official safety post). On "ask", execution stops and a pending approval goes to the app UI. Grants: one-time, session-scoped, task-scoped, time-bounded or perpetual.
- Per-app access levels, e.g. read mail vs also send (official intro post). Defence against prompt injection: classifiers ensemble plus human approvals.
- Not found: a named autonomy ladder like Read only / Auto / Full access.

### 11. Positioning (their words)
- "The World's First Personal AI Agent Built for Everyone" (title of the about.fb.com post).
- "a first-of-a-kind personal AI agent that proactively helps you meet your goals" (Connect post).
- Other press-quoted line: "a personal AI agent with its own computer and its own wallet" (search result summary, press).

### 12. Weaknesses and controversies (all press unless noted)
- Amazon blocked Muse 2026-09-21, saying it got no notice or choice and citing credential handling (Wikipedia; CNN 2026-09-28, https://cnn.com/2026/09/28/tech/meta-muse-ai-agents-amazon, page returned 451 to me so only the search snippet was used).
- Human call-center callers behind AI calls, undisclosed to testers; racist remark incident; rolled back (Reuters via TheNextWeb https://thenextweb.com/news/meta-muse-ai-agent-human-concierge-calls, 404 Media, others).
- Mac zero-day found by Patrick Wardle: malware under the user's account could redirect the transcription endpoint and hijack the auth token; Meta removed the setting within about a day (explainx.ai, press-level).
- Gizmodo 2026-10-05: hourly job builds profile pages on every person in the user's life, including non-users. Meta replied data stays in each user's dedicated VM.
- TechCrunch: Meta's privacy history (FTC settlements 2011, 2019, 2023, Cambridge Analytica) and claims need independent verification.
- US only; free limit undisclosed; training on by default.

### 13. Marketing and video
- Official Facebook video page "Introducing Muse, your personal AI agent from Meta that gets things done across every part of life" (https://www.facebook.com/muse/videos/introducing-muse-your-personal-ai-agent-from-meta-that-gets-things-done-across-e/1871514170486895/). A search snippet showed "414K views"; fetch gave no length, structure or date. Unknown: length, structure, style.
- Themes visible in text: does the work for you, has its own computer and wallet, keeps working when the app is closed, lives in WhatsApp and glasses, Connect pushes voice, avatar, glasses, Charm device.
- Emphasis on safety architecture (Secure VM, Sentinel) in the launch post.
- To do before scripting a contrast: watch the video itself; I could not.

## Gaps
- Official Meta terms and privacy policy for Muse not fetched.
- Exact Mac requirements, version and whether it ships signed/notarized: unknown from official sources.
- The opencode availability of Muse Spark: not verified.
- Whether custom MCP is in the consumer Muse app: unverified.
