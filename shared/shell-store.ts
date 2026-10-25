import {
  defaultFaceFor,
  isAvatarColor,
  isAvatarShape,
  parseAvatarImage,
  type AvatarColor,
  type AvatarShape,
} from "./bot-face.ts";
import { parseModelSelection, type ModelSelection } from "./session-selection.ts";
import { foldPath } from "./fold-path.ts";
import { APP_STATE_DIR, isAppStateSegment, isRuntimeInstallPath, stackName } from "./stack.ts";

/** Client-safe: this file must never pull in node builtins. */
export type WorkspacePermission = "read_only" | "auto" | "full_access";

/**
 * "guard" is what Auto was called before this build; a store written then
 * still reads as the same posture instead of dropping the grant.
 */
export function parseWorkspacePermission(value: unknown): WorkspacePermission | null {
  if (value === "guard") return "auto";
  return value === "read_only" || value === "auto" || value === "full_access" ? value : null;
}

export const SHELL_SCHEMA = 1;
export const DEFAULT_BOT_ID = "bot-useful";
export const RECENTS_MAX = 40;
export const PREVIEW_MAX = 160;

const NAME_MAX = 80;
const LABEL_MAX = 24;
/** A bot's standing instructions. Over this is refused, never clipped. */
export const DESCRIPTION_MAX = 8000;

export type BotKind = "bot" | "group";

/**
 * The folder this conversation works in. The path is a folder the owner
 * picked in a desktop picker; the permission decides what the agent may do
 * inside it (see `agent/lib/workspace.ts`).
 */
export type BotWorkspace = {
  path: string;
  permission: WorkspacePermission;
};

export type ShellBot = {
  id: string;
  kind: BotKind;
  name: string;
  /** Name while the bot is still being onboarded. Cleared once it has a real one. */
  petname: string | null;
  label: string;
  description: string;
  notify: boolean;
  /**
   * True for a bot from before the app had one bot: the archive migration
   * marks every bot but the default one. An archived bot is hidden, takes no
   * writes and never chats; its record and notes stay until the owner removes
   * it (Settings > Earlier bots).
   */
  archived: boolean;
  archivedAt: string | null;
  sessionId: string | null;
  /**
   * Sessions this bot's chat was carried over from, newest first, recorded
   * only when a replacement session was opened with a brief of the old one
   * (see continuation-brief.ts). The proxy checks a `continueFrom` against
   * the live pointer and this list before it reads an old session. A new
   * chat or an opened recent is a deliberate fresh start and is not recorded.
   */
  previousSessionIds?: string[];
  /** The session the last carry-over opened. */
  continuedSessionId?: string;
  /**
   * True once that session has finished a turn, so its brief is in eve's
   * history. Until then a step-zero failure can have dropped the message that
   * carried it, and sends into the session attach the brief again.
   */
  continuationSettled?: boolean;
  lastPreview: string;
  lastAt: string | null;
  createdAt: string;
  updatedAt: string;
  avatarShape: AvatarShape;
  avatarColor: AvatarColor;
  avatarImage: string | null;
  avatarCustom: boolean;
  /**
   * What this bot may do on this Mac: in the attached folder when there is
   * one, otherwise under the owner's home. The folder is where; this is how
   * much. `workspace.permission` mirrors it for older readers.
   */
  permission: WorkspacePermission;
  workspace: BotWorkspace | null;
  /**
   * The model, connection, effort and speed this bot runs on. Null means it
   * inherits the default (the last pick, as the old global chip resolved it).
   * A bot is pinned only where a pick would otherwise move it: a per-bot chip
   * pick pins every null bot first (ensureBotSelections). Every create path
   * leaves it null, and so does a roster from before this field.
   */
  model: ModelSelection | null;
  /**
   * Counts every write to the profile (name, label, description, avatar). A
   * profile card the owner confirms is bound to the revision it was raised
   * against, so a card that went stale because the profile moved on is
   * refused instead of overwriting the newer text.
   */
  profileRevision: number;
};

export type BotProfilePatch = Partial<
  Pick<
    ShellBot,
    | "name"
    | "petname"
    | "label"
    | "description"
    | "notify"
    | "lastPreview"
    | "avatarShape"
    | "avatarColor"
    | "avatarImage"
    | "avatarCustom"
  >
>;

export type ShellRecent = {
  id: string;
  botId: string;
  title: string;
  sessionId: string | null;
  preview: string;
  updatedAt: string;
};

export type ShellStore = {
  schemaVersion: 1;
  selectedBotId: string;
  bots: ShellBot[];
  recents: ShellRecent[];
};

export type ShellAction =
  | { type: "select"; botId: string }
  | { type: "renameBot"; botId: string; name: string }
  | { type: "nameBot"; botId: string; name: string; label?: string; description?: string; avatarShape?: string; avatarColor?: string }
  | {
      type: "updateBot";
      botId: string;
      patch: BotProfilePatch;
    }
  | { type: "setSession"; botId: string; sessionId: string | null }
  | {
      type: "setWorkspace";
      botId: string;
      workspace: BotWorkspace | null;
    }
  | { type: "setPermission"; botId: string; permission: WorkspacePermission }
  | { type: "touchChat"; botId: string; preview: string; sessionId?: string | null }
  | { type: "newChat"; botId?: string }
  | { type: "clearThread"; botId: string }
  | { type: "openRecent"; recentId: string }
  /** Move the live notes of an archived bot to the default bot (the route does the move). */
  | { type: "moveNotes"; fromBotId: string }
  /** Drop an archived bot's record (the route archives its notes). */
  | { type: "removeArchivedBot"; botId: string };

