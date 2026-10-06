import React from "react";
import { Sequence, useVideoConfig } from "remotion";
import cuts from "../../cuts.json";
import { Stage, Layout, SceneSpec } from "../../components/Stage";
import { PageFrame } from "../../components/PageFrame";

// S09: "Your chats and files are stored on your computer. Your model provider
// sees what you send it." The finished page (slow pull-back), then the Cedar
// Studio folder in Finder, cropped to its file list.
export const S09: React.FC<{ format: "16x9" | "9x16" }> = ({ format }) => {
  const { fps } = useVideoConfig();
  const L = Layout[format];
  const pageSecs = format === "9x16" ? 4 : 4.5;
  const finder = (cuts as Record<string, Record<string, SceneSpec>>)[format]["S09"];
  return (
    <>
      <Stage format={format} scene={finder ?? { voice: "S09", voiceAt: 0.4, shots: [] }} />
      <Sequence durationInFrames={Math.round((finder ? pageSecs : 9) * fps)} layout="none">
        <div style={{ position: "absolute", left: L.win.left, top: L.win.top, borderRadius: 18, overflow: "hidden" }}>
          <PageFrame file="cedar/weekly-update.html" width={L.win.width} height={L.win.height} zoomFrom={1.06} zoomTo={1} />
        </div>
      </Sequence>
    </>
  );
};
