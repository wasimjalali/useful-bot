# UI from Grok Bot, Useful Brain visuals

Useful Bot copies Grok Bot information architecture, then restyles it with Useful Brain.

## Mapping

| Grok Bot shot | Useful Bot rail / stage |
|---|---|
| Dark charcoal sidebar | Light `--rail` 248px column, inset `--shadow-rail` |
| Large CEO row | Pinned card only. Default rows stay compact. |
| Section headers with + | `.section-label` plus + on Work and Unassigned |
| Bot overflow menu | Pin, move, rename, hide, delete with confirm |
| New chat create menu | New chat, Create bot, Create group chat |
| Agent settings form | Stage-side `.settings-pane`: name, label, description, notify, routines stub |
| Cursor composer chrome | Deferred. Composer stays send / stop on Useful Brain tokens. |

## Product rules

- Structure and behavior from the shots. Visuals from our tokens.
- Light theme first. Do not charcoal-ize the rail.
- Virtual computer preview is out of scope.
- Prefer durable local state over cloud sync.

## Sequence

This shell sits after streaming replies (GitHub PR 11) and before memory view, search chips, reviewer in chat, launchd install, and release verification.