const ACTION_TYPES = {
  select: true,
  renameBot: true,
  nameBot: true,
  updateBot: true,
  setSession: true,
  setWorkspace: true,
  setPermission: true,
  touchChat: true,
  newChat: true,
  clearThread: true,
  openRecent: true,
  moveNotes: true,
  removeArchivedBot: true,
} satisfies Record<ShellAction["type"], true>;

/**
 * Whether `value` names an action this build takes: one `applyShellAction`
 * runs, or one of the two card confirms (`connectApp`, `connectServer`) the
 * shell route handles itself. Anything else, a removed action included, is
 * refused by the route as `invalid`.
 */
export function isShellActionType(value: unknown): boolean {
  return typeof value === "string"
    && (Object.hasOwn(ACTION_TYPES, value) || value === "connectApp" || value === "connectServer");
}

export function nowIso(at = new Date()): string {
  return at.toISOString();
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

/**
 * The one check every write path runs on a description. Returns the trimmed
 * text and throws `shell_description_too_long` over the cap: a silent clip
 * would change the owner's instructions without telling anyone.
 */
export function checkDescription(value: string, max = DESCRIPTION_MAX): string {
  const text = value.trim();
  if (text.length > max) throw new Error("shell_description_too_long");
  return text;
}

function requireName(value: string, max = NAME_MAX): string {
  const name = clip(value, max);
  if (!name) throw new Error("shell_name_required");
  return name;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}

/**
 * Every description the shipped Generalist (`bot-useful`) has carried, so an
 * untouched one can be recognised and moved to the current text. Append only:
 * when a new text ships, the one it replaces goes here. Found with
 * `git log -p -S` on shared/shell-store.ts, which is the only file that ever
 * seeded it:
 *  - 1f7b7e1, 322f22b, 950dfd7 (2026-09-13): the first shell, "Local personal
 *    agent on this Mac." (name "Useful Bot")
 *  - bd41eed (2026-09-13, #20): added "Creates other bots with a name and
 *    instructions." (name "Useful Bot")
 *  - 3d25c70, 6413804 (2026-09-28, #145): "The starter bot. ..." (name
 *    "Generalist"; 6413804 carries the same change after a rebase)
 *  - generalist-v2 (`GENERALIST_SEED_V2` below): the text that talked about
 *    building a team of bots, replaced when the team features were removed
 */
/** The Generalist's shipped instructions until the team features were removed (`generalist-v2`). */
export const GENERALIST_SEED_V2 = `You're the owner's main assistant on this Mac: research, writing, files, small scripts, diagrams and work in their connected apps. You also help them build a small team of bots for jobs that recur.

How to help:
- Start by doing. Ask one question only when the goal or the target is unclear.
- On longer work, keep the owner posted in short lines, then give the result on its own.
- Be direct and brief. Say plainly when something failed or isn't possible, and what would help.

Preferences:
- Show a draft before anything goes out in the owner's name.
- Say what you'll change before a large edit.
- When the owner is new, explain the app only as far as their task needs.`;

export const GENERALIST_SEEDS: readonly string[] = [
  "Local personal agent on this Mac.",
  "Local personal agent on this Mac. Creates other bots with a name and instructions.",
  "The starter bot. General work on this Mac, and creates other bots with a name and instructions.",
  GENERALIST_SEED_V2,
];

/** The Generalist's shipped instructions today (`generalist-v3`). Owner-editable. */
export const GENERALIST_SEED_V3 = `You're the owner's main assistant on this Mac: research, writing, files, small scripts, diagrams and work in their connected apps.

How to help:
- Start by doing. Ask one question only when the goal or the target is unclear.
- On longer work, keep the owner posted in short lines, then give the result on its own.
- Be direct and brief. Say plainly when something failed or isn't possible, and what would help.

Preferences:
- Show a draft before anything goes out in the owner's name.
- Say what you'll change before a large edit.
- When the owner is new, explain the app only as far as their task needs.`;

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** The one bot's name. It is fixed: the owner can't rename it. */
export const DEFAULT_BOT_NAME = "Useful Bot";

/**
 * A pure overlay for the one bot only: it always reads as "Useful Bot" (an
 * archived one keeps its name), and a description that is still one of the
 * shipped seeds reads as the current text. Nothing is written here; the
 * change persists with the next normal write.
 */
function overlaySeed(bot: ShellBot): ShellBot {
  if (bot.id !== DEFAULT_BOT_ID || bot.kind !== "bot") return bot;
  const named = bot.archived || bot.name === DEFAULT_BOT_NAME ? bot : { ...bot, name: DEFAULT_BOT_NAME };
  const wanted = squash(bot.description);
  if (!GENERALIST_SEEDS.some((seed) => squash(seed) === wanted)) return named;
  return { ...named, description: GENERALIST_SEED_V3 };
}

function assertNameNotFixed(botId: string): void {
  if (botId === DEFAULT_BOT_ID) throw new Error("shell_bot_name_fixed");
}

export function seedStore(at = new Date()): ShellStore {
  const stamp = nowIso(at);
  return {
    schemaVersion: 1,
    selectedBotId: DEFAULT_BOT_ID,
    bots: [
      {
        id: DEFAULT_BOT_ID,
        kind: "bot",
        name: DEFAULT_BOT_NAME,
        petname: null,
        label: "",
        description: GENERALIST_SEED_V3,
        notify: false,
        archived: false,
        archivedAt: null,
        sessionId: null,
        lastPreview: "",
        lastAt: null,
        createdAt: stamp,
        updatedAt: stamp,
        avatarShape: "circle",
        avatarColor: "ink",
        avatarImage: null,
        avatarCustom: false,
        permission: "auto",
        workspace: null,
        model: null,
        profileRevision: 0,
      },
    ],
    recents: [],
  };
}

function parseBot(raw: unknown): ShellBot {
  if (!raw || typeof raw !== "object") throw new Error("shell_bot_invalid");
  const rec = raw as Record<string, unknown>;
  // Unknown fields are ignored so a newer build's store stays readable here;
  // a full-store overwrite is no longer accepted over the API.
  if (!isId(rec.id)) throw new Error("shell_bot_id");
  if (rec.kind !== "bot" && rec.kind !== "group") throw new Error("shell_bot_kind");
  if (typeof rec.name !== "string") throw new Error("shell_bot_name");
  if (typeof rec.label !== "string") throw new Error("shell_bot_label");
  if (typeof rec.description !== "string") throw new Error("shell_bot_description");
  if (typeof rec.notify !== "boolean") throw new Error("shell_bot_notify");
  if (rec.sessionId !== null && typeof rec.sessionId !== "string") throw new Error("shell_bot_session");
  if (rec.archived !== undefined && typeof rec.archived !== "boolean") throw new Error("shell_bot_archived_flag");
  if (rec.archivedAt !== undefined && rec.archivedAt !== null && typeof rec.archivedAt !== "string") {
    throw new Error("shell_bot_archived_at");
  }
  if (typeof rec.createdAt !== "string" || typeof rec.updatedAt !== "string") {
    throw new Error("shell_bot_dates");
  }
  if (rec.lastPreview !== undefined && typeof rec.lastPreview !== "string") {
    throw new Error("shell_bot_preview");
  }
  if (rec.lastAt !== undefined && rec.lastAt !== null && typeof rec.lastAt !== "string") {
    throw new Error("shell_bot_last_at");
  }
  const face = defaultFaceFor(rec.id);
  return {
    id: rec.id,
    kind: rec.kind,
    name: clip(rec.name, NAME_MAX) || rec.id,
    petname: typeof rec.petname === "string" ? clip(rec.petname, NAME_MAX) || null : null,
    label: clip(rec.label, LABEL_MAX),
    // Kept verbatim, whatever the length. A throw here makes readShell reseed
    // the whole store; the cap is enforced when a description is written and
    // when a turn is sent, not when the file is read.
    description: rec.description.trim(),
    notify: rec.notify,
    archived: rec.archived === true,
    archivedAt: rec.archived === true && typeof rec.archivedAt === "string" ? rec.archivedAt : null,
    sessionId: rec.sessionId,
    ...(Array.isArray(rec.previousSessionIds)
      ? {
        previousSessionIds: rec.previousSessionIds
          .filter((id): id is string => typeof id === "string" && SESSION_ID.test(id))
          .slice(0, PREVIOUS_SESSIONS_MAX),
      }
      : {}),
    ...(typeof rec.continuedSessionId === "string" && SESSION_ID.test(rec.continuedSessionId)
      ? { continuedSessionId: rec.continuedSessionId }
      : {}),
    ...(rec.continuationSettled === true ? { continuationSettled: true } : {}),
    lastPreview: typeof rec.lastPreview === "string" ? clip(rec.lastPreview, PREVIEW_MAX) : "",
    lastAt: typeof rec.lastAt === "string" ? rec.lastAt : null,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    avatarShape: isAvatarShape(rec.avatarShape) ? rec.avatarShape : face.shape,
    avatarColor: isAvatarColor(rec.avatarColor) ? rec.avatarColor : face.color,
    avatarImage: parseAvatarImage(rec.avatarImage),
    avatarCustom: typeof rec.avatarCustom === "boolean" ? rec.avatarCustom : rec.id !== DEFAULT_BOT_ID,
    // A roster written before the permission lived on the bot carried it on
    // the folder; that value is kept rather than reset to the default.
    permission: parseWorkspacePermission(rec.permission)
      ?? parseWorkspace(rec.workspace)?.permission
      ?? "auto",
    workspace: parseWorkspace(rec.workspace),
    model: parseModelSelection(rec.model),
    profileRevision: typeof rec.profileRevision === "number"
      && Number.isInteger(rec.profileRevision)
      && rec.profileRevision >= 0
      ? rec.profileRevision
      : 0,
  };
}

/**
 * Tolerant: a malformed workspace field is no workspace, never a failure.
 *
 * Screened the same way a write is. A hand-edited roster naming `/` or a
 * credential folder would otherwise parse into a bot field the grants store
 * then refuses, which turns one bot's chat into a turn that cannot start.
 * Reading it as no folder is the honest answer: the owner reattaches.
 */
function parseWorkspace(raw: unknown): BotWorkspace | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.path !== "string" || !isGrantableRootPath(rec.path)) return null;
  const permission = parseWorkspacePermission(rec.permission);
  if (!permission) return null;
  return { path: rec.path, permission };
}

