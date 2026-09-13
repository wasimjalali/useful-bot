export const SHELL_SCHEMA = 1;
export const DEFAULT_BOT_ID = "bot-useful";
export const UNASSIGNED_SECTION = "unassigned";
export const HIDDEN_SECTION = "hidden";

const NAME_MAX = 80;
const LABEL_MAX = 24;
const DESCRIPTION_MAX = 500;

export type BotKind = "bot" | "group";

export type ShellBot = {
  id: string;
  kind: BotKind;
  name: string;
  label: string;
  description: string;
  notify: boolean;
  pinned: boolean;
  hidden: boolean;
  sectionId: string | null;
  sessionId: string | null;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ShellSection = {
  id: string;
  name: string;
  collapsed: boolean;
  order: number;
};

export type ShellStore = {
  schemaVersion: 1;
  selectedBotId: string;
  collapsedUnassigned: boolean;
  collapsedHidden: boolean;
  bots: ShellBot[];
  sections: ShellSection[];
};

export type ShellAction =
  | { type: "select"; botId: string }
  | {
      type: "createBot";
      name: string;
      label?: string;
      description?: string;
      sectionId?: string | null;
      kind?: BotKind;
    }
  | { type: "createGroup"; name: string; memberIds: string[]; sectionId?: string | null }
  | { type: "createSection"; name: string }
  | { type: "renameBot"; botId: string; name: string }
  | { type: "renameSection"; sectionId: string; name: string }
  | {
      type: "updateBot";
      botId: string;
      patch: Partial<Pick<ShellBot, "name" | "label" | "description" | "notify" | "memberIds">>;
    }
  | { type: "pin"; botId: string; pinned?: boolean }
  | { type: "hide"; botId: string; hidden?: boolean }
  | { type: "deleteBot"; botId: string }
  | { type: "deleteSection"; sectionId: string }
  | { type: "move"; botId: string; sectionId: string | null }
  | { type: "setSession"; botId: string; sessionId: string | null }
  | { type: "newChat"; botId?: string }
  | { type: "toggleSection"; sectionId: string };

const STORE_KEYS = new Set([
  "schemaVersion",
  "selectedBotId",
  "collapsedUnassigned",
  "collapsedHidden",
  "bots",
  "sections",
]);

const BOT_KEYS = new Set([
  "id",
  "kind",
  "name",
  "label",
  "description",
  "notify",
  "pinned",
  "hidden",
  "sectionId",
  "sessionId",
  "memberIds",
  "createdAt",
  "updatedAt",
]);

const SECTION_KEYS = new Set(["id", "name", "collapsed", "order"]);

export function nowIso(at = new Date()): string {
  return at.toISOString();
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function requireName(value: string, max = NAME_MAX): string {
  const name = clip(value, max);
  if (!name) throw new Error("shell_name_required");
  return name;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}

export function seedStore(at = new Date()): ShellStore {
  const stamp = nowIso(at);
  return {
    schemaVersion: 1,
    selectedBotId: DEFAULT_BOT_ID,
    collapsedUnassigned: false,
    collapsedHidden: true,
    sections: [],
    bots: [
      {
        id: DEFAULT_BOT_ID,
        kind: "bot",
        name: "Useful Bot",
        label: "",
        description: "Local personal agent on this Mac.",
        notify: false,
        pinned: false,
        hidden: false,
        sectionId: null,
        sessionId: null,
        memberIds: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  };
}

function parseBot(raw: unknown): ShellBot {
  if (!raw || typeof raw !== "object") throw new Error("shell_bot_invalid");
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!BOT_KEYS.has(key)) throw new Error(`shell_bot_unknown_key:${key}`);
  }
  if (!isId(rec.id)) throw new Error("shell_bot_id");
  if (rec.kind !== "bot" && rec.kind !== "group") throw new Error("shell_bot_kind");
  if (typeof rec.name !== "string") throw new Error("shell_bot_name");
  if (typeof rec.label !== "string") throw new Error("shell_bot_label");
  if (typeof rec.description !== "string") throw new Error("shell_bot_description");
  if (typeof rec.notify !== "boolean") throw new Error("shell_bot_notify");
  if (typeof rec.pinned !== "boolean") throw new Error("shell_bot_pinned");
  if (typeof rec.hidden !== "boolean") throw new Error("shell_bot_hidden");
  if (rec.sectionId !== null && !isId(rec.sectionId)) throw new Error("shell_bot_section");
  if (rec.sessionId !== null && typeof rec.sessionId !== "string") throw new Error("shell_bot_session");
  if (!Array.isArray(rec.memberIds) || rec.memberIds.some((id) => typeof id !== "string")) {
    throw new Error("shell_bot_members");
  }
  if (typeof rec.createdAt !== "string" || typeof rec.updatedAt !== "string") {
    throw new Error("shell_bot_dates");
  }
  return {
    id: rec.id,
    kind: rec.kind,
    name: clip(rec.name, NAME_MAX) || rec.id,
    label: clip(rec.label, LABEL_MAX),
    description: clip(rec.description, DESCRIPTION_MAX),
    notify: rec.notify,
    pinned: rec.pinned,
    hidden: rec.hidden,
    sectionId: rec.sectionId,
    sessionId: rec.sessionId,
    memberIds: rec.memberIds.filter((id, index, all) => all.indexOf(id) === index),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function parseSection(raw: unknown): ShellSection {
  if (!raw || typeof raw !== "object") throw new Error("shell_section_invalid");
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!SECTION_KEYS.has(key)) throw new Error(`shell_section_unknown_key:${key}`);
  }
  if (!isId(rec.id) || rec.id === UNASSIGNED_SECTION || rec.id === HIDDEN_SECTION) {
    throw new Error("shell_section_id");
  }
  if (typeof rec.name !== "string") throw new Error("shell_section_name");
  if (typeof rec.collapsed !== "boolean") throw new Error("shell_section_collapsed");
  if (typeof rec.order !== "number" || !Number.isInteger(rec.order)) throw new Error("shell_section_order");
  return {
    id: rec.id,
    name: clip(rec.name, NAME_MAX) || "Section",
    collapsed: rec.collapsed,
    order: rec.order,
  };
}

export function parseShell(raw: unknown): ShellStore {
  if (!raw || typeof raw !== "object") throw new Error("shell_invalid");
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!STORE_KEYS.has(key)) throw new Error(`shell_unknown_key:${key}`);
  }
  if (rec.schemaVersion !== SHELL_SCHEMA) throw new Error("shell_schema");
  if (!Array.isArray(rec.bots) || !Array.isArray(rec.sections)) throw new Error("shell_shape");
  const bots = rec.bots.map(parseBot);
  const sections = rec.sections.map(parseSection);
  if (bots.length === 0) throw new Error("shell_empty");
  const botIds = new Set(bots.map((bot) => bot.id));
  if (botIds.size !== bots.length) throw new Error("shell_bot_duplicate");
  const sectionIds = new Set(sections.map((section) => section.id));
  if (sectionIds.size !== sections.length) throw new Error("shell_section_duplicate");
  for (const bot of bots) {
    if (bot.sectionId && !sectionIds.has(bot.sectionId)) bot.sectionId = null;
    bot.memberIds = bot.memberIds.filter((id) => botIds.has(id) && id !== bot.id);
  }
  const selectedBotId = isId(rec.selectedBotId) && botIds.has(rec.selectedBotId)
    ? rec.selectedBotId
    : bots[0].id;
  return {
    schemaVersion: 1,
    selectedBotId,
    collapsedUnassigned: rec.collapsedUnassigned === true,
    collapsedHidden: rec.collapsedHidden !== false,
    bots,
    sections: sections.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
  };
}

