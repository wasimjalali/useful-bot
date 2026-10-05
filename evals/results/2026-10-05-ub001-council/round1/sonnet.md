## 1. Audience and the one feeling

**Audience:** Mac users who already pay for ChatGPT or hold an API key. They are builders, solo operators and small-team leads. They've seen the Grok Bot and Hermes buzz and want agents, but they don't want a vendor's cloud computer or an afternoon of setup.

**Feeling:** "This is mine, and I'm already running it." They should believe three things at the end:
- It uses the model I already pay for.
- It lives on my Mac.
- I decide what each bot may touch.

The video never mentions "AI agents" as a category. It shows one small job getting done.

## 2. Three differentiators

1. **Your model, the plan you already pay for.** Subscription sign-in, API key or a local runtime (research §1 item 1; table rows "Models" and "Reuses what you pay for"). Grok Bot, Muse and Dots are each locked to their maker's models.
2. **It runs on your Mac, and it's open source.** Native SwiftUI app. Chats and files are stored locally, with no account of ours (§1 items 2 and 3; rows "Where work runs", "Where data lives", "Native Mac app", "Source"). The caveat stays on screen: the model you pick sees what you send it.
3. **A clear control model.** Read only, Auto or Full access, plus one approval card per risky action (§1 item 4; row "Control"). The claim is the three levels and the card, not "only we ask". Muse, Dots and Hermes have approvals too.

Ease runs through all three, shown by the two-step first run (§1 item 7). Bot teams are not a differentiator, because Grok Bot, Hermes and OpenBot have them. They are the vehicle for the demo, nothing more.

## 3. The demo

One story: **sign in with ChatGPT, then ask the Generalist for a teammate that tidies a messy folder.**

1. Welcome, then Connect, then ChatGPT sign-in (the 1.1.2 official flow).
2. Attach a demo folder with the Project chip. It holds synthetic files and a few duplicates. Access stays on Auto.
3. Send the real starter prompt "Create a bot that plans a Downloads tidy-up".
4. The Generalist's `propose_bot` card appears. Click Add teammate. The new bot gets its own avatar, instructions and chat.
5. The bot sorts files inside the folder. Auto runs these writes without a card. It then asks to delete duplicates, and the approval card docks above the composer. Click Approve.
6. Open the Permission menu and show the three levels.
7. Create a weekly routine (Create routine, Friday). Creating one asks first, so film that card too.
8. Show the result in Finder.

Everything here is shipped (§1 and Appendix D5, D10, E5, G, H). Rehearse before filming:
- Confirm moves run without a card in Auto and that the duplicate deletion does trigger one.
- Check the 1.1.2 sign-in sheet copy ("Useful Bot never sees your password" is 1.1.1 wording).
- Reset the Test Bot's PINEAPPLE instruction, and film on the clean profile with "Useful Bot" and demo identity.

Any model wait is sped up with a small "sped up" tag. Don't film Settings > Computer (research note 11).

## 4. Arc and motion design

- **Arc:** hook, ease, model, team, control, routine, ownership, close. The pace is calm and confident, one idea per beat, with about 1.5 s of silence before the approval card.
- **Framing:** real window recordings at 1.0x, centred on a neutral canvas with a soft long shadow (window radius 24). Slow Remotion push-ins of 105 to 115% on whatever matters (the Connect row, the proposal card, the approval card). Light theme throughout. Black is used only for the bookends, where the logo is approved.
- **Transitions:** hard cuts inside a flow. A short slide with subtle motion blur between sections. No spins, glitches or 3D. All 2D.
- **Typography:** Inter Semibold, -0.018em, white on black for titles and the end card. Captions are Inter Semibold in a lower third, one line at a time, no Oxford commas. Any recreated UI uses app tokens and SF Pro, never Inter.
- **Mascot:** the real white head on black, opening and closing the video. It blinks once and the pink tongue is the only colour. In the middle, the bot avatars carry the colour. Use the animated SVG, never a redrawn mark.
- **Sound (no music):**
  - Low room tone under the video.
  - Soft key clicks while typing and soft UI clicks on buttons.
  - A faint whoosh on section slides.
  - A muted paper-slide sound as files move.
  - A dry pop when a card appears.
  - Silence on the approval beat and on the last line.
  - Audition each sample for pitch or rhythm. High-pass and low-pass anything with a tonal tail.

## 5. Voice

**Wade.** He's warm and confident, and he sounds like a friend showing you something, which matches "easy". Cliff is too trailer-like, Kit's energy leans toward hype, and Maeve is a good fallback.