/**
 * A grant path is a capability root: absolute, bounded, and not a folder whose
 * own name says it holds credentials. The route validates the filesystem side
 * (real directory, not a symlink); this is the shape rule, and it is the same
 * rule the grants store applies, so a bot field can never carry a path the
 * grant built from it would reject.
 */
function assertGrantableRootPath(path: unknown): string {
  if (typeof path !== "string" || path.length > 1024 || !isGrantableRootPath(path)) {
    throw new Error("workspace_path_invalid");
  }
  return path;
}

/**
 * Strict on writes: an unknown permission word must fail the action, not
 * silently become Auto. The read path above stays tolerant — a newer build's
 * store stays readable — but a write with a value this build does not know is
 * a caller bug.
 */
function parseWorkspacePermissionStrict(value: unknown): WorkspacePermission {
  const parsed = parseWorkspacePermission(value);
  if (!parsed) throw new Error("workspace_permission_invalid");
  return parsed;
}

/**
 * Screen a folder root by PATH SEGMENT before it becomes a grant. A folder
 * named `my.github-project` is fine; one whose own name is `.ssh`, `secrets`
 * or `auth.json` is where credentials live, so it is refused at attach time.
 * Anything under the granted root keeps the substring screen in
 * `resolveWorkspacePath`.
 */
