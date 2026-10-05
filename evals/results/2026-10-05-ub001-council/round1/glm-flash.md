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