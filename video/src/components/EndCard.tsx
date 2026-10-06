import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { brand, font } from "../brand/tokens";
import { Mascot } from "./Mascot";

// Copy, verbatim from the locked per-place copy (memory: useful-bot-tagline,
// "App onboarding welcome") and plan section 4, S10. Mac appears only here.
export const END_CARD = {
  line1: "Your own team of AI bots, on your computer.",
  line2: "Use the AI plan you already pay for.",
  licence: "Free and open source · AGPL-3.0",
  download: "Download for Mac",
  platform: "Apple silicon, macOS 14 or later",
  url: "bot.usefulbuild.com",
} as const;

const FADE = 12; // frames, plan section 4

const fadeIn = (frame: number, at: number) =>
  interpolate(frame, [at, at + FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const EndCard: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const scale = vertical ? 1.15 : 1;
  const text: React.CSSProperties = { fontFamily: font.family, fontWeight: font.weight, color: brand.white, margin: 0 };
  return (
    <AbsoluteFill style={{ backgroundColor: brand.black, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, transform: `scale(${scale})` }}>
        <div style={{ opacity: fadeIn(frame, 0) }}>
          <Mascot size={vertical ? 300 : 240} blinkAt={0.9} />
        </div>
        <Img
          src={staticFile("brand/useful-bot-wordmark.svg")}
          style={{ width: vertical ? 520 : 440, marginTop: 8, opacity: fadeIn(frame, 6) }}
        />
        <div style={{ opacity: fadeIn(frame, 18), marginTop: 30, textAlign: "center" }}>
          <p style={{ ...text, fontSize: 34, lineHeight: 1.3, color: brand.white }}>{END_CARD.line1}</p>
          <p style={{ ...text, fontSize: 34, lineHeight: 1.3, color: brand.muted }}>{END_CARD.line2}</p>
        </div>
        <p style={{ ...text, fontSize: 28, marginTop: 30, opacity: fadeIn(frame, 30) }}>{END_CARD.licence}</p>
        <div
          style={{
            opacity: fadeIn(frame, 42),
            marginTop: 34,
            display: "flex",
            flexDirection: vertical ? "column" : "row",
            alignItems: "center",
            gap: vertical ? 16 : 22,
          }}
        >
          <span
            style={{
              ...text,
              fontSize: 28,
              color: brand.black,
              backgroundColor: brand.white,
              borderRadius: 999,
              padding: "14px 30px",
            }}
          >
            {END_CARD.download}
          </span>
          <span style={{ ...text, fontSize: 24, color: brand.muted }}>{END_CARD.platform}</span>
        </div>
        <p style={{ ...text, fontSize: 26, marginTop: 28, color: brand.white, opacity: fadeIn(frame, 54) }}>{END_CARD.url}</p>
      </div>
    </AbsoluteFill>
  );
};
