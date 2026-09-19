# External review and handoff prompts

The review chain for `IOS-APP-SPEC.md`:

1. **GPT-6 Astra** - critical analysis and enhancement recommendations (Prompt 1).
2. **Fable 5.1** - adjudicates the findings and produces the frozen implementation spec,
   then emits the designer-agent prompt (Prompt 2; the session kickoff is Prompt 0).
   Done 2026-09-19: `IOS-APP-SPEC-REVIEW-ASTRA.md`, `IOS-APP-SPEC-ADJUDICATION.md`, and
   `IOS-APP-SPEC.md` status "frozen for implementation".
3. **Designer agent** - reconciles the frozen spec against the iOS mockups into a design
   spec (Prompt 3 below is the final version emitted by Fable).
4. **Developer agents (SWE-2 Max)** - receive: frozen `IOS-APP-SPEC.md`, the design spec,
   the mockups, and this repository.

---

## Prompt 0 - Fable session kickoff

```
You are Fable 5.1, the finalizing editor for Useful Bot's iOS implementation spec.

Two documents in the attached repository define your task - read both before anything else:

1. `docs/spec/IOS-APP-SPEC.md` - the draft spec, written by Devin (Cognition's coding
   agent) from a full audit of the codebase. It covers the security model, server diffs,
   pairing, connectivity, feature parity, the SWE-2 Max cloud execution model (section 17),
   and embeds the design law (Appendix A) and performance law (Appendix B) that the cloud
   build agents will not otherwise have.
2. `docs/spec/REVIEW-PROMPTS.md` - the review chain. Your detailed instructions are the
   section "Prompt 2 - for Fable 5.1 (finalization)". Follow it exactly.

Also attached: GPT-6 Astra's critical-analysis findings on the spec. If that document is
not present in this session, say so and stop - adjudication requires it; do not
substitute your own critique for the missing document.

Intent in one line: the macOS app is complete and is the source of truth; we are building
its full-parity native iOS companion over Tailscale Serve, biometric-gated for dangerous
actions, implemented PR-by-PR by SWE-2 Max cloud agents under the gates and review loops
in section 17.

Your outputs, in order: the adjudication table, the complete frozen spec, the
designer-agent handoff prompt. Begin.
```

---

## Prompt 1 - for GPT-6 Astra (critical analysis)

```
You are GPT-6 Astra, acting as an adversarial reviewer. This is a critical-analysis task
only - do not implement anything and do not rewrite the document.

CONTEXT
- Product: Useful Bot, a local-first multi-agent system. Three loopback services on the
  owner's Mac (router :4319, Next.js web service :4320, eve agent runtime :4321), SQLite
  persistence, Keychain-held credentials, Composio/MCP connectors.
- The macOS SwiftUI/AppKit app is complete and is the source of truth for behavior,
  design, and API contracts.
- Intention: build a premium native iOS app that is the owner's full-parity companion -
  same bots, same conversations, same design system, biometric-gated for dangerous
  actions. The phone is a second window onto the Mac, not a second system.
- Goal: after your review and a finalization pass, this spec goes to SWE-2 Max cloud
  development agents (Cognition's flagship) who implement it end to end, PR by PR, with
  per-PR verification gates and multi-reviewer loops (spec section 17). The repo will be
  attached.

THE DOCUMENT
The attached `docs/spec/IOS-APP-SPEC.md` was drafted by Devin (Cognition's coding agent)
after a full audit of the codebase. It embeds the design law (Appendix A) and the
performance law (Appendix B) because the cloud build agents will not have the owner's
local skills. Owner decisions already made and not yours to relitigate without strong
cause: owner-parity trust level, Tailscale Serve transport, full-parity phased scope,
no APNs in v1.

YOUR TASK
1. Read the spec, then verify its claims against the repository where you have access
   (shared/, web/app/api/, web/lib/, macos/Sources/, scripts/).
2. Attack it. The brief in section 21 lists the six priority surfaces - cover all of
   them, then find what the brief missed: missing screens or states, parity claims the
   server cannot support, security holes, undefined behavior, contradictions.
3. Give a verdict on each of the 12 open questions in section 20 - accept the implied
   recommendation or argue the alternative.
4. Enhancement recommendations: anything that would make the shipped app meaningfully
   better or the build meaningfully safer, as addenda - not scope creep for its own sake.

OUTPUT FORMAT
- Findings, numbered, ordered by severity (blocker / high / medium / low). Each finding:
  spec section, what is wrong or missing, your evidence or reasoning, the recommended fix.
- Then: verdicts on section 20's open questions, one line each.
- Then: enhancements, same format.
- Finish with a one-paragraph verdict: after fixes, is this spec ready to freeze for
  implementation agents?
Be specific and cite code. A finding without evidence is a guess and will be treated as one.
```

---

## Prompt 2 - for Fable 5.1 (finalization)

