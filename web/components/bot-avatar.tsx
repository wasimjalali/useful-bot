"use client";

import { DEFAULT_BOT_ID, type ShellBot } from "../../shared/shell-store.ts";
import { type AvatarColor } from "../../shared/bot-face.ts";

const SIZES = { sm: 24, md: 32, lg: 40, xl: 80 } as const;

export function avatarColor(bot: ShellBot): AvatarColor {
  return bot.id === DEFAULT_BOT_ID && !bot.avatarCustom ? "ink" : bot.avatarColor;
}

export function BotFace({ color, size }: { color: AvatarColor; size: number }) {
  return (
    <img
      aria-hidden="true"
      alt=""
      className="shrink-0 object-contain"
      height={size}
      width={size}
      src={`/brand/avatars/${color}.svg`}
    />
  );
}

export function BotAvatar({ bot, size = "sm" }: { bot: ShellBot; size?: keyof typeof SIZES }) {
  // Saved shape/image fields remain readable, but only the mascot is rendered.
  return <BotFace color={avatarColor(bot)} size={SIZES[size]} />;
}