function touch(bot: ShellBot, at: string, patch: Partial<ShellBot>): ShellBot {
  return { ...bot, ...patch, updatedAt: at };
}

function uniqueName(store: ShellStore, base: string): string {
  const names = new Set(store.bots.map((bot) => bot.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let n = 2;
  while (names.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

function nextOrder(store: ShellStore): number {
  return store.sections.reduce((max, section) => Math.max(max, section.order), -1) + 1;
}

function selectFallback(store: ShellStore, removedId: string): string {
  if (store.selectedBotId !== removedId && store.bots.some((bot) => bot.id === store.selectedBotId)) {
    return store.selectedBotId;
  }
  const visible = store.bots.find((bot) => !bot.hidden);
  return (visible ?? store.bots[0]).id;
}

export function applyShellAction(
  store: ShellStore,
  action: ShellAction,
  at = new Date(),
): { store: ShellStore; createdId?: string } {
  const stamp = nowIso(at);
  switch (action.type) {
    case "select": {
      if (!store.bots.some((bot) => bot.id === action.botId)) throw new Error("shell_bot_missing");
      return { store: { ...store, selectedBotId: action.botId } };
    }
    case "createBot": {
      const id = crypto.randomUUID();
      const bot: ShellBot = {
        id,
        kind: action.kind === "group" ? "group" : "bot",
        name: uniqueName(store, requireName(action.name)),
        label: clip(action.label ?? "", LABEL_MAX),
        description: clip(action.description ?? "", DESCRIPTION_MAX),
        notify: false,
        pinned: false,
        hidden: false,
        sectionId: action.sectionId && store.sections.some((section) => section.id === action.sectionId)
          ? action.sectionId
          : null,
        sessionId: null,
        memberIds: [],
        createdAt: stamp,
        updatedAt: stamp,
      };
      return {
        store: { ...store, selectedBotId: id, bots: [bot, ...store.bots] },
        createdId: id,
      };
    }
    case "createGroup": {
      const members = action.memberIds.filter((id, index, all) => (
        all.indexOf(id) === index && store.bots.some((bot) => bot.id === id)
      ));
      const id = crypto.randomUUID();
      const group: ShellBot = {
        id,
        kind: "group",
        name: uniqueName(store, requireName(action.name)),
        label: "Group",
        description: "",
        notify: false,
        pinned: false,
        hidden: false,
        sectionId: action.sectionId && store.sections.some((section) => section.id === action.sectionId)
          ? action.sectionId
          : null,
        sessionId: null,
        memberIds: members,
        createdAt: stamp,
        updatedAt: stamp,
      };
      return {
        store: { ...store, selectedBotId: id, bots: [group, ...store.bots] },
        createdId: id,
      };
    }
    case "createSection": {
      const id = crypto.randomUUID();
      const section: ShellSection = {
        id,
        name: requireName(action.name),
        collapsed: false,
        order: nextOrder(store),
      };
      return { store: { ...store, sections: [...store.sections, section] }, createdId: id };
    }
    case "renameBot": {
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId ? touch(bot, stamp, { name: requireName(action.name) }) : bot
          )),
        },
      };
    }
    case "renameSection": {
      return {
        store: {
          ...store,
          sections: store.sections.map((section) => (
            section.id === action.sectionId ? { ...section, name: requireName(action.name) } : section
          )),
        },
      };
    }
    case "updateBot": {
      const patch: Partial<ShellBot> = {};
      if (action.patch.name !== undefined) {
        const name = clip(action.patch.name, NAME_MAX);
        if (name) patch.name = name;
      }
      if (action.patch.label !== undefined) patch.label = clip(action.patch.label, LABEL_MAX);
      if (action.patch.description !== undefined) patch.description = clip(action.patch.description, DESCRIPTION_MAX);
      if (action.patch.notify !== undefined) patch.notify = action.patch.notify;
      if (action.patch.memberIds !== undefined) {
        patch.memberIds = action.patch.memberIds.filter((id, index, all) => (
          all.indexOf(id) === index && id !== action.botId && store.bots.some((bot) => bot.id === id)
        ));
      }
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (bot.id === action.botId ? touch(bot, stamp, patch) : bot)),
        },
      };
    }
    case "pin": {
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId
              ? touch(bot, stamp, { pinned: action.pinned ?? !bot.pinned, hidden: false })
              : bot
          )),
        },
      };
    }
    case "hide": {
      const nextHidden = action.hidden ?? true;
      const bots = store.bots.map((bot) => (
        bot.id === action.botId
          ? touch(bot, stamp, { hidden: nextHidden, pinned: nextHidden ? false : bot.pinned })
          : bot
      ));
      const next = { ...store, bots };
      if (nextHidden) next.selectedBotId = selectFallback(next, action.botId);
      return { store: next };
    }
    case "deleteBot": {
      if (store.bots.length <= 1) throw new Error("shell_last_bot");
      if (!store.bots.some((bot) => bot.id === action.botId)) throw new Error("shell_bot_missing");
      const bots = store.bots
        .filter((bot) => bot.id !== action.botId)
        .map((bot) => (
          bot.memberIds.includes(action.botId)
            ? touch(bot, stamp, { memberIds: bot.memberIds.filter((id) => id !== action.botId) })
            : bot
        ));
      const next = { ...store, bots };
      next.selectedBotId = selectFallback(next, action.botId);
      return { store: next };
    }
    case "deleteSection": {
      return {
        store: {
          ...store,
          sections: store.sections.filter((section) => section.id !== action.sectionId),
          bots: store.bots.map((bot) => (
            bot.sectionId === action.sectionId ? touch(bot, stamp, { sectionId: null }) : bot
          )),
        },
      };
    }
    case "move": {
      const sectionId = action.sectionId
        && store.sections.some((section) => section.id === action.sectionId)
        ? action.sectionId
        : null;
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId ? touch(bot, stamp, { sectionId, hidden: false }) : bot
          )),
        },
      };
    }
    case "setSession": {
      return {
        store: {
          ...store,
          bots: store.bots.map((bot) => (
            bot.id === action.botId ? touch(bot, stamp, { sessionId: action.sessionId }) : bot
          )),
        },
      };
    }
    case "newChat": {
      const id = crypto.randomUUID();
      const bot: ShellBot = {
        id,
        kind: "bot",
        name: uniqueName(store, "New chat"),
        label: "Chat",
        description: "",
        notify: false,
        pinned: false,
        hidden: false,
        sectionId: null,
        sessionId: null,
        memberIds: [],
        createdAt: stamp,
        updatedAt: stamp,
      };
      return {
        store: { ...store, selectedBotId: id, bots: [bot, ...store.bots] },
        createdId: id,
      };
    }
    case "toggleSection": {
      if (action.sectionId === UNASSIGNED_SECTION) {
        return { store: { ...store, collapsedUnassigned: !store.collapsedUnassigned } };
      }
      if (action.sectionId === HIDDEN_SECTION) {
        return { store: { ...store, collapsedHidden: !store.collapsedHidden } };
      }
      return {
        store: {
          ...store,
          sections: store.sections.map((section) => (
            section.id === action.sectionId ? { ...section, collapsed: !section.collapsed } : section
          )),
        },
      };
    }
    default:
      throw new Error("shell_action_unknown");
  }
}

export function selectedBot(store: ShellStore): ShellBot {
  return store.bots.find((bot) => bot.id === store.selectedBotId) ?? store.bots[0];
}

export function pinnedBots(store: ShellStore): ShellBot[] {
  return store.bots.filter((bot) => bot.pinned && !bot.hidden);
}

export function sectionBots(store: ShellStore, sectionId: string | null): ShellBot[] {
  return store.bots.filter((bot) => !bot.hidden && !bot.pinned && bot.sectionId === sectionId);
}

export function hiddenBots(store: ShellStore): ShellBot[] {
  return store.bots.filter((bot) => bot.hidden);
}

export function searchBots(store: ShellStore, query: string): ShellBot[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return store.bots.filter((bot) => !bot.hidden);
  return store.bots.filter((bot) => {
    const hay = `${bot.name} ${bot.label} ${bot.description}`.toLowerCase();
    return hay.includes(needle);
  });
}
