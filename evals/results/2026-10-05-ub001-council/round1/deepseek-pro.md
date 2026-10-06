# Useful Bot launch video council, round 1

## 1. Audience and the one feeling

The viewer is a working professional on a Mac who already pays for ChatGPT Plus/Pro, Copilot, a coding plan, or keeps API keys, and who has tried agent demos that either lock them to one model, run on someone else's computer, or ask for a credit card before doing anything. They are technically able but tired of setup. The one feeling to land: **"this is mine and it is easy."** Not "powerful," not "revolutionary." They should leave believing Useful Bot is free, open source, runs on their Mac with their own models, and asks before it does anything dangerous. The trust line is the hook; ease is the proof.

## 2. Three differentiators

**1. Any model, including the ones you already pay for.** Every named rival is locked to its maker's models: Grok Bot is xAI only, Muse is Meta only, Dots is GPT-6 Astra only (comparison table, "Models" row). Useful Bot accepts subscriptions, API keys and local runtimes, and the "Reuses what you pay for" row is a clean "Yes" where Grok Bot, Muse and Dots are "No." This is the headline, and it is honest only when we show the specific routes in section 4: ChatGPT (official sign-in after 1.1.2), OpenCode Go, MiniMax, or a local LM Studio row with Qwen3.8-27B.

**2. It runs on your Mac, and your data stays there, with no account of ours.** The "Where work runs" and "Where data lives" rows put Useful Bot on "Your Mac" while Grok Bot, Muse and Dots run on a vendor cloud computer. A bot that actually reads the local disk is something the cloud rivals structurally cannot demo. We must keep the caveat every time it is said: cloud models and connected apps receive what you send them.

**3. You choose how much each bot may do, with a card for every step that matters.** The "Control" row is the sharpest gap against OpenBot, which the research records as full access with no per-action approval. Read only / Auto / Full access plus hash-bound approval cards (section 1, claim 4) is specific, filmable, and differentiates us without the false "only we ask" framing.

Open source, AGPL-3.0 (claim 3) and "easy, like Grok Bot" (claim 7) are supporting trust beats, not the three, because they are harder to prove visually in the same breath as the demo.

## 3. The demo

One workflow: **"Find what's taking up space on my Mac"**, the real starter prompt from the empty-chat chips (screenshot 04). It is fully SHIPPED today with demo data and proves all three differences at once.

1. First run: Welcome, then "Connect a model." Connect ChatGPT via the official sign-in, and the model chip reads "ChatGPT." This shows ease and reuse-what-you-pay-for in under six seconds. (A recreated local row, LM Studio with Qwen3.8-27B, can be a second chip later.)
2. Type the starter prompt. The Generalist runs `bash` in the sandbox (F1), the step row reads "Running a command," and it reports real numbers, for example "Downloads is 42 GB, mostly old installers." This is the app reading the Mac itself, on the viewer's own machine.
3. It proposes a teammate: a "Storage keeper" bot card with "Add teammate" / "Not now" (D5). The owner adds it; a new avatar lands in the rail. This shows the team, not a single agent.
4. The owner says "Delete the old installers." In Auto the bot raises an approval card listing exactly what it will remove. The owner approves, and the chat confirms. This is the control differentiator, shown as an action, not a slide.

Everything is synthetic demo data, and the model is the owner's own ChatGPT plan, so nothing unshipped is implied.

## 4. Arc and motion design

Pace is unhurried, ~80 seconds, three movements: open (trust), prove (the disk task), grow (the team and model choice). Transitions are 2D and restrained: a soft cross-dissolve between screens, the mascot SVG doing a blink or a small head-float as a wipe between movements, never a spin or bounce. One light 3D moment, the approval card lifting toward the viewer to emphasize the "ask," is the only depth cue; everything else stays flat so it reads as a real app, not a render.

Typography: Inter Semibold at -0.018em for the wordmark and captions; SF Pro inside recreated UI only. Captions sit bottom-center, white on a scrim, nothing animated per word except a gentle fade-in. Colour comes only from the bot avatars; the near-monochrome light theme carries the app footage, and we can cut to dark once (screenshot 04-home-dark) to show the theme. Black is the only logo background, and we never draw a stand-in mark.

