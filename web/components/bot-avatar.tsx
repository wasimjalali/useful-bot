"use client";

import { DEFAULT_BOT_ID, type ShellBot } from "../../shared/shell-store.ts";
import { UsefulBotMark } from "./useful-bot-logo";

const TONES = [
  { bg: "var(--sunken)", fg: "var(--ink)" },
  { bg: "var(--accent-soft)", fg: "var(--ink)" },
  { bg: "var(--success-soft)", fg: "var(--success)" },
  { bg: "var(--warning-soft)", fg: "var(--warning)" },
  { bg: "var(--danger-soft)", fg: "var(--danger)" },
  { bg: "var(--brand)", fg: "var(--brand-ink)" },
] as const;

const SIZES = {
  sm: "size-6 text-[9px] rounded-md",
  md: "size-8 text-[10px] rounded-xl",
  lg: "size-10 text-[11px] rounded-2xl",
} as const;

function toneFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % TONES.length;
  return TONES[hash];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "UB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function BotAvatar({
  bot,
  size = "sm",
}: {
  bot: ShellBot;
  size?: keyof typeof SIZES;
}) {
  const box = SIZES[size];
  if (bot.id === DEFAULT_BOT_ID) {
    return (
      <span className={`grid shrink-0 place-items-center bg-brand ${box}`}>
        <UsefulBotMark tone="dark" className={size === "sm" ? "h-3.5 w-auto" : "h-5 w-auto"} />
      </span>
    );
  }
  const tone = toneFor(bot.id);
  if (bot.kind === "group") {
    return (
      <span className={`relative grid shrink-0 place-items-center ${box}`} style={{ background: tone.bg, color: tone.fg }}>
        <span className="font-semibold tracking-[-0.04em]">{initialsFor(bot.name)}</span>
      </span>
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center font-semibold tracking-[-0.04em] ${box}`}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {initialsFor(bot.name)}
    </span>
  );
}
