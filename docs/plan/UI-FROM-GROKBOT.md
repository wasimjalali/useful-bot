# UI features to add from Grok Bot reference

Status: owner direction 2026-09-13. Source: `docs/grokbot-ui-reference/`.
Extends PLAN-FINAL / SPEC for the macOS + web chat surface.
Does **not** require the virtual computer.

## Why
Useful Bot should feel like a multi-agent personal OS, not a single chat box.
Grok Bot screenshots define **structure and behavior**. Cursor screenshots define **composer / + menu** patterns.

## Visual rules (owner)
1. Implement with **Useful Brain / Useful Bot tokens** (`macos/Sources/UsefulBotCore/DesignTokens.swift`).
2. **Light (white) theme first**, then dark on the same tokens.
3. Do **not** copy Grok Bot’s dark charcoal look from the reference PNGs.
4. Screenshots are mostly dark and often show **CEO pinned** (large card). That is not the default bot row. See README glossary.

## Must include (even if not in the original plan)
1. Multi-bot sidebar: search, avatars, previews, pin, hide, delete.
2. Sidebar **sections** (including an unassigned/default bucket).
3. Group chats.
4. Create Bot / Create group (name, label, description).
5. Per-bot settings + **Routines** side panel without computer preview.
6. Global Search (Cmd+K style).
7. Account menu + Settings.
8. Marketplace-shaped plugins UI (can phase depth).
9. Cursor-like composer: model, effort, fast, `+` modes/skills/files/tools.

## Out of scope for now
- Virtual computer / agent screen streaming
- Grok Bot cloud computer update/reset
- Pixel-matching Grok Bot dark theme

## Evidence
`docs/grokbot-ui-reference/README.md` (per-shot state catalog) and PNGs therein, especially:
- `02-sidebar/03-bot-context-menu.png`, `06-sidebar-with-sections.png`, `06b-sidebar-sections-crop.png`
- `05-create/09-new-chat-create-menu.png`, `10-create-bot-group-shortcuts.png`
- `06-misc/01-marketplace-plugins.png`
- `03-agent-pane/02-agent-settings-form.png`
- `07-cursor-inspiration/*`

## Agent capabilities (interactive)
See `docs/plan/GROKBOT-AGENT-CAPABILITIES.md` for create-bot onboarding, profile, groups, skills, routines, and bot-to-bot handoffs, plus a Useful Bot build order.
