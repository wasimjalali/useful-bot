# Grok Bot UI reference for Useful Bot

This file is the UI state glossary for the multi-bot shell. Structure and behavior come from Grok Bot information architecture and a few Cursor composer patterns. Visuals come from Useful Brain tokens in `web/app/globals.css`. Do not copy Grok Bot dark charcoal.

Reference PNGs were not checked into this repository. Treat the glossary below as normative until screenshots land under this folder.

## Theme

- Light (white) theme first. Dark later on the same tokens.
- Rail is `--rail` (`#f8f8f8`). Stage is `--surface` (`#ffffff`) with 24px radius.
- Class names stay `rail` and `stage`.

## Row size and pin

- Default bot rows are compact (24px avatar, one or two text lines).
- A large row is the pinned state, not the default density.
- Pinned bots render as cards above sections.

## Sidebar (rail)

Must land:

1. Search (rail filter) plus Search chats (Cmd+K).
2. Compact bot rows.
3. Section headers, including Unassigned as the default bucket. Headers expose `+` to create into that section.
4. Pin. Pinned may use a larger card.
5. Selected state (`aria-current`).
6. Footer account entry (operator initials, name, settings).

## Context menu (bot)

- Pin / Unpin
- Move to section (Unassigned, named sections, New section)
- Rename
- Settings
- Hide (confirm)
- Delete (confirm)

## Create flows

- New chat: clears the active bot or group session.
- Create bot: name, label, description, section.
- Create group chat: name plus member bots. Shared `sessionId`.

## Agent settings

- name, label, description, notify toggle
- Routines list is a read-only placeholder
- Create routine is stubbed until a scheduler exists

## Out of scope for the shell PR

- Virtual computer / agent screen preview
- Full Cursor composer (model / effort / fast / + modes)
- Marketplace modal depth
- Cmd+K global search polish
- Dark theme
- Real routines scheduler backend

## Per-shot catalog (when PNGs exist)

| Role | Path |
|---|---|
| Sidebar sections crop | `02-sidebar/06b-sidebar-sections-crop.png` |
| Bot context menu | `03-bot-context-menu.png` |
| Agent settings form | `03-agent-pane/02-agent-settings-form.png` |
| New chat create menu | `05-create/09-new-chat-create-menu.png` |
| Create bot / group shortcuts | `05-create/10-create-bot-group-shortcuts.png` |
| Cursor inspiration | `07-cursor-inspiration/` |

## Store

Persist `~/.useful-bot/shell.json` (override with `UB_SHELL_PATH`). No secrets. Seed Useful Bot as pinned default and Reviewer under Work. Each bot or group keeps its own eve `sessionId`.
