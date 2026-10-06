import React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";

/**
 * Footage is the dev app's window at 2x. The recorder sizes itself from the
 * window frame when it starts, so takes differ slightly (3148 to 3200 pixels
 * wide); each take's size is in TAKE_SIZE and covers are drawn on the
 * 3156 x 1972 reference and scaled to the take.
 */
export const REF_W = 3156;
export const TAKE_SIZE: Record<string, [number, number]> = {
  "take-02-cold-signin.mp4": [3156, 1972],
  "take-6.mp4": [3148, 1968],
  "take-7.mp4": [3156, 1972],
  "take-8.mp4": [3176, 1984],
  "short-s06-pane.mp4": [3200, 2000],
  "short-s06-pane-b.mp4": [3200, 2000],
  "short-s08-menu.mp4": [3200, 2000],
  "short-s03-local-d.mp4": [3200, 2620],
  "short-s09-finder.mp4": [2198, 1238],
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotSpec {
  /** File under public/footage (a symlink to ~/UB001-footage, kept out of git). */
  src: string;
  /** Seconds into the take where this shot starts. Played at 1x, never sped up. */
  from: number;
  /** Region of the footage shown, in footage pixels. Defaults to the whole window. */
  crop?: Rect;
  /** Crop at the end of the shot, for a push-in or pull-back. */
  cropTo?: Rect;
  /** Seconds the move takes from the shot start (default: the whole shot). */
  moveSeconds?: number;
  /** Footage-pixel overlays that keep personal or dev-only details out of frame. */
  covers?: Cover[];
}

export type Cover =
  // Paint a flat rectangle in the surrounding colour (" Dev" after the rail label).
  | { kind: "fill"; rect: Rect; color: string; radius?: number }
  // Three inactive traffic lights, drawn where the capture indicator sits.
  | { kind: "lights"; color: string; ring: string; bg: string; rect: Rect };

// The capture indicator covers the traffic lights; the rail label says "Useful
// Bot Dev" where the release says "Useful Bot"; the account badge carries the
// owner's initials. These three covers repeat on every full-window shot.
export const WINDOW_COVERS: Cover[] = [
  { kind: "lights", rect: { x: 0, y: 8, w: 160, h: 62 }, bg: "#F3F3F3", color: "#DCDCDC", ring: "#CDCDCD" },
  { kind: "fill", rect: { x: 244, y: 116, w: 64, h: 54 }, color: "#F3F3F3" },
  { kind: "fill", rect: { x: 40, y: 1884, w: 46, h: 40 }, color: "#F0F0F0", radius: 8 },
];

const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
});

/**
 * One piece of real footage, shown in a box of `width` x `height` CSS pixels.
 * The crop is scaled to cover the box (same aspect expected), and any covers
 * ride along in footage space so they stay locked to the UI under them.
 */
export const Shot: React.FC<{ spec: ShotSpec; width: number; height: number; radius?: number }> = ({
  spec,
  width,
  height,
  radius = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [FOOT_W, FOOT_H] = TAKE_SIZE[spec.src] ?? (() => { throw new Error(`no size for ${spec.src}`); })();
  const k = FOOT_W / REF_W;
  const full: Rect = { x: 0, y: 0, w: FOOT_W, h: FOOT_H };
  const a = spec.crop ?? full;
  const b = spec.cropTo ?? a;
  const moveFrames = Math.max(1, Math.round((spec.moveSeconds ?? durationInFrames / fps) * fps));
  const p = interpolate(frame, [0, moveFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const r = lerpRect(a, b, p);
  const scale = Math.max(width / r.w, height / r.h);
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative", borderRadius: radius }}>
      <AbsoluteFill
        style={{
          width: FOOT_W,
          height: FOOT_H,
          transformOrigin: "0 0",
          transform: `scale(${scale}) translate(${-r.x}px, ${-r.y}px)`,
        }}
      >
        <Video
          src={staticFile(`footage/${spec.src}`)}
          trimBefore={Math.round(spec.from * fps)}
          muted
          style={{ width: FOOT_W, height: FOOT_H }}
        />
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${k})` }}>
        {(spec.covers ?? []).map((c, i) =>
          c.kind === "fill" ? (
            <div
              key={i}
              style={{
                position: "absolute",
                left: c.rect.x,
                top: c.rect.y,
                width: c.rect.w,
                height: c.rect.h,
                backgroundColor: c.color,
                borderRadius: c.radius ?? 0,
              }}
            />
          ) : (
            <div
              key={i}
              style={{
                position: "absolute",
                left: c.rect.x,
                top: c.rect.y,
                width: c.rect.w,
                height: c.rect.h,
                backgroundColor: c.bg,
              }}
            >
              {[30, 76, 122].map((cx) => (
                <div
                  key={cx}
                  style={{
                    position: "absolute",
                    left: cx - 12,
                    top: 38 - 12 - c.rect.y,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: c.color,
                    boxShadow: `inset 0 0 0 1px ${c.ring}`,
                  }}
                />
              ))}
            </div>
          ),
        )}
        </div>
      </AbsoluteFill>
    </div>
  );
};
