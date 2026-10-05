# Round 1: Claude Opus 5.5 (chair), written before reading any other answer

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
