import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { EndCard } from "./components/EndCard";
import { ShotTest } from "./ShotTest";
import { Launch, totalSeconds } from "./Launch";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="EndCardTest" component={EndCard} durationInFrames={480} fps={60} width={1920} height={1080} />
    <Composition id="ShotTest" component={ShotTest} durationInFrames={60} fps={60} width={1920} height={1080} defaultProps={{ src: "take-02-cold-signin.mp4", from: 99 }} />
    <Composition id="Launch16x9" component={Launch} durationInFrames={Math.round(totalSeconds("16x9") * 60)} fps={60} width={1920} height={1080} defaultProps={{ format: "16x9" as const }} />
    <Composition id="Launch9x16" component={Launch} durationInFrames={Math.round(totalSeconds("9x16") * 60)} fps={60} width={1080} height={1920} defaultProps={{ format: "9x16" as const }} />
  </>
);
