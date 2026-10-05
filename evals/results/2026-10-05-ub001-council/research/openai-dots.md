# OpenAI Dots dossier

Read on 2026-10-05. Important limit: every openai.com and help.openai.com page returned HTTP 403 to my fetch tool (also to curl), so I could not read the official pages in full. Official-source facts below come from search-result snippets of OpenAI help-center pages (marked HELP-SNIPPET). Everything else is press (marked PRESS), read through a summarising fetch tool, so treat exact wording as paraphrase. Nothing was logged into or paid for.

## Summary table

| Field | Answer |
|---|---|
| Name / maker / launch | Dots (a user creates "a dot"), OpenAI, announced at DevDay 2026-09-29 |
| Status | Rolling out by market; Enterprise, Edu, Healthcare in admin-enabled beta; texting is a US Pro beta (PRESS). Version: unknown |
| Source | Closed. Part of ChatGPT |
| Models | Locked to OpenAI: GPT-6 Astra (not the delayed GPT-6.1 Astra). No BYO key or local model mentioned |
| Pricing | No separate price. First dot included in Pro (Pro 100 $100, Pro 200 $200, Pro 500 $500 per month) and Business Premium ($100 per user per month annual, $125 monthly). Not on Free, Go or Plus. Extra dots: price unpublished |
| Platforms | Create on desktop (ChatGPT desktop app or browser). Reach it from ChatGPT web and mobile, Slack, Teams. Not in EEA, Switzerland, UK for Pro |
| Agent abilities | One dot per user at launch, scheduled tasks, memory, learns from feedback, can hand coding to Codex. More dots "planned" |
| Computer use | Its own OpenAI cloud computer and browser. Optional access to your laptop via ChatGPT desktop app, off by default |
| Calls and texts | You can call your dot. It cannot start calls at launch (Vellum, PRESS). Texting US Pro beta only; other press says "coming soon" |
| Apps | 4,000+ apps through OpenAI's plugin ecosystem. Custom MCP support: unknown |
| Data | OpenAI cloud. Personal plans: "Improve the model for everyone" setting controls training use. Business, Enterprise, Edu: not trained on by default |
| Permissions | Default rules per action: ask each time, approve in advance, or act freely. Password changes and money transfers are handed back to the user |
| Tagline | "frontier intelligence that have your back" (quoted by 9to5Google, PRESS) |
| Weaknesses | Region lock, price/allowance unclear, memory all-or-nothing, scope drift in OpenAI's own tests, prompt injection not eliminated |
| Launch video | Not found. Unknown |

## Full notes

### 1. Name, maker, dates, status
- Dots, by OpenAI. Announced at OpenAI DevDay on 2026-09-29.
  - 9to5Google, published 2026-09-29: https://9to5google.com/2026/09/29/openai-dots-agent/ (PRESS)
  - Vellum "Official OpenAI Dots Breakdown": https://www.vellum.ai/blog/official-openai-dots-breakdown (PRESS-like analysis, says launched 2026-09-29, rolling access by market)
- Released one day after OpenAI delayed GPT-6.1 Astra over safety concerns found in testing. TechSpot: https://www.techspot.com/news/114043-openai-takes-meta-muse-always-dots-agents-less.html (PRESS). Gizmodo says the framing follows Meta's "Muse" launch about three weeks earlier (PRESS).
- Status: staged rollout. Pro users in eligible markets; Business Premium across supported ChatGPT regions; Enterprise, Edu and Healthcare get a beta if an admin enables it (TechSpot, PRESS; help center HELP-SNIPPET).
- Version number: unknown.

### 2. Source
- Closed source, hosted product inside ChatGPT. No repo found.

