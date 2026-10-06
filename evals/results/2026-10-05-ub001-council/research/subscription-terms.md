# Subscription route terms check (as of 2026-10-05)

Source of routes: shared/provider-catalog.ts (788 lines). Research only, nothing edited.
Method: web search plus fetch of vendor pages. Where a vendor page could not be fetched directly, the quote is marked "via search snippet". Not legal advice.

## Verdict table

| # | Route (id, label, file:line) | Auth | Vendor position | Verdict |
|---|---|---|---|---|
| 1 | openai / ChatGPT, provider-catalog.ts:79, 85-86 (oauth block 114-122) | Device code using the Codex CLI client id against auth.openai.com, calls chatgpt.com/backend-api/codex | Allowed for open-source local apps, but only via the new Sign in with ChatGPT OAuth (announced 2026-09-29). Our device flow copies the Codex CLI, not that path. | May show and name (open source), switch to the official flow first |
| 2 | github-copilot / GitHub Copilot, :150, 156-157 (oauth 174-181) | Device code (RFC 8628), OAuth app client id, api.githubcopilot.com | Officially supported only for OpenCode (2026-01-16). Other apps: no GitHub statement, community says outside supported clients breaches terms. | Don't show |
| 3 | opencode-go / OpenCode Go, :198, 205 | Plan key from opencode.ai/auth | Documented for third-party agents ("Use with any agent"), with user-agent and session-id rules | May show and name |
| 4 | zai / GLM Coding Plan, :221, 228 | Plan key | Prohibited outside officially supported tools, bans after 3 violations | Don't show |
| 5 | moonshot / Kimi Code, :262, 269 | Plan key from kimi.com/code/console | Documented for third-party coding agents (named list), must keep genuine User-Agent | May show without naming |
| 6 | alibaba / Qwen Coding Plan, :300, 307 | Plan key | Prohibited for custom app backends and non-interactive use | Don't show |
| 7 | minimax / MiniMax Token Plan, :343, 350 | Plan key | Explicitly designed for third-party harnesses (official post) | May show and name |
| 8 | xiaomi / MiMo Token Plan, :383, 390 | Plan key | Documented for named coding tools, bars scripts and custom backends (via search snippet) | May show without naming |
| 9 | command-code / Command Code, :425, 432 | Provider key from commandcode.ai/settings/keys | API access on paid plans only, Go plan excluded and bans reported for using it | Don't show |

Ollama Cloud is NOT a subscription route in this file: it is mode "api" (ollama:670-671, kindLabel API). No Anthropic or Google subscription route exists in the file (anthropic:458 and google:485 are mode "api"). Do not show Anthropic as a subscription.

## Memory check (providers-v2-shipped.md, dated 2026-09-18)

Memory said: subscription sign-in only for ChatGPT and Copilot; coding plans are keys; Claude and Google forbidden; Qwen OAuth discontinued.
- Still true: catalog has OAuth only for those two (openai:85, github-copilot:156); every other plan is a key.
- Changed: OpenAI launched official Sign in with ChatGPT on 2026-09-29 (after the memory). It is the sanctioned path for open-source apps. The catalog still uses the Codex CLI device flow (client id from codex-rs, provider-catalog.ts:100-122, redirect uri 121), which OpenAI's new docs do not describe.
- Memory did not check per-plan third-party terms for the key plans. Findings below show Z.ai, Alibaba and Command Code restrict this use; the memory's "coding plans are keys, shown under Subscription" is not safe for those three.
- Claude and Google claims not re-verified (out of scope, not in file as subscription).

## Per route detail

