# UB-001 council synthesis (chair: Claude Opus 5.5)

2026-10-05. Twelve members answered round 1; eleven critiqued in round 2 (GLM 5.3 Flash spent its whole reasoning budget and returned nothing, and its retry hung). Round 2 was anonymised; the letter map is in `round2/letter-map.json`:

| Letter | Member | Letter | Member |
|---|---|---|---|
| A | Claude Sonnet 5.5 (high) | G | Claude Opus 5.5 (chair) |
| B | Qwen3.8 Max | H | GPT-6.1-Sol (high) |
| C | GPT-6-Astra (high) | I | Kimi K3 |
| D | GLM 5.3 Flash | J | Muse Spark 1.3 (free, max) |
| E | MiMo v2.6 Pro | K | DeepSeek V4 Pro |
| F | DeepSeek V4.1 Flash | L | Grok 4.7 (xhigh) |

## What the council agrees on

1. **Audience:** Apple silicon Mac owners who already pay for an AI plan (ChatGPT first) and want helpers without a vendor's cloud computer or a technical setup. All twelve.
2. **The feeling:** "This is mine, and it's easy." Calm ownership, not hype. All twelve.
3. **The three differences:** (a) the model you already pay for, or any model, including local; (b) it runs on your Mac and stores your work there, with no account of ours, open source; (c) you set what each bot may do (Read only, Auto, Full access) and approve with a card. Ease is shown, never claimed against anyone.
4. **Name no competitor** on screen or in the voice-over. All twelve.
5. **Open on a finished result, then show how it was made.** Ten of eleven round 2 picks moved to this after reading C and H (only Muse Spark kept a setup-first open).
6. **Show the 1.1.2 Sign in with ChatGPT** as the ease beat, cropped so GitHub Copilot is never in frame, and caption filmed replies as ChatGPT's.
7. **One real approval card, on an action the policy really cards.** Round 2 found that five round-1 scripts (D, E, F, G, I) staged cards that Auto would never raise. Verified in code: in Auto, writes inside an attached folder run without a card; deletes, writes outside the folder, edits to existing files with no folder attached, and every MCP call ask (agent/instructions.md:37-39).
8. **Recreate one LM Studio row** (Qwen3.8-27B) in real tokens, label it, never film a local reply.
9. **Light theme for the app footage, black only behind the logo,** real avatars carry the colour, the mascot only at the bookends.
10. **Sound:** room tone, real UI clicks, soft non-tonal whooshes, silence on the approval beat and the last line. No music. All twelve.
11. **Honesty labels:** "Waiting time shortened" on model waits, the provider caveat spoken in the same sentence as "stored on your Mac".
12. **Voice: Wade at expressivity 0.** Ten of eleven round 2 picks (Muse Spark chose Maeve at -1).

## Every point of disagreement, with the chair's recommendation

