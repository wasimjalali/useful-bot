# Useful Bot launch video council, round 2

In round 1 you and eleven other advisors answered the same brief alone. Below are the other eleven answers, anonymised as letters. Your own answer is not included. The round 1 brief and the research doc follow at the end; their rules still bind (honesty per research section 1, no music, real UI only, demo data, no em dashes, 75 to 90 s 16:9 plus a 9:16 cut).

Critique the others. Be specific and cite letters. 800 words max, exactly these headings:

1. **Keep.** The 3 best ideas across all answers (letter and the idea), and why each would make people install.
2. **Drop.** The 3 weakest or riskiest ideas (letter and the idea), and why.
3. **Claim check.** Every claim in any answer that the research doc does not support, or that it forbids (letter, the claim, the research row or rule it breaks). Say "none found" only after checking each answer.
4. **Demo ranking.** Rank the distinct demo workflows proposed (name each and the letters that proposed it), best first, one line each on why.
5. **Your final pick.** The concept, the voice (Wade, Kit, Cliff or Maeve, and expressivity), and the one opening line you'd use, after seeing everyone else. Say what changed your mind, if anything.

Plain markdown, no em dashes.


---

# The other answers

## Answer A

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

## Answer C

## 1. **Audience and the one feeling.**

Independent consultants and small business owners on Apple silicon Macs who already use ChatGPT and repeatedly turn documents into client deliverables.

The feeling is **confident ownership**: “I can give these bots useful jobs, use my existing plan and decide what they change.”

Lead with a finished piece of work. The welcome screen is clear, but an onboarding sequence alone won't give someone a reason to install.

## 2. **Three differentiators.**

1. **Your existing AI plan can power the work.** Show the official ChatGPT sign-in, then real replies using that connection. Mention API keys and local models briefly. This distinguishes Useful Bot from the provider-specific models in Grok Bot, Muse and Dots. OpenBot and Hermes also offer model choice, so don't present this as unique.  
   Evidence: section 1, item 1; comparison rows **Models** and **Reuses what you pay for**.

2. **A team with separate jobs, inside a native Mac app.** Show two named bots contributing to one deliverable, with work saved on the Mac. The app is open source under AGPL-3.0. Muse and Dots lack this team structure in the supplied comparison; Grok Bot has teams but runs work in its cloud. OpenBot and Hermes also offer local teams, but use Electron; OpenBot's licence is noncommercial source-available. The advantage is the combination and its presentation.  
   Evidence: section 1, items 2, 3, 5 and 7; comparison rows **Native Mac app**, **Team of bots**, **Where work runs** and **Source**. Every storage claim carries the cloud-sharing caveat.

3. **Visible control before an external action.** Show Read only, Auto and Full access, then an actual approval card in Auto. This is a direct difference from OpenBot's full-access approach. Grok Bot, Muse, Dots and Hermes have approval systems too. Our case rests on understandable choices and visible execution.  
   Evidence: section 1, item 4; comparison row **Control**; Appendix G.

Don't name competitors in the video. Spend those seconds proving the product.

## 3. **The demo.**

**Turn a fictional shop's weekly sales files into a report, then save it to its demo Notion workspace.**

Use a synthetic business, “Cedar Paper”, with a small sales CSV and a short owner brief. Include one useful wrinkle: revenue rose while order count fell. The report should explain that distinction instead of declaring everything improved.

Start with Generalist:

> Help me prepare Cedar Paper's weekly report. Propose a sales analyst and a report writer.

Accept both real “Add teammate” cards. Give both bots the connected ChatGPT model. Attach the demo folder and ask Generalist to have the analyst examine the figures, pass the findings to the writer and save `weekly-report.md` in that folder.

Show the actual handoff and contributions. Ask the writer to create a page in the connected demo Notion workspace. In Auto, hold on the real approval card before approving. Finish on the successful tool result and report text.

Notion's official MCP connection is configured before recording. Identify it as “Previously connected demo workspace”. Don't imply the film includes its setup. Approve any earlier MCP discovery calls honestly; don't splice separate permissions into one apparent blanket approval.

This uses shipped file, proposal, handoff and MCP capabilities: Appendix D5–D6, E6 and F2. The official ChatGPT sign-in shot requires released 1.1.2. The supplied 1.1.1 screenshots cannot stand in for that flow.

Record a complete successful run before editing. Keep real outputs and label removed waits “Waiting time shortened”.

## 4. **Arc and motion design.**

**Result, setup, teamwork, decision, result.** The first six seconds show the finished report in chat. Then return to how it was made.

Use light mode throughout the workflow. Its neutral surfaces keep the report readable, while two real avatar colours distinguish the bots. Use black only for the closing brand frame.

Build the edit in Remotion around recordings. Use flat 2D crops and restrained 250–350 ms reframing. Establish the whole window before moving into a detail. Cut between completed actions; never dissolve overlapping text. No 3D laptop, floating panels or reconstructed conversation.

Preserve SF Pro in footage. Use Inter Semibold with the supplied tracking for the wordmark. Keep the approved logo on black. Let the real bot avatars blink during work; use the supplied animated mascot once at the end, without inventing a new expression.

Burn in verbatim voice captions, at most two lines, below the active UI. Generate timing from speech-to-text on the finished narration. The table's caption column gives supplemental labels, not replacement subtitles.

Sound is sparse: a soft click on acceptance, one quiet whoosh on the opening reframe and silence while the approval card is read. No music, pulse, chime or repeating sound pattern.

At production, review recordings and the final edit frame by frame, including cold-start takes. These supplied stills establish appearance, not motion quality.

## 5. **Voice.**

**Wade**, for warmth and confidence without a trailer-announcer delivery.

Start Flux at **expressivity 0**. Target **135–145 words per minute during speech**, with silent holds around the proposal, approval and finished report. This is a delivery target, not an assumed API speed control.

Use short sentences and full stops. Generate scene-sized passages and place pauses in the edit. No SSML or emotion tags. Read “ChatGPT” naturally and say “Mac”, not “macOS”, in narration.

## 6. **Scene list.**

| Timecode | On-screen action (real UI or recreated) | Caption | Voice-over line |
|---|---|---|---|
| 00:00–00:06 | Real finished report in chat. Pull back enough to reveal Analyst and Writer in the rail. | A weekly report, made with your bots | “Turn this week's sales files into a report, with a team you can give different jobs.” |
| 00:06–00:15 | Real 1.1.2 ChatGPT sign-in entry, cropped to exclude other subscription rows. Cut to connected state without showing credentials. | Your ChatGPT plan · Sign-in time shortened | “Useful Bot connects to your ChatGPT plan through OpenAI's official sign-in.” |
| 00:15–00:23 | Real demo-folder attachment and Generalist request. | Demo data · Cedar Paper | “Give it the files and the task. Here, we're preparing a weekly report for a fictional shop.” |
| 00:23–00:33 | Real Analyst and Writer proposal cards. Owner accepts each. Two avatars appear in the rail. | You choose the team | “The Generalist proposes an analyst and a writer. You choose whether to add them.” |
| 00:33–00:44 | Real handoff and replies. Hold on the analyst's revenue-versus-orders finding, then the writer's report. | Waiting time shortened | “One checks the figures. The other turns those findings into a report.” |
| 00:44–00:50 | Real model picker showing the active ChatGPT selection. No model switch or local reply is implied. | Subscriptions, API keys or local models | “You can also connect an API key or a local model.” |
| 00:50–00:59 | Real access menu, leave Auto selected. Request a Notion page; reveal its approval card. | Previously connected demo workspace | “Choose each bot's access. In Auto, this Notion action asks before it runs.” |
| 00:59–00:67 | Hold the real action details, approve, then show the successful result and page link in chat. | Review, then approve | “Check the action. Approve it. The report is saved to the connected workspace.” |
| 00:67–00:79 | Real saved-file result and report text. Calm, readable hold. | Stored on your Mac · Requests go to connected services | “Your chats and files are stored on your Mac. Cloud models and connected apps receive what you send them.” |
| 00:79–00:90 | Brand end frame, not recreated UI: approved mascot on black, wordmark and download address. | Free, open source · AGPL-3.0 · Apple silicon · macOS 14+ · bot.usefulbuild.com | “Useful Bot is free and open source. No account of ours. Download it for your Mac.” |

**9:16:** Keep the same 90-second argument, but make a separate edit with sequential crops of the rail, reply and approval card. Never shrink the desktop window to fit portrait.

## 7. **Avoid.**

- Claims of exclusive teams, exclusive model choice, worldwide availability or complete privacy.
- Browser clicking, screen control, unattended overnight work or sleep-time execution.
- Copilot, restricted subscription routes, credentials, “Useful Bot Dev” and the owner's identity.
- A local-model reply presented as evidence when all filmed replies use ChatGPT.
- Fabricated results, staged approval cards or edits that imply instant completion.
- Calling every write approval-gated. Ordinary writes inside an attached folder can run in Auto.
- Connector catalogues, avatar palettes and settings tours replacing the actual outcome.
- “AI employees”, “replace your team”, glowing brains and mascot armies.
- Promising frictionless installation. The download destination must explain the DMG's one-time Open Anyway step.
- Extra features in the closing montage. End with the report and one download action.

## Answer D

# Useful Bot launch video, round 1

## 1. Audience and the one feeling

The audience: Apple silicon Mac owners, working solo or in a two to three person team, who already pay for at least one AI model, most often ChatGPT Plus. They want agent help on real files with their own rules about where data sits. They are technical enough to paste an API key or run an install command, and they have already said no to the 20 to 500 dollar per month agent tiers and to one vendor's model lock. They do not need computer use on day one.

One feeling: this is already mine. My machine, my paid model plans, my rules, nothing new to sign up for, and I can see everything it does. Anyone who believes that installs today, because trying it costs one download.

## 2. Three differentiators

The video names no competitors. Each difference below is sourced in the comparison table, so the frames and captions can carry it without brand names.

1. **The work and the data stay on your Mac.** Rows: Where work runs = "Your Mac", Where data lives = "Your Mac", Native Mac app = "Yes (SwiftUI)". Grok Bot runs on a vendor cloud computer, Muse on a Meta cloud VM, Dots on OpenAI's cloud. Useful Bot is a native SwiftUI app with services on loopback, chats and files in your home folder and no account system of ours. The honest caveat rides along in every use: what you send to a model provider goes to that provider.

2. **Any model, including one you already pay for.** Rows: Models = "Any: subscriptions, API keys, local", Reuses what you pay for = "Yes: subscriptions or your keys". Grok Bot is xAI only (press), Muse is Meta Muse Spark only, Dots is OpenAI GPT-6 Astra only (official). On screen: the official ChatGPT sign in (1.1.2), OpenCode Go and MiniMax named in the list, keys for more than a dozen providers, and LM Studio with Qwen3.8-27B in a recreated chooser row. OpenBot and Hermes tie on model choice, so here we win through the two step start (FirstRunView.swift:713-732) and native polish, not through the claim alone.

3. **Deliberate control, per bot.** Rows: Control = "Read only / Auto / Full access + approval cards", Team of bots = "Yes, groups of 2 to 6, sub-agents". OpenBot runs full access with no per action approval; Grok, Muse and Dots each have their own styles. Our shape is legible in one glance: three levels per bot, one card per action, and a proposal card standing between the owner and every new bot. The end card draws on two more rows without displacing these three: Source = "Open, AGPL-3.0", Price of the app = "Free (AGPL)".

## 3. The demo

One workflow: clear a messy demo Screenshots folder into clean date named files, run by the Generalist, then kept forever by a new teammate.

Start on the welcome screen (its real copy already carries the claim: "Your chats and keys are stored here"). Two steps, ChatGPT sign in through OpenAI's official flow, done. On home, the starter chip "Rename my screenshots by date" sends. The Generalist reads the demo folder and counts the files in the step row. The rename arrives as an approval card, Auto mode asking first: one card, one command, bound and docked above the composer. Approve once, the files rename, the result bubble reports the count, and the Memory section shows the note it saved ("Owner likes dates in filenames"). Then the Generalist proposes "Screenshot Tidier" and the owner confirms with "Add teammate". In the new bot's settings: a pastel avatar, its own instructions, one memory note and a weekly routine created with the real "Create routine" button.

Demo data: a clean profile, rail header "Useful Bot", demo identity "Alex", 34 synthetic screenshots in Documents/Demo Screenshots, ChatGPT provider connected through the 1.1.2 official flow. Nothing else to stage.

Every differentiator lands in body scale: local files on local disk (1), a paid plan reused (2), a visible leash and a team you approved (3), with ease carried by the two step start rather than stated.

## 4. Arc and motion design

Three acts: Empty to ready (0:00 to 0:23), One honest job (0:23 to 0:54), Your team and your rules (0:54 to 1:21). Cut every 4 to 6 seconds, never hold past 7, except the approval card and the end card, which each get about one extra second.

Transitions ride clicks: the press finishes, the next frame lands on the result. Dialogs pop in at 180ms spring with 16pt radii and the app's long soft shadow. Within one screen, pans dissolve over 6 frames. The cursor is recreated as a plain monochrome pointer with a soft shadow.

All footage is flat 2D screen capture. The only 3D is a 2.5D push of the whole window between acts and a 6 degree tilt on the provider grid. Nothing inside a window is re-rendered, only transformed.

Type: brand cards use Inter Semibold at -0.018em, white on black. App side labels stay SF Pro. Captions are SF Pro Semibold, white on a 70 percent black pill with 16pt radii, bottom safe area 7 percent, one line, no glow, no letterboxing bars.

Mascot: only on brand cards, from brand/motion/useful-bot-animated.svg, blink and float only, pink tongue untouched. Inside the app the real avatars already blink and float (BotFaceLayer), so the UI carries the personality and we never draw a stand in face.

Sound, no music: a room tone bed under everything, a soft click on every press, one low thud when the approval card docks, one non melodic whoosh at each act change. The bed ducks to near silence while the approval card sits there, one click on Approve, then work resumes. Every effect is auditioned by ear so nothing rhythmic or melodic slips in.

## 5. Voice

Wade: US male, warm and confident. Warmth fits the "easy, like Grok Bot" positioning without cheerleading, and confidence suits a control first pitch. Kit's energy fights the neutral brand, Cliff reads like a trailer, Maeve reads like a documentary. Expressivity +1, the upper middle of the beta band; drop to +0.5 if a take goes theatrical. Speed 1.0.

