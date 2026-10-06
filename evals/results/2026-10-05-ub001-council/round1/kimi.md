# Council round 1: Useful Bot launch video

## 1. Audience and the one feeling.

Mac people on Apple silicon who already use AI daily and already pay for at least one model (anchor: a ChatGPT Plus or Pro plan). They watched Grok Bot, Muse and Dots launch and had two reactions: "I don't want my work living on a vendor's cloud computer," and, after trying the open alternatives, "I don't want a weekend of setup either." Developers, indie makers, freelancers. Not enterprise, not first-time AI users.

The one feeling at the end: relief. "This is the one built for me. It installs like a normal Mac app, runs on the subscription I already have, keeps my chats and files here, and I stay in charge." The belief that drives the install: a team of agents is now a two-minute download, not a project. Every creative decision should serve that feeling: calm pace, real UI, zero hype.

## 2. Three differentiators.

**1. Your model, even the one you already pay for.** Supported by section 1, claim 1, and the comparison rows "Models" and "Reuses what you pay for." Grok Bot is xAI only, Muse is Muse Spark only, Dots is GPT-6 Astra only. We take a ChatGPT sign-in (official flow, 1.1.2), OpenCode Go and MiniMax plan keys, 15 API providers, and local models through LM Studio or Ollama. This is the film's first act because it's the viewer's first question: "what does it cost me to run?"

**2. On your Mac, open source, no account of ours.** Claims 2 and 3, rows "Where work runs," "Where data lives," "Source." The three named competitors run on vendor cloud computers. OpenBot and Hermes also run locally, so this differentiator only wins when paired with the third and shown as footage, not asserted as a slogan. AGPL-3.0 versus OpenBot's PolyForm Noncommercial is a real, sourced contrast.

**3. Consumer-easy start, grown-up control.** Claims 4 and 7, row "Control." This is the white space in the table. Grok Bot is easy but a locked cloud. OpenBot is local and plan-friendly but Electron, CLI-shaped, and its agents run with full access and no per-action approval (its own README). Hermes is technical to set up. Useful Bot is two steps to first chat, plus Read only / Auto / Full access per bot and an approval card that shows the exact command. Ease and control together: nobody else in the table holds both.

## 3. The demo.

One workflow: "Ship the announcement." Demo persona is a synthetic indie maker launching a fake focus-timer app called Tempo. All accounts, chats and files are demo data.

First run, real footage: Welcome, then Connect, then the 1.1.2 "Sign in with ChatGPT" row. Home, Generalist selected. The owner types: "I'm launching Tempo, a focus timer. Build me a small team." The Generalist answers with two proposal cards: Scout (researcher) and Echo (copywriter). The owner clicks "Add teammate" twice, proving bots are proposed, never created silently.

Owner to Scout: "Find what the top focus apps charge and save notes." Scout runs web_search, reports, and its Memory section fills in. Owner to Echo: "Draft our launch post in the Tempo folder." The attached-folder chip is visible; in Auto the file is written without a card. Echo then wants to delete an old draft: an approval card docks above the composer showing the exact command. The owner reads it, approves.

Closing wide shot: rail with Generalist, Scout and Echo, work products as real files in a Finder window. Every element is shipped in 1.1.1 except the 1.1.2 ChatGPT row. Nothing implies computer use or a browser agent: the web is read, files land in an attached folder, deletes ask first.

## 4. Arc and motion design.

Arc: no problem montage, no "tired of" cliché. We are inside the app within two seconds. Four movements: Connect (0:00 to 0:13), Team (0:13 to 0:35), Control (0:35 to 1:02), Land (1:02 to 1:28). The emotional curve goes "oh, that's simple" to "oh, that's powerful" to "oh, I trust it."

Pace: 6 to 9 second shots early so the ease registers, a 2 to 3 second montage in the middle for capability density, then a slow final card with a beat of silence before the last line.

Motion: Remotion springs tuned gentle (scale 0.98 to 1.0), motion blur on, transitions are match cuts (click to result) and masked slides with the app's 24pt stage radius so the edits feel like the product. One 2.5D moment at the "on your Mac" beat: the window separates into rail, stage and bubble layers with soft long shadows, then flattens back into footage. No full 3D scenes; they would fight the product's near-monochrome calm.

