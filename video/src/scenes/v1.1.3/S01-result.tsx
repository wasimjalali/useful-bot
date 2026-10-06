import React from "react";
import { Sequence, useVideoConfig } from "remotion";
import { Stage, Layout } from "../../components/Stage";
import { PageFrame } from "../../components/PageFrame";
import { WINDOW_COVERS } from "../../components/Shot";

// S01: "A client update, built from this week's notes." Opens on the finished
// page: the real weekly-update.html the Writer wrote in take 6 (recovered from
// the take's own tool call), then pulls back to its card in the Writer chat.
export const S01: React.FC<{ format: "16x9" | "9x16" }> = ({ format }) => {
  const { fps } = useVideoConfig();
  const L = Layout[format];
  // The 9:16 cut holds on the page for its whole 5 seconds.
  const pageSecs = format === "9x16" ? 5 : 4.2;
  return (
    <>
      <Stage
        format={format}
        scene={{
          voice: "S01",
          voiceAt: 0.4,
          shots: format === "9x16" ? [] : [
            {
              at: pageSecs,
              seconds: 6 - pageSecs,
              spec: {
                src: "short-s06-pane.mp4",
                from: 0.2,
                crop: { x: 450, y: 420, w: 1200, h: 750 },
                cropTo: { x: 0, y: 0, w: 3200, h: 2000 },
                covers: WINDOW_COVERS,
              },
            },
          ],
          sfx: [{ file: "click", at: 0.25 }],
        }}
      />
      <Sequence durationInFrames={Math.round(pageSecs * fps)} layout="none">
        <div style={{ position: "absolute", left: L.win.left, top: L.win.top, borderRadius: 18, overflow: "hidden" }}>
          <PageFrame file="cedar/weekly-update.html" width={L.win.width} height={L.win.height} zoomFrom={1} zoomTo={1.06} />
        </div>
      </Sequence>
    </>
  );
};
