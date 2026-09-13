"use client";

import { useRef } from "react";
import {
  AVATAR_COLORS,
  AVATAR_SHAPES,
  AVATAR_SWATCHES,
  defaultFaceFor,
  randomFace,
} from "../../shared/bot-face.ts";
import { DEFAULT_BOT_ID, type BotProfilePatch, type ShellBot } from "../../shared/shell-store.ts";
import { BotAvatar, BotFace } from "./bot-avatar";

async function readFaceImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  const data = canvas.toDataURL("image/jpeg", 0.82);
  if (data.length > 120_000) throw new Error("image_large");
  return data;
}

export function BotFacePicker({
  bot,
  onPatch,
}: {
  bot: ShellBot;
  onPatch: (patch: BotProfilePatch) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="face-picker">
      <div className="flex justify-center pb-1">
        <BotAvatar bot={bot} size="xl" />
      </div>
      <input
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void readFaceImage(file)
            .then((image) => onPatch({ avatarImage: image, avatarCustom: true }))
            .catch(() => undefined);
        }}
        ref={fileRef}
        type="file"
      />
      <div className="face-picker-tabs" role="tablist">
        <span className="face-picker-tab face-picker-tab-active">Bot</span>
        <button
          className="face-picker-tab"
          onClick={() => {
            const face = randomFace();
            onPatch({
              avatarShape: face.shape,
              avatarColor: face.color,
              avatarImage: null,
              avatarCustom: true,
            });
          }}
          type="button"
        >
          Generate
        </button>
        <button className="face-picker-tab" onClick={() => fileRef.current?.click()} type="button">
          Upload
        </button>
        <button
          className="face-picker-tab"
          onClick={() => {
            if (bot.id === DEFAULT_BOT_ID) {
              onPatch({
                avatarShape: "circle",
                avatarColor: "ink",
                avatarImage: null,
                avatarCustom: false,
              });
              return;
            }
            const face = defaultFaceFor(bot.id);
            onPatch({
              avatarShape: face.shape,
              avatarColor: face.color,
              avatarImage: null,
              avatarCustom: true,
            });
          }}
          type="button"
        >
          Reset
        </button>
      </div>
      <div className="face-grid">
        {AVATAR_SHAPES.map((shape) => {
          const selected = bot.avatarCustom && !bot.avatarImage && bot.avatarShape === shape;
          return (
            <button
              aria-label={`${shape} face`}
              aria-pressed={selected}
              className={selected ? "face-swatch face-swatch-on" : "face-swatch"}
              key={shape}
              onClick={() => onPatch({ avatarShape: shape, avatarCustom: true, avatarImage: null })}
              type="button"
            >
              <BotFace color={bot.avatarColor} shape={shape} size={36} />
            </button>
          );
        })}
      </div>
      <div className="face-dots">
        {AVATAR_COLORS.map((color) => {
          const selected = bot.avatarColor === color;
          return (
            <button
              aria-label={`${color} color`}
              aria-pressed={selected}
              className={selected ? "face-dot face-dot-on" : "face-dot"}
              key={color}
              onClick={() => onPatch({ avatarColor: color, avatarCustom: true })}
              style={{ background: AVATAR_SWATCHES[color] }}
              type="button"
            />
          );
        })}
      </div>
    </div>
  );
}