Typography: headline cards on black in Inter Semibold, minus 0.018em tracking, white. Burned-in captions in SF Pro (the app's font), lower third, two lines maximum, soft shadow for legibility over footage.

Mascot: real assets only. The logo tile carries the cold open, the animated SVG blinks once in the end card, and the floating, blinking bot face in working rows is the recurring "alive" cue. Never a redrawn mark.

Sound design, no music: a quiet room-tone bed under everything, real recorded UI clicks and keyboard sounds, a soft paper-like whoosh on transitions, and one muted knock reserved for the approval card. That knock is the film's sound logo. Full silence under the privacy line so the words land.

## 5. Voice.

Cliff. Deep, calm, listed for narration. The script is plain true sentences about ownership and control; a steady low voice reads as confidence and cuts against the high-energy launch norm. Wade is the fallback if Cliff tests too solemn against the friendly pastel avatars.

Expressivity: -1. Restrained but not robotic; positive values risk sounding like an ad, which is exactly what we're not. There is no SSML, so pacing is written into the script: short sentences, commas for breath, a full stop before every claim that matters. About 140 spoken words across 88 seconds, roughly a 60 percent duty cycle, leaving room tone and clicks to breathe. Don't present the voice as human; at this stylization no disclosure issue arises.

## 6. Scene list.

| Time | On screen | Caption | Voice-over |
|---|---|---|---|
| 0:00 to 0:04 | Real UI: Dock click, window opens in about a second (sourced perf run). Light theme | Meet Useful Bot | "Meet Useful Bot." |
| 0:04 to 0:13 | Real UI: Welcome, Get started, Connect step; cursor picks "Sign in with ChatGPT" (1.1.2 row, framed tight so Copilot stays out) | The model you already pay for | "It runs on the model you already pay for. Sign in, bring any key, or stay fully local." |
| 0:13 to 0:19 | Real UI: Home, Generalist, prompt typed and sent | Ask for a team | "Now ask for a team." |
| 0:19 to 0:27 | Real UI: two proposal cards for Scout and Echo; "Add teammate" clicked twice; rail gains two pastel avatars | Proposed, never sneaked in | "Bots are proposed, never created behind your back. You say yes." |
| 0:27 to 0:35 | Real UI two-up: Scout and Echo chats, different model chips; recreated model row flashes LM Studio with Qwen3.8-27B | Per-bot models, even local | "Each bot gets its own job, its own model, its own memory." |
| 0:35 to 0:44 | Real UI: Scout's web_search step rows, then settings Memory shows new notes; quick Echo insert writing launch-post.md | Research saved, drafts written | "Scout researches and remembers. Echo drafts, right into your folder." |
| 0:44 to 0:52 | Real UI: permission menu shows Read only, Auto, Full access; Excalidraw sketch appears in chat as a 2-second insert | You set the rules per bot | "You choose how much each bot may do." |
| 0:52 to 1:02 | Real UI: approval card docks above the composer, exact command visible; hover; Approve; card resolves. Knock sound | The exact command, first | "Anything destructive always asks. You see the exact command first." |
| 1:02 to 1:09 | Real UI wide: three bots with working rows, one sub-agent card glimpsed | Several bots at once | "Several bots, working at once, on your Mac." |
| 1:09 to 1:17 | Recreated 2.5D layer pull-apart, then real Finder: ~/Documents/Useful Bot with the demo files | Stored on this Mac. Open source, AGPL | "Chats, keys and files stay on this Mac. No account of ours. Open source." |
| 1:17 to 1:23 | Black card, Inter Semibold line. Room tone only | Cloud models see what you send them | "Cloud models see what you send them. Local models need no account at all." |
| 1:23 to 1:28 | End card: animated mascot SVG, wordmark, bot.usefulbuild.com | Free for Apple silicon Macs | "Useful Bot. Free download for your Mac." |

Total 88 seconds. The 9:16 cut keeps the same timeline, voice and sound, reframed to the stage column with the rail cropped out, captions raised to optical center, scene 1:02 rebuilt as a vertical stack of three chat crops, and the end card re-centered.

## 7. Avoid.

- Naming competitors on screen or in VO. The contrasts land without names, naming invites fairness fights and dates the film. If the owner insists, only sourced comparison rows, spoken flatly.
- The banned claims: "first," "only," "always on," "works while your Mac sleeps," "nothing leaves your Mac," "available worldwide," unqualified "no telemetry," the "10 bots at once" number, one-click Gmail.
- Anything that implies computer use or browser control: no cursor-driving footage, no "it uses your Mac for you." We show files, folders, web reading and approvals.
- Off-limits screen content: the Copilot row, GLM/Qwen/Command Code plans, Tella, the Settings Computer tab (its text is wrong at Full access), the private repo, owner screenshots, the "Useful Bot Dev" header and WJ badge. Re-record on the release build with the demo identity.
- AI ad clichés: glowing brains, humanoid robots, "revolutionize," "supercharge," "unlock," magic sparkles, terminal green rain.
- Anything melodic or rhythmic in sound. A drum hit still reads as music.
- Sneering at Hermes or OpenBot setup friction. Show our two steps and let the contrast be felt.
- Em dashes, in captions, VO script and cards alike.