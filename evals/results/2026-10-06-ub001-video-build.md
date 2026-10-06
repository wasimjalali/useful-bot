# UB-001 launch video build (2026-10-06)

## Question

Can the launch film in `docs/plan/UB-001-FINAL-PLAN.md` be built entirely from real footage of the shipping app (no mock UI, no sped-up waits), with a synthetic voice and no music, in two formats: 16:9 at 86 s and 9:16 at about 45 s?

## What ran

- **App:** Useful Bot Dev built from `main` at 03e91ce (the 1.1.3 code, PR #195). It ran on a clean demo profile, with the dev state moved aside and restored afterwards from a new dated backup. `~/UB001-dev-backup` was left untouched. Model: ChatGPT plan via official Sign in with ChatGPT.
- **Demo data:** "Cedar Studio" at `/Users/Shared/Cedar Studio`. It has 12 dated notes (28 September to 2 October), last week's `weekly-update.html` and a draft to delete. The pristine copy is in `video/demo-data-cedar-studio/`.
- **Script:** M1 to M3 were sent by `video/scripts/rehearse.py` through cua-driver in the background. It never moves the real pointer.
  - M1: "Build me a small team for Cedar Studio's weekly client update: an Analyst for the notes and a Writer for the update."
  - M2: "Read the week's notes. List what's confirmed and what's open, then send it to the Writer."
  - M3: "Update weekly-update.html from the Analyst's notes, then delete last week's draft."
- **Recording:**
  - `video/scripts/winrec2x.swift` is a ScreenCaptureKit window recorder at 2x, 60 fps. The window was 1600x1000 pt.
  - Raw footage is in `~/UB001-footage` (32 GB, out of git). Hashes are in `video/FOOTAGE.sha256`.
- **Voice:**
  - Deepgram Flux TTS, voice Cliff, expressivity 0, speed 0.85 (`video/scripts/voice.py`).
  - The key was read from Keychain at runtime only.
  - Every take was checked with Deepgram STT. 13 of 13 lines matched (`video/public/voice/voice-report.json`).
- **Sound:** four CC0 Freesound effects plus one synthesized thud. Each was checked on a spectrogram for anything tonal (`video/LICENSES.md`). No music.
- **Edit:**
  - Remotion 4.0.533, one module per scene under `video/src/scenes/v1.1.3/`.
  - Shot choices are in `video/src/cuts.json` and scene timing in `video/src/timeline.json`.
  - Captions are Inter Semibold, burned in below the window. SRTs come from `video/scripts/captions.py`.
- **Commands:**
  - `cd video && python3 scripts/captions.py`
  - `npx remotion render Launch16x9 out/useful-bot-launch-16x9.mp4`
  - `npx remotion render Launch9x16 out/useful-bot-launch-9x16.mp4`

## Cost

- **Deepgram:** 853 characters of TTS in the final takes, plus a few regenerations and the STT checks. All of it is on the existing Deepgram account and well under a dollar. It isn't itemised.
- **Sound:** Freesound CC0 effects, free.
- **Model turns in the app:** on the owner's ChatGPT plan. No API spend.
- **Compute:** no paid compute.

## Rehearsals and takes

| Run | Result | Cause |
|---|---|---|
| Rehearsal 1, 2 | Handoff failed | The Responses API defaults tools to strict mode when `strict` is omitted, forcing optional args. Fixed in PR #195 (`strict: false`) and verified live. |
| Rehearsal 3 | Pass | |
| Rehearsal 4 | Stopped | The Generalist asked an open question instead of proposing. |
| Rehearsal 5 | Stopped | Runner name mismatch (bots named "Cedar Analyst"). The runner now accepts both names. |
| Rehearsal 6 | Pass | |
| Rehearsal 7 | Stopped | Crosstalk while the first briefs were being written. The runner now waits for them before M2. |
| Take 1, 2 | Cold-start sign-in | Take 2 is used for S02. |
| Take 3 | Partial | Aborted at the first briefs. |
| Take 4, 5 | Unusable | A fully covered window stops redrawing. The owner approved bringing Useful Bot Dev to the front for takes. |
| Take 6 | Complete | 910 s, used for S04, S05, S07 and S08. |
| Take 7 | Aborted at M1 | |
| Take 8 | Aborted at M2 | Analyst row not found. |
| Short takes | Single-screen inserts | S03 local rows, S06 pane, S08 menu, S09 Finder. |

The runner aborts on the first missing element or failed wait. It used to keep going, and once sent M3 to the Generalist.

## Deviations from the plan

- Scene modules are tagged `v1.1.3` because the app was filmed on the 1.1.3 code.
- M1 names the two roles. Without them, the Generalist always asks one confirming question first, which is product behaviour.
- S01 shows the real `weekly-update.html` that take 6 wrote, rendered in the film's own browser frame. The app opens pages in the default browser, which isn't in the window capture.
  - A later reset overwrote that file. It was recovered byte for byte from the eve trace of the write (sha256 4db61de4...).
- In take 6, the delete approval came before the page card. The ending of S08 uses a short insert for the permission menu.
- S06's Memory section isn't on screen: the pane's list loads lazily and the take never scrolled it into view. The voice line still says "memory". S06 opens wide on the chat and pushes into the bot's inspector as it opens (a fixed tight crop cut the chat text mid-word).
- **S02 labels:** "Sign-in shortened" and "Not affiliated with OpenAI". The second follows OpenAI's brand and Sign in with ChatGPT terms, read on 2026-10-06. No OpenAI logo is added by the edit.
- **Window covers:** the capture indicator over the traffic lights, " Dev" after the rail title, and the owner's initials badge.
- The owner's first name appears in bot replies in S06, S07 and S08 (taken from the Mac account name). It's flagged for sign-off and not covered.
- "Waiting time shortened" labels mark every cut that skips model time. Footage always plays at 1x.

## Verification

- **Transitions:** every cut was reviewed frame by frame on PNG sequences around each cut time (25 in 16:9, 14 in 9:16). The fixes were the S02 shot boundary, the S06 crop, and the S08 retime with clicks moved onto their on-screen actions.
- **Fidelity:** 13 rendered frames were set side by side with the source footage frame they came from (9 in 16:9, 4 in 9:16). Every one matches. The only additions are the covers, labels, captions and the local-model chip.
- **STT:** all 13 voice lines matched the script.
- **Spectrograms:** all effects are non-tonal. The ear check is with the owner at sign-off.

## Bugs found in the product

1. Tool calls failed when optional args were omitted (strict mode default). Fixed in PR #195.
2. The `clear_history` tool fails with "couldn't resolve my chat ID". Not fixed; reported to the owner.
3. The folder picker (NSOpenPanel) can't be driven in the background. This is a recording-only limit: the owner picked the folder once.

## Conclusion

Both formats were built from real footage and a synthetic voice, with no music. The script needed one product fix (strict tools) to run reliably. One complete take out of eight was enough. The fail-fast runner and bringing the window to the front were what made takes repeatable.

## What changed because of it

- PR #195 shipped `strict: false` for Responses tools.
- `scripts/publish-source.mjs` keeps `video/` and this write-up out of the public source until the film ships.
