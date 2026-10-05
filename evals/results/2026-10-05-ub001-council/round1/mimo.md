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