"use client";

import { DEFAULT_BOT_ID, type ShellBot } from "../../shared/shell-store.ts";
import {
  AVATAR_SWATCHES,
  eyeFill,
  type AvatarColor,
  type AvatarShape,
} from "../../shared/bot-face.ts";
import { UsefulBotMark } from "./useful-bot-logo";

const SIZES = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 80,
} as const;

function Shape({ shape, fill }: { shape: AvatarShape; fill: string }) {
  switch (shape) {
    case "circle":
      return <circle cx="32" cy="32" r="28" fill={fill} />;
    case "oval":
      return <ellipse cx="32" cy="32" rx="22" ry="28" fill={fill} />;
    case "square":
      return <rect x="6" y="6" width="52" height="52" rx="14" fill={fill} />;
    case "pill":
      return <rect x="4" y="16" width="56" height="32" rx="16" fill={fill} />;
    case "triangle":
      return <path d="M32 8 56 54H8Z" fill={fill} />;
    case "hex":
      return <path d="M32 6 54 19v26L32 58 10 45V19Z" fill={fill} />;
    case "blob":
      return (
        <path
          d="M22 10c8-6 22-4 28 6 6 10 8 22 0 30-7 8-20 12-30 6-11-6-14-20-8-30 4-7 4-8 10-12Z"
          fill={fill}
        />
      );
    case "drop":
      return <path d="M32 6c14 16 20 26 20 36a20 20 0 0 1-40 0c0-10 6-20 20-36Z" fill={fill} />;
  }
}

export function BotFace({
  shape,
  color,
  size,
  image,
}: {
  shape: AvatarShape;
  color: AvatarColor;
  size: number;
  image?: string | null;
}) {
  if (image) {
    return (
      <span
        className="block shrink-0 overflow-hidden bg-sunken"
        style={{ width: size, height: size, borderRadius: size * 0.28 }}
      >
        <img alt="" className="size-full object-cover" src={image} />
      </span>
    );
  }
  const fill = AVATAR_SWATCHES[color];
  const eye = eyeFill(color);
  const eyeY = shape === "pill" ? 30 : shape === "triangle" ? 34 : 30;
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <Shape fill={fill} shape={shape} />
      <circle cx="24" cy={eyeY} fill={eye} r="4.2" />
      <circle cx="40" cy={eyeY} fill={eye} r="4.2" />
    </svg>
  );
}

export function usesBrandMark(bot: ShellBot): boolean {
  return bot.id === DEFAULT_BOT_ID && !bot.avatarCustom && !bot.avatarImage;
}

export function BotAvatar({
  bot,
  size = "sm",
}: {
  bot: ShellBot;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];
  if (usesBrandMark(bot)) {
    const box = size === "sm" ? "size-6 rounded-md" : size === "md" ? "size-8 rounded-xl" : size === "lg" ? "size-10 rounded-2xl" : "size-20 rounded-[22px]";
    return (
      <span className={`grid shrink-0 place-items-center bg-brand ${box}`}>
        <UsefulBotMark tone="dark" className={size === "sm" ? "h-3.5 w-auto" : size === "xl" ? "h-9 w-auto" : "h-5 w-auto"} />
      </span>
    );
  }
  return (
    <BotFace
      color={bot.avatarColor}
      image={bot.avatarImage}
      shape={bot.avatarShape}
      size={px}
    />
  );
}
