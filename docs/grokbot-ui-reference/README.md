# Grok Bot UI/UX reference for Useful Bot

**Purpose:** Interaction and information-architecture reference so Useful Bot can support multi-bot chat, sections, groups, routines, marketplace shape, and a Cursor-like composer.

**Audience:** Agents and humans implementing Useful Bot macOS + web UI.

**Captured:** 2026-09-13 (window captures + Desktop screenshots). Almost all Grok Bot shots are **dark theme**. That is incidental. Do not copy that look.

---

## Brand and theme (read this first)

These screenshots show **structure and behavior**, not Useful Bot’s visual system.

1. **Use Useful Bot / Useful Brain design tokens** in `web/app/globals.css` (`--canvas`, `--surface`, `--ink`, `--border`, accents, shadows). Rail + stage shell stays.
2. **Build light (white) theme first.** That is the default product look.
3. **Dark theme second**, still on our tokens, not a port of Grok Bot’s charcoal UI.
4. **Do not** adopt Grok Bot’s dark greys, brand mark, or icon set from these PNGs.
5. Cursor shots in `07-cursor-inspiration/` are also **layout inspiration** for the composer / `+` menu. Restyle them with our tokens.

If a screenshot conflicts with Useful Brain tokens, **tokens win**.

---

## UI state glossary (do not confuse these)

Many shots show a **non-default** sidebar. Implementers must know which state they are looking at.

| State | What it looks like in these shots | What “normal” should look like |
|---|---|---|
| **Pinned bot** | **CEO** appears as a **large featured card** at the top of the sidebar (big avatar, title, subtitle). That size is because CEO is **pinned**, not because every bot is that large. | Unpinned bots are compact rows: small avatar, name, subtitle, time, preview. |
| **Selected / active chat** | Row or card has a stronger background / border. | One active chat at a time; selection chrome uses our tokens. |
| **Section headers** | Named groups in the sidebar (e.g. a section containing Useful Apply bots, plus **Unassigned**). | Empty or few sections is fine; support creating sections via “Move to new section”. |
| **Unassigned** | Section for bots not moved into a custom section. Visible in `06*` shots. | Keep an unassigned / default bucket or equivalent. |
| **Group chat** | Entry with stacked avatars (e.g. Useful Apply group). | Distinct from a single bot row. |
| **Right-click menu open** | Context menu over the sidebar. | Transient overlay; not the resting UI. |
| **Modal open** | Marketplace or Settings dimming the chat behind. | Resting UI has no modal. |
| **Agent info pane open** | Third column: routines (+ computer preview in Grok). | Optional side panel; **omit live computer** for Useful Bot. |
| **Create / New chat** | “To: Search or create Bots” + Create new Bot / Create group chat. | Empty main stage or picker until a chat is chosen. |
| **Cmd+K Search** | Center search overlay with tabs (All, Messages, Bots, …). | Closed by default. |
| **Composer (Cursor)** | Light UI: model / effort / fast; `+` modes menu. | Our resting composer; light theme first. |

**Default resting product state to design toward:** light theme, sidebar with section headers + compact bot rows, one selected chat, no modal, composer at bottom (Cursor-inspired controls), no pinned mega-card unless the user pinned a bot.

---

## How to use this folder

1. Read **Brand and theme** and **UI state glossary** above.
2. For each PNG, read the **State** line in the catalog below before coding from it.
3. Implement features listed under **Required product features**.
4. Prefer Grok Bot for multi-bot IA (sidebar, sections, groups, routines, marketplace shape, settings). Prefer Cursor for composer / `+` / model-effort (`07-cursor-inspiration/`).

---

## Screenshot catalog

### `01-chat` — conversation surface

| File | State | What it shows / how to use it |
|---|---|---|
| `01-main-chat-ceo.png` | Dark; **CEO pinned** (large top card); 1:1 chat open; no modal | Full app chrome: sidebar + thread + composer. Treat CEO size as **pinned**, not default row size. |
| `02-chat-header.png` | Crop of chat header | Header identity strip only. |
| `03-group-useful-apply.png` | Dark; another bot/group thread (e.g. Design or group) | Multi-party / other-bot thread layout vs CEO 1:1. |
| `04-header-share-computer-icons.png` | Crop; share + computer icons | Header actions. **Computer icon is deferred** for Useful Bot; share is optional. |

### `02-sidebar` — bot list and chrome

| File | State | What it shows / how to use it |
|---|---|---|
| `01-agent-list.png` | Dark; **CEO pinned** large; compact rows below | Sidebar list density. Unpinned rows are the normal bot row pattern. |
| `02-sidebar-footer-account.png` | Footer crop | Marketplace entry + account chip. |
| `03-bot-context-menu.png` | Right-click menu open on a bot | Menu items: Pin, Move to new section, Mark unread, Rename, Edit Profile, Duplicate, Copy conversation ID, Hide from sidebar, Delete. This is how sections and pin are created. |
| `06-sidebar-with-sections.png` | Dark; **sections present**; **CEO pinned**; Unassigned visible | Full window after sections exist. Use for section headers + pinned + compact rows together. |
| `06b-sidebar-sections-crop.png` | Same as above, sidebar crop | Cleaner crop of sectioned sidebar. **Unassigned** and pinned CEO are both visible; do not assume every bot is a large card. |

### `03-agent-pane` — per-bot info (Cmd+Shift+I)

