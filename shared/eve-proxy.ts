import { DEFAULT_BOT_ID } from "./shell-store.ts";
import type { ShellBot, ShellStore } from "./shell-store.ts";
import {
  IMAGE_DATA_URL,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_IMAGE_PARTS,
  type TurnFilePart,
  type TurnMessage,
  type TurnTextPart,
} from "./attachments.ts";
import { resolveRoute, speakersFrom, threadPrefix, type Route, type Speaker } from "./threads.ts";
import type { ThreadKind } from "./agent-store.ts";

/**
 * Session ids are opaque eve identifiers (uuid-shaped). The charset is pinned
 * and dots are excluded so a suffix like `session/..` cannot be interpolated
 * into the upstream URL and normalised into a different path.
 */
const SESSION_ID = "[A-Za-z0-9_-]+";
const SESSION_STREAM = new RegExp(`^session/${SESSION_ID}/stream$`);
const SESSION_ONE = new RegExp(`^session/${SESSION_ID}$`);
const SESSION_CANCEL = new RegExp(`^session/${SESSION_ID}/cancel$`);

export function eveGetAllowed(suffix: string): boolean {
  if (suffix === "health" || suffix === "info") return true;
  return SESSION_STREAM.test(suffix);
}

export function evePostAllowed(suffix: string): boolean {
  if (suffix === "session") return true;
  return SESSION_ONE.test(suffix) || SESSION_CANCEL.test(suffix);
}

export function isEveSessionPost(suffix: string): boolean {
  return suffix === "session" || SESSION_ONE.test(suffix);
}

/**
 * The one upstream error code a client is allowed to see. eve answers 409
 * `session_not_active` for a session that failed or was retired, and the
 * only way forward is a fresh session, so the client has to be told which
 * 409 it got. Every other error body stays behind the proxy: it can carry
 * runtime and prompt detail.
 */
export function relayedEveCode(status: number, body: string): string | null {
  if (status !== 409 || !body) return null;
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return parsed.code === "session_not_active" ? "session_not_active" : null;
  } catch {
    return null;
  }
}

export type SessionRoute = Route & { mentionNames: string[] };

/**
 * The `message` field of a turn as this proxy accepts it: a string, or text
 * parts with image file parts. Anything else is refused here rather than
 * relayed, so eve only ever sees the shapes this build has reasoned about.
 * Returns null for a shape it does not accept.
 */
export function parseTurnMessage(value: unknown): TurnMessage | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts: Array<TurnTextPart | TurnFilePart> = [];
  let images = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    if (rec.type === "text") {
      if (typeof rec.text !== "string" || rec.text.length === 0) return null;
      parts.push({ type: "text", text: rec.text });
      continue;
    }
    if (rec.type === "file") {
      if (typeof rec.data !== "string" || rec.data.length > MAX_IMAGE_DATA_URL_CHARS) return null;
      if (!IMAGE_DATA_URL.test(rec.data)) return null;
      const mediaType = rec.data.slice("data:".length, rec.data.indexOf(";"));
      if (rec.mediaType !== mediaType) return null;
      if (typeof rec.filename !== "string" || rec.filename.length === 0 || rec.filename.length > 120) return null;
      if (++images > MAX_IMAGE_PARTS) return null;
      parts.push({ type: "file", data: rec.data, mediaType, filename: rec.filename });
      continue;
    }
    return null;
  }
  return parts;
}

/** The text of a turn: the string itself, or its text parts joined. */
export function turnText(message: TurnMessage): string {
  if (typeof message === "string") return message;
  return message.filter((part): part is TurnTextPart => part.type === "text").map((part) => part.text).join("\n");
}

export function turnHasImages(message: TurnMessage): boolean {
  return typeof message !== "string" && message.some((part) => part.type === "file");
}

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
    const parsed = parseTurnMessage(json.message);
    message = parsed === null ? "" : turnText(parsed);
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
  const message = parseTurnMessage(json.message);
  if (message === null) throw new Error("eve_message");
  if (!bot || bot.id === DEFAULT_BOT_ID) {
    return JSON.stringify({ message });
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
  if (typeof message === "string") {
    return JSON.stringify({ message: `${prefix}${message}` });
  }
  // The prefix goes on the first text part; the images ride beside it. A
  // turn with only images gets a text part of its own to carry the prefix.
  const first = message.findIndex((part) => part.type === "text");
  const prefixed = first >= 0
    ? message.map((part, index) => (index === first && part.type === "text" ? { ...part, text: `${prefix}${part.text}` } : part))
    : [{ type: "text" as const, text: prefix.trim() }, ...message];
  return JSON.stringify({ message: prefixed });
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
