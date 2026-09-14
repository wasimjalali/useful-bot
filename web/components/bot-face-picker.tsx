"use client";

import { AVATAR_COLORS, AVATAR_PALETTE, defaultFaceFor } from "../../shared/bot-face.ts";
import { DEFAULT_BOT_ID, type BotProfilePatch, type ShellBot } from "../../shared/shell-store.ts";
import { avatarColor, BotAvatar, BotFace } from "./bot-avatar";

export function BotFacePicker({ bot, onPatch }: {
  bot: ShellBot;
  onPatch: (patch: BotProfilePatch) => void;
}) {
  return (
    <div className="face-picker">
      <div className="flex justify-center pb-1">
        <BotAvatar bot={bot} size="xl" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold">Avatar color</span>
        <button
          className="btn btn-secondary min-h-10 text-[12px]"
          type="button"
          onClick={() => onPatch({
            avatarColor: bot.id === DEFAULT_BOT_ID ? "ink" : defaultFaceFor(bot.id).color,
            avatarShape: "circle",
            avatarImage: null,
            avatarCustom: bot.id !== DEFAULT_BOT_ID,
          })}
        >
          Reset
        </button>
      </div>
      <div className="avatar-colors" role="group" aria-label="Avatar color">
        {AVATAR_COLORS.map(color => (
          <button
            key={color}
            type="button"
            className="avatar-color"
            aria-label={`${AVATAR_PALETTE[color].label} avatar`}
            aria-pressed={avatarColor(bot) === color}
            onClick={() => onPatch({
              avatarColor: color,
              avatarShape: "circle",
              avatarImage: null,
              avatarCustom: true,
            })}
          >
            <BotFace color={color} size={40} />
            <span>{AVATAR_PALETTE[color].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