There is no SSML and no emotion tags, so the script is the direction: short sentences, periods as beats, commas for pace, and one deliberate pause before the approval card line so the sound design can breathe. Say "AGPL" aloud and show "AGPL-3.0" on screen, since "AGPL-3.0" spoken is ugly. Never present the voice as the app or a member of the team, it is a narrator. Word level timings come from Deepgram speech to text on the finished takes, and the Remotion captions package burns them.

## 6. Scene list

| Timecode | On screen (real UI or recreated) | Caption | Voice over |
|---|---|---|---|
| 0:00 to 0:04 | Black brand card: animated mascot, Inter wordmark | A team of AI helpers, on your Mac. | "This is Useful Bot. A team of AI helpers, on your Mac." |
| 0:04 to 0:10 | Real UI, light: welcome screen, cursor clicks Get started | No account of ours. | "No account of ours, and no region lock. Your chats and keys are stored on your Mac." |
| 0:10 to 0:17 | Real UI, light: Connect, ChatGPT row with the official sign in, click, sheet opens | Sign in with a plan you pay for. | "Sign in with a plan you already pay for, like your ChatGPT plan, through OpenAI's official sign in." |
| 0:17 to 0:23 | Real UI: API rows pan. Recreated chooser row: LM Studio, Qwen3.8-27B | Or a key. Or a local model. | "Or paste a key, or go local. LM Studio runs on your Mac, no account at all." |
| 0:23 to 0:28 | Real UI, light: home, starter chips, "Rename my screenshots by date" sends | Then just type it. | "Then just type what you want done." |
| 0:28 to 0:37 | Real UI, light: chat, step row working over the demo folder, file counts | What you send goes to your model provider. | "It reads the demo folder, counts the files, and plans the rename. What you send goes to the model provider, like any chat." |
| 0:37 to 0:42 | Real UI, light: approval card docks above the composer, bed ducks | Auto asks before changes. | "Renaming is a change. In Auto, that asks first. One card, one action." |
| 0:42 to 0:48 | Real UI, light: Approve, files rename, count bubble, memory note appears | Approve once. It finishes. | "Approve once, it finishes, and it keeps a note of how you like this done." |
| 0:48 to 0:54 | Real UI, light: proposal card, "Add teammate" confirms "Screenshot Tidier" | Propose a teammate. You confirm. | "When a job repeats, the Generalist proposes a new bot. You confirm, always." |
| 0:54 to 1:03 | Real UI, light: new bot in rail with pink avatar, settings: 30 colors, Instructions, Memory, weekly routine | Its own face, instructions, memory. | "Each bot keeps its own face, instructions, memory and model, and it can run on a routine." |
| 1:03 to 1:09 | Real UI, light: access menu flips Read only, Auto, Full access | Three levels, your call. | "Set every bot's reach: Read only, Auto, or Full access." |
| 1:09 to 1:15 | Real UI, light: rail with several bots, a work row mid run | Several bots at once. | "And several bots can work at once, each on the model you gave it." |
| 1:15 to 1:21 | Black brand card: mascot, wordmark, AGPL-3.0, repo and site URLs | Free. Open source. AGPL-3.0. | "Free and open source, under the AGPL. One download for your Mac." |

The 9:16 cut keeps the same order and voice track, reframes as a vertical crop centered on the chat column with the rail out of frame, moves captions above the composer safe area and lets the brand cards go full bleed, keeping all timecodes.

## 7. Avoid

- "Nothing leaves your Mac", "always on", "works while your Mac sleeps", "no data goes out" while a cloud model is connected. The honest line is stored on your Mac, with what you send going to the provider or app you chose. Routines and everything else need the Mac awake.
- "First", "only", "world's first", "the one that actually". "Ten bots at once" is a concurrency limit, not a benchmark: say "several". No absolute "no telemetry".
- Anything unshipped: computer use, browser control, iPhone, web UI, notarization, Intel or Windows, "all subscriptions supported" (Claude and Google are key only, never the word subscription for them), any region claim about Grok Bot, whose status is unknown.
- Filming traps: the GitHub Copilot row (crop past it in Connect), GLM, Kimi and Qwen coding plan rows, the dev rail header or real identity in shots, the Settings > Computer tab whose copy is wrong at Full access, Tella shown as working, and any "one click Gmail" mood, since catalogue apps need the user's own Composio key first. Excalidraw stays a one shot aside if it appears at all.
- Clichés: neon agent cities, robot hands, money shots, "the future of work", "just magic", countdown urgency, star ratings, fake testimonials, vendor style badges, tagline mimicry ("always-on", "have your back", "grows with you"), and whoosh soup at 120 frames per second.
- Tone traps: sneering at cloud agents, mock reverence for rivals, ending on a guilt question, crowd sourced hype captions, and packing connectors, routines, Excalidraw and sub-agents all into one video, which buries the three things we actually sell.

## Answer E

# 1. Audience and the one feeling

For Mac owners who already pay for an AI subscription (ChatGPT Plus or Pro, an OpenCode Go plan, a MiniMax Token Plan) and have bounced off either cloud agent products or technical agent stacks. Solo professionals, freelancers, small studio leads. They value control over their machine and they want help with recurring desk work, not a demo of autonomy.

One feeling: **this is mine and it is easy**. They should believe they can install it in two minutes, connect the plan they already pay for, and build a small team of bots that stays on their Mac. Ease is the hook (the owner's Grok Bot point), control is the reason to stay. Show both, never argue either.

# 2. Three differentiators

1. **A team of bots, not one agent.** Each bot has its own job, instructions, memory, avatar and model, the Generalist proposes new bots you confirm, and 2 to 6 bots meet in a group chat. Research: section 1.5, comparison table rows "Team of bots" (Muse is one agent, Dots is one dot at launch) and D1, D3, D5, D7 in the fact sheet.
2. **The model you already pay for, or any model you like.** Sign in with ChatGPT (after 1.1.2), OpenCode Go, MiniMax Token Plan, or paste a key, or point it at LM Studio or Ollama. Research: section 1.1 item 1, section 4, table rows "Models" and "Reuses what you pay for". Grok Bot, Muse and Dots each run only their maker's model.
3. **It runs on your Mac, stores your work there, and you can read the source.** No account of ours, AGPL-3.0, plus the clear three-level leash: Read only, Auto, Full access, one approval card per action. Research: section 1 items 2, 3 and 4, table rows "Source", "Where work runs", "Where data lives", "Control". Grok Bot, Muse and Dots run on vendor cloud computers; OpenBot runs full access with no per-action approval.

Competitor names: **none in the video.** Naming them forces equal-time caveats (Muse regions, Dots exclusions, Grok Bot unknown) and we cannot show their UIs under the real-UI rule. Put the comparison table on the site instead. The video argues by demonstration.

# 3. The demo

One workflow, all real, all demo data, recorded in Useful Bot Dev on 1.1.1 with the 1.1.2 ChatGPT sign-in:

**"Make me a copywriter bot for my brand."**

1. First run: Welcome, Connect, Sign in with ChatGPT (official flow). Proves ease (two steps, section 1.7) and reuse (section 1.1).
2. Empty Generalist home, real starter chip "Create a copywriter bot for my brand" tapped.
3. Generalist returns a proposal card. Click "Add teammate". Proves the team is opt-in (D5, always a card).
4. New Copywriter bot appears in the rail with its own pastel avatar. Bot pane opens: its instructions, "Nothing remembered yet", and its own model chip set to a different route than the Generalist (ChatGPT for Copywriter, OpenCode Go for Generalist). Proves per-bot identity and per-bot models (D1, D3).
5. Group chat with Generalist and Copywriter. One prompt fans out, two step rows run at once. Proves a working team (D7).
6. Copywriter writes brand-voice.md to an attached demo folder. An approval card docks above the composer, one card, one action. Click Allow. Proves the leash (section 1.4).
7. File lands in chat and in the Library, under ~/Documents/Useful Bot on this Mac. Proves local storage (section H).

Every step is in the shipped app today. No sub-agent (model-driven, unpredictable), no routine, no connector beyond what is needed.

# 4. Arc and motion design

Pace: fast and quiet for 20 seconds (setup must feel trivial), steady middle for the team build, one held beat on the approval card, calm close. 84 seconds.

2D only. Real recordings, scaled and panned in Remotion on the app's real radii and shadows. Transitions are short cross-dissolves with a soft whoosh, plus one hard cut on the approval card so it lands.

Typography: captions in Inter Semibold, white on a soft scrim, bottom third, two lines max. On-screen callouts in the app's system font where they mirror real UI text, Inter where they are editorial. Wordmark Inter Semibold, -0.018em, white on black.

Mascot: real avatars in the UI (the same glasses face in different pastels) do the character work. The animated SVG appears twice only: a 1 second blink-in on the opening black, and the end card. Black is the only background it ever sits on.

Sound design (no music): a very low room tone bed through the body, non-melodic UI clicks on real taps, soft filtered whooshes on transitions, and deliberate silence while text is being typed and on the approval card. Nothing that could be tapped along to. Nothing melodic or rhythmic at any point.

# 5. Voice

**Wade**, US male, warm and confident. The job is to make setup feel easy and the product feel trustworthy, not to narrate a documentary. Cliff is too solemn, Kit's energy would push toward ad-land, Maeve is lovely but the "narration" register adds distance.

Expressivity **+1** (beta): a little lift on the opening and the end card line, flat elsewhere. Speed **0.98**. Delivery steered by punctuation only: short sentences, a full stop before the approval card, one comma pause before "you approve it". No SSML, no emotion tags. Do not present the voice as human (section 5). Record five takes of the full script, pick per scene, mix under room tone at about -18 LUFS.

# 6. Scene list

| Time | On-screen action | Caption | Voice-over |
|---|---|---|---|
| 0:00-0:05 | Black. Mascot SVG blinks in. Wordmark fades up. (brand SVG) | Useful Bot | (silence, room tone) |
| 0:05-0:13 | First run: Welcome screen, Get started, Connect step. (real) | Two steps to start | Two steps. That is the whole setup. |
| 0:13-0:22 | ChatGPT row, Sign in, browser code screen. (real, 1.1.2) | Use the plan you already pay for | Sign in with ChatGPT. Or paste any API key, or use a local model. |
| 0:22-0:30 | Home, Generalist, empty state, starter chips. (real) | One bot to start | You start with one bot. It can build you a team. |
| 0:30-0:41 | Tap "Create a copywriter bot for my brand". Proposal card slides in. Click Add teammate. (real) | You approve every new bot | Ask for a copywriter. You approve it before it exists. |
| 0:41-0:51 | Copywriter in rail. Bot pane: instructions, memory line, its own model chip. Recreated model row shows ChatGPT and OpenCode Go (real) and LM Studio Qwen3.8-27B (recreated, labelled). | Its own job, memory and model | Its own instructions. Its own memory. Its own model. |
| 0:51-1:02 | Group chat with Generalist and Copywriter. One prompt fans out, two step rows run. (real) | A team, not one chat | Put two bots on the same job. They work together here. |
| 1:02-1:12 | Approval card docks above the composer for writing brand-voice.md. Click Allow. Hard cut. (real) | Read only, Auto or Full access | Writes ask first. One card, one action. You set how much each bot may do. |
| 1:12-1:20 | File appears in chat, Library row, Finder path bar under ~/Documents/Useful Bot. (real) | Saved on your Mac | Your chats, files and keys stay on your Mac. |
| 1:20-1:26 | Black. Mascot, wordmark, "Free and open source. AGPL-3.0.", bot.usefulbuild.com. Small caption: "Your model provider and connected apps see what you send them." | Free and open source | Useful Bot. Free, open source, and yours. |

9:16: same VO and order, each scene cropped to one element at a time (chip, card, approval, file), captions larger in the lower third, end card stacked logo over wordmark, about 78 seconds.

# 7. Avoid

- "First", "only", "always on", "works while your Mac sleeps", "nothing leaves your Mac", "available worldwide", "no telemetry", "10 bots at once", "private AI" or "unrestricted".
- Any computer use, browser agent or screen control. UB-006 is not shipped.
- GitHub Copilot on screen at all. Do not show GLM Coding Plan, Qwen Coding Plan or Command Code. Never "Claude subscription".
- Any Grok Bot region claim; no region claim of ours beyond "no region lock of ours, provider rules apply, local models need no account".
- Gmail or Drive "in one click". Composio needs the user's own key first.
- Intel, Windows, iPhone, notarized, or hiding the DMG's one-time Open Anyway step.
- Naming or sneering at competitors, or "like Grok Bot but better". Ease is shown, not claimed against anyone.
- Hype words: magic, revolutionary, game changer, seamless, next generation.
- Melodic or rhythmic sound, beat drops, trailer whoosh stacks.
- Any invented UI, any real chat from the dev machine, and the rail header "Useful Bot Dev" or the "WJ" badge in final footage.

## Answer F

# Useful Bot launch video council, round 1

## 1. Audience and the one feeling

The video is for the Mac user who already pays for a capable model and is tired of the trade. They have ChatGPT Plus or Pro, or an OpenCode Go or MiniMax plan, and they want a real agent on their own machine without buying another subscription, handing their files to a vendor's cloud VM, or spending an evening wiring up a technical stack like Hermes Agent or OpenBot. Secondary: developers and small operators on Apple silicon who care that the thing is open source and that they can read what it stores.

The one thing they should feel: "This is mine, it starts in two minutes, and I stay in charge of what it can touch." The belief underneath: a team of bots is not a cloud toy, it runs on the Mac in front of me, on the plan I already pay for, with limits I set. Ease is the emotion; control is the proof.

## 2. Three differentiators

1. **The model you already pay for, plus local.** Section 1 items 1 and 2, and the comparison rows "Models" and "Reuses what you pay for." Grok Bot is xAI only, Muse is Meta's model, Dots is GPT-6 Astra. We show ChatGPT (after 1.1.2's official sign-in), OpenCode Go and MiniMax, and a local row.
2. **A team of bots that lives on your Mac, each with its own job, memory and model.** Section 1 items 2 and 5, rows "Where work runs," "Where data lives," "Team of bots." Grok Bot, Muse and Dots run on a cloud computer the vendor owns. Ours is the native SwiftUI app on your Mac, with per-bot models (UB-002, D3) and per-bot memory (D2).
3. **You decide what each bot may do: Read only, Auto, Full access, with approval cards.** Section 1 item 4, row "Control." We claim the clear three-level model and the card, never "only we ask," because Dots, Muse and Hermes have approvals of their own kinds. OpenBot runs full access with no per-action approval, which is the honest contrast.

Open source AGPL-3.0 (item 3) closes the video rather than competing for a slot. On naming competitors: do not name any in the video. A sourced comparison dates fast and reads as sneering, and the brief says show ease, don't sneer.

