import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";
import { brand } from "../brand/tokens";
import captions from "../captions.json";
import { Caption, Label } from "./Caption";
import { Shot, ShotSpec } from "./Shot";

export interface ShotCue {
  spec: ShotSpec;
  /** Seconds from the scene start. */
  at: number;
  seconds: number;
}

export interface SfxCue {
  file: "click" | "keys" | "whoosh" | "thud";
  at: number;
  /** Linear gain; effects sit 12 to 18 dB under the voice (plan section 6). */
  volume?: number;
  seconds?: number;
}

export interface SceneSpec {
  voice: string;
  /** Seconds into the scene where the voice clip starts. */
  voiceAt: number;
  shots: ShotCue[];
  labels?: { lines: string[]; at: number; seconds: number }[];
  sfx?: SfxCue[];
  /** Pause the voice at `at` seconds into the clip for `gap` seconds (the S08 still). */
  voiceGap?: { at: number; gap: number };
}

export const Layout = {
  "16x9": { win: { left: 256, top: 34, width: 1408, height: 880 }, band: { top: 930, height: 130 }, captionSize: 40, captionWidth: 1560 },
  "9x16": { win: { left: 40, top: 240, width: 1000, height: 1000 }, band: { top: 1300, height: 240 }, captionSize: 46, captionWidth: 980 },
} as const;

const SFX_GAIN: Record<SfxCue["file"], number> = { click: 0.35, keys: 0.5, whoosh: 0.18, thud: 0.3 };

/**
 * One scene on the black stage: real footage in the window box, the burned-in
 * caption in the band below it, honesty labels top left of the window, the
 * voice clip and the effects.
 */
export const Stage: React.FC<{ scene: SceneSpec; format: keyof typeof Layout; shotBox?: { width: number; height: number } }> = ({
  scene,
  format,
  shotBox,
}) => {
  const { fps } = useVideoConfig();
  const L = Layout[format];
  const box = shotBox ?? { width: L.win.width, height: L.win.height };
  const raw = (captions as Record<string, { text: string; start: number; end: number }[]>)[scene.voice] ?? [];
  const g = scene.voiceGap;
  const chunks = g ? raw.map((c) => (c.start >= g.at ? { ...c, start: c.start + g.gap, end: c.end + g.gap } : c)) : raw;
  const f = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: brand.stage }}>
      <div
        style={{
          position: "absolute",
          left: L.win.left + (L.win.width - box.width) / 2,
          top: L.win.top + (L.win.height - box.height) / 2,
          width: box.width,
          height: box.height,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        }}
      >
        {scene.shots.map((cue, i) => (
          <Sequence key={i} from={f(cue.at)} durationInFrames={f(cue.seconds)} layout="none">
            <Shot spec={cue.spec} width={box.width} height={box.height} />
          </Sequence>
        ))}
      </div>
      {(scene.labels ?? []).map((l, i) => (
        <Sequence key={`l${i}`} from={f(l.at)} durationInFrames={f(l.seconds)} layout="none">
          <div style={{ position: "absolute", left: L.win.left + (L.win.width - box.width) / 2 + 16, top: L.win.top + (L.win.height - box.height) / 2 + 16 }}>
            <Label lines={l.lines} />
          </div>
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: L.band.top,
          height: L.band.height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sequence from={f(scene.voiceAt)} layout="none">
          <Caption chunks={chunks} fontSize={L.captionSize} maxWidth={L.captionWidth} />
        </Sequence>
      </div>
      {g ? (
        <>
          <Sequence from={f(scene.voiceAt)} durationInFrames={f(g.at)} layout="none">
            <Audio src={staticFile(`voice/${scene.voice}.wav`)} />
          </Sequence>
          <Sequence from={f(scene.voiceAt + g.at + g.gap)} layout="none">
            <Audio src={staticFile(`voice/${scene.voice}.wav`)} trimBefore={f(g.at)} />
          </Sequence>
        </>
      ) : (
        <Sequence from={f(scene.voiceAt)} layout="none">
          <Audio src={staticFile(`voice/${scene.voice}.wav`)} />
        </Sequence>
      )}
      {(scene.sfx ?? []).map((s, i) => (
        <Sequence key={`s${i}`} from={f(s.at)} durationInFrames={s.seconds ? f(s.seconds) : undefined} layout="none">
          <Audio src={staticFile(`sfx/${s.file}.wav`)} volume={s.volume ?? SFX_GAIN[s.file]} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/** A scene whose footage is not recorded yet (preview renders only). */
export const Pending: React.FC<{ id: string }> = ({ id }) => (
  <AbsoluteFill style={{ backgroundColor: "#202020", color: "#888", alignItems: "center", justifyContent: "center", fontSize: 48 }}>
    {id} pending
  </AbsoluteFill>
);
