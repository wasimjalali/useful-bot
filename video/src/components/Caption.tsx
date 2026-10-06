import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { brand, font } from "../brand/tokens";

export interface CaptionChunk {
  text: string;
  /** Seconds from the scene start, from the speech-to-text word timings. */
  start: number;
  end: number;
}

/**
 * Burned-in caption: white Inter Semibold on a soft black pill, radius 16
 * (plan section 7). It sits in the caption band below the app window, so it
 * never covers the composer, a card or typed text.
 */
export const Caption: React.FC<{ chunks: CaptionChunk[]; fontSize?: number; maxWidth?: number }> = ({
  chunks,
  fontSize = 40,
  maxWidth = 1560,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const chunk = chunks.find((c) => t >= c.start - 0.05 && t < c.end + 0.25);
  if (!chunk) return null;
  const fade = 6 / fps;
  const opacity = interpolate(t, [chunk.start - 0.05, chunk.start - 0.05 + fade, chunk.end + 0.25 - fade, chunk.end + 0.25], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity,
        maxWidth,
        fontFamily: font.family,
        fontWeight: font.weight,
        fontSize,
        lineHeight: 1.3,
        color: brand.white,
        backgroundColor: brand.pill,
        borderRadius: 16,
        padding: `${Math.round(fontSize * 0.32)}px ${Math.round(fontSize * 0.7)}px`,
        textAlign: "center",
      }}
    >
      {chunk.text}
    </div>
  );
};

/** A small honesty label ("Sign-in shortened", "Replies: ChatGPT"), top left of the window. */
export const Label: React.FC<{ lines: string[] }> = ({ lines }) => (
  <div style={{ display: "flex", gap: 10 }}>
    {lines.map((line) => (
      <span
        key={line}
        style={{
          fontFamily: font.family,
          fontWeight: font.weight,
          fontSize: 22,
          color: brand.white,
          backgroundColor: brand.pill,
          borderRadius: 999,
          padding: "7px 16px",
        }}
      >
        {line}
      </span>
    ))}
  </div>
);
