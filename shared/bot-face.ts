export const AVATAR_SHAPES = ["circle", "oval", "square", "pill", "triangle", "hex", "blob", "drop"] as const;
export const AVATAR_COLORS = [
  "ink",
  "brown",
  "red",
  "orange",
  "gold",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "gray",
] as const;

export type AvatarShape = (typeof AVATAR_SHAPES)[number];
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export type BotFace = {
  shape: AvatarShape;
  color: AvatarColor;
  image: string | null;
};

export const AVATAR_SWATCHES: Record<AvatarColor, string> = {
  ink: "#171717",
  brown: "#6b4a2b",
  red: "#e11d48",
  orange: "#f97316",
  gold: "#f5b301",
  green: "#16a34a",
  teal: "#0d9488",
  blue: "#2563eb",
  purple: "#7c3aed",
  pink: "#ec4899",
  gray: "#9ca3af",
};

export function isAvatarShape(value: unknown): value is AvatarShape {
  return typeof value === "string" && (AVATAR_SHAPES as readonly string[]).includes(value);
}

export function isAvatarColor(value: unknown): value is AvatarColor {
  return typeof value === "string" && (AVATAR_COLORS as readonly string[]).includes(value);
}

export function parseAvatarImage(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  if (!value.startsWith("data:image/")) return null;
  if (value.length > 120_000) return null;
  return value;
}

export function defaultFaceFor(id: string): BotFace {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 3)) >>> 0;
  return {
    shape: AVATAR_SHAPES[hash % AVATAR_SHAPES.length],
    color: AVATAR_COLORS[(hash >> 3) % AVATAR_COLORS.length],
    image: null,
  };
}

export function randomFace(at = Date.now()): BotFace {
  // `^` coerces to a signed 32-bit int, so a negative seed produced negative
  // modulo indices and undefined shapes. Stay unsigned end to end.
  const seed = (at ^ Math.floor(Math.random() * 0xffffff)) >>> 0;
  return {
    shape: AVATAR_SHAPES[seed % AVATAR_SHAPES.length],
    color: AVATAR_COLORS[(seed >>> 4) % AVATAR_COLORS.length],
    image: null,
  };
}

export function eyeFill(color: AvatarColor): string {
  return color === "ink" || color === "brown" || color === "blue" || color === "purple" || color === "red"
    ? "#fafafa"
    : "#171717";
}
