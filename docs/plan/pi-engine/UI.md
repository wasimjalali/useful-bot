# Pi engine: UI and UX for one bot

Status: draft 1, 2026-10-25. Decision (owner, 2026-10-25): **one bot only**, no second bot, no
bot switcher; the sidebar is built around chats. Companion to `SPEC.md` (engine, protocol) and
`PLAN.md` (who builds what). Visual rules come from the `useful-brand` and `useful-design` skills;
this file fixes structure, states and the contract with the backend.

## 1. Principles

- **One bot, many chats.** The bot is the app's identity, not a list item. Chats are the list.
- **Every visible thing has a backend source, and every backend capability has a place in the UI.**
  Section 9 is the contract; nothing ships that is missing from it.
- **Live state where the work is.** Each chat row shows whether that chat is working, waiting on
  the owner, has an unread reply or failed. No bot-level guessing.
- **Nothing the owner relies on today disappears silently.** Routines, Library, Connectors,
  memory, instructions, approvals, questions and model picking all keep a clear home.

## 2. Window

```
+-----------------+----------------------------------------------+-------------+
| SIDEBAR 248pt   | STAGE                                        | BOT PANE    |
|  search  new    |  header: bot face + chat title   [pane]      | 320pt, opt. |
|  logo           |                                              |             |
|  Routines       |  transcript                                  | Profile     |
|  Library        |                                              | Instructions|
|  Connectors     |                                              | Memory      |
|  ------------   |                                              | Notify      |
|  Today          |  ask column (approvals, question)            |             |
|   chat rows     |  composer                                    |             |
|  Yesterday ...  |                                              |             |
|  ------------   |                                              |             |
|  account row    |                                              |             |
+-----------------+----------------------------------------------+-------------+
```

The stage shows one of: a chat, the Routines page, the Library page. Connectors stays a dialog.

## 3. Sidebar

### 3.1 Top band (traffic-light row)

- **Search** (magnifier, ⌘K): opens the search palette (section 7).
- **New chat** (plus, ⌘N): opens an empty chat on the stage, selected in the list once the first
  message is sent. Replaces today's "New Bot" button. If the open chat is already empty, ⌘N only
  focuses the composer.
- Logo row below, as today.

### 3.2 Fixed entries

Three rows above the chat list, icon plus label, the active one highlighted:

