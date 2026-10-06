import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { MASCOT_INNER, MASCOT_VIEWBOX } from "../brand/mascot-svg";

/**
 * The animated mascot from brand/motion/useful-bot-animated.svg, driven by the
 * frame number. The brand file floats up 7 units and blinks once per 2.8 s
 * cycle (blink at 60 to 68% of the cycle). Here it blinks once, at `blinkAt`
 * seconds, and floats on the same curve.
 */
export const Mascot: React.FC<{ size: number; blinkAt?: number; float?: boolean }> = ({ size, blinkAt = 1.2, float = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // ub-blink: 1 -> 0.08 -> 1 over 8% of 2.8 s (about 224 ms).
  const blinkLen = 0.224;
  const blink = interpolate(t, [blinkAt, blinkAt + blinkLen / 2, blinkAt + blinkLen], [1, 0.08, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // ub-float: rest until 15%, up 7 units by 30%, hold to 78%, back down by 100%.
  const cycle = 2.8;
  const p = ((t % cycle) / cycle) * 100;
  const y = float
    ? interpolate(p, [0, 15, 30, 78, 100], [0, 0, -7, -7, 0], { easing: (x) => 0.5 - Math.cos(Math.PI * x) / 2 })
    : 0;
  const markup = MASCOT_INNER.replace("{{FLOAT}}", y.toFixed(3)).split("{{BLINK}}").join(blink.toFixed(4));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MASCOT_VIEWBOX}
      width={size}
      height={size}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
};