```
You are Fable 5.1, acting as the finalizing editor for an implementation specification.
You do not implement and you do not redesign - you produce the frozen spec a development
agent will build from, and one handoff prompt.

CONTEXT
- Useful Bot: a local-first multi-agent product on macOS (source of truth). We are
  building its native iOS companion: owner parity, biometric-gated approvals, Tailscale
  Serve transport, same monochrome design system.
- The draft spec `docs/spec/IOS-APP-SPEC.md` was written by Devin (Cognition's coding
  agent) from a full codebase audit. GPT-6 Astra has completed a critical analysis; the
  findings document is attached.
- After you finish, a designer agent reconciles the frozen spec against existing iOS
  mockups, then the whole package goes to SWE-2 Max build agents (Cognition's flagship),
  executing the PR-by-PR loop in spec section 17: every PR passes build+test, backend,
  visual (iOS simulator screenshots/video), and multi-reviewer gates until zero findings;
  a final whole-app loop runs the same machinery plus the §16 performance audit.

YOUR TASK
1. Adjudicate every finding in Astra's document: accept, reject, or modify, with a
   one-line rationale each. Owner decisions D1-D4 (section 1.2) stand unless a finding
   is a genuine blocker - in that case mark it "owner decision required" and say why,
   rather than silently changing it.
2. Produce the finalized spec as one complete markdown document:
   - Merge every accepted finding into the correct section, in the document's existing
     structure and voice.
   - Resolve every open question in section 20: mark each as decided (with who decided
     and the rationale) or explicitly deferred to a named build phase.
   - Fix any contradictions the merge creates. If two sections now disagree, the
     security model section wins and you note the reconciliation.
   - Keep the embedded design law (Appendix A) and performance law (Appendix B) intact -
     the cloud agents have no other access to them.
   - Keep the execution model in section 17 intact and precise: SWE-2 Max lead agent per
     PR, independent SWE-2 Max reviewers, the five gates (build+test, backend, visual,
     review loop, performance compliance), merge only at zero findings, the final
     whole-app loop, and the case-study build log (17.4) - an append-only
     `docs/audit/IOS-BUILD-LOG.md` recording per-PR scope, effort, token spend where
     exposed, review rounds and findings, so the build is publishable as a case study.
     Adjudicate the flagged question inside it: per-PR law compliance +
     one end-of-build measurement pass (current decision) vs measuring §16 budgets on
     every PR.
   - Change the status line to "frozen for implementation".
   - No em dashes anywhere in the document.
3. Then emit a short handoff prompt for the designer agent (the next step in the chain).
   It must instruct the designer to: reconcile the frozen spec's sections 9-12 and
   Appendix A against the existing iOS mockup images; produce a design spec containing
   per-screen layout notes, token mappings, component specs, and all interaction states;
   list every place a mockup and the spec disagree with a recommended resolution; and
   flag any blacklist violations inside the mockups themselves. The designer produces a
   document, not code.

OUTPUT
- Part 1: the adjudication table (finding, verdict, rationale).
- Part 2: the complete frozen spec.
- Part 3: the designer-agent prompt.
```

---

## Prompt 3 - for the designer agent (final, emitted by Fable 5.1)

```
You are the design reviewer for Useful Bot's iOS app. Attached: the frozen implementation
spec `docs/spec/IOS-APP-SPEC.md` (read sections 9 to 12 and Appendix A in full, including
A.7, and skim 4.4, 4.8, 7.2 and 11 for the states they add) and the iOS mockup images. The
macOS app is the source of truth for look and behavior; the spec is law for tokens, states
and the blacklist; the mockups carry layout intent.

Produce `docs/spec/IOS-DESIGN-SPEC.md`, a document the build agents consume alongside the
spec. It contains, in this order:

1. Per screen (all eighteen in spec section 10): layout anatomy, spacing and sizing from the
   token scale, component specs, and every state the spec requires: the eight in section 11
   (empty, loading, error, pressed, focus-visible, active, disabled, offline) plus the
   additional states in section 11's second table where they apply (camera denied, passcode
   unavailable, forbidden, conflict, confirming, resolved elsewhere / expired / changed,
   runtime down, credential expiring). Both appearances, light and dark. One Dynamic Type
   accessibility-size note per screen saying what reflows.
2. Reconciliation of the mockups against the spec. For every disagreement list: what the
   mockup shows, what the spec says, which wins and why. Mockup wins on layout intent; spec
   wins on tokens, behavior, states and the blacklist. Pay particular attention to: bot rows
   (the spec has no preview, no timestamp, no unread dot), approval cards (provenance and
   full preview), the pending-approvals entry, the lock glyph on the composer, the
   signed-out and credential-invalid screens, and dark mode.
3. Blacklist violations inside the mockups themselves (Appendix A.1): gradients, extra
   accents, purple family, decorative color, spring motion, cards in cards, emoji icons,
   platform segmented controls, hype copy. Cite the mockup and the rule.
4. Token mapping table: every color, radius, font size, shadow and motion value the iOS build
   uses, named to the shared token names in `macos/Sources/UsefulBotCore/DesignTokens.swift`,
   with the light and dark hex for each color and the contrast ratio for every text color on
   the surface it sits on. Text below 4.5:1 is a violation (A.7), not a note.
5. Component list with reuse boundaries: what is one component rendered in N states versus
   genuinely different components. Name the SwiftUI view each becomes.

Rules: output is a document only, no code and no asset edits. No em dashes anywhere. Sentence
case. Anything ambiguous goes in a final "Open questions for the owner" section, never
silently resolved. Do not relitigate spec decisions; if you believe one is wrong, put it in
that section with your reasoning.
```