### 1. ChatGPT (openai, oauth) - provider-catalog.ts:85-86, device-code config 114-122
- Auth: device code. deviceUrl auth.openai.com/api/accounts/deviceauth/usercode (:117), tokenUrl /oauth/token (:118), base chatgpt.com/backend-api/codex (:90), protocol openai-responses.
- Position: explicitly allowed through the official route. Quotes:
  - "ChatGPT plan usage is an optional capability within Sign in with ChatGPT. In addition to identity scopes, your open-source app can request permission to use the user's ChatGPT plan for eligible Responses API requests." https://developers.openai.com/siwc/token-sharing-open-source (fetched 2026-10-05)
  - "If you're interested in offering it in a paid or remotely hosted app, complete the interest form." same page.
  - Registration needs no pre-approval: "Start first-time registration with client_id=dynamic_agent_client", endpoints auth.openai.com/api/accounts/authorize and /api/accounts/oauth/token. https://developers.openai.com/siwc/token-sharing-open-source/sign-in
  - Announcement: DevDay 2026-09-29, Plus and Pro, users set weekly caps per app, usage stops at the cap (https://www.explainx.ai/blog/openai-sign-in-with-chatgpt-devday-2026, https://thenewstack.io/sign-in-with-chatgpt/). Help article cited: help.openai.com/en/articles/20001542 (returned 403 to fetch).
  - The new docs do not mention Codex CLI client ids or chatgpt.com/backend-api, so our current flow is not covered by them.
- Verdict: may show and name. Our repo is open source, so it qualifies. Caveat for the video: record the flow only after moving to the Sign in with ChatGPT OAuth, or the on-screen flow is the Codex-CLI impersonation, not the sanctioned one. Preview limits: no image generation, hosted file search or Code Interpreter.

### 2. GitHub Copilot (github-copilot, oauth) - :150, 156-157, oauth 174-181
- Auth: device code, client id Ov23li8tweQw6odWQebz (:176), scope read:user, exchange via api.github.com/copilot_internal/v2/token (:180) then api.githubcopilot.com.
- Position: documented for OpenCode only. Quote: "GitHub is officially supporting using your Copilot Pro, Pro+, Business, or Enterprise subscription with OpenCode" and "run /connect and select GitHub Copilot. Complete the GitHub device login flow." https://github.blog/changelog/2026-01-16-github-copilot-now-supports-opencode/ (2026-01-16). Copilot SDK docs list OAuth apps, gho_/ghu_/PAT tokens, and BYOK as documented auth for third-party apps: https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate. Nothing from GitHub blesses the copilot_internal exchange for other apps; the GitHub discussion #178117 on it is unanswered by staff.
- Community reading (not GitHub): using Copilot tokens outside supported clients breaches the terms (search summary of GitHub community threads, e.g. discussions/206143, treat as unofficial). Also OAuth apps get a restricted model list there.
- Verdict: don't show. Silent for us, partnership exists only for OpenCode, and we use the internal endpoint.

### 3. OpenCode Go (opencode-go, plan) - :198, 205, opencodeSession :215
- Auth: plan key from opencode.ai/auth (:211), base opencode.ai/zen/go/v1.
- Position: documented for third-party use. Quotes: FAQ "Can I use Go with other coding agents?" answered "Use with any agent." https://opencode.ai/go . Docs: "Clients must identify themselves with proper user agents and session IDs" and "Traffic is monitored for abuse that degrades the experience for other users." https://opencode.ai/docs/go/ . Our opencodeSession flag (:215) exists for that header rule.
- Verdict: may show and name. Keep the user-agent and session-id behaviour intact.

### 4. GLM Coding Plan (zai, plan) - :221, 228
- Auth: plan key, base api.z.ai/api/coding/paas/v4.
- Position: prohibited. Quotes: "The GLM Coding Plan is strictly limited to use within officially supported tools and products." and "The subscriber shall not use the subscription benefits in any unsupported tools or scenarios." https://docs.z.ai/devpack/faq . Via search snippet of the same FAQ: unsupported tools "such as SDK-based access or other third-party integrations" restrict benefits, and "Violating the Usage Rules three or more times will result in an account ban." Supported list (search result, Z.ai pages): Claude Code, Cursor, Cline, Roo Code, Kilo Code, OpenCode, Crush, Goose, TRAE, Qoder, Factory Droid and others; Useful Bot is not on it. Pre-existing policy, no change found in Sep or Oct 2026.
- Verdict: don't show. Ban risk for users.

### 5. Kimi Code (moonshot, plan) - :262, 269
- Auth: plan key from kimi.com/code/console, base api.kimi.com/coding/v1.
- Position: documented for third-party coding agents with a named list. Quotes: works with "Claude Code, Roo Code, OpenClaw, and Hermes"; "When using third-party tools, please keep the tool's genuine identity; tampering with the client identifier (User-Agent) will be treated as a violation and may result in suspension of your membership benefits." https://www.kimi.com/en/help/kimi-code/third-party-agents . A forum thread asks how to get a new agent added (https://forum.moonshot.ai/t/what-is-the-official-process-for-adding-a-third-party-coding-agent-to-kimi-code/464); we are not on the list.
- Verdict: may show without naming. Allowed in principle for coding agents, but we are not a listed agent, and spoofing a User-Agent is a violation.

### 6. Qwen Coding Plan (alibaba, plan) - :300, 307
- Auth: plan key, base coding-intl.dashscope.aliyuncs.com/v1 (:312).
- Position: prohibited for apps. Quotes: "This plan is for interactive use in programming tools such as Claude Code, Qoder, Qoder CN, and OpenClaw." and "Do not use the plan's API key for automated scripts, application backends, or other non-interactive scenarios." and "Using the API key outside the permitted scope is a violation that may result in subscription suspension or API key revocation." https://www.alibabacloud.com/help/en/model-studio/coding-plan (page updated 2026-09-28; Lite closed to new subscribers 2026-03-20). The personal Token Plan page repeats it: "must not be used for automation scripts, custom application backends, or any non-interactive batch call scenarios." https://help.aliyun.com/en/model-studio/token-plan-personal-overview
- Verdict: don't show.

### 7. MiniMax Token Plan (minimax, plan) - :343, 350
- Auth: plan key, base api.minimax.io/v1.
- Position: explicitly allowed. Quote (MiniMax official X, early April 2026; page itself returned 402 so via search snippet): "The MiniMax Token Plan was designed from the beginning to be used across third-party harnesses." https://x.com/MiniMax_AI/status/2040431340961542460 . Docs list many third-party tools and say usage "is not restricted to specific websites and applications" (search snippet of https://platform.minimax.io/docs/token-plan/intro and /other-tools). No prohibition found in the fetched docs, but I did not read the full terms of service.
- Verdict: may show and name. The Token Plan is now branded "M Plan" in some listings; check the label before filming.

### 8. MiMo Token Plan (xiaomi, plan) - :383, 390
- Auth: plan key, base token-plan-sgp.xiaomimimo.com/v1.
- Position: documented for named coding tools, restricted for scripts and backends. Via search snippet of the vendor docs: "The quota of the Token Plan package is only available for use in programming tools (such as OpenClaw, OpenCode, etc.), and it is prohibited to use it in the form of API calls for request behaviors in obvious non-coding scenarios such as automated scripts and custom application backends." Fetched vendor page (https://mimo.mi.com/docs/en-US/price/token-plan, updated 2026-09-21) confirms "mainstream development toolchains including OpenCode, OpenClaw, Claude Code" but did not show the prohibition text; I could not confirm it first-hand.
- Verdict: may show without naming. A general chat app is arguably not "programming tools", so be cautious.

### 9. Command Code (command-code, plan) - :425, 432
- Auth: provider key from commandcode.ai/settings/keys (:442). Base in file is api.commandcode.ai/v1 (:438), marked UNVERIFIED in a comment; docs say https://api.commandcode.ai/provider/v1 so the catalog is probably wrong.
- Position: API access is paid-plan only. Quote: "Every plan except the Go plan has API access - GOAT, Pro, Max, Team, and Provider all use these endpoints." https://commandcode.ai/docs/provider . Also "Use any agent, anywhere. No lock-in". Third-party plugin READMEs report that using the Go plan through third-party tools violates the terms and accounts were banned (unofficial, via search). Did not read commandcode.ai/terms.
- Verdict: don't show. Plan tier dependent, Go plan banned, base URL likely wrong.

## One-line API key and local routes (no terms check)
- Anthropic, api key: provider-catalog.ts:452 (mode line 458)
- Google, api key: :479 (485)
- xAI Grok, api key: :501 (507)
- DeepSeek, api key: :526 (532)
- OpenRouter, api key: :550 (556)
- Vercel AI Gateway, api key: :585 (591)
- Cloudflare Workers AI, key plus account id: :610 (616)
- OpenCode Zen, api key (pay as you go, not Go): :638 (644)
- Ollama Cloud, api key: :664 (670); Ollama local: (684)
- LM Studio, local: :705 (711)
- Custom provider, local/any URL: :730 (736)
- Also api twins of plan rows: OpenAI API :131, Z.ai :242, Moonshot :283, Qwen DashScope :324, MiniMax :364, Xiaomi MiMo :406.

## Suggested launch-video line
Show and name: ChatGPT (after moving to the official Sign in with ChatGPT flow), OpenCode Go, MiniMax Token Plan. Show without naming: Kimi Code, MiMo. Do not show: GitHub Copilot, GLM Coding Plan, Qwen Coding Plan, Command Code.

## Sources
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://thenewstack.io/sign-in-with-chatgpt/ ; https://www.explainx.ai/blog/openai-sign-in-with-chatgpt-devday-2026 ; https://xenospectrum.com/en/chatgpt-sign-in-subscription-apps/
- https://github.blog/changelog/2026-01-16-github-copilot-now-supports-opencode/
- https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate
- https://github.com/orgs/community/discussions/178117 (unanswered)
- https://opencode.ai/go ; https://opencode.ai/docs/go/
- https://docs.z.ai/devpack/faq
- https://www.kimi.com/en/help/kimi-code/third-party-agents
- https://www.alibabacloud.com/help/en/model-studio/coding-plan ; https://help.aliyun.com/en/model-studio/token-plan-personal-overview
- https://x.com/MiniMax_AI/status/2040431340961542460 ; https://platform.minimax.io/docs/token-plan/other-tools
- https://mimo.mi.com/docs/en-US/price/token-plan
- https://commandcode.ai/docs/provider