| Row | Opens | Badge |
|---|---|---|
| Routines | Routines page on the stage (section 5) | count of routines whose last run failed, if any |
| Library | Library page on the stage (today's `LibraryView`) | none |
| Connectors | Connectors dialog (today's) | a dot when a connection needs sign-in again |

Library moves out of the account menu. The Connectors footer pill goes (the row replaces it).

### 3.3 Chat list

- Groups by `updatedAt` in the owner's time zone: **Today**, **Yesterday**, **Previous 7 days**,
  **Previous 30 days**, then one group per month ("September", "August 2026" when not this year).
- Row: title on one line (truncated), a trailing state mark or relative time. Height and type
  follow the current compact bot row.
- **State mark per chat** (from `/api/engine/status` chats, polled with approvals every 1.5 s):

| State | Mark | Clears when |
|---|---|---|
| working (a turn is running) | the bot face, small, in its working pose | the turn settles |
| waiting on owner (open question or pending approval in that chat) (PR 3) | amber dot | the question is answered, or the approval is decided or expires (5 min) |
| reply ready (a turn settled while the chat was not open) (PR 3) | blue dot | the chat is opened |
| failed (newest turn failed, not retried) (PR 3) | red mark | Retry succeeds or a new turn starts |
| idle | relative time ("2m", "Tue") | |

  Priority when several apply: waiting on owner, working, failed, reply ready.
- Selected chat: the current selection style.
- **Row menu** (hover ··· and right-click): **Rename** (inline edit, Enter saves, Escape cancels,
  60 chars), **Delete** (confirm dialog: "Delete this chat? This can't be undone."). Delete is
  disabled while the chat is working (tooltip "Stop the chat first"). Deleting the open chat opens
  the chat the engine makes current (the newest remaining one), or an empty chat. The engine keeps
  deleted files 30 days as a safety net; there is no restore in the app.
- Order: newest `updatedAt` first. `updatedAt` changes when a turn starts or a row is added, so a
  routine chat moves to the top each time it runs.
- **What PR 2 can show on eve data** (until PR 3 moves the list to the engine): the current chat
  plus up to 40 recents, titles taken from the last message (eve's recents keep no first message),
  no row menu (rename and delete arrive with PR 3), and the working mark only for the open chat.
- Long lists: the first 60 rows render, more load on scroll (`GET /api/chats?before=`).
- Empty list: one quiet line, "No chats yet", under the fixed entries.

### 3.4 Account row (footer)

The owner's face opens the account menu as today: Token usage, Providers, Settings, Appearance,
Send feedback, Contact us, version and updates. Library leaves this menu (3.2).

### 3.5 Background work and notifications

- A routine, connect-card resume or queued turn in a chat that is not open shows only in that
  chat's row (state mark) and, when the turn finishes, as a macOS notification if the Bot pane's
  notify toggle is on and either the window is not key or the chat is not open.
- Clicking the notification opens that chat.
- The Dock badge shows the number of chats waiting on the owner.

## 4. Stage: chat

### 4.1 Header

- Centered pill: bot face (22pt) and the **chat title** (falls back to the bot name in a new
  chat). Clicking the title starts inline rename (same as the row menu).
- Right: the Bot pane toggle (`sidebar.right`), as today.
- The group avatar stack and group header go.

### 4.2 Transcript

Rows come from `GET /api/chats/:id/rows` and live events (SPEC 5.12, 6.2):

- owner bubble, bot bubble (streams), working row (activity label and timer), failure row with
  Retry and cool-down countdown, question card, compaction note, image row, page row, widget row,
  connect card, search chips, note rows (routine ran, connected), unsent row with Send again /
  Edit / Dismiss, queued tag under an owner bubble.
- First launch after the update, in the empty chat: "Chats from the earlier version were not
  carried over. Your bot, notes, routines and connections are all here." Shown once.
- Gone: sub-agent cards and the waiting card, handoff and post strips, "N messages with ..."
  summaries, group attribution, "never got this message" rows, the "Continued from an earlier
  session" divider.

### 4.3 Ask column (above the composer)

- **Approval cards**: as today ("Needs approval", tool, preview, Deny / Approve). A card from
  another chat shows "From another chat" and an **Open chat** link; it still docks here so the
  owner never misses one.
- **Question card**: the open question of this chat, as today.

### 4.4 Composer

Unchanged except: no `@name` hint or group placeholder; the model chip, effort, folder and
permission chip, attachments and `+` menu stay. A model change made while a turn runs applies to
the next turn (the chip says so: "Applies to the next message"). Stop (the send button while a
turn runs) cancels the turn. Sending while a turn runs queues the message (queued tag).

### 4.5 Empty chat

The bot face, a greeting, and the starter prompts as today (`starter-prompt`). No onboarding
"New bot" card.

## 5. Stage: Routines page

Routines move from the 320pt pane to the stage, reusing today's routine list, detail, editor and
history views (`ChatDetailsPaneView.swift` 149-786) at full width:

- Left column: routine list (name, schedule summary, active toggle, last run state). Right:
  the selected routine's detail or the create form.
- **Each routine has its own chat** (SPEC D18), titled with the routine's name and reused for every
  run, so runs never pile into the chat the owner is in. It appears in the sidebar like any chat,
  with a small clock mark before the title. Run history rows link to the chat the run used
  (**Open chat**); a run whose chat was deleted shows "Chat deleted" instead, and a run recorded before PR 3 (no
  `chatId`) shows neither. Deleting a routine
  turns its chat into an ordinary chat (no clock mark). Deleting a routine's chat is allowed; the
  next run starts a new one.
- "Test run" runs it now (as today) in that routine chat.
- A notice while any routine still carries `movedFrom` (set by the archive migration, section 8):
  "N routines from your earlier bots are paused. Review them and turn on the ones you want."
  Turning a moved routine on or editing it clears its `movedFrom`; Dismiss on the notice clears
  them all (one `PATCH` per moved routine).

## 6. Bot pane (right, 320pt)

Opened from the header toggle. Sections, in order:

1. **Profile**: name, face color (today's avatar color and reset).
2. **Instructions**: today's editor with the instruction counter (`/api/bots/context`).
3. **Memory**: today's `MemorySectionView` (list, read, archive).
4. **Notifications**: "Notify when NAME finishes" toggle (NAME is the bot's name) and the system-permission note.

Routines leave the pane (section 5). Group members, delete-bot and "the last bot cannot be
deleted" go. There is no "create bot" anywhere.

## 7. Search palette (⌘K)

Tabs **All**, **Chats**, **Library**, **Routines**:

- Chats: title and preview match from the chat index, plus message text from
  `GET /api/chats/search?q=` (the engine scans rows; up to 50 hits, each with a snippet and its
  row id). Choosing a hit opens the chat scrolled to that row with a brief highlight.
- Library: generated images, drawings and pages by title.
- Routines: by name; opens the Routines page on it.
- Commands: "New chat", "Open settings", "Connectors", "Token usage".
- The Bots and Groups sections of today's palette go.

## 8. Settings (app)

- **General, Providers, Computer, Usage, Feedback, About** as today. Providers drops the reviewer
  role row.
- **Earlier bots** (new, in General, shown only if the migration archived any): one row per earlier
  bot with its name, a **Copy instructions** button, its memory-note count with **Move notes to
  NAME** (the bot's name), and **Remove** (confirm; deletes that archived bot's record and archives its notes, so they leave memory). This is the
  only place earlier bots appear.

## 9. Contract: UI element to backend

Every row must exist in both columns before PR 3 merges. "PR" says where it is built.

| UI element | Backend source | PR |
|---|---|---|
| Chat list rows (title, time, order) | `GET /api/chats` (`chats[]`: `chatId`, `title`, `preview`, `updatedAt`) | 2 on shell recents, 3 on the engine |
| Chat state marks | `GET /api/engine/status` `chats[]`: `{chatId, running, waitingOnOwner, replyReadySince, lastTurn}` | 3 (PR 2 shows working only for the open chat) |
| New chat | `POST /api/chats {botId}` | 2 (`newChat` shell action), 3 |
| Rename chat | `PATCH /api/chats/:id {title}` | 3 |
| Delete chat | `DELETE /api/chats/:id` (moves the file to `<stateRoot>/engine/trash/`, purged after 30 days) | 3 |
| Open chat | `POST /api/chats/:id/open` (current chat, clears reply ready) | 2 (`openRecent`), 3 |
| Transcript rows | `GET /api/chats/:id/rows` | 3 |
| Live transcript | `GET /api/chats/:id/events` | 3 |
| Send, queue, retry | `POST /api/chats/:id/turns` | 3 |
| Stop | `POST /api/chats/:id/cancel` | 3 |
| Approval cards (+ "From another chat") | `GET /api/approvals` (`chatId`, `botId`), `POST /api/approvals/:id` | 3 (`chatId`) |
| Question card | `input.requested` / `input.resolved` events; answer = next turn | 3 |
| Connect cards | `GET /api/proposals`, `PUT /api/shell` confirm and dismiss | 3 |
| Widgets | `tool.call` event, `POST /api/agent/widget {chatId}`, `GET /api/connections/widget/:id` | 3 |
| Images, pages | `row` events; `/api/agent/image/:id`, `/api/agent/media` | 3 |
| Search chips | `tool.result.searchResults` | 3 |
| Routines page | `/api/routines` CRUD, `POST /api/routines/:id/run`, run history with `chatId` | 2 (page move), 3 (`chatId` link) |
| Routine chats in the list (clock mark) | chat index entry `routineId`; `routine.chatId`, `RoutineRun.chatId` | 3 |
| Moved-routines notice | `routine.movedFrom` in `/api/routines`; `PATCH /api/routines/:id` clears it | 2 |
| Chat row menu (rename, delete) | `PATCH` / `DELETE /api/chats/:id` | 3 |
| Library page | `/api/agent/media` | 2 |
| Connectors dialog and its dot | `/api/connectors`, `/api/connections` (state `needsSignIn`) | 2 |
| Bot pane: profile | `PUT /api/shell` `renameBot`, `updateBot` | 2 |
| Bot pane: instructions and counter | `PUT /api/shell` `updateBot`, `GET /api/bots/context` | 2, 3 (engine-measured) |
| Bot pane: memory | `/api/memory` | 2 |
| Bot pane: notifications | `PUT /api/shell` `updateBot {notify}` | 2 |
| Composer model chip | `/api/providers` composer state | 2 |
| Composer folder and permission | `PUT /api/shell` `setWorkspace`, `setPermission`; `/api/workspace` | 2 |
| Attachments | `POST /api/attachments` | 3 (structured parts) |
| Search palette chats | chat index + `GET /api/chats/search?q=` | 2 (titles only), 3 (message text) |
| Notifications, Dock badge | `/api/engine/status` transitions | 3 |
| Earlier bots (Settings) | `GET /api/shell` (archived bots), `PUT /api/shell` `moveNotes`, `removeArchivedBot`; note count from `GET /api/memory?botId=` (`total`, from the store's `countLive`) | 2 |
| Token usage, Providers, Settings | as today | unchanged |
| First-launch note | engine `migration.json` flag in `GET /api/engine/status` (`cleanSlateNotice`) | 3 |

Backend capabilities that have no UI are not allowed. Check at PR 3 review: every route in
`web/app/api/**` and every event type in SPEC 6.2 appears in the table above, or is listed as
internal (SPEC 6.5) or as health and auth.

## 10. Removed UI (complete list)

Bot rail rows and pinned bot cards; sections, Unassigned and Hidden groups; row menu items Pin,
Move, Hide, New section; New Bot button and the create-bot and create-group dialogs; group
settings and members; the new-chat bot picker (`NewChatPickerView`); the onboarding "New bot" card;
sub-agent cards, runs and waiting card; handoff and post strips; fan-out and profile proposal
cards; group avatar stack; reviewer role row; Bots and Groups in search; the rail's
"SUB-AGENTS WORKING" subtitle.

## 11. Keyboard

⌘N new chat, ⌘K search, ⌘R reload chat, ⌘. stop the running turn, ⌘⌫ delete the selected chat
(with the confirm dialog), ⌘↑ / ⌘↓ previous and next chat in the list.

## 12. Verification

Screenshots (light and dark) of: sidebar with all five chat states, row menu, rename, delete
confirm, Routines page, Library page, Bot pane, search palette with a message hit, an approval from
another chat, Earlier bots. A 30 fps recording of: sending a message while another chat's routine
runs (its row turns to working, then reply ready, then the notification), and of deleting the open
chat. All in Useful Bot Dev with its one bot.
