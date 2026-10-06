# UB-001 final plan: adversarial review

Checked against `main` (shipped code) and the PR #187 branch. I could not check OpenAI's Sign in with ChatGPT docs or brand terms, so the S03 wording is verified against the repo only.

## Findings

1. **{ severity: high, where: S09 voice line and claims table }**
   - Finding: "Before it changes a file you already have, it asks" is false as a general statement. `autoApproved` (`agent/lib/workspace.ts:87-91`) approves silently for any write inside an attached folder in Auto, and for everything in Full access. The card fires only in Auto with no folder. This is the same defect the council banned in row 3 ("before anything"). The on-screen Access chip is not a qualifier a viewer will parse.
   - Fix: scope the line, for example "Here, before it changes a file you already have, it asks." Or let S10's "You choose how much each bot may do" come first and say "On Auto, it asks before...".

2. **{ severity: high, where: section 9 demo data, S05, S11 }**
   - Finding: there is no "demo home". The profile swap only moves app state. With no folder attached the bot's root is the real home (`workspace.ts:20-23`), so Cedar Studio sits in the owner's real `~/Documents`. A `list_dir` of Documents can put real folder names into step rows and replies, and sends them to OpenAI. The Finder shot shows the real sidebar. This breaks the demo-data-only rule.
   - Also: the dev app's services reading `~/Documents` can raise the macOS Documents privacy prompt mid-take. CLAUDE.md records the same trap for Desktop on every ad hoc rebuild.
   - Fix: film in a separate clean macOS user account, or pin `UB_WORKSPACE_ROOT` to a demo home. Give the Generalist the full path in the prompt. Grant Documents access before take 1.

3. **{ severity: high, where: S06 to S09, build step 3 }**
   - Finding: the flow between "Add teammate" and the approval card is not scripted, and the code does not behave as the storyboard implies.
     - Confirming a proposal that carries a brief starts the new bot at once (`web/app/api/shell/route.ts:491-505`, `deliverFirstBrief`). Two clicks start the Analyst and the Writer in parallel, so the Writer can draft before the Analyst's facts exist.
     - "The handoff" only happens if a model chooses to call `send_to_bot`. No owner message in the plan asks for it.
     - The card is raised in the Writer's session while the Analyst's `send_to_bot` waits 180 s. The plan doesn't say which chat is open.
     - S07 films the Writer's settings while both bots are already running.
   - Fix: write the exact owner messages, which chat is open per shot, and whether briefs are used. Simplest: no brief on the cards, then one owner message to the Analyst ending "then hand your findings to the Writer".

4. **{ severity: high, where: S09 storyboard }**
   - Finding: the card will not look as described. It shows "Needs approval", the tool name `write_file`, and the preview `write <path as the model typed it>: <first 500 characters of the content, flattened>`, up to 6 lines (`agent/lib/write.ts:96`, `ChatView.swift:277-312`). So the frame is a relative path followed by raw HTML markup, not a clean `~/Documents/Cedar Studio/weekly-update.html`.
   - Also: the card may not fire at all. A new filename skips the card in Auto, and a `bash` edit raises a different card. Two rehearsals won't prove a model-dependent path.
   - Fix: tell the Writer in its instructions to update `weekly-update.html` in place with `write_file`. Rehearse 5 or more times. Decide now whether the markup-heavy card is acceptable on camera. If not, that is a product change, not a post fix.

5. **{ severity: high, where: S08 voice line, S05 prompt, claims table }**
   - Finding: "sorts facts from open questions" and "without inventing a deadline" are not in the claims table, which says anything absent is not said. Worse, the S05 prompt orders "Keep the delivery date unconfirmed", so the film presents instruction-following as an honesty property. Model accuracy is not a claim the research supports.
   - Fix: describe what is on screen, for example "The Writer drafts the update and leaves the date open, as asked." Add the row to the table, sourced to the filmed take.

