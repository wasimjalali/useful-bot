# Deepgram TTS research for the launch voice-over (checked 2026-10-05)

Method: pages fetched through a summarising fetch tool, so exact wording and tables are the tool's rendering. Re-check anything you will bake in. Nothing was signed up for or called.

## 1. Current models
- Two families (https://developers.deepgram.com/docs/voice-agent-tts-models, 2026-10-05):
  - **Flux TTS** (newer, GA, `/v2/speak`, models `flux-{voice}-en`). Streaming WebSocket and batch REST. Built for live voice agents. Changelog: GA with self-hosted release 260826 (2026-08-26); inline pause and IPA pronunciation controls 2026-09-30; speed range widened to 0.5 to 1.5 on 2026-08-31 (https://developers.deepgram.com/changelog).
  - **Aura-2** (April 2025) and Aura-1, `/v1/speak`, still supported, "no forced migration" (https://deepgram.com/learn/flux-tts-what-ships-at-ga). Aura-2 is the one with the large English catalog (40 voices) and the 2000-char limit.
- Expressive narration: Flux is the only one with an `expressivity` control (-2 calm to +2 animated, default 0). It is beta: "only the default value is validated for production; non-default settings increase hallucination and pronunciation error risk" and it is not on Aura-2 (https://deepgram.com/learn/emotional-text-to-speech-expressivity-controls). Deepgram's own marketing claims Flux wins blind tests (73.4 percent overall, 77.5 percent on expressiveness; vendor claim, https://deepgram.com/product/text-to-speech/flux).
- Recommendation: audition **Flux first** (batch REST, mp3, expressivity 0 then +1), keep **Aura-2** as the fallback. Flux is tuned for conversation, not narration, so a listening test decides. Caveat: Flux's best controls conflict (see 3).

## 2. Voices
Official samples: the docs have no audio sample URLs. Deepgram says to preview all Flux voices live at https://talk.deepgram.com (https://developers.deepgram.com/docs/flux-tts/voices). No separate Aura-2 sample page was found in the fetched docs.

### Flux (26 voices listed in the docs, page says 36 at launch; the docs table has 26)
Source: https://developers.deepgram.com/docs/flux-tts/voices (2026-10-05). Model id `flux-<name>-en`.
Shortlist (voice, gender, accent, docs tone, why):
- **Kit** (male, British, young adult): friendly, energetic, thoughtful, calm, helpful. Listed for narration. Warm and bright.
- **Cliff** (male, American, mature): deep, confident, calm, raspy, clear. Listed for narration. Confident, grounded.
- **Hannah** (female, American, young): clear, confident, thoughtful, pleasant. Listed for storytelling.
- **Maeve** (female, Irish, adult): friendly, energetic, confident, gentle, calm. Listed for narration. Distinctive and warm.
- **Rufus** (male, British, adult): friendly, confident, intelligent, gentle, enthusiastic. Listed for storytelling.
- **Wade** (male, American, adult): warm, confident, clear, enthusiastic, friendly. Closest to "warm and confident, not salesy".
Other featured: Alexis, Sienna, Cole, Brooke, Colin, Gemma, Haley, Heather, Miles, Sean. Full table is at the URL above.

### Aura-2 English (40 voices, https://developers.deepgram.com/docs/tts-models, 2026-10-05; id `aura-2-<name>-en`)
Shortlist:
- **Draco** (male, British, adult): warm, approachable, trustworthy, baritone; storytelling.
- **Apollo** (male, American, adult): confident, comfortable, casual.
- **Aries** (male, American): warm, energetic, caring.
- **Athena** (female, American, mature): calm, smooth, professional; storytelling.
- **Cora** (female, American): smooth, melodic, caring; storytelling.
- **Thalia** (female, American): clear, confident, energetic, enthusiastic.
- Also: Hyperion (male, Australian, caring, warm), Theia (female, Australian, expressive, sincere), Jupiter (male, expressive, knowledgeable, baritone), Selene (female, expressive, engaging), Hermes (male, expressive, engaging).
Docs tags are mostly customer-service and IVR use cases; none are marketed as film narrators.

## 3. Controls (exact)
Source: https://developers.deepgram.com/docs/tts-voice-controls and changelog 2026-08-31 / 2026-09-30.
- **SSML: not supported, not on the roadmap** (https://github.com/orgs/deepgram/discussions/1031).
- **Emotion or style tags: none.** Only the Flux `expressivity` integer -2..2, set per connection/request, beta.
- **Speed**: Flux 0.5 to 1.5 in 0.05 steps; Aura-2 0.7 to 1.5. English (Aura-2 also Spanish).
- **Pauses**: punctuation drives pacing (commas and periods short, ellipsis "..." longer). Explicit `{pause:1s}` / `{pause:{duration_ms:500}}` markers: **Flux batch only**, 500 to 3000 ms in 100 ms steps, max 8 per request, speed capped at 1.15 when pauses are used. Not on Aura-2.
- **Emphasis**: no markup. Use punctuation, short sentences, wording.
- **Pronunciation**: inline IPA, e.g. `{"word": "dupilumab", "pronounce": "duːˈpɪljuːmæb"}`. Marked "Early Access" on Flux; the page says Aura-2 supports it fully. Max 500 entries per request, 128 chars per IPA string. Mark primary stress with ˈ.
- **Combination rules**: Flux rejects pronunciation with pause, and pronunciation with speed other than 1.0, and all three together. Aura-2 allows speed plus pronunciation. For this script, pronunciation fixes are likelier needed than pauses, so Aura-2 (speed + IPA) or Flux (IPA only at speed 1.0) are the options.
- Suggested IPA (my own, untested, verify by ear): Useful Bot `ˈjuːsfəl bɒt`/`ˈjuːsfəl bɑːt`; AGPL spell as letters "A G P L" in the text (simplest); MCP "M C P"; Composio `kɒmˈpoʊzioʊ`; LM Studio "L M Studio" or spaced letters; Ollama `oʊˈlɑːmə`. Plain re-spelling in the script ("A G P L") needs no control and works on every model.

## 4. API
- **Aura-2**: `POST https://api.deepgram.com/v1/speak?model=aura-2-thalia-en`, header `Authorization: Token <key>`, JSON body `{"text":"..."}`. **Max 2000 characters per request** (413 beyond). Default linear16 wav 24000 Hz. REST encodings: linear16, mulaw, alaw, mp3, opus, flac, aac; mp3 and aac fixed 22050 Hz, opus 48000 Hz, bit rate settable for compressed (https://developers.deepgram.com/docs/tts-media-output-settings). Response headers `dg-model-name`, `dg-char-count`, `dg-request-id`. Also WebSocket streaming (raw audio only).
- **Flux**: `POST https://api.deepgram.com/v2/speak?model=flux-haley-en` same auth and body (https://developers.deepgram.com/docs/flux-tts/quickstart); mp3/opus/flac/aac batch-only. Streaming `wss://api.deepgram.com/v2/speak`. **Per-request character limit for Flux batch: not found in the docs I could read**; split the script into paragraphs under 2000 chars anyway.
- **Timestamps: none.** No word-level timing from either TTS API. Flux only gives text_spoken / text_remaining on interrupt. For captions, run Deepgram STT (Nova-3, `punctuate`, word timestamps, `utterances`/SRT via the SDK) on the generated audio, or any forced aligner.

## 5. Pricing (https://deepgram.com/pricing, 2026-10-05)
- Aura-2: **$0.030 per 1k chars** pay as you go. Aura-1 $0.015.
- Flux: **$0.045 per 1k chars** PAYG ($0.0405 Growth), free launch period ended 2026-09-12 (https://deepgram.com/product/text-to-speech/flux, third-party recap https://www.layer3labs.io/guides/deepgram-flux-tts-pricing).
- New accounts: **$200 free credit**, no card required, no expiry.
- 7,000 chars (about 250 words x 5 takes, billed on characters sent): Aura-2 about **$0.21**; Flux about **$0.32**. Even 20 takes is under $1.30. Covered fully by the free credit. Billing excludes stripped markup.

## 6. Licensing (https://deepgram.com/terms, 2026-10-05)
- Deepgram claims no ownership of Output; you keep rights in your content; **commercial use allowed**, you are solely responsible for it. No attribution requirement found.
- Conditions: do not misrepresent audio as human-made and give any legally required notice that it is AI generated (s3.5(c)); do not strip or alter watermarks (s2.4(11)); no use of Output for competitive purposes, model training or benchmarking (s2.4(9)). A public video that says "AI voice" in the description satisfies the safe reading. Terms are a legal doc, confirm before publishing; I read a summary of them.

## 7. MCP / skills
- Docs MCP (credential free): `claude mcp add deepgram-docs --scope project --transport http https://api.dx.deepgram.com/kapa/mcp`.
- `dg` CLI has a built-in MCP server: `dg mcp` (stdio) or `dg mcp --transport sse --port 8000`; also `dg` TTS commands (https://developers.deepgram.com/developer-tools/cli/text-to-speech).
- Skills: https://github.com/deepgram/skills; `/plugin marketplace add deepgram/skills` then `/plugin install deepgram@deepgram-agent-skills`.
Source: https://developers.deepgram.com/developer-tools/agentic-tools

## 8. Other TTS (not researched with sources this pass, treat as my prior knowledge)
- ElevenLabs (v3 audio tags, emotion control) and Hume Octave (emotion-prompted voices) are generally ahead of Deepgram for acted, emotional narration. Deepgram is built for latency and voice agents, so launch-video narration is not its sweet spot. Cartesia and OpenAI TTS (instructions-steerable gpt-4o-mini-tts) sit in between. No sources fetched; verify before relying on it.
- Practical hedge: generate one take from Deepgram, cost is cents, and compare by ear.