/**
 * The session ids whose folder grant an action just invalidated.
 *
 * A grant is keyed by eve session id, so it stops being the owner's decision
 * the moment a bot stops holding that session. Rather than listing the actions
 * that do it — `newChat`, `clearThread`, `removeArchivedBot`, but also
 * `touchChat`, `setSession` and `openRecent`, which rotate a session quietly —
 * this diffs the roster: every session id a bot held before the commit and
 * nobody holds after it. A session that simply moved between bots is still
 * held, so it survives. A detach keeps its session id, which the diff cannot
 * see, so that one case is named.
 */
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PREVIOUS_SESSIONS_MAX = 5;

/**
 * Whether a turn may be carried over from `sessionId`:
 * - "allowed": it is the bot's live session, or the session the last
 *   carry-over opened (the client may hold that one before its pointer write
 *   lands).
 * - "moved": it was already carried over into a newer session. Carrying it
 *   over again would fork the chat, so the client is told to catch up.
 * - "refused": anything else. Fails closed, so a crafted id cannot read
 *   another bot's conversation.
 */
export function continueFromVerdict(bot: ShellBot, sessionId: string): "allowed" | "moved" | "refused" {
  if (!SESSION_ID.test(sessionId)) return "refused";
  // First: a session already carried over stays moved even while some
  // client's pointer still names it.
  if ((bot.previousSessionIds ?? []).includes(sessionId)) return "moved";
  if (bot.sessionId === sessionId || bot.continuedSessionId === sessionId) return "allowed";
  return "refused";
}

/**
 * Record that `botId`'s chat moved on from `previous` into `continued`,
 * newest first, bounded, and move the live pointer in the same locked write:
 * a gap between the lineage and the pointer let a second client carry the
 * same session over again and fork the chat.
 */
export function recordSessionLineage(store: ShellStore, botId: string, previous: string, continued: string): ShellStore {
  return {
    ...store,
    bots: store.bots.map((bot) => {
      if (bot.id !== botId) return bot;
      const rest = (bot.previousSessionIds ?? []).filter((id) => id !== previous);
      return {
        ...bot,
        sessionId: continued,
        previousSessionIds: [previous, ...rest].slice(0, PREVIOUS_SESSIONS_MAX),
        continuedSessionId: continued,
        continuationSettled: false,
      };
    }),
  };
}

/**
 * Record a verified carry-over, unless another one got there first: the
 * pointer no longer names the session this one came from. Then nothing is
 * recorded and `lost` says so, so the caller can answer `session_moved`
 * instead of handing back a session the chat will not use.
 */
export function carryOverLineage(
  store: ShellStore,
  botId: string,
  previous: string,
  created: string,
): { store: ShellStore; lost: boolean } {
  const now = store.bots.find((item) => item.id === botId);
  if (now && now.sessionId && now.sessionId !== previous) return { store, lost: true };
  return { store: recordSessionLineage(store, botId, previous, created), lost: false };
}

/** The carried-over session finished a turn: its brief is in eve's history. */
export function settleContinuation(store: ShellStore, botId: string, sessionId: string): ShellStore {
  return {
    ...store,
    bots: store.bots.map((bot) => (
      bot.id === botId && bot.continuedSessionId === sessionId ? { ...bot, continuationSettled: true } : bot
    )),
  };
}

export function staleSessionIds(
  action: ShellAction | undefined,
  before: ShellStore,
  after: ShellStore,
): string[] {
  if (!action) return [];
  const stale = new Set<string>();
  const held = new Set(
    after.bots.map((bot) => bot.sessionId).filter((id): id is string => Boolean(id)),
  );
  for (const bot of before.bots) {
    if (bot.sessionId && !held.has(bot.sessionId)) stale.add(bot.sessionId);
  }
  if (action.type === "setWorkspace" && !action.workspace) {
    const session = after.bots.find((bot) => bot.id === action.botId)?.sessionId;
    if (session) stale.add(session);
  }
  return [...stale];
}