6. **{ severity: medium, where: S04, asset list }**
   - Finding: the recreated LM Studio row is composited into a real menu, so it shows a connected local model that isn't there. It is "labelled" only in the asset list, not on screen. "Qwen3.8-27B" and the real row format are unverified. The research only records Qwen3-4B and an 8B.
   - Fix: connect LM Studio for real with a model that exists and film the real menu. No reply is needed.

7. **{ severity: medium, where: sections 3 to 5, timing }**
   - Finding: the script is 134 words, about 55 s of speech in 86 s, so the total fits. Several scenes don't:
     - S03: 14 words, about 6 to 6.5 s, over five UI states plus a match cut and a push-in, in 8 s.
     - S08: 16 words, 6.6 s, over three text-dense states in 9 s. Nobody reads any of them.
     - S12: 14 words with two full stops, 5.8 s plus pauses, in a 6 s window once the 2 s silence is taken out. It overruns.
     - S04 (5.4 s in 6 s) and S11 (7.0 s in 8 s) have under a second of slack.
     - 9:16: 71 words, 29 s. The S12 slot is 7 s for 5.8 s of speech plus 2 s of silence. The S08 slot is 8 s with no voice line at all.
     - The 145 words per minute figure for Wade is assumed, not measured.
   - Fix: time the existing Wade samples. Cut S12 to "Useful Bot. Free and open source. Download it for Mac." Give S08 one reply per shot or more seconds. Give the 9:16 S08 a line or cut it to 4 s.

8. **{ severity: medium, where: S05 }**
   - Finding: the typed request is 29 words, about 170 characters. At real typing speed that is 20 s or more, and it can't be read in 8 s under a voice line. The voice says "build a small team" while the text names both bots, so "It proposes an Analyst and a Writer" overstates the Generalist's initiative.
   - Fix: shorten the prompt to about 12 words and let the Generalist choose the roles, or change the voice line to "Ask for an Analyst and a Writer."

9. **{ severity: medium, where: section 7 captions }**
   - Finding: lower-area caption pills sit on the composer, the typed request and the docked approval card, the three places the action happens.
   - Fix: define a caption band on the stage below the window, and check it in the 9:16 crops.

10. **{ severity: medium, where: S07 }**
    - Finding: nothing on camera creates the note "Keep client updates under 200 words", and the Writer was created 8 s earlier in film time. It reads as if bots arrive with notes. If the note is saved after the Writer read files or a handoff, the pane shows an "After outside content" tag (`MemorySectionView.swift:186`).
    - Fix: show the owner telling the Writer the preference in a clean first turn, or drop the note and show only the instructions.

11. **{ severity: medium, where: S03, S05 to S06, S09 honesty labels }**
    - Finding: "Waiting time shortened" appears only in S08. The S05 to S06 cut hides the longest wait (reading 12 notes, then two proposals), and S09 hides the write. The council's "caption filmed replies as ChatGPT's" was dropped. "The plan you already pay for" is true for Plus or Pro only (catalog hint), and the risk table admits org workspaces are blocked.
    - Fix: label every cut wait, add a small "Replies: ChatGPT" label, and show "ChatGPT Plus or Pro" on screen in S03.

12. **{ severity: medium, where: section 6 sources, asset list, licences }**
    - Finding: three licence gaps.
      - Apple licenses SF Pro for mock-ups of Apple-platform UI. Burned-in marketing captions are outside that.
      - Pixabay and Sonniss files are not CC0, and both forbid redistributing raw files. Committing them puts them in the public `usefulbot` snapshot.
      - Nobody has checked OpenAI's rules on using the ChatGPT name and "official" in an advert.
    - Fix: use Inter (OFL, already in the repo) for captions. Use CC0 sounds only, or keep raw audio out of the public snapshot. Read OpenAI's brand terms before S03 is locked.

