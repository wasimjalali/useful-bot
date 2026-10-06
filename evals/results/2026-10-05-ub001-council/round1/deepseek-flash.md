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