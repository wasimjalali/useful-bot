import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import timeline from "./timeline.json";
import { brand } from "./brand/tokens";
import { S01 } from "./scenes/v1.1.3/S01-result";
import { S02 } from "./scenes/v1.1.3/S02-signin";
import { S03 } from "./scenes/v1.1.3/S03-local";
import { S04 } from "./scenes/v1.1.3/S04-ask";
import { S05 } from "./scenes/v1.1.3/S05-propose";
import { S06 } from "./scenes/v1.1.3/S06-pane";
import { S07 } from "./scenes/v1.1.3/S07-handoff";
import { S08 } from "./scenes/v1.1.3/S08-approve";
import { S09 } from "./scenes/v1.1.3/S09-local";
import { S10 } from "./scenes/v1.1.3/S10-endcard";

type Format = "16x9" | "9x16";
type Row = { id: string; start: number; duration: number; voice: string; voiceAt: number };

const SCENES: Record<string, React.FC<{ format: Format }>> = { S01, S02, S03, S04, S05, S06, S07, S08, S09 };

export const totalSeconds = (format: Format) =>
  (timeline as Record<Format, Row[]>)[format].reduce((s, r) => Math.max(s, r.start + r.duration), 0);

/**
 * The film: scenes back to back on the black stage (hard cuts on real clicks,
 * plan section 4), a room-tone bed under everything at about -40 LUFS, and the
 * end card. No music of any kind.
 */
export const Launch: React.FC<{ format: Format }> = ({ format }) => {
  const { fps } = useVideoConfig();
  const rows = (timeline as Record<Format, Row[]>)[format];
  const f = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: brand.stage }}>
      {rows.map((row) => {
        const Scene = SCENES[row.id];
        return (
          <Sequence key={row.id} from={f(row.start)} durationInFrames={f(row.duration)} name={row.id}>
            {row.id === "S10" ? <S10 format={format} voiceAt={row.voiceAt} /> : <Scene format={format} />}
          </Sequence>
        );
      })}
      <Audio src={staticFile("sfx/roomtone.wav")} volume={0.8} />
    </AbsoluteFill>
  );
};