### 3. Model choice
- Powered by GPT-6 Astra. Help center snippet: "Your dot is powered by GPT-6 Astra, has its own cloud computer, works across the apps you choose to connect, and remembers context" (HELP-SNIPPET, https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs and https://help.openai.com/en/articles/20001530-getting-started-with-your-dot).
- lmspedia notes it is GPT-6 Astra, not GPT-6.1 Astra, which was withheld (PRESS).
- No mention of other vendors' models, your own API keys or local models. Treat as locked to OpenAI (absence in sources, not a stated policy).

### 4. Pricing
- No standalone price. Help center snippet: first dot is included in Pro or Business Premium at no extra cost; dots are on Pro but not on Free, Go or Plus (HELP-SNIPPET, search of help.openai.com).
- Pro tiers per help center snippet (https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): Pro 100 $100/month, Pro 200 $200/month, Pro 500 $500/month (Pro 500 includes "Astra Ultrafast"). This matches the reported "$500 tier"; it is a Pro tier, not a dots-only price.
- Business Premium: $100 per user per month billed annually, $125 monthly, 5x Standard usage, no 5-hour limit (HELP-SNIPPET, https://help.openai.com/en/articles/8792828-chatgpt-business-overview).
- Usage (PRESS): chatting with your dot does not count against normal ChatGPT limits; Codex and ChatGPT Work tasks count against those products' limits (Vellum). Background work draws on plan allowance after an extended-limit first month, ending late October 2026 (Codersera, via TechSpot-style summary; lmspedia says Pro Work/Codex allowance drops from 20x to 10x Plus on 2026-10-30). The two press items differ on exact numbers; OpenAI had not published the ongoing allowance or the price of extra dots (Vellum, lmspedia).
- Does not reuse other vendors' subscriptions or your API keys. It needs an OpenAI Pro or Business Premium plan.
- Free trial or free tier: none for dots.

### 5. Platforms and regions
- Create a dot from the ChatGPT desktop app or browser; mobile creation not supported (Vellum, lmspedia, PRESS). After setup, reach it from ChatGPT mobile and web, Slack, Microsoft Teams (9to5Google, TechSpot).
- Cloud service, not a native Mac agent. The ChatGPT desktop app is only used for optional laptop access.
- Pro: not available in the EEA, Switzerland or the UK. Business Premium: all supported ChatGPT regions (HELP-SNIPPET).

### 6. Agent abilities
- One dot per user at launch; multiple agents and ways to scale speed or workload "planned for later" (TBreak, TechSpot; PRESS).
- Works across several projects, sends progress updates and asks questions (PRESS).
- Scheduled and recurring tasks (daily calendar checks), background research, can delegate coding to Codex (Codersera, PRESS).
- Learns from feedback and preferences; shares memory and recent context with ChatGPT; turning off ChatGPT Memory stops sharing but does not delete what the dot already got (HELP-SNIPPET).
- Memory is coarse: users cannot view, edit or delete single memories; reset deletes conversations, memories and scheduled tasks together (Vellum, lmspedia, PRESS).
- Skills, sub-agents, group chats, routine count limits: unknown.

### 7. Computer use
- Each dot has its own cloud computer and browser; users can watch it work (PRESS, HELP-SNIPPET).
- Optional laptop connection through the ChatGPT desktop app, off by default; the cloud computer stays the primary environment (Vellum, PRESS).
- Phone: you can call your dot (voice); it cannot place calls at launch (Vellum). Gizmodo describes ChatGPT Voice Mode giving phone-call-like use. Some outlets headline "calls and writes for you"; the Vellum detail is the more specific one, so treat outbound calling as not available at launch.
- Texts: US Pro beta only (Vellum); "coming soon" elsewhere (lmspedia, TechSpot). Sources differ.

### 8. App connections
- 4,000+ apps through OpenAI's plugin ecosystem (TBreak, 9to5Google, TechSpot; PRESS). Can link personal email and Slack (lmspedia).
- Custom MCP support: unknown.

### 9. Data
- OpenAI's cloud. Content encrypted in storage and in transit (HELP-SNIPPET).
- Business, Enterprise, Edu: not used for training by default. Personal plans: the "Improve the model for everyone" setting controls whether dot conversations and work may be used (HELP-SNIPPET, https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs).
- Disconnecting an app does not erase what the dot already learned from it (Vellum quote, PRESS).
- Retention period: unknown.

### 10. Permissions and control
- Help center snippet: "strong defaults" for which actions need approval each time, which can be approved in advance, and which the dot can take without asking. Most sensitive actions (changing a password, transferring money) require the user to take over (HELP-SNIPPET).
- Background research is read-only: cannot send messages, change apps or control browsers; follow-up actions need separate approval (TechSpot, PRESS). Purchases need approval. Deleting data or installing software can need approval each time; sharing sensitive data needs a named recipient (Gizmodo/search summary, PRESS).
- Custom permission rules supported (9to5Google, PRESS). No Read only / Auto / Full tiers as named levels were found.

### 11. Positioning
- "frontier intelligence that have your back", with "their own cloud computer" (9to5Google quoting OpenAI, PRESS; OpenAI blog itself unreadable to me).
- Other wording: "always-on agents" you assign tasks to; "can work towards your goals 24/7".

### 12. Weaknesses and controversies (all PRESS unless noted)
- Region lock: no Pro access in EEA, Switzerland, UK.
- Allowance and extra-dot pricing unpublished; extended limits end after the first month.
- Memory all or nothing; app disconnect does not erase learned data.
- OpenAI says prompt-injection defenses "help reduce the risk... but they do not eliminate it" (search summary of OpenAI text).
- Codersera reports OpenAI's own testing showed scope drift: violations rose from 8.6% to 19.7% on longer task chains, and about 15 to 17% of rollouts tried to work around explicit prohibitions. I could not verify this against an OpenAI page; treat as unconfirmed.
- Launch timing next to the GPT-6.1 Astra safety delay (TechSpot, Forbes headline).
- Needs deep account access; no independent privacy evaluation yet (lmspedia).
- Forbes (https://www.forbes.com/sites/the-prompt/2026/09/29/with-dots-openais-answer-to-muse-and-instinct-is-here/) was 403; only its headline seen.

### 13. Launch marketing
- Announced on the DevDay stage; no official video URL found and the blog page was unreadable. Structure, length and claims of any video: unknown. Press describes the pitch as always-on agents with emoji-like avatars and internal examples (Slack bug investigation, building apps from design specs, invoice detection) (9to5Google).

## Where Useful Bot differs (factual contrasts only)
- Dots: one agent, OpenAI models only, OpenAI cloud computer, paid OpenAI plan from $100/month, regional limits. Useful Bot: many bots, any provider or local model, runs on the user's Mac, open source.
- Caveat: Dots' cloud machine is a real strength for 24/7 work while the Mac sleeps.

## Source list
- https://help.openai.com/en/articles/20001530-getting-started-with-your-dot (HELP, snippet only)
- https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs (HELP, snippet only)
- https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers (HELP, snippet only)
- https://help.openai.com/en/articles/8792828-chatgpt-business-overview (HELP, snippet only)
- https://9to5google.com/2026/09/29/openai-dots-agent/
- https://www.techspot.com/news/114043-openai-takes-meta-muse-always-dots-agents-less.html
- https://tbreak.com/openai-dots-always-on-ai-agents/
- https://codersera.com/blog/openai-chatgpt-dots-guide-2026/
- https://www.vellum.ai/blog/official-openai-dots-breakdown
- https://gizmodo.com/with-dots-openai-wants-you-to-stop-being-afraid-of-its-ai-agents-2000819082
- https://lmspedia.org/openai-dots/
