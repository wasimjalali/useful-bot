import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { font, light, radius } from "../brand/tokens";

// Plan section 4, S03: a caption chip, not UI. Source: LM Studio's Qwen3.8 model
// page (lmstudio.ai/models/qwen3.8, Apache 2.0, released 2026-08-14).
export const LOCAL_CHIP_TEXT = "Works with local models like Qwen3.8-27B in LM Studio";

export const LocalChip: React.FC<{ at?: number }> = ({ at = 0 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [at, at + 12], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        opacity: o,
        transform: `translateY(${y}px)`,
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 22px",
        backgroundColor: light.surface,
        border: `1px solid ${light.borderStrong}`,
        borderRadius: radius.lg,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        fontFamily: font.family,
        fontWeight: font.weight,
        fontSize: 26,
        color: light.ink,
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: light.success }} />
      {LOCAL_CHIP_TEXT}
    </div>
  );
};
