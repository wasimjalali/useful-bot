import React from "react";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { EndCard } from "../../components/EndCard";

// S10: the brand end card. Voice "Useful Bot. Free and open source." then two
// seconds of room tone only. No music (owner rule).
export const S10: React.FC<{ format: "16x9" | "9x16"; voiceAt: number }> = ({ format, voiceAt }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      <EndCard vertical={format === "9x16"} />
      <Sequence from={Math.round(voiceAt * fps)} layout="none">
        <Audio src={staticFile("voice/S10.wav")} />
      </Sequence>
    </>
  );
};