export function isGrantableRootPath(path: string): boolean {
  if (!path.startsWith("/") || path.length > 1024) return false;
  // The filesystem root has no segments to screen, so every check below would
  // pass it while it covers every credential store on the machine. A grant is
  // a folder the owner picked, never the whole disk.
  if (path.replace(/\/+$/, "") === "") return false;
  // The runtime install folders span three segments (Library/Application
  // Support/Useful Bot[ Dev]), so they cannot be a per-segment name.
  if (isRuntimeInstallPath(path)) return false;
  for (const segment of path.split("/")) {
    if (!segment) continue;
    if (segment === "..") return false;
    const lowered = foldPath(segment);
    if (isForbiddenGrantSegment(lowered)) return false;
  }
  return true;
}

/**
 * Credential stores with one exact name. Screened per path segment rather than
 * as a substring, so `.dockerignore` at a project root stays readable while
 * `.docker/config.json` does not. Used for the grant root and, in
 * `resolveWorkspacePath`, for everything under it.
 */
const FORBIDDEN_CHILD_SEGMENTS = new Set([
  // The app's own stores: approvals, the roster, the grants. A bot that
  // could edit these could approve itself. This is the exact name only;
  // `isForbiddenChildSegment` adds the dashed siblings (.useful-bot-dev,
  // .useful-bot-dev-app), so go through it rather than `.has()`.
  APP_STATE_DIR,
  // Shell startup files: a line planted in one runs in the owner's own
  // shell next time they open a terminal, outside every gate here.
  ".zshenv", ".zprofile", ".zshrc", ".zlogin", ".zlogout",
  ".bash_profile", ".bashrc", ".bash_login", ".bash_logout", ".profile",
  ".inputrc", ".hushlogin", "config.fish",
  ".docker",
  ".kube",
  ".pypirc",
  ".authinfo",
  ".netrc",
  ".npmrc",
  "keychains",
  "id_rsa",
  "id_ecdsa",
  "id_ed25519",
]);

/** A segment that is a credential store or one of the app's own state folders. */
export function isForbiddenChildSegment(lowered: string): boolean {
  return FORBIDDEN_CHILD_SEGMENTS.has(lowered) || isAppStateSegment(lowered);
}

const FORBIDDEN_GRANT_SEGMENTS = new Set([
  ...FORBIDDEN_CHILD_SEGMENTS,
  ".env",
  ".ssh",
  ".aws",
  ".gnupg",
  ".git",
  "auth.json",
  "secrets",
  "launchagents",
  // Only the root gets these: `keychain` and `cookies` name real stores on
  // macOS, and a folder called either is not a project. Under the root the
  // substring screen already covers `Library/Keychains` and `Library/Cookies`
  // without refusing a `cookies` directory in someone's source tree.
  "keychain",
  "netrc",
  "cookies",
]);

function isForbiddenGrantSegment(lowered: string): boolean {
  return FORBIDDEN_GRANT_SEGMENTS.has(lowered) || isAppStateSegment(lowered);
}

function parseRecent(raw: unknown): ShellRecent {
  if (!raw || typeof raw !== "object") throw new Error("shell_recent_invalid");
  const rec = raw as Record<string, unknown>;
  if (!isId(rec.id)) throw new Error("shell_recent_id");
  if (!isId(rec.botId)) throw new Error("shell_recent_bot");
  if (typeof rec.title !== "string") throw new Error("shell_recent_title");
  if (rec.sessionId !== null && typeof rec.sessionId !== "string") throw new Error("shell_recent_session");
  if (typeof rec.preview !== "string") throw new Error("shell_recent_preview");
  if (typeof rec.updatedAt !== "string") throw new Error("shell_recent_date");
  return {
    id: rec.id,
    botId: rec.botId,
    title: clip(rec.title, NAME_MAX) || "Chat",
    sessionId: rec.sessionId,
    preview: clip(rec.preview, PREVIEW_MAX),
    updatedAt: rec.updatedAt,
  };
}

export function parseShell(raw: unknown): ShellStore {
  if (!raw || typeof raw !== "object") throw new Error("shell_invalid");
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== SHELL_SCHEMA) throw new Error("shell_schema");
  if (!Array.isArray(rec.bots)) throw new Error("shell_shape");
  if (rec.recents !== undefined && !Array.isArray(rec.recents)) throw new Error("shell_recents");
  const parsed = rec.bots.map(parseBot);
  const bots = parsed.map((bot) => overlaySeed(bot));
  const recents = (rec.recents ?? []).map(parseRecent);
  if (bots.length === 0) throw new Error("shell_empty");
  const botIds = new Set(bots.map((bot) => bot.id));
  if (botIds.size !== bots.length) throw new Error("shell_bot_duplicate");
  // An archived bot is never the selected one: it takes no chats.
  const active = bots.filter((bot) => !bot.archived);
  const selectedBotId = isId(rec.selectedBotId) && active.some((bot) => bot.id === rec.selectedBotId)
    ? rec.selectedBotId
    : (active.find((bot) => bot.id === DEFAULT_BOT_ID) ?? active[0] ?? bots[0]).id;
  return {
    schemaVersion: 1,
    selectedBotId,
    bots,
    recents: recents.filter((item, index, all) => {
      if (!botIds.has(item.botId)) return false;
      return all.findIndex((other) => other.id === item.id) === index;
    }).slice(0, RECENTS_MAX),
  };
}

const PROFILE_KEYS = ["name", "label", "description", "avatarShape", "avatarColor", "avatarImage"] as const;

function touch(bot: ShellBot, at: string, patch: Partial<ShellBot>): ShellBot {
  // Every profile write bumps the revision the owner's profile card is bound
  // to; a write that changes nothing does not.
  const profileChanged = PROFILE_KEYS.some((key) => key in patch && patch[key] !== bot[key]);
  return {
    ...bot,
    ...patch,
    updatedAt: at,
    ...(profileChanged ? { profileRevision: bot.profileRevision + 1 } : {}),
  };
}