- **Expressivity:** 0 for the master. Audition +1 on the first and last lines only (about $0.32 for five takes), and keep it only if it still sounds natural.
- **Speed:** there's no speed control, so steer with punctuation. Use short sentences, full stops for beats and commas for breath. Aim for about 140 words per minute. Fit timing in Remotion by moving cuts, and don't stretch the audio by more than 3%.
- **Delivery:** understated and no exclamation marks. Say the caveat lines plainly and don't speed up through them.
- **Disclosure:** state that the voice is AI in the video description.
- **Captions:** timings come from Deepgram speech-to-text run on the final audio.

## 6. Scene list (16:9, 88 s)

| Time | On screen | Caption | Voice-over |
|---|---|---|---|
| 0:00-0:05 | Black. Mascot blinks, wordmark fades in (brand asset) | You already pay for ChatGPT. | You already pay for ChatGPT. Put it to work on your Mac. |
| 0:05-0:12 | Recorded: Welcome, click Get started | Two steps to start. | Open the app. Two steps, and you're in. |
| 0:12-0:22 | Recorded: Connect, ChatGPT Sign in, code sheet, signed in | Sign in with ChatGPT. No key to paste. | Sign in with ChatGPT, through OpenAI's official flow. No key to paste. |
| 0:22-0:30 | Recreated model row in real tokens: ChatGPT, OpenCode Go, MiniMax, LM Studio with Qwen3.8-27B marked Local | Or another plan, a key or a local model. | Prefer another model? Use another plan, an API key or a local model. Local needs no account at all. |
| 0:30-0:39 | Recorded: Generalist home, Project chip attaches the demo folder, Auto chip, prompt typed | Pick a folder. Ask for a teammate. | Pick a folder. Ask the Generalist for a teammate. |
| 0:39-0:48 | Recorded: proposal card, Add teammate, new bot in rail, right pane with instructions | Its own job, memory and model. | It proposes a bot with its own job, memory and model. You say yes. |
| 0:48-0:60 | Recorded: bot works, Finder shows sorted folders, silence, approval card, Approve | Sorting runs. Deleting asks first. | Sorting runs in the folder you chose. Deleting asks first. One card, one action. |
| 0:60-0:67 | Recorded: Permission menu, pause on each level | Read only. Auto. Full access. | You decide how much each bot may do. Read only, Auto or Full access. |
| 0:67-0:76 | Recorded: bot pane, Create routine, Friday, confirm card | Make it a routine. | Make it a Friday routine. It runs right here, while your Mac is awake. |
| 0:76-0:83 | Recorded: Finder with the sorted folder and the bot's files | Chats and files stay on your Mac. | Chats and files live on your Mac. We never see them. Your model sees what you send it. |
| 0:83-0:88 | Black: mascot, wordmark, "Open source. Apple silicon Macs, macOS 14 or later." and the site URL | Useful Bot. Open source. | Useful Bot. Open source, for your Mac. |

**9:16 cut:** keep the same voice-over and captions. Crop and pan the 16:9 recordings in Remotion to the active region (the composer, the cards and the rail row) with the rail hidden. Use larger two-line captions inside the safe zone. Trim the model-row scene to 5 s so the cut lands near 80 s.

## 7. Avoid

- **Unshipped features:** computer use, a browser agent, "always on", "works while you sleep", "first", "only" and "10 bots at once". Also avoid "nothing leaves your Mac" and any region claim beyond our safe line.
- **Banned routes on screen:** GitHub Copilot, GLM, Qwen Coding Plan, Command Code and any "Claude subscription". Hide Copilot in the Connect list by cropping to the named rows.
- **One-click Gmail:** apps need the user's own Composio key. Show Excalidraw instead, or skip apps.
- **Naming competitors:** none on screen. Claims age and a name invites a fight. Link a sourced comparison page if one is wanted.
- **Clichés:** "supercharge", "your AI workforce", glowing orbs, matrix text, countdowns, fake typing speed and fake dashboards. No cursors flying around.
- **Looking like the others:** no cloud-computer imagery, no "agents that run forever" framing, no tech-demo terminal wall.
- **Real data:** the dev build's "Useful Bot Dev" and "WJ" labels, the untracked repo screenshots and the Notion shots.
- **Tone:** no sneering at Hermes or at technical setups. Show ease and stop.

**Owner to confirm:** the word "Free" is inferred from the AGPL licence and the absence of billing code (Appendix A11), so I kept it off the end card and used "Open source". Add "Free" only after you confirm it.