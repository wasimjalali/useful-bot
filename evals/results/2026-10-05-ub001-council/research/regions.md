# Regional availability, read 2026-10-05

Labels: [official] vendor page, fetched or via search snippet. [press] third party. UNKNOWN = no source found.

| Product | EU/EEA | UK | CH | Other limits | Sources |
|---|---|---|---|---|---|
| Grok Bot (beta) | UNKNOWN. Official pages state no regional limits and no country list [official, silence]. | UNKNOWN (same) | UNKNOWN (same) | Plans: SuperGrok / Plus / Heavy, Cursor Pro / Pro+ / Ultra, Cursor Teams Standard / Premium. Desktop + iOS at launch (2026-08-11); Android listed in docs now. Enterprise waitlist. Cloud computers run in the US today [official, Cursor docs]. | https://x.ai/news/introducing-grok-bot (2026-08-11); https://x.ai/news/grok-bot-more-plans (2026-08-26); https://docs.x.ai/grok-bot/overview ; https://cursor.com/docs/grok-bot/security (US hosting; "not the same as Cursor's US-only data residency program") |
| Meta Muse | Not available, no date [press] | Not available, no date [press] | Not listed, no date [press] | Launched US 2026-09-08 (iOS, Android, muse.ai; AI glasses "coming soon") [official]. Canada added 2026-09-18 [press]. Mexico unconfirmed [press]. 18+. Signup elsewhere shows "Muse isn't available in your country or region yet" [press]. No Meta statement found citing EU AI Act or DMA. Apple App Store US listing exists; iPhone only, iOS 18+. Google Play: press says #1 on 2026-09-19, store page not fetched. | https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/ (US rollout) [official]; https://apps.apple.com/us/app/muse-from-meta/id6760173601 [official]; https://techcrunch.com/2026/09/25/meta-is-putting-its-muscle-behind-muse-as-the-ai-app-takes-off/ (US and Canada only) [press]; https://www.aiagentslibrary.com/blog/meta-muse-availability/ [press]; https://www.gbnews.com/tech/meta-muse-ai-agent-uk (headline "UK misses out", body not read, paywalled) [press] |
| OpenAI dots | Pro: excluded. Business Premium: available in all ChatGPT-supported regions. Enterprise/Edu/Healthcare: supported regions, admin turns on, off by default | Same as EEA | Same as EEA | Pro and Business Premium only at launch, 18+, creation on desktop app or desktop browser only. SMS/texting beta is US Pro only. Unsupported-region access "may lead to account blocking" per help center. Separate feature "Computer History" (Mac desktop app, Pro) now reaches EEA/UK/CH per OpenAI search snippet; not dots computer use, so computer-use region limits for dots are UNKNOWN beyond the above. No OpenAI reason for the exclusion found. | help.openai.com dots article: direct fetch 403, wording confirmed only via search snippets and https://smartscope.blog/en/blog/openai-dots-regional-availability-2026/ (quotes the help center) [press quoting official]; https://help.openai.com/en/articles/6825453-chatgpt-release-notes (snippet); https://x.com/OpenAI/status/2087996499263369267 (Computer History, snippet) |
| OpenBot (openbot.run, nightly-labs) | No stated limit | No stated limit | No stated limit | Free; macOS 13+, Windows 10+, Linux. Accounts optional (email codes), not needed locally. Uses your own provider plan or API key, so provider regions apply. License PolyForm Noncommercial 1.0.0 (commercial use needs a license). | https://openbot.run/ ; https://github.com/nightly-labs/openbot (both read 2026-10-05) |

## Providers Useful Bot connects to

| Provider | EU/EEA | UK | CH | Source |
|---|---|---|---|---|
| OpenAI API | Listed supported | Listed | Listed | https://developers.openai.com/api/docs/supported-countries (read 2026-10-05; "outside the countries listed may result in your account being blocked or suspended") |
| ChatGPT (consumer) | Not verified (help page 403) | | | UNKNOWN |
| Anthropic API | Listed supported (all 27 EU states, plus IS, LI, NO) | Listed | Listed | https://www.anthropic.com/supported-countries (read 2026-10-05, page date not shown) |
| Google Gemini API | Listed available | Listed | Listed | https://ai.google.dev/gemini-api/docs/available-regions (read 2026-10-05) |
| xAI API | No country block list found. Global endpoint plus US-only regional endpoint (grok-4.7, 4.6 only, +10% price). EEA/UK/CH users governed partly by Europe Specific Terms. | same | same | https://docs.x.ai/developers/regions (search snippet); https://x.ai/legal/terms-of-service (fetch 403, snippet only). Supported-country list: UNKNOWN |
| OpenRouter | No fixed country list. Terms bar access to models whose provider restricts your country. EU in-region routing exists on Business/Enterprise plans. | | | https://openrouter.ai/terms ; https://openrouter.ai/docs/guides/features/in-region-routing (snippets) |
| LM Studio / Ollama (local) | No account needed | | | Not checked on vendor pages; follows from running local. Mark as inference. |

## Notes
- Grok Bot: the "no regional restriction published" statement is silence, not confirmation of availability. A press piece (tryagentsonic.com, 2026-09-29) says the same. Do not claim it works in the EU.
- Grok Bot SuperGrok/X Premium+ regional availability: not checked on help.x.com (not reached). UNKNOWN. X Premium+ was not named in the official Grok Bot pages read, only SuperGrok and Cursor plans.
- Cursor: help page https://cursor.com/help/security-and-privacy/regions says model availability varies by provider region; Grok 4.5 in EU is a press-sourced claim. No Cursor Grok Bot country list found.
- Muse "US only" is out of date: Canada added 2026-09-18 per press. Official Meta post only says US.
- dots Pro exclusion applies to the EEA, CH and UK together. The Business Premium path is the only EU-side route.
- Many "availability" blogs about these products are SEO pages; I used them only where they quote or match an official source.

## Honest launch-video claim
Say: "Useful Bot is a download for your Mac, with no account of ours. Where you can use it depends on the AI provider you connect, and you can also run local models with no account at all."
Do NOT say: "Available worldwide", or "works in the EU where X, Y or Z don't". Grok Bot's EU status is unknown, and Useful Bot itself is only as available as its providers. Also avoid "unlike Muse and dots, Useful Bot has no region limits" as a flat claim; the true form is "the app has no region lock of its own, your chosen provider does". Also not verified: that macOS app distribution (notarized DMG) has no export or sanctions limits.
