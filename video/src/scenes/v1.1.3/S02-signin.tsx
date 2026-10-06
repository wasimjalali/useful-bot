import React from "react";
import { Stage, SceneSpec, Pending } from "../../components/Stage";
import cuts from "../../cuts.json";

// S02: Welcome, Connect, Continue with ChatGPT, connected. Sign-in shortened; not affiliated with OpenAI.
// Recorded on Useful Bot Dev built from main 03e91ce7 (the 1.1.3 code), demo
// profile. Shots, labels and effects come from cuts.json.
export const S02: React.FC<{ format: "16x9" | "9x16" }> = ({ format }) => (
  (cuts as Record<string, Record<string, SceneSpec>>)[format]["S02"] ? (
    <Stage scene={(cuts as Record<string, Record<string, SceneSpec>>)[format]["S02"]} format={format} />
  ) : (
    <Pending id="S02" />
  )
);
