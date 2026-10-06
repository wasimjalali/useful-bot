// Mirrors macos/Sources/UsefulBotCore/DesignTokens.swift (light theme, the one
// the film shows) plus the brand rules in brand/README.md. Anything recreated
// on screen (the S03 chip, overlays) draws from these values only.

export const light = {
  canvas: "#F3F3F3",
  surface: "#FFFFFF",
  sunken: "#F0F0F0",
  ink: "#171717",
  inkMuted: "#5C5C5C",
  inkFaintText: "#6B6B6B",
  border: "#EBEBEB",
  borderStrong: "#E0E0E0",
  success: "#0F6F56",
  successSoft: "#E4F4EE",
  warning: "#8A5300",
  warningSoft: "#FBF1DE",
} as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 16, xl: 22, xxl: 24, pill: 999 } as const;

// brand/README.md: black is the primary background, white the foreground.
export const brand = {
  black: "#000000",
  white: "#FFFFFF",
  faceInk: "#141413",
  // The stage around the app window and the caption pill (plan section 7:
  // white on a soft black pill, radius 16).
  stage: "#0B0B0B",
  pill: "rgba(28, 28, 28, 0.92)",
  muted: "#A3A3A3",
} as const;

export const font = {
  family: "Inter",
  weight: 600,
  // Wordmark tracking from brand/README.md.
  wordmarkTracking: "-0.018em",
} as const;
