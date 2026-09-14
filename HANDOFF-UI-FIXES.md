# Handoff — UI fixes worktree (`fix/ui-composer-scroll-model-selector`)

**Worktree path:** `/Users/wasimjalali/Desktop/useful-bot-ui-fixes`
**Branch:** `fix/ui-composer-scroll-model-selector` (cut from `main` @ `4931168`)
**Author:** session that fixed the UI issues below. Another agent should merge this
branch into its working branch, resolve conflicts, remove this worktree, then hand
the branch to Opus for the Muse Spark review loop + visual verification.

Before merging, remember the main checkout (`/Users/wasimjalali/Desktop/useful-bot`)
has **concurrent uncommitted changes from other agent sessions** in
`macos/Sources/UsefulBotApp/AppModel.swift`, `macos/Sources/UsefulBotApp/ComposerView.swift`
and several web/agent files. Do not `git checkout --` anything there blindly; only
resolve conflicts for the files listed below.

---

## Issues fixed and root causes

### 1. Voice-to-text transcript gets double-pasted into the composer
**Root cause.** The composer used SwiftUI `TextField(axis: .vertical)`, whose
binding desyncs from the underlying field editor on macOS exactly when a voice
app or system dictation commits text: the app's periodic `refreshComposer` poll
(2.5 s) republishes `AppModel.composer`, SwiftUI re-renders and re-applies the
bound text mid-commit, and dictation/paste re-inserts the committed text.
Writing back to the binding from `.onChange` (the 2000-char clip) made it worse.

**Fix.** Replaced the vertical `TextField` with `ComposerTextView.swift` (new),
an `NSViewRepresentable` around a real `NSTextView`:
- pushes text out on `textDidChange` (with the 2000-char UTF-16 clip inside the
  text view, not via a binding write-back),
- pulls model → view only when the string differs **and** it is not the echo of
  the last push (`lastPushed`) **and** the field has no marked text
  (`textView.hasMarkedText()`) — this is what stops dictation double-inserts,
- Return-to-send semantics identical to the old `onKeyPress` handler:
  plain Return sends when `canSend` and not pending, is swallowed when nothing
  to send, falls through to a newline while a turn runs; modified keys always
  fall through,
- `allowsUndo`, plain-text typing attributes, smart quotes/dashes off.

### 2. After sending, a copy of the message stays in the composer
**Same root cause** (binding/field-editor desync): the model cleared `draft`
after the turn was accepted, but the field kept showing the sent text, and the
next edit re-imported it. The representable clears deterministically:
`updateNSView` pulls `model.draft` into the text view whenever it differs from
both the view string and `lastPushed`, preserving selection/caret.

### 3. Long paste in the composer had no scrolling
**Root cause.** `TextField(axis: .vertical)` with `lineLimit(1...6)` does not
scroll its field editor on macOS once content exceeds the cap.
**Fix.** The `NSTextView` lives in a borderless `NSScrollView` that grows from
1 line to 6 (min 32 pt, max 148 pt via `sizeThatFits`) and scrolls internally
past that. The app-wide `ThinScrollbar` swizzle (`NativeTheme.swift`) dresses it
with the 5 pt overlay knob automatically — hidden by default, revealed while
scrolling, fading out after ~0.85 s, same as every other scroll view.

### 4. Transcript jumps to the top, then auto-scrolls to the bottom
**Root causes (two, both fixed).**
- `TranscriptBlocks` keyed day dividers to `"day-\(row.id)"` of the row that
  started the day. When the live echo of the owner's turn replaced the
  optimistic `local-…` row id, the divider's identity changed, tearing the
  transcript list down; the ScrollView reset to the top, and the content-change
  scrollTo then dragged it back down. Divider ids are now keyed to the day
  itself: `day-\(startOfDay(timeIntervalSince1970))`, stable across the
  optimistic→echo transition.
- Auto-scroll fired unconditionally with `withAnimation` on every content
  change, fighting the reader. The transcript now uses
  `.defaultScrollAnchor(.bottom)` plus `ScrollPinnedTracker` (new modifier in
  `ChatView.swift`) which uses `onScrollGeometryChange` (macOS 15+, falls back
  to always-follow on 14) to only scroll to bottom while the viewport is pinned
  to the bottom; scrolling up into history is never yanked back.