/**
 * The bots the perf guard drives in the dev stack (perf/fixtures.dev.lock.json
 * names them). They stay unarchived there until PR 3 replaces them with
 * fixture chats. The runtime does not carry perf/, so the names are kept here
 * and a test holds them to the lock file.
 */
export const PERF_FIXTURE_BOT_NAMES: readonly string[] = ["Perf Long Replies", "Perf Long Tools", "Perf Short A", "Perf Short B"];

/** A perf fixture bot, in the dev stack only. Anywhere else it is a bot like any other. */
export function isPerfFixtureBot(bot: Pick<ShellBot, "kind" | "name" | "id">): boolean {
  return bot.kind === "bot"
    && bot.id !== DEFAULT_BOT_ID
    && PERF_FIXTURE_BOT_NAMES.includes(bot.name)
    && stackName() === "dev";
}

/**
 * The archive migration, pure: every bot but the default one (and, in the dev
 * stack, the perf fixtures) and every group becomes archived, nothing is
 * deleted, and the default bot is seeded if it is missing. Idempotent: a bot
 * that is archived keeps its first `archivedAt`, so a second run changes
 * nothing. `moved` names the bots whose routines move to the default bot.
 */
export function archiveEarlierBots(
  store: ShellStore,
  at = new Date(),
): { store: ShellStore; moved: Array<{ id: string; name: string }>; changed: boolean } {
  const stamp = nowIso(at);
  const moved: Array<{ id: string; name: string }> = [];
  let changed = false;
  let bots = store.bots.map((bot) => {
    if (bot.id === DEFAULT_BOT_ID || isPerfFixtureBot(bot)) return bot;
    moved.push({ id: bot.id, name: bot.name });
    if (bot.archived && bot.archivedAt) return bot;
    changed = true;
    return { ...bot, archived: true, archivedAt: bot.archivedAt ?? stamp };
  });
  if (!bots.some((bot) => bot.id === DEFAULT_BOT_ID)) {
    bots = [seedStore(at).bots[0], ...bots];
    changed = true;
  }
  const selectedBotId = DEFAULT_BOT_ID;
  if (store.selectedBotId !== selectedBotId) changed = true;
  return { store: { ...store, selectedBotId, bots }, moved, changed };
}

/** A bot that is archived takes no writes: nothing chats with it, edits it or points a session at it. */
function assertNotArchived(store: Pick<ShellStore, "bots">, botId: string): void {
  if (store.bots.some((bot) => bot.id === botId && bot.archived)) throw new Error("shell_bot_archived");
}

function pushRecent(store: ShellStore, bot: ShellBot, stamp: string): ShellRecent[] {
  if (!bot.sessionId && !bot.lastPreview) return store.recents;
  const next: ShellRecent = {
    id: crypto.randomUUID(),
    botId: bot.id,
    title: clip(bot.lastPreview, NAME_MAX) || bot.name,
    sessionId: bot.sessionId,
    preview: clip(bot.lastPreview, PREVIEW_MAX),
    updatedAt: bot.lastAt ?? stamp,
  };
  const recents = store.recents.filter((item) => (
    !(item.botId === bot.id && item.sessionId === bot.sessionId)
  ));
  return [next, ...recents].slice(0, RECENTS_MAX);
}

