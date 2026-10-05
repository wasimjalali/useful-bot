# Adversarial review: UB-001 final plan (launch video)

You are the adversarial reviewer for the final plan of the Useful Bot launch video. Claude Opus 5.5 drafted it from a 12-model council. The owner will approve or reject it; your job is to find what's wrong before he sees it. Be specific and blunt. Don't rewrite the plan.

Files (absolute paths):
- The plan: /private/tmp/claude-501/-Users-wasimjalali-Desktop-useful-bot/7b705cac-19c3-4027-b784-69770f8a6fe7/scratchpad/staging/docs/plan/UB-001-FINAL-PLAN.md
- The council synthesis: /private/tmp/claude-501/-Users-wasimjalali-Desktop-useful-bot/7b705cac-19c3-4027-b784-69770f8a6fe7/scratchpad/staging/council/SYNTHESIS.md
- The research (fact sheet, competitors, what may and may not be claimed): /private/tmp/claude-501/-Users-wasimjalali-Desktop-useful-bot/7b705cac-19c3-4027-b784-69770f8a6fe7/scratchpad/staging/docs/plan/UB-001-research.md
- The product repo is your working directory. The checkout may be on a feature branch; read the shipped code with `git show main:<path>` (for example `git show main:agent/instructions.md`). PR #187 (official ChatGPT sign-in, not merged yet) is the branch `feat/chatgpt-official-signin`.

Owner rules that bind the plan: honesty (only claims the research allows; nothing unshipped shown as available), no music at all, real UI only (recreated UI must use real tokens), demo data only, no em dashes in copy, no competitor names, voice is Deepgram Flux Wade at expressivity 0, "Free and open source" approved, 16:9 about 86 s plus 9:16 about 45 s, the voice-over says "your computer" (not "your Mac") because Windows is planned, with Mac stated only on the end card.

Check at least:
1. Every on-screen and spoken claim against the code and research. Verify the S09 approval mechanics (Auto, no folder attached, editing an existing file under ~/Documents asks) and that `write_file` or the tool the Writer would use really edits an existing file that way. Verify bots can hand work to each other the way S08 shows, and that the Generalist's proposal flow creates two bots as S05 and S06 show.
2. Whether the demo can actually be filmed as written in 1.1.2 (UI states, labels, timing, model behaviour), and what will break on the day.
3. Timing math: do the voice lines fit their scenes at about 145 words per minute with the holds described? Does the 9:16 cut fit 45 s?
4. Anything misleading by implication (speed, autonomy, privacy, platform), and whether "your computer" plus a Mac-only end card is honest today.
5. Craft: will this make the target viewer install? What's the weakest scene, and what would you cut or change?
6. Missing pieces in the build plan, asset list or licences.

Output: findings as a list, each `{ finding, severity: "critical" | "high" | "medium" | "low", where: "section or scene", fix }`, most severe first. Then a DISMISSED list: everything you checked that is fine, and why. A bare "no issues" is not accepted. Plain markdown, no em dashes.
