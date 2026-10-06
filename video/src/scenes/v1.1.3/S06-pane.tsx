import React from "react";
import { Stage, SceneSpec, Pending } from "../../components/Stage";
import cuts from "../../cuts.json";

// S06: The Analyst's pane: avatar, instructions, routines, memory.
// Recorded on Useful Bot Dev built from main 03e91ce7 (the 1.1.3 code), demo
// profile. Shots, labels and effects come from cuts.json.
export const S06: React.FC<{ format: "16x9" | "9x16" }> = ({ format }) => (
  (cuts as Record<string, Record<string, SceneSpec>>)[format]["S06"] ? (
    <Stage scene={(cuts as Record<string, Record<string, SceneSpec>>)[format]["S06"]} format={format} />
  ) : (
    <Pending id="S06" />
  )
);