### 5. Model selector / mode chip opens unreliably
**Root cause.** Popover dismissal (`OutsideClickDismissal` in
`OutsideClick.swift`) classified a click as "outside" unless the hover flag had
fired. A popover that opens under a resting pointer gets no hover-enter event
until the pointer moves, and fast clicks can land before tracking catches up —
so clicking a menu row (e.g. "Model") dismissed the whole menu on mouse-up.
**Fix.** The dismissal now also tracks the popover's own window frame
(`WindowFrameReader` background) and treats any click inside that frame as
inside, in addition to hover. This fixes the mode chip menu, its flyout, the
plus menu, and the settings/details panes (all share the modifier).

### 6. Responses render uncleanly; code blocks overflow with no copy button
**Root causes.**
- Inline rendering used Apple's `AttributedString(markdown:)` (full CommonMark)
  while the web uses a deliberately narrower parser (`shared/chat-markdown.ts`):
  native italicized `_snake_case_`, rendered emphasis forms the web never
  draws. Ported that parser to Swift (`ChatInline.swift`, cached through
  `ChatMarkdownCache.inline`) and `ChatMarkdownView` now renders those spans,
  so bold/italic/code/links match the web character for character. Links stay
  http(s) and non-local only (same guard as before).
- Code blocks are now `CodeBlockView`: bounded to the column width (the old
  one pushed past the window edge), long lines scroll horizontally under the
  thin scroller, and a copy button (top-right, turns into a checkmark for
  ~1.4 s) copies the block text to the pasteboard — the "copy drafted prompt"
  affordance.

---

## Files changed (all in the worktree)

New files:
- `macos/Sources/UsefulBotApp/ComposerTextView.swift` — the composer's
  `NSTextView` representable (issues 1–3).
- `macos/Sources/UsefulBotCore/ChatInline.swift` — web-parity inline parser
  (issue 6).

Modified files:
- `macos/Sources/UsefulBotApp/ComposerView.swift` — swaps the vertical
  `TextField` for `ComposerTextView`; `@FocusState` → `@State` focus driven by
  the delegate; removed the `.onChange` clip and `.onKeyPress(.return)` (both
  moved into the text view). *Likely conflict point:* another agent session has
  uncommitted edits to this same file in the main checkout.
- `macos/Sources/UsefulBotApp/ChatView.swift` — transcript scroll: bottom
  default anchor, pin-aware auto-scroll, `ScrollPinnedTracker` modifier at the
  bottom of the file; removed the `withAnimation` scroll.
- `macos/Sources/UsefulBotApp/OutsideClick.swift` — popover frame hit-testing
  inside `OutsideClickDismissal`.
- `macos/Sources/UsefulBotApp/ChatMarkdownView.swift` — span-based inline
  rendering + `CodeBlockView` with copy button.
- `macos/Sources/UsefulBotCore/ChatMarkdown.swift` — `inline(from:)` now
  returns `[InlineSpan]` (cached) instead of `AttributedString`.
- `macos/Sources/UsefulBotCore/TranscriptBlocks.swift` — stable day-divider ids.
- Tests: `TranscriptBlocksTests.swift` (divider ids via `dayID(_:)` helper),
  `ChatMarkdownTests.swift` (+ `ChatInlineTests` suite),
  `ChatMarkdownCacheTests.swift` (span cache assertion).

## Verification done (backend only)

- `swift build` clean; `macos/test.sh` — **178 tests pass**.
- `npm test` — **223 tests pass** (worktree needed `npm ci` — worktrees don't
  inherit `node_modules`).
- `npm run typecheck` — clean.
- Visual verification deliberately left to the next agent/Opus. A stale debug
  instance of the app (`macos/.build/debug/UsefulBotApp`) was killed before
  handoff; rebuild before visual testing.

## Suggested merge flow for the other agent

1. In your branch checkout, merge
   `/Users/wasimjalali/Desktop/useful-bot-ui-fixes` branch
   `fix/ui-composer-scroll-model-selector` (or cherry-pick the commit).
2. Expect conflicts mainly in `ComposerView.swift` if the other session's
   uncommitted composer work is already applied; my changes are localized to
   the `input` view builder, the `@FocusState` → `@State` swap, and the removed
   `onChange`/`onKeyPress` modifiers.
3. After merging: `swift build` in `macos/`, `./macos/test.sh`, `npm test`,
   `npm run typecheck`.
4. Remove this worktree from the main checkout:
   `git worktree remove ../useful-bot-ui-fixes` (and optionally
   `git branch -d` the branch after the merge).