Sound design, no music at all: a real macOS UI click on each button, a soft, non-tonal whoosh on scene changes, faint room tone under the voice, and one deliberate beat of near-silence before the approval card appears. No rhythm, no melody, nothing pitched. Freesound CC0 clicks, each auditioned so nothing melodic slips in.

## 5. Voice

**Wade.** He is the US male, warm and confident, which matches the "easy like Grok Bot, show it don't sneer" tone and reads as a sharp colleague, not a movie trailer. Kit's energy and Cliff's depth both push toward hype; Maeve's narration is lovely but a female Irish narrator signals "documentary" where we want "neighbor." Expressivity **+1**: enough to carry warmth without the beta setting overshooting, since there is no SSML to catch a misfire. Speed normal to slightly brisk, short declarative sentences. Delivery notes: commas are the only pause control, so I write short clauses with commas where breaths go; periods create the silent beats (especially before the approval card). No rising-fall exclamation, no "imagine," no whispers. Present the voice as synthetic per policy, but never call it out on screen.

## 6. Scene list

| Timecode | On-screen action | Caption | Voice-over |
|---|---|---|---|
| 0:00-0:03 | Black, white mascot head on black, wordmark | (none) | "Meet Useful Bot." |
| 0:03-0:08 | Welcome screen (01, real UI) | A team of AI helpers on your Mac | "A team of AI helpers that works on your Mac. Your chats and keys are stored here." |
| 0:08-0:15 | Connect step (02), ChatGPT official sign-in, then skip (real) | Two steps. Connect a model | "Two steps to start. Sign in with a plan you already pay for." |
| 0:15-0:22 | Home, type "Find what's taking up space on my Mac" (real) | (prompt shown as typed) | "Then ask a bot anything on this Mac." |
| 0:22-0:30 | Step row "Running a command," disk scan (real) | It reads your Mac, not a cloud | "It reads your Mac directly. Your files and chats stay here." |
| 0:30-0:38 | Result: Downloads 42 GB, old installers (real) | Downloads is 42 GB | "Forty-two gigabytes in Downloads, mostly old installers." |
| 0:38-0:45 | Proposal card "Add teammate: Storage keeper," click Add (real) | It suggests teammates | "It offers to build a Storage keeper bot that tidies this weekly. You say yes." |
| 0:45-0:55 | Approval card listing files, click Approve (real) | You approve every step that matters | "Before it changes anything, it asks. You pick Read only, Auto, or Full access." |
| 0:55-1:02 | Deletion confirmed, Storage bot in rail (real) | Done | "Done. And your team grows from here." |
| 1:02-1:12 | Model chip flip: ChatGPT, OpenCode Go, MiniMax, local Qwen (recreated rows) | Any model. Local needs no account | "Bring any model: the plans you pay for, your keys, or a local model." |
| 1:12-1:22 | Logo, wordmark, install line, "open source" (recreated) | Free, open source, AGPL-3.0 | "Open source, AGPL-3.0. A free download for your Mac. No account of ours." |

Total ~82 seconds. The 9:16 cut keeps the same voice and story but crops the rail, centers the mascot and the approval card, makes captions larger and fewer words each, and leads with the disk scan in the first two seconds, holding the logo five beats longer at the end.

## 7. Avoid

No "first," "only," "always on," "works while your Mac sleeps," "nothing leaves your Mac" unqualified, "worldwide," "10 bots at once," computer use, or browser automation (F13/F14). No Copilot on screen (section 4), no Gmail/Drive one-click, no naming any competitor, and no sneering at Hermes Agent's setup: we show ease, never criticize. No clichés: no "imagine," "meet your AI workforce," robot arms, glowing holograms, "magic," or countdowns. No fake UI: every recreated frame uses real tokens, fonts and layout. No music, no em dashes, and no typed "approved" in chat standing in for a real approval card, since the research is explicit that text approval is not permission. Keep the caveat audible whenever a cloud model is connected, so honesty reads as confidence, not asterisks.