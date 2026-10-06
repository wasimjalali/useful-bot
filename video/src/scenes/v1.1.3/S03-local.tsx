import React from "react";
import { Sequence, useVideoConfig } from "remotion";
import { Stage, SceneSpec, Pending, Layout } from "../../components/Stage";
import { LocalChip } from "../../components/LocalChip";
import cuts from "../../cuts.json";

// S03: "Or use an API key, or a local model that needs no account." The real
// Connect list scrolled to its Local rows (Ollama, LM Studio), with the
// caption chip naming Qwen3.8-27B in LM Studio (a caption, not UI).
export const S03: React.FC<{ format: "16x9" | "9x16" }> = ({ format }) => {
  const { fps } = useVideoConfig();
  const scene = (cuts as Record<string, Record<string, SceneSpec & { chip?: { at: number } }>>)[format]["S03"];
  if (!scene) return <Pending id="S03" />;
  const L = Layout[format];
  return (
    <>
      <Stage scene={scene} format={format} />
      <Sequence from={Math.round((scene.chip?.at ?? 3) * fps)} layout="none">
        <div
          style={{
            position: "absolute",
            left: L.win.left,
            width: L.win.width,
            top: L.win.top + L.win.height - 110,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <LocalChip />
        </div>
      </Sequence>
    </>
  );
};
