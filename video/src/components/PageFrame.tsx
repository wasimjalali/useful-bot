import React from "react";
import { IFrame, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";

/**
 * The real weekly-update.html the Writer wrote in the filmed take, rendered by
 * the film's own browser at its natural width. The app opens pages in the
 * default browser rather than a page view of its own, so this shows the file
 * itself instead of a browser window with the owner's tabs in it.
 */
export const PageFrame: React.FC<{ file: string; width: number; height: number; zoomFrom?: number; zoomTo?: number; pageWidth?: number }> = ({
  file,
  width,
  height,
  zoomFrom = 1,
  zoomTo = 1.06,
  pageWidth = 1100,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(frame, [0, durationInFrames], [zoomFrom, zoomTo], { easing: Easing.inOut(Easing.cubic) });
  const scale = (width / pageWidth) * z;
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative", backgroundColor: "#fbfaf6" }}>
      <IFrame
        src={staticFile(file)}
        style={{
          width: pageWidth,
          height: height / scale,
          border: "none",
          transformOrigin: "0 0",
          transform: `translate(${(width - pageWidth * scale) / 2}px, 0) scale(${scale})`,
        }}
      />
    </div>
  );
};