## 3. The demo

"Hire a team in two minutes," possible today with a clean demo profile.

Cold open on the app, first run. Welcome, then Connect. The ChatGPT row becomes the official Sign in with ChatGPT flow. One browser code, done. On Home, the pinned Generalist is waiting. The user types one plain request: "I run a small ceramics shop. Build me a team to handle customer email and Monday sales." The Generalist replies and raises a `propose_bot` card. The user clicks "Add teammate." A second card, another click. Two bots land in the rail, each with its own avatar and instructions, shown in the bot pane with Routines and Memory.

Then the proof of model choice: the composer Model chip sets Support Writer to ChatGPT, Sales Analyst to OpenCode Go. Two bots, two plans, one app, no new subscription.

Then a routine: on Sales Analyst, "Every Monday at 9, summarize last week and post it to the team." The user hits Test run and it fires. A group chat glimpse shows both bots replying.

Then control: set Support Writer to Read only, ask it to update a pricing file, and watch it decline cleanly. Switch to Auto, ask the same write inside an attached folder, and the approval card docks above the composer. One click approves exactly that action.

Close on the repo, AGPL-3.0, and the download.

## 4. Arc and motion design

Pace is brisk but never frantic: about 14 shots in 85 seconds. Frame real screen recordings inside the app's 24 radius stage, with gentle push-ins and slight parallax so it feels filmed, not captured. Transitions are restrained slides and wipes from Remotion, one soft wipe per beat, never a spin.

2D carries almost everything, because real UI is the brand. One 3D moment earns its place: on the model beat, the actual provider rows (ChatGPT, OpenCode Go, MiniMax, LM Studio) lift into a shallow 3D stack and settle into two bot chips. No invented chrome.

Typography: Inter Semibold for titles and the wordmark at -0.018em, SF Pro for any recreated UI. Kinetic captions in the real ink colours, lower third, one line, never covering the rail or composer. The mascot animated SVG is the connective tissue: it floats in at the cold open, nudges toward each new bot as it lands, and returns for the close. It never speaks and is never redrawn as a stand-in.

Sound is non-musical only. A low room tone bed under the whole piece. A soft UI click on every real tap. A short airy whoosh on each transition, no pitch centre. A soft thud when a bot lands in the rail and when a card is approved. Full silence for half a second before each differentiator caption, which is the cheapest emphasis there is. No loops, no melodic swells, no rhythmic beds.

## 5. Voice

Deepgram Flux, **Wade**, expressivity **+1**, speed **1.0**.

Wade is the fit: US male, warm and confident, which matches the "sharp colleague" register the brand wants, and it reads calm authority without the sales lift Kit's energy would add. Not Cliff, whose depth can sound sombre for an ease-first story; not Maeve, whose Irish narration is lovely but pulls the ear away from the product voice.

Delivery is steered only by punctuation, so write for it: short sentences, full stops where a beat is wanted, commas only for real pauses. Expressivity +1 keeps warmth without the over-performance +2 invites. Read every number as words ("Monday at nine"). Say the caveat line plainly and slightly slower, because it is the honest bit. No em dashes in the script.

## 6. Scene list

| Time | On-screen action | Caption | Voice-over |
|---|---|---|---|
| 0:00-0:05 | Black. Mascot SVG floats up, wordmark fades. | Useful Bot | This is Useful Bot. |
| 0:05-0:11 | Real Welcome (01). | A team of AI helpers | A team of AI helpers that works on your Mac. |
| 0:11-0:18 | Real Connect (02); ChatGPT row to official sign-in; sign-in sheet. | Two minutes to start | Sign in with the ChatGPT plan you already pay for. Or paste a key. Or run a model on your Mac. No account of ours. |
| 0:18-0:23 | Real Home (04). | Ask for a team | Ask the Generalist to build you a team. |
| 0:23-0:31 | Type request, reply, propose_bot card, Add teammate; bots land in rail. | You approve each bot | It proposes the teammates. You approve them. Each gets its own job, memory and model. |
| 0:31-0:38 | Bot pane (06); Model chips set per bot. | Two bots, two plans | Support Writer runs on your ChatGPT plan. Sales Analyst, on OpenCode Go. |
| 0:38-0:45 | Create routine (07); Test run fires; group chat glimpse. | Routines show up to work | Give a bot a routine and it shows up to work. Daily, weekly, or once. |
| 0:45-0:53 | Permission menu; Read only refusal; Auto write; approval card approved. | You set the limits | You choose how much each bot may do. Read only. Auto. Or Full access. Every change can still ask first. |
| 0:53-0:59 | Connectors (05); a bot draws in chat. | Apps and MCP | Connect apps with your own Composio key, or any official MCP server. Drawings appear in the chat. |
| 0:59-1:06 | Recreated local row: LM Studio, Qwen3.8-27B. | Local stays local | Point it at a local model and the conversation stays on your Mac. Cloud models and connected apps receive what you send them. |
| 1:06-1:13 | Memory notes fill in settings; Usage pane. | Notes you can read | Bots remember what matters, and you can read every note they keep. |
| 1:13-1:19 | GitHub repo, AGPL-3.0, download. | Open source, AGPL-3.0 | It's open source. Download it for your Mac. |
| 1:19-1:25 | Mascot and wordmark close. | Useful Bot | Useful Bot. Your Mac, your models, your team. |

Total 85 seconds. The 9:16 cut runs the same order but opens on the sign-in beat inside three seconds, stacks the rail into a bottom bar, scales captions to upper third, and drops the Memory/Usage scene (11) to hold 75 seconds.

## 7. Avoid

No "first," "only," "always on," "works while your Mac sleeps," "nothing leaves your Mac," "available worldwide," "no region lock" as an absolute, or "no telemetry." No computer use, screen control or browser agent. No Gmail or Drive "in one click" without the Composio key step. Do not show GitHub Copilot, Tella, Claude or Google subscription sign-in, the 10-bots-at-once number, or the Settings > Computer tab, whose text is inaccurate at Full access. Do not say "10 bots."

Skip the AI-hype clichés: no glowing neural mesh, no robot hands, no "supercharge," "revolutionize," "productivity," no speed claims framed as model speed (only the recorded chat-open and launch times). Never redraw the logo or invent UI. No real owner data: the dev build ("Useful Bot Dev", "WJ") must be replaced. And no music of any kind, nothing melodic or rhythmic, not even a soft chime bed.

## Answer G

## 1. Audience and the one feeling

Mac users who already pay for an AI plan (ChatGPT Plus or Pro first, then API-key people) and who watched Grok Bot, Muse and Dots launch and thought one of: "I can't get it here", "I'm not paying another $100 to $200 a month", or "I don't want my whole life inside one company's cloud". Secondary: builders who care that it's open source.

The one feeling: **"This is mine."** The belief at the end: *I can have a small team of AI helpers on my own Mac today, running on the AI I already pay for, and nothing happens that I didn't allow.*

## 2. Three differentiators

1. **Your AI, not theirs.** Sign in with the ChatGPT plan you already have, use OpenCode Go, paste a key, or point it at a local model. Grok Bot, Muse and Dots are each locked to their maker's models (research doc section 2, rows "Models" and "Reuses what you pay for"; section 4 for which routes we may name).
2. **Your Mac, your files, open code.** The team and its chats live on your Mac, with no account of ours, and the code is AGPL on GitHub. The three big agents run on a cloud computer their vendor owns and are closed (rows "Where work runs", "Where data lives", "Source"). Always paired with the small print: cloud models and connected apps receive what you send them.
3. **You decide what each bot may do.** Read only, Auto or Full access, and an approval card before anything risky (row "Control"). This is where we beat OpenBot (full access, no per-action approval) and where we look calmer than the "always-on agent" pitch.

