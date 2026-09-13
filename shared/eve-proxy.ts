import { DEFAULT_BOT_ID } from "./shell-store.ts";

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

export function personaPrefix(bot: {
  id: string;
  kind: string;
  name: string;
  description: string;
} | null): string {
  if (!bot || bot.id === DEFAULT_BOT_ID) return "";
  if (bot.kind === "group") {
    return `This is a group chat named ${bot.name}. Reply as Useful Bot coordinating the group.\n\n`;
  }
  const job = bot.description.trim() || "Help the owner.";
  return `You are ${bot.name}. Follow these instructions: ${job}\n\n`;
}

export function rewriteEveSessionBody(
  raw: string,
  bot: { id: string; kind: string; name: string; description: string } | null,
): string {
  const json = JSON.parse(raw) as { message?: unknown };
  if (typeof json.message !== "string") throw new Error("eve_message");
  return JSON.stringify({ message: `${personaPrefix(bot)}${json.message}` });
}
