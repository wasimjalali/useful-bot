export type ShellKind = "bot" | "group";

export interface ShellSection {
  id: string;
  name: string;
  order: number;
}

export interface ShellBot {
  id: string;
  name: string;
  label: string;
  description: string;
  notify: boolean;
  pinned: boolean;
  hidden: boolean;
  sectionId: string | null;
  hue: number;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShellGroup {
  id: string;
  name: string;
  botIds: string[];
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShellState {
  schemaVersion: 1;
  operatorName: string;
  activeKind: ShellKind;
  activeId: string;
  bots: ShellBot[];
  sections: ShellSection[];
  groups: ShellGroup[];
}

export interface BotSettingsInput {
  name?: string;
  label?: string;
  description?: string;
  notify?: boolean;
}

const UNASSIGNED = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 240) {
    throw new Error(`shell_invalid:${field}`);
  }
  return value;
}

function requireId(value: unknown, field: string): string {
  const text = requireString(value, field).trim();
  if (!text || text.length > 80) {
    throw new Error(`shell_invalid:${field}`);
  }
  return text;
}

export function seedShell(now: string = new Date().toISOString()): ShellState {
  return {
    schemaVersion: 1,
    operatorName: "Wasim",
    activeKind: "bot",
    activeId: "bot-useful",
    sections: [{ id: "sec-work", name: "Work", order: 0 }],
    groups: [],
    bots: [
      {
        id: "bot-useful",
        name: "Useful Bot",
        label: "Default",
        description: "Local personal agent on this Mac.",
        notify: true,
        pinned: true,
        hidden: false,
        sectionId: UNASSIGNED,
        hue: 0,
        sessionId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "bot-reviewer",
        name: "Reviewer",
        label: "Read only",
        description: "Same agent for now. Dedicated reviewer turns land in a later PR.",
        notify: false,
        pinned: false,
        hidden: false,
        sectionId: "sec-work",
        hue: 210,
        sessionId: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

export function parseShellState(raw: unknown): ShellState {
  if (!isRecord(raw) || raw.schemaVersion !== 1) {
    throw new Error("shell_schema");
  }
  const operatorName = requireString(raw.operatorName, "operatorName").trim() || "Wasim";
  const activeKind = raw.activeKind === "group" ? "group" : "bot";
  const activeId = requireId(raw.activeId, "activeId");
  if (!Array.isArray(raw.bots) || raw.bots.length === 0) {
    throw new Error("shell_bots");
  }
  const sections = Array.isArray(raw.sections) ? raw.sections.map(parseSection) : [];
  const sectionIds = new Set(sections.map((section) => section.id));
  const bots = raw.bots.map((item) => parseBot(item, sectionIds));
  const botIds = new Set(bots.map((bot) => bot.id));
  const groups = Array.isArray(raw.groups) ? raw.groups.map((item) => parseGroup(item, botIds)) : [];
  const state: ShellState = {
    schemaVersion: 1,
    operatorName,
    activeKind,
    activeId,
    bots,
    sections: sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    groups,
  };
  if (!activeExists(state)) {
    const first = visibleBots(state)[0] ?? state.bots[0];
    state.activeKind = "bot";
    state.activeId = first.id;
  }
  return state;
}

function parseSection(raw: unknown): ShellSection {
  if (!isRecord(raw)) throw new Error("shell_section");
  const order = typeof raw.order === "number" && Number.isInteger(raw.order) ? raw.order : 0;
  return {
    id: requireId(raw.id, "section.id"),
    name: requireString(raw.name, "section.name").trim() || "Section",
    order,
  };
}

function parseBot(raw: unknown, sectionIds: Set<string>): ShellBot {
  if (!isRecord(raw)) throw new Error("shell_bot");
  const sectionId = raw.sectionId === null || raw.sectionId === undefined
    ? null
    : requireId(raw.sectionId, "bot.sectionId");
  if (sectionId && !sectionIds.has(sectionId)) {
    throw new Error("shell_section_missing");
  }
  const hue = typeof raw.hue === "number" && Number.isFinite(raw.hue) ? Math.abs(Math.trunc(raw.hue)) % 360 : 0;
  return {
    id: requireId(raw.id, "bot.id"),
    name: requireString(raw.name, "bot.name").trim() || "Bot",
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : "",
    description: typeof raw.description === "string" ? raw.description.slice(0, 500) : "",
    notify: Boolean(raw.notify),
    pinned: Boolean(raw.pinned),
    hidden: Boolean(raw.hidden),
    sectionId,
    hue,
    sessionId: raw.sessionId === null || raw.sessionId === undefined
      ? null
      : requireString(raw.sessionId, "bot.sessionId"),
    createdAt: requireString(raw.createdAt, "bot.createdAt"),
    updatedAt: requireString(raw.updatedAt, "bot.updatedAt"),
  };
}

function parseGroup(raw: unknown, botIds: Set<string>): ShellGroup {
  if (!isRecord(raw)) throw new Error("shell_group");
  const ids = Array.isArray(raw.botIds)
    ? raw.botIds.filter((id): id is string => typeof id === "string" && botIds.has(id))
    : [];
  return {
    id: requireId(raw.id, "group.id"),
    name: requireString(raw.name, "group.name").trim() || "Group",
    botIds: ids,
    sessionId: raw.sessionId === null || raw.sessionId === undefined
      ? null
      : requireString(raw.sessionId, "group.sessionId"),
    createdAt: requireString(raw.createdAt, "group.createdAt"),
    updatedAt: requireString(raw.updatedAt, "group.updatedAt"),
  };
}

function clone(state: ShellState): ShellState {
  return {
    schemaVersion: 1,
    operatorName: state.operatorName,
    activeKind: state.activeKind,
    activeId: state.activeId,
    bots: state.bots.map((bot) => ({ ...bot })),
    sections: state.sections.map((section) => ({ ...section })),
    groups: state.groups.map((group) => ({ ...group, botIds: group.botIds.slice() })),
  };
}

function touch(bot: ShellBot, now: string): ShellBot {
  return { ...bot, updatedAt: now };
}

export function visibleBots(state: ShellState): ShellBot[] {
  return state.bots.filter((bot) => !bot.hidden);
}

export function pinnedBots(state: ShellState): ShellBot[] {
  return visibleBots(state).filter((bot) => bot.pinned);
}

export function unassignedBots(state: ShellState): ShellBot[] {
  return visibleBots(state).filter((bot) => !bot.pinned && bot.sectionId === null);
}

export function botsInSection(state: ShellState, sectionId: string): ShellBot[] {
  return visibleBots(state).filter((bot) => !bot.pinned && bot.sectionId === sectionId);
}

export function activeExists(state: ShellState): boolean {
  if (state.activeKind === "group") {
    return state.groups.some((group) => group.id === state.activeId);
  }
  return state.bots.some((bot) => bot.id === state.activeId && !bot.hidden);
}

export function activeSessionId(state: ShellState): string | null {
  if (state.activeKind === "group") {
    return state.groups.find((group) => group.id === state.activeId)?.sessionId ?? null;
  }
  return state.bots.find((bot) => bot.id === state.activeId)?.sessionId ?? null;
}

export function activeTitle(state: ShellState): string {
  if (state.activeKind === "group") {
    return state.groups.find((group) => group.id === state.activeId)?.name ?? "Group";
  }
  return state.bots.find((bot) => bot.id === state.activeId)?.name ?? "Useful Bot";
}

export function matchesQuery(bot: ShellBot, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${bot.name} ${bot.label} ${bot.description}`.toLowerCase().includes(needle);
}

export function setActive(state: ShellState, kind: ShellKind, id: string): ShellState {
  const next = clone(state);
  next.activeKind = kind;
  next.activeId = id;
  if (!activeExists(next)) {
    throw new Error("shell_active_missing");
  }
  return next;
}

export function setActiveSession(state: ShellState, sessionId: string | null, now: string = new Date().toISOString()): ShellState {
  const next = clone(state);
  if (next.activeKind === "group") {
    next.groups = next.groups.map((group) => (
      group.id === next.activeId ? { ...group, sessionId, updatedAt: now } : group
    ));
    return next;
  }
  next.bots = next.bots.map((bot) => (
    bot.id === next.activeId ? touch({ ...bot, sessionId }, now) : bot
  ));
  return next;
}

export function newChatForActive(state: ShellState, now: string = new Date().toISOString()): ShellState {
  return setActiveSession(state, null, now);
}

export function pinBot(state: ShellState, id: string, now: string = new Date().toISOString()): ShellState {
  const next = clone(state);
  next.bots = next.bots.map((bot) => (
    bot.id === id ? touch({ ...bot, pinned: !bot.pinned }, now) : bot
  ));
  return next;
}

export function hideBot(state: ShellState, id: string, now: string = new Date().toISOString()): ShellState {
  if (visibleBots(state).length <= 1 && visibleBots(state).some((bot) => bot.id === id)) {
    throw new Error("shell_last_bot");
  }
  const next = clone(state);
  next.bots = next.bots.map((bot) => (
    bot.id === id ? touch({ ...bot, hidden: true, pinned: false }, now) : bot
  ));
  if (!activeExists(next)) {
    const first = visibleBots(next)[0];
    next.activeKind = "bot";
    next.activeId = first.id;
  }
  return next;
}

export function deleteBot(state: ShellState, id: string): ShellState {
  if (state.bots.length <= 1) {
    throw new Error("shell_last_bot");
  }
  if (visibleBots(state).filter((bot) => bot.id !== id).length === 0) {
    throw new Error("shell_last_bot");
  }
  const next = clone(state);
  next.bots = next.bots.filter((bot) => bot.id !== id);
  next.groups = next.groups.map((group) => ({
    ...group,
    botIds: group.botIds.filter((botId) => botId !== id),
  }));
  if (!activeExists(next)) {
    const first = visibleBots(next)[0] ?? next.bots[0];
    next.activeKind = "bot";
    next.activeId = first.id;
  }
  return next;
}

export function renameBot(state: ShellState, id: string, name: string, now: string = new Date().toISOString()): ShellState {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("shell_name");
  const next = clone(state);
  next.bots = next.bots.map((bot) => (
    bot.id === id ? touch({ ...bot, name: trimmed.slice(0, 80) }, now) : bot
  ));
  return next;
}

export function updateBotSettings(
  state: ShellState,
  id: string,
  input: BotSettingsInput,
  now: string = new Date().toISOString(),
): ShellState {
  const next = clone(state);
  next.bots = next.bots.map((bot) => {
    if (bot.id !== id) return bot;
    return touch({
      ...bot,
      name: input.name !== undefined ? (input.name.trim().slice(0, 80) || bot.name) : bot.name,
      label: input.label !== undefined ? input.label.trim().slice(0, 80) : bot.label,
      description: input.description !== undefined ? input.description.trim().slice(0, 500) : bot.description,
      notify: input.notify !== undefined ? input.notify : bot.notify,
    }, now);
  });
  return next;
}

export function moveBot(state: ShellState, id: string, sectionId: string | null, now: string = new Date().toISOString()): ShellState {
  if (sectionId && !state.sections.some((section) => section.id === sectionId)) {
    throw new Error("shell_section_missing");
  }
  const next = clone(state);
  next.bots = next.bots.map((bot) => (
    bot.id === id ? touch({ ...bot, sectionId }, now) : bot
  ));
  return next;
}

export function createSection(state: ShellState, name: string, id: string, now: string = new Date().toISOString()): ShellState {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("shell_name");
  if (state.sections.some((section) => section.id === id)) {
    throw new Error("shell_id");
  }
  const next = clone(state);
  const order = next.sections.reduce((max, section) => Math.max(max, section.order), -1) + 1;
  next.sections.push({ id, name: trimmed.slice(0, 80), order });
  void now;
  return next;
}

export function createBot(
  state: ShellState,
  input: { name: string; label?: string; description?: string; sectionId?: string | null },
  id: string,
  now: string = new Date().toISOString(),
): ShellState {
  const name = input.name.trim();
  if (!name) throw new Error("shell_name");
  if (state.bots.some((bot) => bot.id === id)) {
    throw new Error("shell_id");
  }
  const sectionId = input.sectionId === undefined ? null : input.sectionId;
  if (sectionId && !state.sections.some((section) => section.id === sectionId)) {
    throw new Error("shell_section_missing");
  }
  const next = clone(state);
  next.bots.push({
    id,
    name: name.slice(0, 80),
    label: (input.label ?? "").trim().slice(0, 80),
    description: (input.description ?? "").trim().slice(0, 500),
    notify: false,
    pinned: false,
    hidden: false,
    sectionId,
    hue: (next.bots.length * 47) % 360,
    sessionId: null,
    createdAt: now,
    updatedAt: now,
  });
  next.activeKind = "bot";
  next.activeId = id;
  return next;
}

export function createGroup(
  state: ShellState,
  input: { name: string; botIds: string[] },
  id: string,
  now: string = new Date().toISOString(),
): ShellState {
  const name = input.name.trim();
  if (!name) throw new Error("shell_name");
  const botIds = input.botIds.filter((botId) => state.bots.some((bot) => bot.id === botId));
  if (botIds.length === 0) throw new Error("shell_group_members");
  const next = clone(state);
  next.groups.push({
    id,
    name: name.slice(0, 80),
    botIds,
    sessionId: null,
    createdAt: now,
    updatedAt: now,
  });
  next.activeKind = "group";
  next.activeId = id;
  return next;
}
