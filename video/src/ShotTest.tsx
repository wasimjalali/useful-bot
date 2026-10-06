import React from "react";
import { AbsoluteFill } from "remotion";
import { Shot, WINDOW_COVERS } from "./components/Shot";

export const ShotTest: React.FC<{ src: string; from: number }> = ({ src, from }) => (
  <AbsoluteFill style={{ backgroundColor: "#0B0B0B", alignItems: "center", justifyContent: "center" }}>
    <Shot spec={{ src, from, covers: WINDOW_COVERS }} width={1578} height={986} radius={20} />
  </AbsoluteFill>
);