13. **{ severity: medium, where: craft, S02, S08, S10 }**
    - Finding: S08 is the weakest scene. It carries the whole "they did real work" promise in 9 unreadable seconds. S02 spends 3 s on a logo at 0:05, just when the viewer asked "how?". S10 is 6 s of a static menu. The opening shot is a small preview card, which doesn't yet read as a result.
    - Fix: cut S02 to about 1 s or keep the logo for the end only. Fold S10 into the tail of S09. Give the saved seconds to S08. Open on the rendered update page large, not its card.

14. **{ severity: low, where: S06 }**
    - Finding: `propose_bot` tells the model to "Confirm once with the owner before proposing several", so the Generalist may ask a question instead of posting two cards. Proposals also get a generated petname (`propose_bot.ts:44`), so the rail label and the avatar colours need checking.
    - Fix: rehearse it, and check the rail in the dev app first.

15. **{ severity: low, where: build plan steps 4, 7, 9 }**
    - Finding: several gaps.
      - No recording resolution or window size is set. The 9:16 crops need 2x capture.
      - Finder is a separate window for `winrec`.
      - `framesheet` tiles at most 24 changed frames and skips fades, so it can't be "every frame".
      - Raw 60 fps footage has no storage plan (the repo rule is gzip over 5 MB).
      - Covering "Useful Bot Dev" in post is doctored UI.
    - Fix: specify each. Prefer a build-time name over a post overlay.

16. **{ severity: low, where: S12, risks }**
    - Finding: three small ones.
      - The voice says "Mac", so S12 audio must be regenerated when Windows ships. The owner rule reads as Mac on the card only.
      - "Download it for Mac" lands on an un-notarized DMG with a one-time Open Anyway, in a film about ease.
      - The S09 fallback (delete in an attached folder) no longer matches the voice line or the "no folder" shot.
    - Fix: keep "Mac" to the card text. Make sure the site states the Open Anyway step. Write a fallback voice line.

## DISMISSED

- **S09 mechanics.** Auto, no folder, existing file under home asks: `write.ts:100-103`, `workspace.ts:87-91`. `write_file` overwrites in place.
- **New bots default to Auto.** `shared/shell-store.ts:863, 901`. No permission change is needed on camera.
- **"One card, one action".** The approval is bound to a hash of path, content and root, and refused if the folder or permission changes (`write.ts:76-118`).
- **Proposal flow.** `propose_bot` is orchestrator only, always a card, and never creates the bot itself. One call per bot, so two cards is right. The "Add teammate" label is real (`ProposalCardView.swift:51`).
- **Handoff capability.** A plain bot can message any teammate with `send_to_bot`. The reply lands in both transcripts. It is refused only in Read only.
- **Labels.** "Read only", "Auto", "Full access" (`ComposerView.swift:915-917`). "Approve" and "Deny" (`ChatView.swift:314-318`). "Get started", "Connect a provider" and "Continue with ChatGPT" on the PR branch (`FirstRunView.swift:504, 716, 974`).
- **Copilot crop.** Copilot is the row right after ChatGPT (`FirstRunView.swift:197`). The crop is feasible if the push-in stays tight.
- **HTML preview card.** A `.html` write posts a page card once per chat and files it in the Library (`write_file.ts:34-59`). S01 and S11 are filmable.
- **S11 line.** Matches fact sheet H, and the provider caveat is in the same breath.
- **"Your computer" plus Mac end card.** Honest today. Every frame shows macOS chrome, the end card states the platform, and nothing promises Windows.
- **S12 facts.** "Free and open source", AGPL-3.0, Apple silicon and macOS 14 are owner-approved or sourced.
- **Owner rules.** No em dashes in the script, no competitor names, no music, Wade at expressivity 0, and no banned phrases from section 8.
- **Brand assets.** `brand/motion/useful-bot-animated.svg`, `brand/svg/useful-bot-logo.svg` and Inter SemiBold with its licence all exist.
- **Overall length.** The 16:9 scene times sum to 86 s and the 9:16 to 45 s.