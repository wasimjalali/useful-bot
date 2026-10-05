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
