import { DEFAULT_BOT_ID } from "./shell-store.ts";
import type { ShellBot, ShellStore } from "./shell-store.ts";
import { resolveRoute, speakersFrom, threadPrefix, type Route, type Speaker } from "./threads.ts";
import type { ThreadKind } from "./agent-store.ts";

export function eveGetAllowed(suffix: string): boolean {
  if (suffix === "health" || suffix === "info") return true;
  return /^session\/[^/]+\/stream$/.test(suffix);
}

export function evePostAllowed(suffix: string): boolean {
  if (suffix === "session") return true;
  if (/^session\/[^/]+$/.test(suffix)) return true;
  return /^session\/[^/]+\/cancel$/.test(suffix);
}

export function isEveSessionPost(suffix: string): boolean {
  return suffix === "session" || /^session\/[^/]+$/.test(suffix);
}

export type SessionRoute = Route & { mentionNames: string[] };

/**
 * Resolve the bot or group an eve turn belongs to, plus its @mentions, from the
 * stored shell. The caller hands the route back to the UI so the transcript can
 * attribute the reply to the bot that actually answered.
 */
export function eveSessionRoute(raw: string, store: ShellStore): SessionRoute | null {
  let botId = "";
  let message = "";
  try {
    const json = JSON.parse(raw) as { botId?: unknown; message?: unknown };
    botId = typeof json.botId === "string" ? json.botId : "";
    message = typeof json.message === "string" ? json.message : "";
  } catch {
    return null;
  }
  const bot = store.bots.find((item) => item.id === botId) ?? null;
  const speakers = speakersFrom(store.bots);
  // An unknown botId is an error, never a silent remap to whichever bot is
  // selected: rewriting the turn as another bot would misattribute the reply.
  if (!bot) return null;
  const route = resolveRoute({
    botId: bot.id,
    text: message,
    bots: speakers,
    memberIds: bot.memberIds,
  });
  const mentionNames = route.mentionIds
    .map((id) => speakers.find((speaker) => speaker.id === id)?.name ?? "")
    .filter((name) => name.length > 0);
  return { ...route, mentionNames };
}

/**
 * Full turn rewrite: bot or group identity, the resolved group roster, and the
 * targeted member when the owner used an @mention. Empty for the default bot, so
 * the verified 1:1 path is byte identical.
 */
export function rewriteEveTurnBody(
  raw: string,
  bot: ShellBot | null,
  route: SessionRoute | null,
  members: Speaker[] = [],
): string {
  const json = JSON.parse(raw) as { message?: unknown };
  if (typeof json.message !== "string") throw new Error("eve_message");
  if (!bot || bot.id === DEFAULT_BOT_ID) {
    return JSON.stringify({ message: json.message });
  }
  const prefix = threadPrefix({
    bot: {
      id: bot.id,
      kind: bot.kind,
      name: bot.name,
      label: bot.label,
      description: bot.description,
    },
    members: members.length > 0 ? members : undefined,
    mentionNames: route?.mentionNames ?? [],
  });
  return JSON.stringify({ message: `${prefix}${json.message}` });
}

export function sessionRouteHeader(route: SessionRoute | null): string | null {
  if (!route) return null;
  try {
    return Buffer.from(JSON.stringify(route), "utf8").toString("base64url");
  } catch {
    return null;
  }
}

export function parseSessionRouteHeader(value: string | null): SessionRoute | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as SessionRoute;
    if (!parsed || (parsed.kind !== "bot" && parsed.kind !== "group")) return null;
    return {
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : "",
      kind: parsed.kind as ThreadKind,
      mentionIds: Array.isArray(parsed.mentionIds)
        ? parsed.mentionIds.filter((id): id is string => typeof id === "string")
        : [],
      mentionNames: Array.isArray(parsed.mentionNames)
        ? parsed.mentionNames.filter((name): name is string => typeof name === "string")
        : [],
      untargeted: parsed.untargeted === true,
    };
  } catch {
    return null;
  }
}