| File | State | What it shows / how to use it |
|---|---|---|
| `01-agent-info-pane.png` | Info pane open; routines list; computer preview slot | Third column pattern. Build routines + settings affordances; **stub or omit** live computer. |
| `01b-agent-info-screen-connected.png` | Same pane with preview connected | Ignore computer content; still useful for pane chrome. |
| `02-agent-settings-form.png` | Per-bot Settings form open (name, label, description, notify) | Edit-profile surface for a bot. Normal settings state, not resting chat. |
| `03-create-routine.png` | Routines add / create affordance | Creating a routine, not the empty resting list only. |
| `04-group-info-pane.png` | Info pane for group / other bot | Members / routines empty-state style for non-CEO bots. |

### `04-settings` — global app settings

| File | State | What it shows / how to use it |
|---|---|---|
| `01-settings-general.png` | Settings modal; General selected | Account, theme, language, system, timezone. Modal over chat. |
| `02-settings-computer.png` | Settings → Computer | Local machine / execution. Map only what Useful Bot needs (local tools), not Grok’s cloud computer product. |
| `03-settings-updates.png` | Settings → Updates | Update channel pattern. |
| `04-settings-microphone.png` | Settings deep-link mic | Mic preference row. |
| `05-settings-local-execution.png` | Local execution | Permission / allow local tasks. |
| `06-settings-auto-review.png` | Auto-review | Safety / review toggle pattern. |
| `07-settings-timezone.png` | Timezone | Timezone preference. |
| `09-settings-usage-billing.png` | Usage & Billing | Usage snapshot UI. |
| `10-account-menu.png` | Account popover open | Weekly usage, mobile, support, settings, add account, log out. Transient menu. |

### `05-create` — new chat / bot / group

| File | State | What it shows / how to use it |
|---|---|---|
| `01-command-palette.png` | Cmd+K Search open | Global search tabs: All, Messages, Bots, Groups, Files, Links, Routines, Actions. |
| `03-cmdk-create.png` … `08-cmdk-new-section.png` | Cmd+K with typed queries | Mostly **message search** results for those strings. Use for Search UX, **not** as the primary Create Bot flow. |
| `09-new-chat-create-menu.png` | New chat / create picker open | “To: Search or create Bots”; Create new Bot; Create group chat; list of bots. This is the real create entry. |
| `10-create-bot-group-shortcuts.png` | Same picker; shortcuts visible | ⌘1 Create new Bot, ⌘2 Create group chat. |

### `06-misc`

| File | State | What it shows / how to use it |
|---|---|---|
| `01-marketplace-plugins.png` | Marketplace modal open; Plugins tab | Plugins / Bots tabs, search, category chips, Featured, Team plugins, Add / Added. Chat dimmed behind. |

### `07-cursor-inspiration` — composer target

| File | State | What it shows / how to use it |
|---|---|---|
| `01-composer-fast-effort-model.png` | Cursor; light; model popover open | Fast toggle, Effort, Model. Restyle with Useful tokens; light first. |
| `02-plus-menu-modes-skills-mcp.png` | Cursor; `+` overlay open | Search skills/context/chats; Plan / Debug / Multitask / Ask; Files / Model / MCP. Adapt labels to Useful Bot capabilities. |
| `03-composer-bar.png` | Cursor; resting composer bar | `+`, placeholder, Extra High Fast, mic. Target resting composer for Useful Bot (light). |

---

## Required product features (build these)

Derived from the screenshots. Belong in the plan even if missing from the original SPEC. **Exclude virtual computer.**

### A. Sidebar and bots
1. Searchable list: avatar, title, subtitle, time, last-message preview (**compact row = normal**).
2. **Pin** — pinned bot may render as a larger featured card (as CEO does here); unpinned stay compact.
3. **Sections** — named headers; Move to new section; Unassigned / default bucket.
4. Context menu: Pin, Move to section, Mark unread, Rename, Edit profile, Duplicate, Copy ID, Hide, Delete.
5. Footer: Marketplace + account menu.
6. New chat / sidebar `+` entry.

### B. Chat
1. 1:1 bot threads and **group chats**.
2. Bubbles, timestamps, optional cross-bot metadata.
3. Composer with attach; voice optional.
4. Header: bot identity; share optional; **no required computer icon**.
5. Global Search (Cmd+K style).

### C. Create flows
1. Create Bot (name, label, description).
2. Create group chat.
3. Create / manage sections.
4. Shortcuts where reasonable.

### D. Per-bot panel
1. Settings form: name, label, description, notifications.
2. **Routines** list + create. No computer preview.

### E. Global settings and account
1. Settings: General (theme, language, mic, timezone), updates, usage.
2. Account menu: usage, support, settings, add account, log out.
3. Local-execution controls only as Useful Bot needs them.

### F. Marketplace shape
1. Modal: Plugins / Bots, search, categories, Add / Added. Can phase depth; shape is in scope.

### G. Composer (Cursor-inspired, Useful tokens)
1. Model selector, effort, fast mode.
2. `+` menu: modes/skills, files, tools/MCP — mapped to real Useful Bot features.
3. Overlay search: skills, context, chats.

---

## Explicitly deferred
- Agent virtual computer / live desktop preview / “CEO’s screen”
- Grok Bot cloud computer update/reset controls
- Copying Grok Bot dark visual styling

---

## Related docs
- `docs/spec/SPEC.md`
- `docs/spec/PLAN-FINAL.md`
- `docs/plan/UI-FROM-GROKBOT.md`
- `docs/plan/GROKBOT-AGENT-CAPABILITIES.md` — interactive bot capabilities and how to build them
- Tokens: `web/app/globals.css`
