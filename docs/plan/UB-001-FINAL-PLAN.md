# UB-001 final plan: the Useful Bot launch video

Status: **for owner approval**, 2026-10-05. Nothing is built until the owner approves.
Drafted by Claude Opus 5.5 from the council synthesis, reviewed adversarially by Claude Fable 5.1 (16 findings, all resolved in section 13), resolved by Opus.
Inputs: `docs/plan/UB-001-research.md`, the council record in `evals/results/2026-10-05-ub001-council/`, owner decisions of 2026-10-05.
Version shown: **Useful Bot 1.1.2** (1.1.1 plus the official Sign in with ChatGPT, PR #187). Filming starts after 1.1.2 is merged and the dev app is rebuilt from `main`.

## 1. Concept

**"A client update, built from this week's notes."**

Open on a finished piece of work, then show how it was made, in 86 seconds, on the real app:

1. It runs on your ChatGPT Plus or Pro plan, through OpenAI's official sign-in. Or a key, or a local model.
2. Ask the Generalist for a small team. It proposes two teammates; you add them.
3. The Analyst reads the week's notes and hands its findings to the Writer, who updates the client file.
4. On Auto, the everyday work just runs, and it asks before it deletes anything. One card, one action.
5. Your chats and files are stored on your computer. Free and open source.

The film argues by showing. It names no competitor. Every claim maps to a sourced row in section 8.

## 2. Emotional arc

| Beat | Time | The viewer feels |
|---|---|---|
| Proof | 0:00 to 0:06 | "That's useful. How?" |
| Ease | 0:06 to 0:20 | "Oh, I already have that plan." |
| Team | 0:20 to 0:58 | "It built me helpers, and they did real work together." |
| Trust | 0:58 to 1:10 | "It asked first. I'm in charge." |
| Ownership | 1:10 to 1:26 | "It's mine, on my own computer, and it's free." |

Calm and confident, one idea per beat, cuts on real clicks. Two silences: one second while the approval card sits, and the last two seconds of the end card.

## 3. Script (voice-over = captions)

Voice: **Deepgram Flux, Cliff, expressivity 0** (owner's pick by ear, 2026-10-05; the council leaned Wade). Cliff measured **213 words per minute at speed 1.0** in the samples, so the film uses **speed 0.85** (about 180 wpm) and no pronunciation overrides (Flux allows speed or IPA, not both). 124 words, about 41 s of speech in 86 s. Generated per scene. No em dashes.

| # | Voice-over (and caption, verbatim) | Words | Speech at 180 wpm | Scene length |
|---|---|---|---|---|
| S01 | A client update, built from this week's notes. | 8 | 2.7 s | 6 s |
| S02 | It runs on your ChatGPT Plus or Pro plan, through OpenAI's official sign-in. | 13 | 4.3 s | 8 s |
| S03 | Or use an API key, or a local model that needs no account. | 13 | 4.3 s | 6 s |
| S04 | Ask the Generalist for a small team. | 7 | 2.3 s | 8 s |
| S05 | It proposes two teammates. You add the ones you want. | 10 | 3.3 s | 9 s |
| S06 | Each one gets its own job, instructions and memory. | 9 | 3.0 s | 7 s |
| S07 | The Analyst reads the week's notes, lists what's confirmed and what's still open, and hands it to the Writer. | 19 | 6.3 s | 14 s |
| S08 | On Auto, the everyday work just runs, and it asks before it deletes anything. You choose how much each bot may do. | 22 | 7.3 s | 12 s |
| S09 | Your chats and files are stored on your computer. Your model provider sees what you send it. | 17 | 5.7 s | 8 s |
| S10 | Useful Bot. Free and open source. | 6 | 2.0 s | 8 s (2 s silence at the end) |

The rate is measured from the samples and re-measured on the first real take; scene lengths flex by up to a second to fit.

## 4. Storyboard (16:9, 1920 x 1080, 60 fps, 86 s)

All app footage is real, recorded from Useful Bot Dev 1.1.2 on a clean demo profile, light theme, with `winrec` at 60 fps. The app window is captured at 1600 x 1000 points (3200 x 2000 pixels), so both formats can crop without upscaling. "Recreated" means drawn in Remotion from the app's real tokens, listed in section 10.

Owner messages, exactly as typed (short, so they're readable):
- **M1, to the Generalist:** "Build me a small team for Cedar Studio's weekly client update."
- **M2, to the Analyst, Cedar Studio folder attached:** "Read this week's notes. List what's confirmed and what's open, then send it to the Writer."
- **M3, to the Writer, same folder attached:** "Update weekly-update.html from the Analyst's notes, then delete last week's draft."

| # | Time | UI state on screen | Motion | Sound |
|---|---|---|---|---|
| S01 | 0:00 to 0:06 | Real: the finished `weekly-update.html` opened large from the Writer's page card (the app's page view) | Slow push-in, 100 to 106% | Room tone in, one soft click |
| S02 | 0:06 to 0:14 | Real: Welcome, Get started, Connect cropped to the heading and the ChatGPT row with its "ChatGPT Plus or Pro" hint (Copilot never in frame), Continue with ChatGPT, then connected. Label: "Sign-in shortened" | Hard cuts on clicks, 600 ms push-in on the ChatGPT row | Real clicks, one soft whoosh into the scene |
| S03 | 0:14 to 0:20 | Real: the Connect list scrolled to its Local rows (LM Studio, Ollama). Recreated caption chip beside it: "Works with local models like Qwen3.8-27B in LM Studio" | Static hold | One click |
| S04 | 0:20 to 0:28 | Real: Generalist home, M1 typed and sent | Real typing, trimmed by a cut, never sped up | Soft key ticks, send click |
| S05 | 0:28 to 0:37 | Real: two proposal cards; Add teammate twice; the rail gains the two bots with their own avatars. Label: "Waiting time shortened" | Push-in on the first card, pull back to the rail | Click, a dry soft thud as each bot lands |
| S06 | 0:37 to 0:44 | Real: the Analyst's pane: avatar, instructions, Routines, Memory | The app's own pane slide, hold | One click |
| S07 | 0:44 to 0:58 | Real: Analyst chat, folder attached, M2 sent; its reply listing confirmed and open items; the send to the Writer; then the Writer's chat with the Analyst's message arriving. Labels: "Waiting time shortened", "Replies: ChatGPT" | Hard cuts, one reply per shot, each held long enough to read its first lines; never cross-fade text | Room tone |
| S08 | 0:58 to 1:10 | Real: Writer chat, M3 sent; the update is written with no card (page card appears); then the delete card docks above the composer showing the `rm` line for last week's draft; one second still; Approve; then the access menu opened on Read only, Auto, Full access | Push-in on the card; quick cut to the menu | Silence for one second, then one click |
| S09 | 1:10 to 1:18 | Real: the finished page, then a Finder window cropped to its file list (no sidebar) showing the Cedar Studio folder | Slow pull-back | Room tone |
| S10 | 1:18 to 1:26 | Brand: black, the animated mascot blinks once, wordmark, "Free and open source", "AGPL-3.0", "Download for Mac", "Apple silicon, macOS 14 or later", bot.usefulbuild.com | 12-frame fades, hold | Last two seconds room tone only |

## 5. The 9:16 cut (1080 x 1920, about 45 s)

Re-crops of the same 2x recordings, one region at a time at readable size. No restacked layout.

| Time | From | Crop | Voice-over |
|---|---|---|---|
| 0:00 to 0:05 | S01 | the finished page | A client update, built from this week's notes. |
| 0:05 to 0:12 | S02 | the ChatGPT row, then connected | It runs on your ChatGPT Plus or Pro plan, through OpenAI's official sign-in. |
| 0:12 to 0:21 | S04 + S05 | M1, then the two cards and the rail | Ask the Generalist for a small team. You add the teammates. |
| 0:21 to 0:31 | S08 | the delete card and Approve | On Auto, it asks before it deletes anything. |
| 0:31 to 0:38 | S09 | the finished page | Your files are stored on your computer. Your model provider sees what you send it. |
| 0:38 to 0:45 | S10 | stacked logo over wordmark, the end lines | Useful Bot. Free and open source. |

## 6. Sound design (no music)

Owner rule: no music in any form. Voice plus non-musical sound only.

- Room tone bed under everything, about -40 LUFS.
- UI clicks recorded from the app where possible, otherwise CC0 foley.
- Soft key ticks on typed lines, one soft air whoosh per section change (no pitch centre), a dry low thud when a bot lands.
- Silence on the approval beat and the end card.
- **CC0 only** (Freesound with the CC0 filter), so raw files can live in the repo and the public snapshot. Each file's URL and licence go in `video/assets/LICENSES.md`.
- Every file auditioned by ear plus a spectrogram check; anything tonal, melodic or rhythmic is rejected.
- Mix: voice about -16 LUFS integrated, effects 12 to 18 dB under the voice.

## 7. Formats and delivery

- 16:9 master: 1920 x 1080, 60 fps, H.264 high, 86 s. 9:16: 1080 x 1920, 60 fps, about 45 s.
- Burned-in captions in **Inter Semibold** (SIL OFL, already in `brand/source/fonts/`), white on a soft black pill, radius 16, in a caption band on the stage **below** the app window so they never cover the composer, a card or typed text. The 9:16 crops reserve a band under each crop.
- `.srt` for each format, timed from Deepgram speech-to-text on the final voice track, then hand-checked.
- The video description discloses the AI voice ("Voice: Deepgram, AI generated") and the DMG's one-time Open Anyway step (also on the site).

## 8. Claims table

Every line the viewer hears or reads, with its source. Anything not here is not said.

| Claim | Where | Source |
|---|---|---|
| Runs on your ChatGPT Plus or Pro plan through OpenAI's official sign-in | S02 | PR #187 (1.1.2); developers.openai.com/siwc/token-sharing-open-source; the ChatGPT row hint "ChatGPT Plus or Pro" |
| API keys, and local models that need no account (LM Studio, Ollama) | S03 | shared/provider-catalog.ts API and local routes; research §1 item 1 |
| LM Studio runs Qwen3.8-27B | S03 caption | LM Studio announcement and model page (lmstudio.ai/models/qwen3.8), Apache 2.0, released 2026-08-14 |
| The Generalist proposes bots; you add them with a card | S04, S05 | agent/instructions.md:40; agent/tools/propose_bot.ts; ProposalCardView.swift:51 |
| Each bot has its own job, instructions and memory | S06 | fact sheet D1, D2; SettingsPaneView.swift |
| A bot can send its work to a teammate | S07 | agent/tools/send_to_bot.ts; fact sheet D6 |
| On Auto, everyday work in the attached folder runs without a card | S08 | agent/instructions.md:37; agent/lib/workspace.ts:87-91 |
| On Auto, it asks before it deletes anything | S08 | agent/instructions.md:37 (deletes ask inside a folder; any change asks with no folder); agent/tools/bash.ts:127-147 |
| A card approves one exact action | S08 | agent/instructions.md:42; agent/lib/write.ts:76-118 (hash-bound) |
| Read only, Auto, Full access | S08 | agent/instructions.md:33-38; ComposerView.swift:915-917 |
| Chats and files are stored on your computer; your model provider sees what you send | S09 | fact sheet H; research §1 item 2 caveat |
| Free and open source, AGPL-3.0 | S10 | LICENSE; README.md:290-296; owner decision 2026-10-05 |
| Download for Mac, Apple silicon, macOS 14 or later | S10 card | scripts/install.sh:21-23; macos/bundle/Info.plist:13 |
| What the Analyst and Writer actually wrote | S07, S08 | the filmed take itself; never edited |

Platform wording (owner, 2026-10-05): the voice-over says "your computer", never "Mac", so the audio survives a Windows release. Only the end card text states today's platform and swaps when other platforms ship. No "coming soon".

Never said or shown: computer use, a browser agent, "always on", "first", "only", "nothing leaves your Mac", "worldwide", "no telemetry", "two minutes", competitor names, GitHub Copilot, GLM, Qwen or Command Code plan rows, "Claude subscription", one-click Gmail, model accuracy as a product promise.

## 9. Demo setup (all synthetic)

- **Profile:** a fresh Useful Bot Dev state via the swap the owner chose on 2026-10-05 "for screenshots and footage" (the real dev state moves to `~/UB001-dev-backup/` and back after filming).
- **Model:** the owner's personal ChatGPT Plus or Pro plan via the official sign-in (his org workspace blocks third-party apps). No email or account name in frame.
- **Cedar Studio folder:** 12 short client notes (duplicate requests, two open blockers, one unconfirmed delivery date), `weekly-update.html` (last week's update) and `drafts/weekly-update-draft.html`. Written for the film. Placed at `/Users/Shared/Cedar Studio` if the app accepts it as a grantable folder (so no username shows in paths), otherwise a home folder outside Documents and Desktop, with any path that shows the username kept out of frame. Both bots work only inside this attached folder, so nothing else on the computer is in their root.
- **Identity:** the release build shows "Useful Bot" where the dev build shows "Useful Bot Dev". The rail label is covered in post with the exact release label, drawn from the same tokens and checked against a release screenshot. The account badge uses a demo display name if the app has one; otherwise the same overlay treatment. Both are listed as recreated.
- **Bots:** the Generalist, plus the two teammates it proposes on camera (their names and colours are whatever the app gives them, checked in rehearsal).

## 10. Asset list

| Asset | Source | Real or recreated |
|---|---|---|
| App footage S01 to S09 | `winrec` 60 fps, window 1600 x 1000 pt at 2x | Real |
| Finder file list (S09) | separate `winrec` of the Finder window, cropped | Real |
| Mascot head, animated | `brand/motion/useful-bot-animated.svg` | Brand asset |
| Logo on black | `brand/svg/useful-bot-logo.svg` | Brand asset |
| Wordmark and captions | Inter Semibold, `brand/source/fonts/Inter-SemiBold.ttf` (SIL OFL) | Brand asset |
| S03 local-model caption chip | drawn with real tokens | Recreated, a caption, not UI |
| "Useful Bot" rail label, demo badge | drawn to match the release build exactly | Recreated overlay |
| Voice-over | Deepgram Flux, Cliff, expressivity 0, speed 0.85 | Generated |
| Sound effects | Freesound CC0 only, licences logged | Licensed CC0 |

## 11. Build plan (after approval)

Built by Claude Opus 5.5 (owner's ask), on branch `feat/ub001-launch-video`.

1. **Tooling:** skill-scanner on Remotion's official Claude Code plugin, then install it and the Remotion packages in `video/` (`remotion`, `@remotion/cli`, `@remotion/transitions`, `@remotion/captions`, `@remotion/media-utils`). Free licence (3 or fewer employees, owner confirmed).
2. **Layout:** `video/src/scenes/v1.1.2/S01-result.tsx` and so on, one module per scene, version-tagged; `video/src/brand/tokens.ts` mirrors DesignTokens.swift.
3. **Brand check:** read OpenAI's current brand guidelines for naming ChatGPT and "Sign in with ChatGPT" in marketing before S02 is locked.
4. **Demo setup and rehearsal:** swap the dev state aside, create Cedar Studio, sign in, then rehearse M1 to M3 at least five times. Confirm each time: two proposal cards appear (not a question), the Analyst sends to the Writer, the Writer's update runs without a card, the delete raises a card with a readable `rm` line, and no step row shows anything outside the folder. Fix the messages, not the footage, if a run drifts.
5. **Recording:** `winrec` at 60 fps per scene, several takes, including a cold start. Never the daily app, never the real pointer.
6. **Voice:** generate per scene (key read at runtime from the Useful Voice Keychain item, which the owner told us to use for Deepgram on 2026-10-05; never logged), check every take with speech-to-text against the script, re-measure the rate. Estimated cost under $1.
7. **Edit:** assemble in Remotion; captions from the STT timings; sound per section 6.
8. **Fidelity check:** each scene's key frames side by side with a real screenshot of the same screen; fix any drift.
9. **Frame review:** export every frame of every transition and every scene change as a PNG sequence and review them all in batches (framesheet only for overviews, since it tiles 24 frames and can skip fades).
10. **Render** both formats; send the MP4s and SRTs to the owner for sign-off. Publishing is a separate step the owner triggers.
11. **Records:** commit the source, scripts, licences and review record. Raw footage (large video) stays out of git in `~/UB001-footage/` with SHA-256 hashes committed. Restore the dev state.

## 12. Risks

| Risk | Handling |
|---|---|
| The Generalist asks a question instead of posting two cards | Rehearsal step 4; M1 wording adjusted until it posts cards |
| The Analyst doesn't send to the Writer | M2 asks for it explicitly; rehearse |
| The model writes the update with `bash` instead of `write_file`, or the delete uses `mv` | Rehearse; reword M3 ("delete") until the run is stable |
| Replies differ between takes | Keep the best real take; never edit reply text |
| Flux mispronounces a word | STT check; rephrase the line |
| A sound effect turns out tonal | Spectrogram plus ear check; replace |
| macOS privacy prompt mid-take | The folder sits outside Documents and Desktop; grant any prompt before take 1 |

## 13. Fable review: resolution

| # | Fable finding (severity) | Resolution |
|---|---|---|
| 1 | "Before it changes a file you already have, it asks" overgeneralises (high) | Now "On Auto, it asks before it deletes anything", true in Auto with or without a folder (bash.ts:127-147, instructions.md:37) |
| 2 | No demo home; the bot's root would be the owner's real home and Documents (high) | Both bots work in an attached Cedar Studio folder, outside Documents and Desktop, ideally `/Users/Shared` |
| 3 | The flow between cards and the approval wasn't scripted (high) | Exact owner messages M1 to M3, which chat is open per shot, rehearsal checklist |
| 4 | A `write_file` card shows raw HTML; may not fire (high) | The card is a delete (`rm` line), always carded in Auto; the write runs without a card, which is the honest "everyday work runs" beat |
| 5 | "Without inventing a deadline" sold model accuracy (high) | Removed; S07 describes what's on screen; accuracy added to "never said" |
| 6 | Recreated LM Studio row faked a connected model (medium) | Replaced by the real Local rows in Connect plus a caption chip naming Qwen3.8-27B, sourced |
| 7 | Timing assumed, several scenes overran (medium) | Cliff measured at 213 wpm; speed 0.85; S02 logo beat and S10 static menu folded; per-scene word counts and lengths tabled |
| 8 | Typed request too long; voice overstated the Generalist (medium) | M1 is 11 words; voice says "It proposes two teammates" |
| 9 | Captions covered the action (medium) | Caption band below the window |
| 10 | Unexplained memory note (medium) | Dropped; S06 shows the real pane |
| 11 | Honesty labels missing (medium) | "Sign-in shortened", "Waiting time shortened", "Replies: ChatGPT"; "Plus or Pro" said and shown |
| 12 | Licence gaps: SF Pro for captions, non-CC0 sounds, OpenAI brand terms (medium) | Inter captions, CC0-only sounds, brand-guideline check in build step 3 |
| 13 | Craft: logo beat too early, static menu, weak S08 (medium) | Logo only at the end; menu folded into the card scene; the team scene now 14 s; open on the page large |
| 14 | Generalist may ask instead of proposing; petnames (low) | Rehearsal step 4 |
| 15 | Capture size, Finder, frame review, storage, dev label (low) | 2x capture, separate Finder recording, PNG frame review, footage outside git with hashes, release-exact label overlay |
| 16 | "Mac" in the voice, Open Anyway, fallback line (low) | "Mac" only on the card; Open Anyway disclosed in the description and site; the fallback is gone because the delete is the primary card |