export function applyShellAction(
  store: ShellStore,
  action: ShellAction,
  at = new Date(),
): { store: ShellStore } {
  const stamp = nowIso(at);
  switch (action.type) {
    case "select": {
      // Kept for the dev stack's perf harness: the app has one bot, so only the
      // default bot passes, and the perf fixtures in the dev stack.
      const bot = store.bots.find((item) => item.id === action.botId);
      if (!bot) throw new Error("shell_bot_missing");
      if (bot.id !== DEFAULT_BOT_ID && !isPerfFixtureBot(bot)) throw new Error("shell_bot_forbidden");
      return { store: { ...store, selectedBotId: action.botId } };
    }
    case "nameBot": {
      assertNotArchived(store, action.botId);
      assertNameNotFixed(action.botId);
      const name = clip(action.name, NAME_MAX);
      if (!name) throw new Error("shell_name_required");
      const patch: Partial<ShellBot> = { name };
      if (action.label !== undefined) patch.label = clip(action.label, LABEL_MAX);
      if (action.description !== undefined) patch.description = checkDescription(action.description);
      if (action.avatarShape !== undefined && isAvatarShape(action.avatarShape)) {
        patch.avatarShape = action.avatarShape;
        patch.avatarCustom = true;
      }
      if (action.avatarColor !== undefined && isAvatarColor(action.avatarColor)) {
        patch.avatarColor = action.avatarColor;
        patch.avatarCustom = true;
      }
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (bot.id === action.botId ? touch(bot, stamp, patch) : bot)),
        },
      };
    }
    case "renameBot": {
      assertNotArchived(store, action.botId);
      assertNameNotFixed(action.botId);
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId ? touch(bot, stamp, { name: requireName(action.name) }) : bot
          )),
        },
      };
    }
    case "updateBot": {
      assertNotArchived(store, action.botId);
      const patch: Partial<ShellBot> = {};
      if (action.patch.name !== undefined) {
        if (action.botId === DEFAULT_BOT_ID && clip(action.patch.name, NAME_MAX) !== DEFAULT_BOT_NAME) assertNameNotFixed(action.botId);
        const name = clip(action.patch.name, NAME_MAX);
        if (name) patch.name = name;
      }
      if (action.patch.petname !== undefined) {
        patch.petname = typeof action.patch.petname === "string"
          ? clip(action.patch.petname, NAME_MAX) || null
          : null;
      }
      if (action.patch.label !== undefined) patch.label = clip(action.patch.label, LABEL_MAX);
      if (action.patch.description !== undefined) patch.description = checkDescription(action.patch.description);
      if (action.patch.notify !== undefined) patch.notify = action.patch.notify;
      if (action.patch.lastPreview !== undefined) {
        patch.lastPreview = clip(action.patch.lastPreview, PREVIEW_MAX);
        patch.lastAt = stamp;
      }
      if (action.patch.avatarShape !== undefined && isAvatarShape(action.patch.avatarShape)) {
        patch.avatarShape = action.patch.avatarShape;
      }
      if (action.patch.avatarColor !== undefined && isAvatarColor(action.patch.avatarColor)) {
        patch.avatarColor = action.patch.avatarColor;
      }
      if (action.patch.avatarImage !== undefined) {
        patch.avatarImage = parseAvatarImage(action.patch.avatarImage);
      }
      if (action.patch.avatarCustom !== undefined) patch.avatarCustom = action.patch.avatarCustom;
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (bot.id === action.botId ? touch(bot, stamp, patch) : bot)),
        },
      };
    }
    case "setSession": {
      assertNotArchived(store, action.botId);
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            // A page loaded before a carry-over names the retired session in
            // its address; it must not put that back over the live one.
            bot.id === action.botId
              ? touch(bot, stamp, {
                sessionId: action.sessionId && (bot.previousSessionIds ?? []).includes(action.sessionId)
                  ? bot.sessionId
                  : action.sessionId,
              })
              : bot
          )),
        },
      };
    }
    case "setWorkspace": {
      if (!store.bots.some((bot) => bot.id === action.botId)) throw new Error("shell_bot_missing");
      assertNotArchived(store, action.botId);
      // The route validates the folder exists before calling; the store only
      // enforces shape. An explicit null detaches the folder.
      const workspace = action.workspace === null ? null : {
        path: assertGrantableRootPath(action.workspace.path),
        permission: parseWorkspacePermissionStrict(action.workspace.permission),
      } satisfies BotWorkspace | null;
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId
              // The folder carries the same permission as the bot: one value,
              // written in both places, so neither reader can disagree.
              ? touch(bot, stamp, { workspace, ...(workspace ? { permission: workspace.permission } : {}) })
              : bot
          )),
        },
      };
    }
    case "setPermission": {
      if (!store.bots.some((bot) => bot.id === action.botId)) throw new Error("shell_bot_missing");
      assertNotArchived(store, action.botId);
      const permission = parseWorkspacePermissionStrict(action.permission);
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId
              ? touch(bot, stamp, {
                permission,
                workspace: bot.workspace ? { ...bot.workspace, permission } : null,
              })
              : bot
          )),
        },
      };
    }
    case "touchChat": {
      assertNotArchived(store, action.botId);
      const preview = clip(action.preview, PREVIEW_MAX);
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId
              ? touch(bot, stamp, {
                lastPreview: preview,
                lastAt: stamp,
                // A session the chat was carried over from is behind it for
                // good: a late write naming one must not pull the pointer
                // back off the newer session.
                sessionId: action.sessionId !== undefined
                  && !(action.sessionId && (bot.previousSessionIds ?? []).includes(action.sessionId))
                  ? action.sessionId
                  : bot.sessionId,
              })
              : bot
          )),
        },
      };
    }
    case "newChat": {
      const botId = action.botId ?? store.selectedBotId;
      const bot = store.bots.find((item) => item.id === botId);
      if (!bot) throw new Error("shell_bot_missing");
      assertNotArchived(store, botId);
      const recents = pushRecent(store, bot, stamp);
      // "New chat" clears the bot row, but the bot's agent transcript is the
      // durable handoff log and is cleared separately.
      return {
        store: {
          ...store,
          selectedBotId: botId,
          recents,
          bots: store.bots.map((item) => (
            item.id === botId ? touch(item, stamp, { sessionId: null, lastPreview: "", lastAt: null }) : item
          )),
        },
      };
    }
    case "clearThread": {
      const bot = store.bots.find((item) => item.id === action.botId);
      if (!bot) throw new Error("shell_bot_missing");
      assertNotArchived(store, action.botId);
      const recents = pushRecent(store, bot, stamp);
      return {
        store: {
          ...store,
          recents,
          bots: store.bots.map((item) => (
            item.id === action.botId
              ? touch(item, stamp, { sessionId: null, lastPreview: "", lastAt: null })
              : item
          )),
        },
      };
    }
    case "openRecent": {      const recent = store.recents.find((item) => item.id === action.recentId);
      if (!recent) throw new Error("shell_recent_missing");
      const bot = store.bots.find((item) => item.id === recent.botId);
      if (!bot) {
        return { store: { ...store, recents: store.recents.filter((item) => item.id !== action.recentId) } };
      }
      assertNotArchived(store, bot.id);
      let recents = store.recents;
      if (bot.sessionId && bot.sessionId !== recent.sessionId) {
        recents = pushRecent(store, bot, stamp);
      }
      return {
        store: {
          ...store,
          selectedBotId: bot.id,
          recents,
          bots: store.bots.map((item) => (
            item.id === bot.id
              ? touch(item, stamp, {
                sessionId: recent.sessionId,
                lastPreview: recent.preview,
                lastAt: recent.updatedAt,
              })
              : item
          )),
        },
      };
    }
    case "moveNotes": {
      // The route moves the notes; this only says whether the move is allowed.
      const bot = store.bots.find((item) => item.id === action.fromBotId);
      if (!bot) throw new Error("shell_bot_missing");
      if (bot.id === DEFAULT_BOT_ID || isPerfFixtureBot(bot)) throw new Error("shell_bot_forbidden");
      if (!bot.archived) throw new Error("shell_bot_not_archived");
      return { store };
    }
    case "removeArchivedBot": {
      const bot = store.bots.find((item) => item.id === action.botId);
      if (!bot) throw new Error("shell_bot_missing");
      if (bot.id === DEFAULT_BOT_ID || isPerfFixtureBot(bot)) throw new Error("shell_bot_forbidden");
      if (!bot.archived) throw new Error("shell_bot_not_archived");
      return {
        store: {
          ...store,
          bots: store.bots.filter((item) => item.id !== action.botId),
          recents: store.recents.filter((item) => item.botId !== action.botId),
        },
      };
    }
    default:
      throw new Error("shell_action_unknown");
  }
}