Ease (owner's point) runs through all three: the demo itself must look effortless, two steps from welcome to working.

## 3. The demo

One workflow that exists today, using a starter prompt the app already ships: **"Create a bot that plans a Downloads tidy-up."**

1. Welcome, then Connect: **Continue with ChatGPT** (official sign-in, 1.1.2). Plan connected.
2. Click the starter prompt. The Generalist answers with an **Add teammate** card. Click it. A new bot, "Tidy", lands in the rail with its own avatar colour.
3. Tidy's chip shows the model (the ChatGPT plan). Attach a demo Downloads folder as its project. Access: **Auto**.
4. Ask Tidy to plan the tidy-up. It lists the folder and answers with a short plan (demo files: invoices, screenshots, installers).
5. Ask it to do it. Moving files triggers an **approval card**. Click Approve. Tidy reports what moved.
6. Cutaway beats from the same session: the access menu (Read only / Auto / Full access), the model menu (ChatGPT, OpenCode Go, and a recreated LM Studio row with Qwen3.8-27B), Connectors with Notion's official MCP tool grid, then the rail with four demo bots and a group.

It proves all three differentiators in one story: your plan powers it, it works on files on your Mac, and it asks first. Waiting on the model is time-compressed in the edit; nothing is faked.

## 4. Arc and motion design

Arc: **friction, relief, competence, control, ownership.**

- **Opening (friction):** black stage, three short lines set one by one in Inter Semibold, white, tight tracking: "Their cloud." "Their model." "Their rules." No logos, no names. Each line lands with a dry click, then the lines dim.
- **Turn (relief):** the mascot head fades up on black, blinks once, and the window rises out of it.
- **Body (competence and control):** real footage in a floating window on black, with a slight 2.5D tilt that settles flat as each scene begins. Camera moves are slow push-ins to the element that matters (the ChatGPT row, the Add teammate card, the approval card, the access menu), never whip pans. Cuts follow real clicks.
- **3D moment, only one:** the rail of bots fans out in depth when the team scene arrives, each avatar on its own plane, then settles back into the real rail. Built in @remotion/three with the real avatar PNGs.
- **Mascot use:** the welcome tile and the closing card only, plus one small blink when the approval is granted. It's a character, not a cartoon.
- **Typography:** captions in SF Pro to match the UI, title cards in Inter Semibold. Never more than six words on a title card.
- **Sound design, no music:** room tone under everything, real UI click sounds synced to clicks, a soft air whoosh on window moves, keyboard taps when text is typed, and two full silences: before "Or keep it on your Mac" and before the final line. No risers, hits or tonal pads.

## 5. Voice

**Cliff** (US male, deep, calm, listed for narration), expressivity **0** (the only validated value), speed **0.95**. Calm suits "you stay in charge" and contrasts with the hyped agent launches. Commas and full stops do the pacing. Spell "bot dot useful build dot com" in the script. If Cliff sounds flat in the samples, Kit at 0 is the second choice. The owner's ear decides.

## 6. Scene list (16:9, 86 s)

| Time | On screen | Caption | Voice-over |
|---|---|---|---|
| 0:00 to 0:07 | Black. "Their cloud." "Their model." "Their rules." set one by one (recreated type) | same | "Every new AI agent wants you to move into its cloud." |
| 0:07 to 0:12 | Mascot fades up, blinks; window rises from it (real welcome screen) | Or keep it on your Mac. | "Or, keep your team on your Mac." |
| 0:12 to 0:22 | Real first run: Connect, Continue with ChatGPT, plan connected | Use the AI you already pay for. | "Sign in with the ChatGPT plan you already pay for. Or use an API key, or a local model." |
| 0:22 to 0:36 | Real: starter prompt, Generalist reply, Add teammate card, "Tidy" lands in the rail | Ask for a teammate. | "Ask the Generalist for help, and it builds you a teammate, with its own job, memory and model." |
| 0:36 to 0:52 | Real: attach demo Downloads, Auto, plan appears, approval card, Approve, report | It asks before it acts. | "Point it at a folder. It makes a plan, and it asks before it changes anything." |
| 0:52 to 0:60 | Real access menu: Read only, Auto, Full access | You decide what each bot may do. | "You decide what each bot may do." |
| 1:00 to 1:08 | Real model menu (ChatGPT, OpenCode Go) plus recreated LM Studio row, Qwen3.8-27B | Any model. Even local. | "Switch models any time. Run one locally if you like." |
| 1:08 to 1:16 | Real Connectors: Notion official MCP and its tools | Connect your apps. | "Connect your apps, like Notion, through their official servers." |
| 1:16 to 1:22 | 3D fan of the rail, settles into a real group chat of four demo bots | Build the team you need. | "Build the team you need." |
| 1:22 to 1:26 | Black. Mascot, wordmark. "Open source. On your Mac." Small print: cloud models and connected apps receive what you send them. macOS 14 or later, Apple silicon. | same | "Useful Bot. Open source, and on your Mac." |
| 1:26 to 1:30 | bot.usefulbuild.com, Download for Mac | Free download. | "Get it free at bot dot useful build dot com." |

**9:16 cut (about 45 s):** keep the opening lines, the ChatGPT sign-in, the teammate and the approval card, then the close. Reframe on the chat column, captions larger and centred above the composer, skip the 3D fan.

## 7. Avoid

- Naming or showing competitor logos. "Their cloud" says it without a fight we can't fully source (Muse also has Mac computer use).
- "First", "only", "private", "nothing leaves your Mac", "always on", "works while you sleep", "worldwide", any computer-use shot.
- Robot clichés, neon glows, particle swooshes, fake dashboards, typing shown at superhuman speed without a cut.
- "Supercharge your productivity" copy. Say what happens.
- Showing GitHub Copilot, GLM, Qwen plan or Command Code rows; any real account, email or name.
- Music, tonal stingers, risers.

## Answer H

## 1. **Audience and the one feeling.**

Mac-based freelancers, consultants and small business owners who already use ChatGPT, work with files and want repeatable help without configuring an agent framework.

The feeling is **confident ownership**: “I can give these bots useful jobs, use my existing model plan and decide what they change.”

Lead with a finished piece of work. Let the interface establish ease. Don’t name competitors in the video. The differences are clearer when demonstrated.

## 2. **Three differentiators.**

1. **Bring the model you already use.** Show official ChatGPT sign-in, then mention API keys and local models. Grok Bot, Muse and Dots use their makers’ models. OpenBot and Hermes also offer model choice, so this is an advantage against the closed platforms, not an exclusive feature.  
   Support: section 1, claim 1; comparison rows **Models** and **Reuses what you pay for**; section 4, **ChatGPT** route.

2. **Turn a task into reusable teammates.** Each bot has a defined job, instructions and memory. Show the Generalist proposing two bots, the owner accepting them and the bots contributing to one deliverable. Muse and Dots launch around one agent. Grok Bot, OpenBot and Hermes also have teams. Useful Bot’s pitch is making that team approachable in a native Mac interface.  
   Support: section 1, claims 5 and 7; comparison rows **Team of bots** and **Native Mac app**; appendix **D1, D2, D5 and D6**.

3. **Work on your Mac with visible control.** Show an actual approval before changing an existing file. Chats and files are stored locally, with no Useful Bot account. Cloud models and connected apps receive what you send them. OpenBot and Hermes also run locally; OpenBot’s full-access approach makes Useful Bot’s permission choices a meaningful contrast. Other competitors have approvals too.  
   Support: section 1, claims 2 and 4; comparison rows **Where work runs**, **Where data lives** and **Control**; appendix **G**, especially the **Auto** row.

Open source supports trust at the close. It doesn’t need a fourth demonstration.

## 3. **The demo.**

**Turn scattered client feedback into a weekly update.**

Use a synthetic project, Cedar Studio. Prepare twelve short feedback notes with duplicate requests, two unresolved blockers and one uncertain delivery date. Include an existing `weekly-update.html` containing last week’s update.

Start with official ChatGPT sign-in. The workflow itself uses shipped tools; film the sign-in only after 1.1.2 is installed and verified.

Ask the Generalist:

> Read the Cedar Studio demo notes. Propose an Analyst to check the evidence and a Writer to draft the weekly client update. Separate confirmed facts from open questions. Keep the delivery date unconfirmed. Update the existing weekly-update.html after I approve the change.

Accept both real proposal cards. Give the Writer a synthetic preference to remember: “Keep client updates under 200 words.” Show its saved note in settings.

The Analyst identifies duplicates and blockers. The Writer drafts from those findings. The Generalist coordinates through real handoffs.

Keep **Auto** selected and leave Project unattached. The demo files sit under the demo user’s home directory. Updating the existing file should require approval under the documented policy. Rehearse and verify that exact operation before filming.

Approve the actual change. End on the generated page preview card and the completed update. It must retain both blockers and avoid inventing a deadline.

This produces one outcome while proving model connection, distinct teammates and permission control. No connector setup is needed.

## 4. **Arc and motion design.**

Use an **86-second film**: result, connection, teamwork, approval, result again, download.

Stay in light mode for readable evidence. Use black for the closing brand frame. The supplied “settings-dark” screenshot is visibly light, so don’t treat its filename as dark-theme evidence.

Remotion handles framing, captions and transitions around recordings. Use restrained 2D crops and slow moves between the rail, transcript and approval card. No 3D device orbit or floating interface panels. Never cross-fade readable transcripts into each other.

Keep important clicks and their resulting states at normal speed. Shorten model waits with a visible “Wait shortened” label. Don’t manufacture instantaneous replies.

Use SF Pro for captured UI and captions. Use Inter Semibold with the supplied tracking for the wordmark. Preserve the real colours, radii and layout. Avatar colours distinguish the two jobs.

Use the supplied mascot asset once at the close, on approved black. One blink is enough. Working avatars keep their real recorded animation.

Sound is voice, isolated UI clicks, one soft non-tonal transition and silence. No beat, melodic notification, sonic logo or repeating pulse.

Capture at 60 fps. Review every frame of moving sequences across several takes, including a cold start. These are production checks, not checks already performed for this proposal.

## 5. **Voice.**

**Wade**, expressivity **0**, targeting approximately **145 words per minute**.

His warm, confident delivery suits practical work without making the video sound like an announcement. Let the approved action and finished result carry the excitement.

Use periods for clean stops and separate audio segments for deliberate pauses. No SSML or emotion tags. Treat speaking speed as a measured delivery target, not an assumed API parameter.

Leave short silences while proposal cards and approval arguments are readable. Generate caption timing from speech-to-text on the final audio, then correct names and timings manually.

## 6. **Scene list.**

Captions below reproduce the voice-over verbatim. Break them into short phrases, with two lines maximum. All app footage is real; only the closing brand card is composed in code.

| Timecode | On-screen action | Caption | Voice-over line |
|---|---|---|---|
| 00:00-00:05 | Real completed update and its chat preview card. | A client update, built from the week's notes. | A client update, built from the week's notes. |
| 00:05-00:12 | Welcome, Get started, tight crop of official ChatGPT sign-in, then connected state. Never include Copilot. | Useful Bot connects to your ChatGPT plan through OpenAI's official sign-in. | Useful Bot connects to your ChatGPT plan through OpenAI's official sign-in. |
| 00:12-00:18 | Real connected model picker. Hold the selected ChatGPT model. Don’t film a local reply. | You can also connect API keys or a local model. | You can also connect API keys or a local model. |
| 00:18-00:26 | Send the Cedar Studio task. Show the two genuine proposal cards. | Ask the Generalist to build a small team for this job. | Ask the Generalist to build a small team for this job. |
| 00:26-00:34 | Accept both cards. Rail gains Analyst and Writer with distinct real avatar colours. | An Analyst checks the evidence. A Writer turns it into a client update. | An Analyst checks the evidence. A Writer turns it into a client update. |
| 00:34-00:41 | Writer settings: its actual instructions and saved preference note. | Each bot keeps its own instructions and notes across chats. | Each bot keeps its own instructions and notes across chats. |
| 00:41-00:48 | Analyst transcript shows duplicate requests, blockers and uncertain date. | The Analyst separates confirmed facts from questions still open. | The Analyst separates confirmed facts from questions still open. |
| 00:48-00:56 | Real handoff and Writer draft. Hold the sentence that leaves the deadline unconfirmed. | The Writer uses those findings to draft an update, without inventing a deadline. | The Writer uses those findings to draft an update, without inventing a deadline. |
| 00:56-00:64 | Auto chip, actual approval card and exact destination. Pause before approving. | Before changing this existing file, Auto asks for approval. | Before changing this existing file, Auto asks for approval. |
| 00:64-00:71 | Approve. Show the successful write and finished page preview. | Approve the change. The finished update is saved on your Mac. | Approve the change. The finished update is saved on your Mac. |
| 00:71-00:81 | Hold the completed app view. Keep privacy captions prominent. | Chats and files stay stored here. Cloud models and connected apps receive what you send them. There's no Useful Bot account. | Chats and files stay stored here. Cloud models and connected apps receive what you send them. There's no Useful Bot account. |
| 00:81-00:86 | Black brand card: supplied logo, wordmark, “Download for Mac”, public download URL, “AGPL-3.0”, “Apple silicon · macOS 14+”. | Useful Bot is open source. Download it for your Mac. | Useful Bot is open source. Download it for your Mac. |

**9:16:** Keep the same duration and story, but reframe each recorded region separately. Show rail, transcript and approval card sequentially at readable size. Reserve caption space below the evidence.

## 7. **Avoid.**

- “First”, “only”, “always on”, worldwide availability or absolute privacy claims.
- Screen control, browser automation or work continuing while the Mac sleeps.
- Pretending every subscription works or that local-model quality equals the filmed ChatGPT reply.
- Claims that every Auto write asks. This demonstration concerns an existing file outside an attached project.
- Invented messages, approval cards, tool progress or model responses.
- Copilot, restricted plan routes, development labels, owner accounts and private repository footage.
- A wall of provider logos, competitor ridicule, terminal setup theatre or an AI-generated futuristic workspace.
- Music, rhythmic typing beds, melodic effects and dramatic countdowns.
- “Install in seconds” or a frictionless DMG claim. The download page must explain the current Open Anyway step.

## Answer I

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

## Answer J

1. **Audience and the one feeling.**
Mac owners on Apple silicon who already pay for ChatGPT, tinker with local models, and want help without new accounts or cloud lock in. Makers, writers, small teams, open source friendly. The one feeling at the end: this looks easy and mine. Belief: my models, my bots, my files stay on my Mac, and I stay in charge.

2. **Three differentiators.**
No competitor names on screen. Show the gap, do not sneer.

A. Use models you already pay for, or bring a key, or go local. Sign in with ChatGPT plan through the official flow in 1.1.2, plus OpenCode Go and MiniMax Token Plan, plus API keys, plus LM Studio or Ollama or Custom. Grok Bot, Muse and Dots each lock to maker models. (UB-001 Sec 1.1, Sec 4)
B. It runs on your Mac and stores chats and keys here, with no account of ours. Free download, public AGPL-3.0 repo you can read. Grok Bot, Muse and Dots run on vendor cloud computers. Caveat spoken plainly: cloud models and connected apps receive what you send them. (UB-001 Sec 1.2 and 1.3)
C. A team with clear control. Each bot has its own instructions, memory and model. Generalist proposes, you confirm. Read only, Auto or Full access with one approval card per action. OpenBot runs at full access with no per action approval. Hermes Bot Mode exists but setup is technical, so claim ease by showing two step start. (UB-001 Sec 1.4, 1.5 and 1.7)

3. **The demo.**
One continuous job, possible today with demo data in a clean Dev profile.
Start at Welcome, then Connect, sign in with ChatGPT plan. Empty Generalist chat shows starter chip: Create a copywriter bot for my brand. Ask it. It returns a propose_bot card. You press Add teammate. New bot Brand Writer appears in the rail with its own instructions pane and model chip.
Give it work: draft launch notes from a local folder, save to Notion through the official Notion MCP, sketch a simple graphic in Excalidraw in chat. Permission stays on Auto. One approval card appears for the Notion write. You approve. Memory saves voice notes. You add a weekday routine: draft ideas at 09:00 in your zone. Routine run lands in that bot chat. End on Library files under Documents. This proves A (your ChatGPT plan), B (local chats and files), and C (team plus approval card plus routine).

4. **Arc and motion design.**
Pace: calm and quick. 84 seconds, 11 beats, mostly 6 to 9 seconds each. Hard cuts between real app states. One soft dissolve to mark time passing to the routine run. No spinning 3D, no fake windows. One 2D push in on the mascot at open and close, plus real bot face blink while working, with Reduce Motion respected in footage.
Typography: app UI stays in SF Pro as shipped. Titles and end card in Inter Semibold with -0.018em tracking, white on black. Captions burned in, Inter Medium, 44 px on 16:9 with scrim, two lines max, verbatim to voice.
Mascot: open on black #000000 with the real white head mark, pink tongue #FF8FA3, then the animated SVG blink once. Never redraw it. Never place it on color. Use small avatar dots as chapter markers, in real pastel tones.
Color and shape: light theme canvas and rail #F3F3F3, bot bubbles #FFFFFF, ink #171717 for day scenes. One dark beat for connectors to show both themes. Radii as shipped: stage 24, cards 16, composer pill. Soft long shadows kept.
Sound, no music: room tone low, real UI clicks, soft whoosh on cuts, paper like tick on approval card, muted pop on memory save, silence under the privacy line. Nothing melodic or rhythmic. No metronome, no hum, no beat.

5. **Voice.**
Pick Wade, US male, warm and confident. Why: the brief is ease like Grok Bot, not epic and not sleepy. Wade carries plain how to copy without hype, and stays clear under burned in captions. Kit is brighter but reads young for a privacy line. Cliff is calm but heavier. Maeve is strong but Irish voice over a US Mac default adds friction.
Settings: Flux TTS, expressivity +0.5, speed 1.0, 44.1 kHz WAV. Delivery by punctuation alone. Short sentences. Periods for beats. Commas for breath. No SSML, no tags. Read at conversational pace, smile held back, stress nouns: Mac, team, approve. Reprint voice credit in end card: Voice by Deepgram, not human.

6. **Scene list.**
All footage re-recorded in Useful Bot Dev with demo identity. No Copilot, no Tella, no Computer tab.

| Timecode | On-screen action (real UI or recreated) | Caption | Voice-over line |
|---|---|---|---|
| 0:00-0:07 | Recreated in code: black #000000, real mark, Inter Semibold wordmark, animated SVG blink once | A team of helpers on your Mac | Meet Useful Bot. A small team of AI helpers that lives on your Mac. |
| 0:07-0:15 | Real: 01-first-run-light.png flow, Welcome to Useful Bot, Get started | Easy start, two steps | Start in two steps. Welcome, then connect a model to start. |
| 0:15-0:24 | Real: 02-connect-light.png after 1.1.2, ChatGPT row with official sign in, OpenCode Go, MiniMax named | Use the plan you pay for | Sign in with the ChatGPT plan you already pay for. Or OpenCode Go, MiniMax, a key, or a local model. |
| 0:24-0:31 | Recreated row with real tokens: LM Studio with Qwen3.8-27B listed under Local, no key field | Local needs no account | Prefer local. Point it at LM Studio or Ollama. Local models need no account. |
| 0:31-0:41 | Real: 04-after-skip.png, Generalist, starter chip Create a copywriter bot for my brand, proposal card with Add teammate | You confirm each new bot | Ask the Generalist to build your team. It proposes. You confirm. Nothing is added quietly. |
| 0:41-0:50 | Real: 06-bot-pane-light.png, avatar, instructions, Routines with Create routine, 07-settings-light.png memory line | Each bot keeps its job and notes | Brand Writer keeps its own instructions, memory and model. It remembers voice notes as you work. |
| 0:50-1:00 | Real: 05-connectors-light.png, Excalidraw Added, Notion official MCP tool grid, composer access level Auto | Apps plug in, writes ask | Connect Notion and draw with Excalidraw in chat. On Auto, reads run and writes ask. |
| 1:00-1:09 | Real: chat with approval card above composer, Approve once, Notion page created, Excalidraw preview | One card, one action | One card approves one action. You approve the Notion save. The drawing stays in the chat. |
| 1:09-1:17 | Real: routine set weekday 09:00, run lands in bot chat; Library files shown | Routines run while the Mac is awake | Set a weekday routine. It runs here while the Mac is awake, and files land in your Library. |
| 1:17-1:24 | Recreated end card with real tokens: black, mark, github.com/wasimjalali/usefulbot, AGPL-3.0, Download for Mac | Chats and keys stay on your Mac | Chats and keys stay on your Mac. Useful Build has no account for you. Your provider sees what you send it. |

9:16 cut differs: same voice and order, reframed to the chat column and rail at 1080 by 1920 with larger captions and a stacked end card.

7. **Avoid.**
Avoid unshipped as shipped: computer use, screen control, browser agent, works asleep, always on language. Avoid absolute privacy: nothing leaves your Mac, worldwide, no telemetry as absolute, one click Gmail without a Composio key. Avoid naming Claude subscription, Copilot, GLM Coding Plan, Qwen Coding Plan, Command Code, Kimi Code and MiMo by name. Avoid first and best claims, versus films, unnamed rival jabs, robot uprising jokes, typing speed brags, millisecond model claims, fake UI, stock laptops, music beds, rhythmic tapping, melodic chimes.

## Answer K

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

## Answer L

## 1. Audience and the one feeling.

Mac owners who already pay for ChatGPT and want a few helpers without a vendor's cloud computer. They have bounced off a locked model, a region rule, a price or a technical setup. A first run that finishes is the answer.

They should feel settled. They can open this tonight, sign in with the plan they already have, and stay in charge: a new teammate waits for a yes, and the file they asked for is on their Mac.

Leave the other products unnamed. A named comparison would sneer or concede. The picture carries the difference.

## 2. Three differentiators.

**The model you already pay for.** Rows "Models" and "Reuses what you pay for", claim 1. Grok Bot is xAI only, on Cursor or SuperGrok. Muse is Meta's model only, and does not reuse an outside plan. Dots is GPT-6 Astra only, inside ChatGPT Pro or Business Premium. Film the 1.1.2 ChatGPT sign-in, OpenAI's official flow. OpenCode Go and MiniMax may be named, and a local runtime sits in the same list. Hermes and OpenBot also take outside models. The filmed difference is claim 7: two steps, and the ease is the take.

**Your Mac, no account of ours.** Rows "Where work runs", "Where data lives" and "Native Mac app", claim 2. Grok Bot, Muse and Dots run on a cloud computer the vendor owns. Useful Bot is native SwiftUI, and chats and keys stay on the Mac. OpenBot and Hermes also run locally, and both are Electron. "On your computer, with the plan you pay for" is already OpenBot's line. Say the caveat with the Mac: ChatGPT still receives what you send.

**A team you approve, at three levels.** Rows "Team of bots" and "Control", claims 4 and 5. Show two bots, each with its own instructions and model. Muse and Dots are one agent, and a crowd of faces echoes Grok Bot's always-on team. Proof is the real menu (Read only, Auto, Full access) and the Add teammate card, which shows even in Full access. OpenBot approves nothing per action. The others have systems of their own, so the claim stops at the three levels and the card.

Claim 8 is an end-card line only: no region lock of ours, provider rules apply. Muse is US only, Canada per press. Dots Pro excludes the EEA, the UK and Switzerland. Say nothing about Grok Bot's regions.

## 3. The demo.

One pass, demo data, a clean profile, on 1.1.2. The 1.1.1 ChatGPT row says "through Codex sign in" and stays off screen. Rail title "Useful Bot", a demo badge.

A folder named Northwind holds three synthetic files: who they are, how they sound, one product.

Welcome, Get started, then ChatGPT on a fresh demo account, framed with Copilot out of view. OpenCode Go may stay. Leave restricted plans collapsed. Attach Northwind, keep Auto, send: "Read this folder. Propose a copywriter bot for Northwind. Change nothing yet." The step row shows the read. Click Add teammate. Northwind arrives in the pink nearest the tongue, with its own instructions. Ask it to write intro.md in that folder. On Auto that write raises no card, so do not narrate one. Show the file, then Finder for one second. Hold the access menu on its three labels. On the model menu, comp one row onto the filmed plate: LM Studio, and the real local id (the brief names Qwen3.8-27B; draw whatever id LM Studio returns). No local generation. Caption the reply as ChatGPT's. propose_bot, attach, write_file and per-bot settings are shipped. Leave out Excalidraw, routines, memory and sub-agents.

## 4. Arc and motion design.

84 seconds. The app stays in the light theme. Black is only behind the logo.

The animated mascot blinks once on black. Wordmark in Inter Semibold, tracking -0.018em, white. A 12-frame match cut lands that logo in the real welcome tile. After that, the film is the recording: cuts on clicks, two 600ms zooms on the card and the model chip, then holds. The close runs the match backward, from the Northwind avatar to the black logo.

No 3D and no rendered app. Drawn pixels are the black frames, captions, the end card and that one row. The row uses SF Pro, a white surface, ink #171717 and radius 16, on a plate from the filmed menu. Captions are SF Pro on a soft black pill, fading in four frames. Inter is the wordmark only. The working avatar blinks on its own. Film with Reduce Motion off. No second mascot.

Room tone under the whole film. Dry clicks on real pointer downs. A few key ticks on the typed line. One whoosh under each match cut, from a CC0 or Sonniss source, kept only if it has no note in it. No chime. Voice dry and close. The last two seconds are room tone. Do not speed-ramp the turn.

## 5. Voice.

Maeve, expressivity -1, default rate.

At -1 she stays level. Wade would fill the silence, Kit runs hot, and Cliff turns into a trailer. Leave the rate. The brief has no speed control. A full stop is where the click lands, above all after "then it asks." Credit "Voice: Deepgram" in small SF Pro. Say the product name only over the logo.

## 6. Scene list.

16:9, 84 seconds. Captions are the spoken line.

| Time | On-screen action | Caption | Voice-over |
|---|---|---|---|
| 0:00-0:05 | Black. Animated logo, one blink. Wordmark in. | | |
| 0:05-0:13 | Match cut to the real Welcome screen. | A team of helpers, on your Mac. | A team of helpers, on your Mac. |
| 0:13-0:20 | Real UI. Get started, then Connect. ChatGPT and OpenCode Go in frame. | Sign in with the ChatGPT plan you already pay for. | Sign in with the ChatGPT plan you already pay for. |
| 0:20-0:27 | Real 1.1.2 sign-in, back on the model chip. | No account of ours. ChatGPT still receives what you send. | No account of ours. ChatGPT still receives what you send. |
| 0:27-0:34 | Attach Northwind. Send the line. | Ask for a teammate. | Ask for a teammate. |
| 0:34-0:42 | Step row, then the proposal card. Hold. | It reads the folder on your Mac, then it asks. | It reads the folder on your Mac, then it asks. |
| 0:42-0:50 | Click Add teammate. Northwind joins, own colour, own instructions. | You add it. It keeps its own instructions, and its own chat. | You add it. It keeps its own instructions, and its own chat. |
| 0:50-0:58 | The reply, then intro.md. One second of Finder. | That reply came from ChatGPT. The file stays on your Mac. | That reply came from ChatGPT. The file stays on your Mac. |
| 0:58-1:06 | Access menu: Read only, Auto, Full access. | You choose what each bot may do. | You choose what each bot may do. |
| 1:06-1:14 | Filmed model menu plus one recreated row: LM Studio, the real local id. | Or a local model, which needs no account. | Or a local model, which needs no account. |
| 1:14-1:20 | Both bots in the rail. Hold. | Same Mac. A job each. | Same Mac. A job each. |
| 1:20-1:24 | Match cut to black. Logo, wordmark, "Provider rules apply.", Deepgram credit. | Free and open source. | Free and open source. |

The 9:16 cut keeps this audio and these takes, cropped to the stage. The rail slides in only when Northwind appears. Captions sit just above the composer, clear of the card and the menu. Connect crops to the heading and the ChatGPT row.

## 7. Avoid.

- "First", "only", "always on", "works while your Mac sleeps", "nothing leaves your Mac", "available worldwide", "no telemetry", any Grok Bot region, "10 bots", Intel, Windows, iPhone, notarized.
- Computer use, a browser agent, and Settings > Computer. Its approval line is wrong at Full access.
- Copilot, the Codex sign-in wording, a Claude or Google subscription, the GLM, Qwen and Command Code plans, one-click Gmail or Drive, the Composio key, Tella.
- Naming those products, and borrowing OpenBot's tagline. Show the plan and the Mac, then the card.
- A tour of memory, routines, groups of six, sub-agents, the colour grid or Excalidraw.
- A drawn chat bubble passed off as the model's reply.
- "Useful Bot Dev", the WJ badge, the private repo, captures from any other profile.
- The Gatekeeper "Open Anyway" step. The description can hold the DMG note and the curl install.
- Music, chimes, risers, rhythmic ticks, a 3D head, a fake screen, Inter outside the wordmark, a stand-in logo.
- Trailer words (unleash, supercharge, seamless, powerful) and em dashes in any spoken or on-screen line.
- A jab at anyone's setup. The two-step start is the argument.

---

# Round 1 brief

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


---

# UB-001-research.md

# UB-001 research: product truth and competitors

Prepared 2026-10-05 for the Useful Bot launch video. Version shown: 1.1.1 (build 450), plus the official ChatGPT sign-in shipping in 1.1.2 (UB-015 part, PR #187) before filming. Research by nine Sonnet 5.5 agents, checked by Opus 5.5. Raw dossiers with every source URL are in `evals/results/2026-10-05-ub001-council/research/`. Facts carry the date they were read (2026-10-05) unless marked.

Status words: **official** = the vendor's own page, docs, repo or store listing. **press** = third-party coverage. **unknown** = no source found, never filled in by guess.

## 1. What we can honestly claim

Strong, sourced, and different from most of the field:

1. **Any model, including ones you already pay for.** Sign in with a subscription, paste an API key, or point it at a local runtime (LM Studio, Ollama, Custom). Grok Bot, Muse, Dots, Claude Cowork, Gemini Spark and Perplexity are each locked to their maker's models. Subscription routes we may name on screen: ChatGPT (after 1.1.2 moves it to OpenAI's official open-source flow), OpenCode Go, MiniMax Token Plan. See section 4 for the routes we must not show.
2. **It runs on your Mac and stores your chats and files there, with no account of ours.** Grok Bot, Muse and Dots run on a cloud computer the vendor owns. Caveat in every use: cloud models and connected apps receive what you send them.
3. **Open source, AGPL-3.0.** Public at github.com/wasimjalali/usefulbot. Grok Bot, Muse, Dots, Cowork, Spark and Perplexity are closed. OpenBot (openbot.run) and Agent! are source-available under PolyForm Noncommercial, not open source.
4. **You choose how much each bot may do: Read only, Auto or Full access, with approval cards.** OpenBot runs agents with full access and no per-action approval (its own README). Others have approvals of their own kinds (Dots custom rules, Muse Sentinel, Hermes Smart/Manual/Off), so the claim is the clear three-level model and the card, not "only we ask".
5. **A team of bots, each with its own job, instructions, memory and model,** a Generalist that proposes new bots and groups, group chats of 2 to 6 bots, sub-agents in parallel, routines (daily, weekly, once).
6. **Apps through Composio and any official MCP server** (Notion's official MCP verified with 44 tools on 2026-10-04), each shown with its tools, plus Excalidraw drawings in chat.
7. **Easy to start, like Grok Bot.** Two-step first run: Welcome, then "Connect a model to start" with sign-in or key (FirstRunView.swift:713-732). The owner's point: Hermes Agent has a bot mode but is technical to set up. Claim the ease by showing it, not by naming Hermes.
8. **No region lock of ours.** Muse is US (Canada reported by press). Dots Pro excludes the EEA, UK and Switzerland. Safe line: "A download for your Mac, no account of ours. Where it works depends on the AI provider you connect, and local models need no account at all."

Do not claim:

- "First" or "only" for bot teams, open source or model choice. Hermes Agent (MIT, 251k stars) has Bot Mode with named bots, group chats, any model and local models. OpenClaw (MIT) has multi-agent teams.
- Computer use, controlling the Mac's screen, or a browser agent. UB-006 is not shipped; bots have `web_search` and `web_fetch` only. Muse, Hermes, OpenClaw, Cowork, Perplexity and Agent! all control a computer.
- "Works while your Mac sleeps" or "always on". Grok Bot, Muse and Dots run in the cloud; we don't.
- "Nothing leaves your Mac", "available worldwide", "no telemetry" as an absolute, any Grok Bot region status, "10 bots at once" as a benchmark (it's a concurrency limit, not a measured result), Intel, Windows, iPhone, notarized.
- Gmail or Drive "in one click": catalogue apps need the user's own Composio key first.

## 2. Comparison table

Only claims sourced on both sides. Full sources per cell are in the dossiers.

| | Useful Bot 1.1.1 | Grok Bot (xAI) | Muse (Meta) | Dots (OpenAI) | OpenBot (openbot.run) | Hermes Agent (Nous) |
|---|---|---|---|---|---|---|
| Source | Open, AGPL-3.0 | Closed | Closed | Closed | Source-available, PolyForm Noncommercial | Open, MIT |
| Models | Any: subscriptions, API keys, local | xAI only (press) | Meta Muse Spark only | OpenAI GPT-6 Astra only (official) | Any, via CLIs, keys, Ollama, LM Studio | Any, incl. local |
| Reuses what you pay for | Yes: subscriptions or your keys | Cursor or SuperGrok plans only | No | ChatGPT Pro or Business Premium only | Yes, via CLI plans | Partly (Claude Max, SuperGrok, Copilot) |
| Price of the app | Free (AGPL) | In Cursor from $20/mo, SuperGrok | Free tier, $20, $100/mo | In Pro ($100 to $500/mo), Business Premium | Free | Free |
| Platforms | macOS 14+, Apple silicon | Mac, Windows, Linux, iOS, Android | iOS, Android, web, Mac | ChatGPT desktop, web, mobile, Slack, Teams | Mac, Windows, Linux (Electron) | Mac, Windows, Linux (Electron) |
| Native Mac app | Yes (SwiftUI) | unknown | unknown | ChatGPT desktop app | No (Electron) | No (Electron) |
| Where work runs | Your Mac | Vendor cloud computer (US) | Meta cloud VM, plus Mac computer use | OpenAI cloud computer, optional local | Your computer | Your computer |
| Where data lives | Your Mac | Vendor cloud | Meta cloud | OpenAI cloud | Your computer | Your computer |
| Team of bots | Yes, groups of 2 to 6, sub-agents | Yes, group chats | One agent | One dot at launch | Yes | Yes, Bot Mode |
| Computer use | No (planned) | Yes, cloud computer | Yes | Yes, cloud, optional local | Optional, local | Yes, local |
| App connections | Composio catalogue + official MCP | Connectors, MCP | Dozens of partners | 4,000+ ChatGPT plugins | Plugins, MCP | MCP |
| Control | Read only / Auto / Full access + approval cards | Approval prompts, Auto-review model | Sentinel approvals | Custom rules per action | None per action (full access) | Smart / Manual / Off |
| Regions | No lock of ours; provider rules apply | unknown | US (+ Canada, press) | Pro: not EEA, UK, CH | No stated limit | No stated limit |

Also close, not in the main table: **OpenClaw** (MIT, multi-agent, poor security record), **Claude Cowork** (Claude models only, paid plan, computer use), **Gemini Spark** (Google AI Ultra, $100 or $200/mo, Gemini only, US-first), **Perplexity Personal Computer** ($200/mo Max, press only), **Agent! for macOS** (native Swift, any model, single agent, noncommercial license).

## 3. Taglines (for contrast)

- Grok Bot: "Grok Bot is your team of always-on agents." (official)
- Muse: "The World's First Personal AI Agent Built for Everyone" (official)
- Dots: "frontier intelligence that have your back" (press quote)
- OpenBot: "Persistent AI teammates on your own computer. Run Codex, Claude, Gemini and Grok with the plans you already pay for, or your own model." (official)
- Hermes Agent: "The Agent That Grows With You" (official)
- Useful Bot welcome screen today: "A team of AI helpers that works on your Mac. Your chats and keys are stored here."

## 4. Subscription routes: what may appear on screen

| Route | Verdict | Why |
|---|---|---|
| ChatGPT | Show and name, after 1.1.2 | OpenAI's official Sign in with ChatGPT for open-source apps (2026-09-29); 1.1.1 uses the Codex CLI client, which is why UB-015 moves it |
| OpenCode Go | Show and name | "Use with any agent" (opencode.ai/docs/go) |
| MiniMax Token Plan | Show and name | Built "to be used across third-party harnesses" (MiniMax, search snippet) |
| Kimi Code, MiMo Token Plan | Show without naming | Documented for named coding tools only |
| GLM Coding Plan, Qwen Coding Plan, Command Code | Don't show | Vendor terms restrict third-party or backend use (logged as UB-015) |
| GitHub Copilot | Don't show | Officially supported only in OpenCode |
| Anthropic, Google | API key only | No subscription route exists; never show "Claude subscription" |

## 5. Voice, sound and tooling findings

- **Deepgram:** Flux TTS (`/v2/speak`, GA August 2026) has an `expressivity` setting (-2 to +2, beta); Aura-2 is the fallback. No SSML, no emotion tags, no word timestamps (captions get timings from Deepgram speech-to-text on the audio). About $0.045 per 1k characters; five full takes cost about $0.32 and fit the $200 new-account credit. Commercial use allowed; don't present the voice as human. Shortlist: Wade, Kit, Cliff, Maeve (Flux).
- **Remotion:** official Claude Code plugin with 12 skills (`remotion-dev/skills`), free for 3 or fewer employees (owner confirmed). The Remotion MCP is deprecated. Packages: transitions, motion-blur, captions, lottie, three.
- **No music (owner rule):** non-musical sound effects only, from Freesound (CC0 filter), Pixabay SFX or Sonniss, each auditioned so nothing melodic or rhythmic slips in. Avoid kits that bundle music generation.

---

# Appendix A: Useful Bot 1.1.1 fact sheet (sourced)


Scope: main at 973a981 (shipped 2026-10-04). Repo: /Users/wasimjalali/Desktop/useful-bot. Prepared 2026-10-05, read only.
Paths are relative to the repo unless absolute. Status key: SHIPPED = in main at 973a981 and reachable in the macOS app UI (or the public site/repo for non-app claims). PLANNED = not built. PARTIAL = built with a stated limit. UNVERIFIED = no source I could find.

Live checks I ran today (unauthenticated GET only):
- github.com/wasimjalali/usefulbot is public, license agpl-3.0 per GitHub API, last push 2026-10-04T20:53:27Z.
- github.com/wasimjalali/useful-bot-releases latest release is v1.1.1, published 2026-10-04T20:52:30Z. Assets: Useful-Bot-macOS.dmg (138,400,529 bytes), Useful-Bot-macOS.zip (132,876,842), appcast.xml, install.sh.
- bot.usefulbuild.com answers HTTP 200 and has no `data-release="soon"` on `<html>`, so the live page shows the Download and install-command state, not "Coming soon" (CSS rule site/public/index.html:63-64).

---

## 1. Claims table

### A. Open source and distribution

| # | Claim | Status | Source |
|---|---|---|---|
| A1 | Open source under GNU AGPL-3.0 | SHIPPED | LICENSE:1-2 (GNU AFFERO GPL v3); README.md:8, 290-296 |
| A2 | A commercial license is sold separately for companies that want to build on it without AGPL terms (contact hello@usefulbuild.com). No price is published anywhere. | SHIPPED (price UNVERIFIED) | README.md:292-296; CONTRIBUTING.md:3-5; docs/plan/LAUNCH-PLAN.md:165-168 |
| A3 | Public source repo is github.com/wasimjalali/usefulbot, one snapshot commit per release, not this repo's history | SHIPPED | docs/distribution.md:124-137; docs/plan/LAUNCH-PLAN.md:170-173, 201-204; live GitHub API check above. Snapshot for 1.1.1 ("usefulbot #9") is only in memory notes: UNVERIFIED in repo docs, but the repo's pushed_at is 2026-10-04 20:53Z, 1 minute after the release |
| A4 | The private working repo is NOT the public one. The video must not show this repo, its history or the untracked screenshots in its root (real chats, owner email) | Constraint | docs/distribution.md:126-128; docs/plan/LAUNCH-PLAN.md:171-172 |
| A5 | macOS only. Needs macOS 14 or later | SHIPPED | macos/bundle/Info.plist:13 (`LSMinimumSystemVersion` 14.0); macos/Package.swift:6; README.md:38; docs/distribution.md "Limits" |
| A6 | Apple silicon only. Installer refuses Intel. No Intel, Windows, Linux, iOS or Android build | SHIPPED (limit) | scripts/install.sh:21 ("needs a Mac with Apple silicon (M1 or later)"); scripts/build-runtime.mjs:40 (`darwin-arm64` Node); docs/distribution.md "Limits" |
| A7 | Two ways to install: DMG download, or `curl -fsSL https://github.com/wasimjalali/useful-bot-releases/releases/latest/download/install.sh \| sh` | SHIPPED | README.md:44-49; site/public/index.html:295-299; live release assets above |
| A8 | The app is ad-hoc signed, NOT notarized, no Apple Developer ID. A browser-downloaded DMG needs a one-time System Settings > Privacy & Security > Open Anyway. The curl install carries no quarantine flag so it opens without that stop | SHIPPED (friction) | docs/distribution.md:3-5, 91-93, "DMG file itself is not signed or notarized" (~line 36); site/public/index.html (text "The DMG needs a one-time OK in System Settings > Privacy & Security > Open Anyway") |
| A9 | The DMG opens as a classic drag-to-Applications window; first launch from elsewhere offers "Move Useful Bot to Applications?" | SHIPPED | docs/distribution.md:20-30, 95-115; macos/Sources/UsefulBotApp/MoveToApplications.swift |
| A10 | Sparkle updates, checked automatically every 6 hours, each update verified against the app's EdDSA signing key | SHIPPED | macos/build-app.sh:209-214 (`SUScheduledCheckInterval` 21600, `SUEnableAutomaticChecks`); docs/distribution.md:1-5, "The signing key"; macos/Sources/UsefulBotApp/Updater.swift; privacy page "Updates" |
| A11 | Free to download and use. The repo states "Anyone may use, change and share it" and the public repo description says open source. No paywall, account or subscription for Useful Bot itself in the repo. You still pay your own model provider (and image/connector costs) | SHIPPED (no explicit "free" price statement on the site; inferred from AGPL + no pricing code) | README.md:292; agent/skills/about-useful-bot/SKILL.md:9 ("use, change and share it for free"); no billing code in repo (rg for stripe/paywall: none) |
| A12 | Version/build: 1.1.1, build 450 (build number = commit count), released 2026-10-04 from main 973a981 | SHIPPED | Product Log UB-003 history entry 2026-10-04T20:55; docs/distribution.md:"build number"; GitHub release v1.1.1 |

### B. Model agnostic (every route in shared/provider-catalog.ts)

All rows are in `PROVIDER_CATALOG` (shared/provider-catalog.ts:76-788). In the app they appear under Connect with groups "Subscription", "API", "Local" (macos/Sources/UsefulBotApp/ProvidersPaneView.swift:20, 167-197) and in first run (FirstRunView.swift:193-218, 720-723).

Subscription sign-in (device code or browser flow, no key):

| Route | Status | Source |
|---|---|---|
| ChatGPT (Plus/Pro) via Codex device-code sign-in; protocol OpenAI Responses | SHIPPED | provider-catalog.ts:83-129 (baseUrl chatgpt.com/backend-api/codex, hint "ChatGPT Plus or Pro through Codex sign in.") |
| GitHub Copilot via GitHub device-code sign-in | SHIPPED | provider-catalog.ts:154-196 |

Coding-plan keys (kindLabel "Subscription", but the user pastes a plan key; not an OAuth sign-in):

| Route | Source |
|---|---|
| OpenCode Go (plan key) | provider-catalog.ts:202-219 |
| GLM Coding Plan (Z.ai) | provider-catalog.ts:225-240 |
| Kimi Code | provider-catalog.ts:266-281 |
| Qwen Coding Plan (Alibaba ModelStudio) | provider-catalog.ts:304-322 |
| MiniMax Token Plan | provider-catalog.ts:347-362 |
| MiMo Token Plan (Xiaomi) | provider-catalog.ts:387-404 |
| Command Code (plan key; model ids and reasoning are marked UNVERIFIED in a code comment) | provider-catalog.ts:429-449 |

API key routes (kindLabel "API"):

| Route | Source |
|---|---|
| OpenAI API (also image models gpt-image-1, gpt-image-1-mini, dall-e-3) | provider-catalog.ts:129-147 |
| Z.ai API (images glm-image, cogview-4) | provider-catalog.ts:241-258 |
| Moonshot AI | provider-catalog.ts:282-298 |
| Qwen (DashScope) | provider-catalog.ts:323-341 |
| MiniMax | provider-catalog.ts:363-381 |
| Xiaomi MiMo | provider-catalog.ts:405-423 |
| Anthropic (Claude, via API key only; Anthropic Messages protocol) | provider-catalog.ts:450-477 |
| Google (Gemini API key from AI Studio, OpenAI-compatible endpoint) | provider-catalog.ts:477-499 |
| xAI Grok (images grok-imagine-image) | provider-catalog.ts:500-524 |
| DeepSeek | provider-catalog.ts:525-548 |
| OpenRouter (one key, many models, includes Claude; has image models) | provider-catalog.ts:549-583 |
| Vercel AI Gateway | provider-catalog.ts:584-608 |
| Cloudflare Workers AI (account id + token) | provider-catalog.ts:609-636 |
| OpenCode Zen | provider-catalog.ts:637-662 |
| Ollama Cloud (hosted, NOT local) | provider-catalog.ts:663-682 |

Local routes (kindLabel "Local"; user enters a server URL, no key):

| Route | Source |
|---|---|
| Ollama, default URL http://localhost:11434/v1 | provider-catalog.ts:683-703 |
| LM Studio, default URL http://localhost:1234/v1 | provider-catalog.ts:704-727 |
| Custom provider, any OpenAI-compatible server (name, URL, optional key). Shown as "Add custom provider" at the bottom of Connect | provider-catalog.ts:728-757; ProvidersPaneView.swift:~190-195, 212-235 |

Supporting model claims:

| Claim | Status | Source |
|---|---|---|
| Claude and Google SUBSCRIPTION sign-in is deliberately not offered (their terms forbid third-party use); both work with an API key | SHIPPED (limit) | README.md:93 |
| The site/README line "Models: ChatGPT, GitHub Copilot, Claude, Gemini, OpenRouter and more, or a local model" means Claude and Gemini via API key, not sign-in | Wording trap | README.md:39 vs provider-catalog.ts:450-499 |
| Local model: conversation stays on the Mac apart from web search, image generation, connected apps, `review` with a cloud reviewer, or a handoff to a bot on a cloud model | SHIPPED | agent/skills/about-useful-bot/SKILL.md:12 |
| Live model lists are fetched from each connected provider (and public details from models.dev) | SHIPPED | provider-catalog.ts `listsModels`; site privacy page "model provider you connect" |
| Local-model usage is reported (stream usage asked for LM Studio/Custom), so compaction and the Usage pane work. Evidence: 15 of 15 streamed requests reported usage with Qwen3-4B on llama.cpp (was 35 of 36 null) | SHIPPED (UB-012, 1.1.1) | evals/results/2026-10-04-ub012-local-usage.md ("Results"); router/src/upstreams/opencode.ts |
| Honest local-model quality note: an 8B local model at its real window was evaluated; read the write-up before claiming it is "good enough day to day" | Caution | evals/results/2026-10-03-ub009-local-8b.md |

### C. "Use what you already pay for, or bring your own key" (UI)

| Claim | Status | Source |
|---|---|---|
| First run, step 1 of 2 "Connect a provider": group "Sign in with a subscription" (featured ChatGPT, GitHub Copilot, OpenCode Go; "More subscriptions") then "Or use an API key" (featured Anthropic, OpenAI, OpenRouter; "More providers"). "Skip for now" until one is connected | SHIPPED | macos/Sources/UsefulBotApp/FirstRunView.swift:197-198, 713-732 (headings at 720-723) |
| Sign-in sheet: "Sign in to <provider>". Browser opens, user enters a code. Copy says "Useful Bot never sees your password" | SHIPPED | FirstRunView.swift:954-960 |
| API key sheet "Connect <provider>" with "API key" field; local needs only a server URL | SHIPPED | FirstRunView.swift:1144-1175; ProvidersPaneView.swift:561-660 (`showsKeyField` false for local) |
| Settings > Providers pane: Connect popover grouped Subscription / API / Local, connected rows with Disconnect, "Task models" (chat model and reviewer model with reasoning level) | SHIPPED | AppSettingsView.swift:6-40 (tabs General, Providers, Computer, Usage, Feedback, About); ProvidersPaneView.swift:20, 46, 147-163, 295, 321 |
| Pick the model per bot | SHIPPED (see D3) | shared/shell-store.ts:1277-1283 |

### D. A team of bots

| # | Claim | Status | Source |
|---|---|---|---|
| D1 | Each bot has its own name, job/instructions (field is `description`, "Instructions" in the UI, cap 8,000 chars), avatar, own chat, memory and routines | SHIPPED | shared/shell-store.ts:37 (`DESCRIPTION_MAX` 8000); macos/Sources/UsefulBotApp/SettingsPaneView.swift:5-9, 48, 320-330 (sections Profile, Instructions, Routines, Memory, notify row) |
| D2 | Memory: bots keep their own notes across chats. Tools `memory_upsert`, `memory_read`, `memory_search`, `memory_delete`. Each prompt loads the 6 newest notes in full (each body capped at 1,200 chars) and up to 50 more as titles (80 chars), whole block capped at 6,000 chars; older notes open with `memory_read`. Owner sees them under Memory in bot settings ("N notes"), refreshed every 4 s | SHIPPED | agent/tools/memory_upsert.ts, memory_read.ts, memory_search.ts, memory_delete.ts; shared/notes-block.ts:13-18; agent/instructions.md:50-52; MemorySectionView.swift:25-31, 56-61. Notes written after reading outside content are flagged and shown without body (notes-block.ts:36-45) |
| D3 | Per-bot model (UB-002): each bot keeps its own model/connection/effort; a pick on bot B does not move bot A; a running turn stays on the model it started with, the change applies next turn. Evidence: 7/7 calls of a turn stayed on GLM while chip moved to Kimi; overlapping bots ran DeepSeek and Kimi at once | SHIPPED (1.1.0) | shared/shell-store.ts:1253-1283 (`withBotSelection`); agent/agent.ts:157-165 (frozen selection); evals/results/2026-10-01-ub002-model-switching.md "Scenarios and results" rows 1, 3, 4, 6; Product Log UB-002 Shipped 1.1.0. Anthropic/OpenAI prompt caching is unit-tested only, not live (same file, "Not covered live") |
| D4 | The built-in Generalist is pinned at the top on first launch, named "Generalist", description is its starter instructions ("main assistant on this Mac ... also help them build a small team of bots") | SHIPPED (UB-010) | shared/shell-store.ts:234-239, 261-272, 296-310 (seed store, pinned true) |
| D5 | The Generalist (only the main bot) can PROPOSE new bots: `propose_bot` writes a profile card; the owner must confirm ("Add teammate" / "Not now"). It never creates a bot itself. Same for groups ("Create group"). Always a card, even in Full access | SHIPPED | agent/tools/propose_bot.ts:16-30; agent/tools/propose_group.ts:9-20; ProposalCardView.swift:51, 86; agent/instructions.md:40 |
| D6 | Bots hand work to each other: `send_to_bot` messages a teammate and waits (180 s default wait) for the reply; replies land in both transcripts | SHIPPED | agent/tools/send_to_bot.ts:11-17; agent/instructions.md:9 (peer rule) |
| D7 | Group chats: 2 to 6 bots per group; the main bot orchestrates untargeted group turns and is never a member; `post_to_group` fans one message out after owner confirmation. UI: "Create group chat" in the New Bot picker and a Members section in group settings (count n/6) | SHIPPED | shared/shell-store.ts:32 (`GROUP_MAX_MEMBERS` 6); propose_group.ts:11, 38 comments; post_to_group.ts:9-14; PickerViews.swift:93; RootView.swift:681-745; SettingsPaneView.swift:505-509, 568-575 |
| D8 | Many bots working at once: up to 10 model requests in flight app-wide, one per bot session at a time, so ten bots can each run a step simultaneously. When full the app says "Ten bots are already working. Try again in a moment." (router waits it out up to 60 s per attempt) | SHIPPED | shared/policy.ts:89 (`MAX_ACTIVE_UPSTREAM` 10); router/src/concurrency.ts:8-20; macos/Sources/UsefulBotCore/EveStream.swift:334; docs/audit/SCOREBOARD.md:593-621 (Round 5). I found no recorded benchmark of 10 bots at once beyond the Round 5 unit and live notes ("466 node tests, 254 Swift tests") |
| D9 | Sub-agents in parallel are ON in 1.1.1. eve's built-in `agent` and `task_cancel` tools are active (no disabling files in agent/tools/), the Generalist prompt tells bots to "Split sizeable, independent work into parallel `agent` runs", the app shows a collapsible sub-agent card per launching turn (live step, timer, report, failure with Retry). Re-enabled by PR #179 (98fb78a, ancestor of HEAD), shipped in 1.1.0. Older docs/notes saying "disabled on main until PR 2" are superseded | SHIPPED (UB-011) | agent/instructions.md:56-58; `ls agent/tools` has no agent.ts/task_cancel.ts; docs/plan/UB-009-AGENT-CONTEXT-PLAN.md:200 ("both tools are back on since 2026-10-03"); `git merge-base --is-ancestor 98fb78a HEAD` true; macos/Sources/UsefulBotApp/SubagentCard.swift; evals/results/2026-10-03-subagent-stall.md. Caveats: sub-agents inherit the bot's permission, cannot change notes/settings (SUB_AGENT_BLOCKED, agent/lib/permission.ts:120-140). Reports are batched by eve until siblings finish (subagent-stall.md "Live checks"). No explicit cap on how many sub-agents a bot may launch found: UNVERIFIED. A stall incident (5 critics, silent chat for 2 days) was found and fixed in 1.1.0 |
| D10 | Routines: a recurring instruction owned by one bot; schedules daily, weekly (chosen days) or one-shot; wall-clock time in an IANA zone; up to 50 routines per bot, up to 10 schedules each, last 20 runs kept; instruction up to 4,000 chars; runs enter the bot's own chat; "Test run" button (works even when paused); a missed window after sleep catches up with one run; a run is stopped after 1 hour, or 10 minutes silent; bots can create/update/delete routines via tools (creating or rescheduling asks first) | SHIPPED | README.md:105-124; shared/routines-store.ts:28-30, 32, 36-54 (schedule kinds); ChatDetailsPaneView.swift:149-156, 404; SettingsPaneView.swift:365-406; agent/tools/create_routine.ts, run_routine.ts, update_routine.ts, delete_routine.ts, list_routines.ts; agent/instructions.md:28. A scheduled run only works while the Mac is awake and the app services are running ("Sleeping the Mac is downtime", README.md:91) |
| D11 | Notifications: per-bot "Notify when <bot> finishes" toggle, off by default | SHIPPED | SettingsPaneView.swift:410-446; shared/shell-store.ts seed `notify: false`. Product Log notes this was "unverified" in an earlier memory note (ub009-bot-context-direction); treat the banner as owner-checked before filming |
| D12 | Rail: pin, hide, sections, unassigned; New Bot + search by the traffic lights | SHIPPED | RailView.swift:6, 40-45; shared/shell-store.ts (sections, pinned, hidden) |
| D13 | Bot character: circular white-head avatar with bright colour options; head floats and blinks while working; respects Reduce Motion. Face lives in avatar-face.svg | SHIPPED (PR2) | README.md:288; brand/README.md:93; macos/Sources/UsefulBotApp/BotFaceLayer.swift:143-253; docs/plan/PR2-BOT-CHARACTER.md; evals/results/2026-09-28-pr2-bot-face.md |

### E. Apps (connectors, MCP, OpenAPI, widgets)

| # | Claim | Status | Source |
|---|---|---|---|
| E1 | Composio catalogue connectors (Gmail, Calendar, Drive, Slack, Notion, GitHub, Linear and the rest). IMPORTANT: the user must bring their OWN Composio API key (paste once in Connectors; "Get a key at composio.dev"). There is no built-in Composio account. "Hundreds more" is Composio's catalogue size, which the repo caches but does not state as a number | SHIPPED (needs own Composio key) | README.md:185-212; RootView.swift:1163-1172 ("Composio API key", link to platform.composio.dev); agent/skills/connect-apps/SKILL.md "No Composio key"; site privacy page "with your own Composio key" |
| E2 | Connectors dialog from the "Connectors" pill at the foot of the rail: catalogue grid + one "Added" grid for apps AND MCP/OpenAPI servers, each with logo and real state; clicking opens an in-dialog detail page with its tools and Disconnect (servers also Refresh/Reconnect) | SHIPPED (UB-003, 1.1.1) | RailView.swift:327; RootView.swift:777 (`ConnectorDetailPage`), 1022-1128 (`ConnectorsDialog`, "Added"); ConnectorTile.swift:3; README.md:185-193 |
| E3 | Apps with no Composio app (TikTok, X, Spotify) show "Needs your own app" and a form for your own developer-app credentials | SHIPPED | RootView.swift:1562; README.md:195-204 |
| E4 | A bot can ask for an app it lacks: `connector_catalog` then `propose_connector` puts a "Connect app" card above the composer; once authorized the bot resumes | SHIPPED | agent/tools/connector_catalog.ts, propose_connector.ts; README.md:220-226 |
| E5 | Writes ask in Auto; destructive actions (delete, remove, archive, revoke) ALWAYS ask even in Full access; Read only refuses writes. Reads run in every mode | SHIPPED | README.md:213-219; agent/instructions.md:40; agent/skills/connect-apps/SKILL.md "What asks the owner". Note: instructions.md:40 says "Every MCP server or OpenAPI call asks in Auto and is refused in Read only" |
| E6 | Official MCP servers connect directly (outside Composio), OAuth 2.1 with discovery, dynamic client registration, PKCE and RFC 8707 resource indicator; a connection is "ready" only after MCP initialize and tools/list succeed; honest states: Needs sign-in, Sign-in expired, Can't reach server, Tools unreadable, Couldn't list tools. Bot finds tools with `find_tools` and they mount for its next step | SHIPPED (UB-003, 1.1.1) | README.md:231-274; shared/mcp-oauth.ts; shared/connections-store.ts; agent/tools/connection_tools.ts; Product Log UB-003 (Shipped 1.1.1) |
| E7 | Notion's official MCP server verified live on 2026-10-04: 44 tools, a search ran | UNVERIFIED in repo docs. Source is the owner-session memory note release-1-1-1.md and untracked screenshots ub003-11-notion-card.png, ub003-12-notion-call.png, ub003-18-notion-call.png in the repo root (these may show real data; check before filming) | /Users/wasimjalali/.claude/projects/-Users-wasimjalali-Desktop-useful-bot/memory/release-1-1-1.md |
| E8 | Tella (the original UB-003 trigger) does NOT work: Tella accepts tokens only from partner apps; its row stays at "Needs sign-in" | Do not show as working | README.md:252-254; memory release-1-1-1.md |
| E9 | OpenAPI connections: supported (eve mounts them; `connection_search`), owner-approved list in ~/.useful-bot/connections.json, secrets in Keychain | SHIPPED (backend + Connectors list). No consumer-friendly UI flow to add an arbitrary OpenAPI doc was checked; a bot proposes it via a card (`propose_connection`) | README.md:231-236, 256-258; agent/tools/propose_connection.ts; agent/skills/connect-apps/SKILL.md path 2 |
| E10 | Excalidraw is pre-connected (seeded by setup): ask a bot to draw, it appears as an interactive drawing in the chat; Edit opens it full screen, "Open in Excalidraw" exports to excalidraw.com; drawings saved as .excalidraw files in the Library | SHIPPED | scripts/setup-local.mjs:496-503; shared/connections-store.ts:54; README.md:236-243, 101-103; agent/instructions.md:54; macos/Sources/UsefulBotApp/WidgetWebView.swift:90, ExcalidrawPreview.swift. Excalidraw's server sees the drawing request (privacy page "Drawings and MCP servers") |

### F. What a bot can actually do (tools today)

Tool inventory = agent/tools/*.ts plus eve built-ins (`todo`, `ask_question`, `load_skill`, `agent`, `task_cancel` per scripts/tool-schema-size.mjs:37).

| # | Claim | Status | Source |
|---|---|---|---|
| F1 | Shell: `bash` runs in a macOS sandbox profile with the owner's PATH and home; default timeout 30 s, ceiling 30 min; credential paths (.git, .env, secrets, .ssh) refused in every mode | SHIPPED | agent/tools/bash.ts:100-200; README.md:126-183; agent/instructions.md:44-48 |
| F2 | Files: `read_file`, `list_dir`, `write_file` inside an attached folder (or under home when none). The owner attaches a folder from the composer "+" menu ("Photos and files", folder option) | SHIPPED | agent/tools/read_file.ts, list_dir.ts, write_file.ts; ComposerView.swift:705-710, 357 |
| F3 | Run command-line tools the owner has installed (codex, claude, gh, etc.) and install known CLIs via `install_cli` (registry: codex, claude, opencode, gemini, gh, wrangler, vercel); installs ask in Auto, run in Full access, refused in Read only | SHIPPED | agent/lib/cli-registry.ts:54-113; README.md:174-178 |
| F4 | Web search is built in, no key needed; backend is Firecrawl keyless search through the local router, up to 5 results per call; site says "free to use, with a daily allowance". The allowance number is UNVERIFIED | SHIPPED (allowance UNVERIFIED) | agent/tools/web_search.ts:9-22; router/src/search.ts:112 (`provider: "firecrawl-keyless"`); site/public/index.html:351; privacy page "Web search sends the search words to Firecrawl" |
| F5 | Web page fetch (`web_fetch`): https page as markdown/text/html, 5 MB cap, content treated as untrusted | SHIPPED | agent/tools/web_fetch.ts:10-24 |
| F6 | Image generation (`generate_image`): needs an image-capable provider key (OpenAI, Z.ai, xAI or OpenRouter have image model lists); without one the bot says so; costs real money at the provider; refused in Read only. Images saved to the Library | SHIPPED (needs key) | agent/tools/generate_image.ts:12-20; provider-catalog.ts:143, 255, 519, 571 |
| F7 | HTML pages: a bot that writes a .html file gets it listed in the Library as a "page", with a chat preview card and "Open in browser" | SHIPPED | agent/tools/write_file.ts:12, 59; macos/Sources/UsefulBotApp/PageRow.swift |
| F8 | Library (account menu under the owner's photo): every generated image and drawing as real files under ~/Documents/Useful Bot/<Bot>/<YYYY-MM>/; filter by kind and bot, search by prompt; Open, Show in Finder, Copy, Open chat, Move to Trash; Locate/Regenerate for missing files | SHIPPED | README.md:101-103; LibraryView.swift:39-81, 493; RailView.swift:348 |
| F9 | Attachments: up to 5 files per message, 1 MiB each, text up to 64 KiB; drag and drop or "Photos and files"; images need a model that can see | SHIPPED | shared/attachments.ts:1-3, 60; ComposerView.swift:332, 501-546, 710; agent/instructions.md:46 |
| F10 | `review`: asks a pinned reviewer model to find defects in supplied text (read-only). Reviewer alias; "reviewer credential" past notes said unprovisioned in some installs | SHIPPED (PARTIAL, depends on a configured reviewer model) | agent/tools/review.ts:15-25; ProvidersPaneView.swift:46 "Task models" |
| F11 | `todo` planning list, `ask_question`, `load_skill` (skills: about-useful-bot, connect-apps) | SHIPPED | agent/instructions.md:20, 22; agent/skills/ |
| F12 | Bot can manage the team: `list_bots`, `update_bot_profile`, `delete_bot`, `clear_history`, `rail_action`. delete_bot and clear_history ask in Auto | SHIPPED | agent/tools/; agent/instructions.md:38, 40; agent/lib/permission.ts:44-52 |
| F13 | **No browser control tool.** There is no Playwright/browser-automation tool. Web access is web_search + web_fetch only (read pages, no clicking). A bot can only drive a browser indirectly if the owner has a CLI installed and Full access | SHIPPED fact (absence) | `rg -i "playwright\|puppeteer\|browse" agent/tools agent/instructions.md agent/agent.ts agent/skills` found nothing |
| F14 | **No computer use / screen control.** Zero references to cua-driver, "computer use" or screen control in agent/, shared/, router/src, web/, macos/Sources, scripts/ or the site (`rg -i "cua\|computer.use"` over those paths: no hits). UB-006 "Capability-first computer use through CUA Driver" is status Captured (backlog only, "does not change current prompts or authorize installation"). The Settings > Computer tab is only a status pane ("This Mac", "Local execution: On, Writes and shell still need your approval"); it is not computer use | PLANNED only (UB-006) | /Users/wasimjalali/Desktop/Useful Bot Product Log.html JSON, UB-006; macos/Sources/UsefulBotApp/AppSettingsView.swift:309-342 |

### G. Control: Read only / Auto / Full access

Permission is set per bot in the composer's Permission menu (labels Read only, Auto, Full access; macos/Sources/UsefulBotApp/ComposerView.swift:910-917). The default shown is Auto (BackendModels.swift:36-41 default case).

| Level | What it allows | Source |
|---|---|---|
| Read only | Nothing changes. Reads and read-only shell lines run (sandbox refuses any write); every write, install, image, memory/rail/routine change, group post and handoff is refused (`workspace_read_only`); catalogue app writes and all MCP/OpenAPI calls refused | agent/instructions.md:36, 40; agent/tools/bash.ts:109-113; agent/lib/permission.ts:44-79 |
| Auto | Reads run anywhere. In an attached folder, everyday writes and commands run without a card; deletes, history rewrites, privilege escalation, inline code (`python -c`, `curl \| sh`) and anything outside the folder ask. No folder attached: only reads and new files skip the card, anything that changes a file asks. Catalogue writes ask; every MCP/OpenAPI call asks. `delete_bot` and `clear_history` ask | agent/instructions.md:37, 40; agent/tools/bash.ts:116-147; agent/lib/permission.ts:44-52 |
| Full access | No execution cards, EXCEPT the wipe card: a remover aimed at a disk, volume, home or top-level folder, or disk formatting. Credential stores stay refused in every mode. Still always cards: new bots, profile changes, groups, group posts, new connections, destructive connector actions | agent/instructions.md:38, 40; agent/tools/bash.ts:127-146 (`wipeRisk`); agent/lib/command-risk.ts:500-525; README.md:136-147 |

| Claim | Status | Source |
|---|---|---|
| Approval cards: one card approves exactly one action, bound by hash of the exact command/arguments; "approved" typed in chat is not permission; if permission or folder changes while a card is open, the approval is refused | SHIPPED | agent/instructions.md:42; agent/tools/bash.ts:114-122, 164-185; README.md:216-219 |
| Cards dock above the composer with options on the same block | SHIPPED | README.md:99 |
| UI wording trap: Settings > Computer says "Local execution: On / Writes and shell still need your approval", which is not true at Full access | Inaccuracy in the app | AppSettingsView.swift:327-338; contrast agent/instructions.md:38 |

### H. Native Mac app and local storage

| Claim | Status | Source |
|---|---|---|
| Native SwiftUI Mac app (not Electron/web). The browser UI was removed 2026-09-28; `web/` is only the local API | SHIPPED | CLAUDE.md "Surfaces and priority"; macos/Sources/ |
| Chats, bots, memory, instructions, routines, images sent and files the bots make are stored on the Mac, in ~/.useful-bot (shell, routines, providers, connectors, connections, media index), files in ~/Documents/Useful Bot/<Bot>/<YYYY-MM>/, release runtime in ~/Library/Application Support/Useful Bot/app; Unsent messages under Application Support | SHIPPED | site/public/privacy/index.html "What stays on your Mac"; shared/stack.ts:35-36, 100; docs/distribution.md:66-72; README.md:101-112 |
| Secrets: the app's local tokens and secrets for MCP/OpenAPI connections are in the macOS Keychain (`com.usefulbot.*`; connections as `com.usefulbot.connection.{id}`). Model provider keys/sign-ins and the Composio key are NOT in the Keychain: they sit in files only the user can read (`~/.useful-bot/providers.json`, `connectors.json`, mode 0600) | SHIPPED (nuance) | shared/stack.ts:35, shared/keychain.ts:41-46; shared/providers.ts:215, 434 (0o600); README.md:206-207, 235; privacy page "Model provider keys and sign-ins are stored on your Mac in files only your user account can read ... kept in the macOS Keychain" |
| Services run locally on loopback (127.0.0.1:4319-4321); no cloud service of ours; no account system | SHIPPED | README.md:60, 91; docs/distribution.md:68 ("Nothing leaves the Mac"); privacy page "We have no copy and no account system" |
| What leaves the Mac: (1) the conversation to the model provider you connect (incl. attachments, tool results), (2) catalogue apps via Composio, MCP/OpenAPI servers directly, (3) web search words to Firecrawl, (4) Excalidraw's server when drawing, widget code may load from esm.sh, (5) logos from Composio's logo server, (6) update checks to GitHub, (7) feedback you choose to send | SHIPPED | site/public/privacy/index.html "What leaves your Mac, and why"; agent/skills/about-useful-bot/SKILL.md:11 |
| Tracking: none. No analytics, telemetry or crash reporting | SHIPPED (owner policy statement, no code path found) | privacy page "What we don't do"; site/public/index.html "Tracking None"; I found no analytics SDK in macos/Package.resolved scope (not exhaustively audited: UNVERIFIED as an absolute) |
| Feedback is the only thing sent to Useful Build: Settings > Feedback posts to a Cloudflare Worker + D1 (feedback.usefulbuild.com/v1/feedback): message, type, optional reply email, random install ID, optional app/macOS/chip info; raw IP never stored (salted HMAC) | SHIPPED | macos/build-app.sh:220-222; services/feedback/README.md:1-30; docs/distribution.md "Feedback"; evals/results/2026-09-28-feedback-worker-e2e.md; AppSettingsView.swift:9 (Feedback tab) |
| Daily token/request budgets are user-configurable in Settings > Usage (UB-008) | SHIPPED (1.1.0) | AppSettingsView.swift:358-403; Product Log UB-008 |
| Usage pane shows requests/tokens by model (works for local models since 1.1.1) | SHIPPED | evals/results/2026-10-04-ub012-local-usage.md "Usage pane" |

### I. Other things a launch video can honestly show

| Item | Status | Source |
|---|---|---|
| Fast chat open. Recorded perf check on 8427895 (pre-release for 1.1.1, machine reported as "Apple M4"): cold launch median 993 ms (n=10, worst 1,170 ms); warm return to a chat median 230 ms (replies) / 182 ms (tool-heavy) (n=30); warm switch median 192 ms; cold first open of a chat median 244 ms. Result: PASS. Note the run header says "git 8427895 with uncommitted changes", and ran on the dev app | SHIPPED | evals/results/2026-10-04-perf-check-2232-8427895/README.md (table + "Result: PASS") |
| Perf work history: idle CPU 29% to 1%; opening a 3,504-event chat from over 4 min to 4 s (older audit, Sept 2026) | SHIPPED (historic, pre-1.0) | docs/audit/PERFORMANCE.md (table near line 480-495) |
| Inline thinking handled: models that emit `<think>` blocks have them folded out of the chat bubble into the working row (router split). Verified frame by frame, 0 of 2,962 OCR'd frames showed raw thinking | SHIPPED | evals/results/2026-09-25-inline-think.md "What changed" and "Runs" |
| Chat polish: each bot message is its own bubble; step row says what the bot is doing; centred Today/Yesterday dividers; plain URLs and bare domains are clickable (UB-005); a send refused before reaching the bot stays as "Not sent" with Retry/Edit/Dismiss (UB-013) | SHIPPED | README.md:97-99; ChatView.swift:650-656, 1233; Product Log UB-005, UB-013 |
| First-run flow: Welcome ("A team of AI helpers that works on your Mac. Your chats and keys are stored here.") then Connect a provider then pick a model (2 steps) | SHIPPED | FirstRunView.swift:478-482, 713-732, 1376 |
| Starter prompt chips in empty chat (example: "Rename my screenshots by date") | SHIPPED | ChatView.swift:2439-2440 |
| Local-only demo of a bot on LM Studio/Ollama | SHIPPED | provider-catalog.ts:683-727 |
| Site shots in the repo (safe, public assets): site/public/shots/chat.png, bots.png, models.png, connectors.png, routines.png | SHIPPED | README.md:10-32 |

### J. Planned / not available (do NOT show as available)

| Item | Status | Source |
|---|---|---|
| Computer use / controlling the Mac's screen (UB-006, CUA Driver) | PLANNED, Captured, no code | Product Log UB-006; zero code hits (see F14) |
| Dynamic provider subscription usage/limits indicator in the composer (UB-007) | PLANNED | Product Log UB-007 (Captured) |
| `read_file` returning SHA-256 for safe edits (UB-014) | PLANNED | Product Log UB-014 (Captured); agent/tools/read_file.ts unchanged |
| iPhone / mobile app | PLANNED (not shipped; ios/ project and specs exist, README "3 phone: deferred") | README.md:70; CLAUDE.md "Mobile app. Planned, not built yet"; docs/spec/IOS-APP-SPEC.md |
| Web UI / browser version | REMOVED 2026-09-28 | CLAUDE.md "No web UI" |
| Intel Macs, Windows, Linux | Not supported | scripts/install.sh:21 |
| Tella MCP | Does not work (vendor refuses self-registered clients) | README.md:252-254 |
| Claude or Google subscription sign-in | Not offered by design | README.md:93 |
| Notarized/Developer-ID signed app (no Gatekeeper prompt for DMG) | Not done | docs/distribution.md:3-5 |
| Cloud/virtual computer for bots | Deferred (Grok-Bot parity doc) | docs/plan/GROKBOT-AGENT-CAPABILITIES.md:3 |
| Browser automation tool | Does not exist | see F13 |
| Voice (Useful Voice) / Brain (Useful Brain) | Separate Useful Build products, NOT part of Useful Bot | site/public/index.html footer "Products" |

---

## 2. Product Log (UB-001 to UB-014) status

Source: /Users/wasimjalali/Desktop/Useful Bot Product Log.html, JSON script block, updatedAt 2026-10-04T20:55:00Z, nextId 15.

Shipped in 1.1.1 (build 450): UB-003 (official MCP connections, Connectors grid and detail page), UB-012 (local models report token usage), UB-013 (refused send stays as Not sent bubble).

Shipped earlier in 1.1.0 (build 413, so also in 1.1.1): UB-002 (per-bot models, frozen turns, cache), UB-004 (dev app isolated from daily app; internal), UB-005 (clickable URLs), UB-008 (user-set daily token/request budgets), UB-009 (concise Generalist prompt and bot context), UB-010 (Generalist pinned at top on first launch), UB-011 (sub-agents: visible progress, reliable hand-back).

Not shipped (Captured): UB-001 (this launch video; target "Launch week, recorded on 1.1.1"), UB-006 (computer use via CUA Driver), UB-007 (usage/limits indicator in composer), UB-014 (read_file SHA-256).

UB-001 guardrail text (owner): "show credible current capabilities, not unshipped backlog features as available" and "avoid promising that all subscriptions or all regions are supported."

---

## 3. Notes and caveats for the video

1. Website state: live page is in release state (download button, install command). The README/site line "Download for Mac" points to the DMG, which needs the one-time Open Anyway click. Showing the curl install avoids that screen.
2. "Connect Gmail, Calendar, Drive and hundreds more" requires the viewer to create a Composio account and paste an API key first. Do not imply one-click Gmail without that step. MCP servers (Excalidraw built in, Notion verified in owner session) do not need the Composio key.
3. "Use the model you already pay for" is strictly true for: ChatGPT Plus/Pro (via Codex sign-in), GitHub Copilot, and coding-plan keys (OpenCode Go, GLM, Kimi Code, Qwen, MiniMax, MiMo, Command Code). It is NOT true for Claude.ai or Google AI subscriptions (API key only). Another agent is checking vendor terms for the ChatGPT/Copilot sign-in routes; I only list routes.
4. "Sub-agents" are real and visible (card with live steps) but are model-driven: the bot decides to launch them. Reports arrive batched. A models-only demo with a weak model may not delegate unless asked; the dev notes say GLM 5.3 Flash needed "Call the tool named agent three times".
5. "Ten bots at once": the system supports 10 concurrent model requests, one per bot. There is no recorded 10-bot benchmark or video-ready measurement; the only evidence is the Round 5 audit and unit tests (docs/audit/SCOREBOARD.md:593-621). Say "several bots working at once", or film it live, rather than quoting a number you cannot source.
6. Speed numbers that ARE recorded: evals/results/2026-10-04-perf-check-2232-8427895/README.md (table above). These are UI landing times in milliseconds, not model speed. Quote them as chat-open and launch times only.
7. Untracked screenshots in the repo root (pr*.png, ub*.png, subagent-*.png and others) are working captures of the owner's Test Bot and may contain real data. The public-repo snapshot script excludes eval images for that reason (docs/distribution.md:137-139). Re-record footage in a clean profile rather than reusing them.
8. Dev vs daily app: all live recording must be in Useful Bot Dev (`~/Applications/Useful Bot Dev.app`, CLAUDE.md "Verification"). Never the daily app.
9. Open items at release time that affect what you can honestly show: Codex review credits exhausted (process only), Sparkle offers 1.1.1 to the daily app on its next check, Test Bot (dev) still carries a PINEAPPLE line in its instructions from UB-009 evals (memory note release-1-1-1.md), so reset it before filming.
10. Privacy line "We never see your chats" is accurate for Useful Build; the model provider, Composio, Firecrawl and Excalidraw do see what a request sends them (privacy page). Do not say "nothing leaves your Mac" unqualified, and do not say "no data leaves" while a cloud model is connected.
11. Settings > Computer tab text claims shell and writes always need approval, which is wrong at Full access. Avoid filming that tab, or pair it with an accurate caption.