| # | Question | Positions (letters) | Chair recommends |
|---|---|---|---|
| 1 | The demo | Two-bot client update from scattered notes, existing file edited with no folder attached (H; picked by A, C, E, F, L, B as hybrid). Sales report to a demo Notion workspace (C; picked by H). Disk-space scan then delete (K; picked by I). One-folder copywriter, no card (L; picked by J). Downloads tidy with a delete card (A, G; body of K's pick) | **The two-bot client update (H).** Its card is guaranteed by policy, it shows a team doing one deliverable, and it needs no connector. The Notion variant depends on a live MCP setup that isn't recorded in repo docs (fact E7). |
| 2 | What raises the card | Edit an existing file with no folder attached (H). Delete an old draft in the attached folder (A, I, E, K). An MCP write (C) | **Edit an existing file with no folder attached,** rehearsed before filming. Fallback: delete an old draft in an attached folder. Both are carded in Auto. |
| 3 | Approval wording | "One card, one action" (many). "It asks before it changes anything" (G round 1, K) | **"It asks before changing a file you already have."** "Before anything" is false in Auto and Full access. |
| 4 | Expressivity | 0 for everything (H, C, F, G round 2). 0 with +1 auditioned on the first and last lines (A, I, K, E, L). -1 (J, I round 1) | **0 for the master.** Audition +1 on the first and last lines only; keep it only if a blind listen prefers it. |
| 5 | "Free" on the end card | Supported by fact A11 (H, C). Wait for the owner (A, E, G) | **Owner decides.** A11 infers "free" from AGPL and the absence of billing code. |
| 6 | 3D | None (most). One 3D moment: rail fan (G round 1), provider stack (F), card lift (K), 2.5D layer pull (I) | **No 3D.** Real UI is the brand; depth comes from the app's own shadows and slow push-ins. |
| 7 | Extra features (routines, memory, connectors, Excalidraw, groups) | One job only (L, D, H, C). Add a routine (A, D), memory note (D, H), Read only refusal (B, E), Notion and Excalidraw (J) | **One job, plus three short proof beats:** the access menu, the model menu with the local row, and the Writer's saved preference note (H). No routines, connectors or groups in this cut. |
| 8 | 9:16 cut | Re-crop recorded regions in sequence (H, C, L). Restack rail and panes into a new portrait layout (B, F) | **Re-crop only.** Restacking invents a layout and breaks the real-UI rule. |
| 9 | Caption font | SF Pro (G, H, I, L, D). Inter (A, E, J, K) | **SF Pro** for captions, Inter only for the wordmark and title cards. |
| 10 | Opening line | "A client update, built from the week's notes." (H, L). "You already pay for ChatGPT. Put it to work on your Mac." (A, F, K). "This report was written by two bots that live on this Mac." (B, E). "Turn a week of scattered notes into a client update." (C) | **Open on the result:** "A client update, built from this week's notes." Then the ChatGPT line as the second beat. |
| 11 | Dark theme beat | None (most). One dark beat (J, K, B) | **None in the main cut.** |
| 12 | Voice | Wade (10). Maeve -1 (J). Cliff (G round 1, B round 1, I round 1) | **Wade 0,** confirmed by the owner's ear from the samples. |

## Claim errors the council caught (now banned from the plan)

- "Every new AI agent wants you to move into its cloud" and "Most AI agents run on someone else's computer" (G, B): Hermes, OpenBot and OpenClaw run locally.
- Cards on writes or moves inside an attached folder in Auto (D, E, F, G).
- "Anything destructive always asks" (I): false at Full access.
- "No region lock" without "of ours, provider rules apply" (D).
- "Two minutes to start", "two clicks" (B, E, F, I): unmeasured; the DMG needs a one-time Open Anyway.
- The Generalist as a group member (E): it orchestrates and can never be a member (shared/shell-store.ts:776).
- "Reads run and writes ask" for MCP (J): every MCP call asks in Auto.
- "We never see them" (A): too close to "no telemetry" as an absolute.
- "Local stays local" (F): web search and connected apps still receive what they're sent.
- Scripted numbers before filming ("42 GB", K): use whatever the demo machine shows.
- Speed: several members said Flux has no speed control, and Sol and Astra flagged numeric speeds as unsupported. Flux does take speed 0.5 to 1.5, but not together with pronunciation fixes, so the plan paces with punctuation and holds speed at 1.0. The confusion came from the chair's brief (see below).

## Errors in the chair's dossier

- `07-settings-dark.png` was captured before the dark appearance applied, so it's a light screenshot (caught by H).
- The round 1 brief said Flux delivery is steered "only by punctuation, pauses and an expressivity setting", leaving out its speed parameter.
- The research doc's §5 called expressivity "beta" but didn't say Deepgram validates only 0; two members then flagged "only 0 is validated" as unsupported. The Deepgram dossier does source it.

## Owner decisions

1. The voice: Wade at 0 (council) or another sample by ear.
2. "Free" on the end card: yes or no.
3. The demo: approve the two-bot client update.
4. Length: 16:9 at about 86 s and a 9:16 re-crop at the same length, or a shorter 9:16 (about 45 s).