/**
 * Give every bot that has no selection the one passed in (the last pick as it
 * stands now). Bots that already chose are untouched, so it is idempotent.
 */
export function freezeNullSelections(store: ShellStore, pick: ModelSelection): ShellStore {
  if (!store.bots.some((bot) => bot.model === null)) return store;
  return {
    ...store,
    bots: store.bots.map((bot) => (bot.model === null ? { ...bot, model: { ...pick } } : bot)),
  };
}

/**
 * Reset every bot pinned to one connection back to "inherit the default"
 * (null). Used when the owner signs that connection out: the bot's chip then
 * shows the new default instead of an unavailable model.
 */
export function clearConnectionSelections(store: ShellStore, connectionId: string): ShellStore {
  if (!store.bots.some((bot) => bot.model?.connectionId === connectionId)) return store;
  return {
    ...store,
    bots: store.bots.map((bot) => (bot.model?.connectionId === connectionId ? { ...bot, model: null } : bot)),
  };
}

/** Set one bot's selection. Only that row changes, so a pick never moves another bot. */
export function withBotSelection(store: ShellStore, botId: string, selection: ModelSelection): ShellStore {
  if (!store.bots.some((bot) => bot.id === botId)) throw new Error("shell_bot_missing");
  return {
    ...store,
    bots: store.bots.map((bot) => (bot.id === botId ? { ...bot, model: { ...selection } } : bot)),
  };
}

export function selectedBot(store: ShellStore): ShellBot {
  return store.bots.find((bot) => bot.id === store.selectedBotId) ?? store.bots[0];
}

export function searchBots(store: ShellStore, query: string): ShellBot[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return store.bots;
  return store.bots.filter((bot) => {
    const hay = `${bot.name} ${bot.label} ${bot.description} ${bot.lastPreview}`.toLowerCase();
    return hay.includes(needle);
  });
}

export type ShellSearchHit =
  | { kind: "new-chat" }
  | { kind: "recent"; recent: ShellRecent; bot: ShellBot | null }
  | { kind: "bot"; bot: ShellBot };

export type SearchTab =
  | "all"
  | "messages"
  | "bots"
  | "files"
  | "links"
  | "routines"
  | "actions";

function matchesNeedle(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle);
}

export function searchShell(store: ShellStore, query: string, tab: SearchTab = "all"): ShellSearchHit[] {
  const needle = query.trim().toLowerCase();
  const hits: ShellSearchHit[] = [];
  if (tab === "all") hits.push({ kind: "new-chat" });

  if (tab === "all" || tab === "messages") {
    const recents = store.recents.filter((recent) => {
      if (!needle) return true;
      const bot = store.bots.find((item) => item.id === recent.botId);
      return matchesNeedle(`${recent.title} ${recent.preview} ${bot?.name ?? ""} ${bot?.label ?? ""}`, needle);
    });
    const recentCap = needle ? recents : recents.slice(0, 8);
    for (const recent of recentCap) {
      hits.push({
        kind: "recent",
        recent,
        bot: store.bots.find((item) => item.id === recent.botId) ?? null,
      });
    }
  }

  if (tab === "files" || tab === "links" || tab === "routines" || tab === "actions") {
    return hits;
  }

  if (tab === "all" || tab === "bots") {
    const bots = store.bots.filter((bot) => {
      if (!needle) return true;
      return matchesNeedle(`${bot.name} ${bot.label} ${bot.description} ${bot.lastPreview}`, needle);
    });
    for (const bot of bots) hits.push({ kind: "bot", bot });
  }
  return hits;
}

/**
 * Records a bot's current chat and its last preview when a turn settles or a
 * chat is made current (SPEC 5.4). The engine calls it under the shell lock
 * through `updateShell`. W3 implements it with the v2 shell schema.
 */
export function setBotChat(store: ShellStore, botId: string, chatId: string | null, preview: string | null, at: string): ShellStore {
  void store; void botId; void chatId; void preview; void at;
  throw new Error("setBotChat_not_implemented");
}
