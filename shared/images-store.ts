import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Generated images, one JSON record each under ~/.useful-bot/images/. The
 * bytes are too large for the transcript (TEXT_MAX is 4000), so the event
 * carries the id and the app fetches the record through /api/agent/image.
 */
export type ImageRecord = {
  id: string;
  /** "image/png" etc. The route sends it back as the content type. */
  mime: string;
  /** Base64 image bytes, the shape the upstream answered in. */
  b64: string;
  /** The prompt the model drew from, clipped for the record. */
  prompt: string;
  provider: string;
  model: string;
  createdAt: string;
};

const ID = /^[a-zA-Z0-9_-]{8,80}$/;
export const IMAGE_MIME = /^image\/(png|jpeg|gif|webp)$/;

/**
 * The router refuses decoded image bytes past this, so the base64 body below
 * (x4/3 plus the record's fields) always fits inside RECORD_MAX.
 */
export const IMAGE_BYTES_MAX = 12 * 1024 * 1024;
/** A 4k PNG lands around 12 MB base64; anything past this is not one of ours. */
const RECORD_MAX = 20_000_000;
const PROMPT_MAX = 2_000;

export function imagesDir(root = process.env.UB_IMAGES_DIR): string {
  if (root) return root;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/images");
}

function pathFor(id: string, dir = imagesDir()): string {
  if (!ID.test(id)) throw new Error("image_id");
  return join(dir, `${id}.json`);
}

export function writeImage(
  input: { id: string; mime: string; b64: string; prompt: string; provider: string; model: string },
  dir = imagesDir(),
): void {
  if (!ID.test(input.id)) throw new Error("image_id");
  if (!IMAGE_MIME.test(input.mime)) throw new Error("image_type");
  const decoded = Math.floor(input.b64.length / 4) * 3 - (input.b64.endsWith("==") ? 2 : input.b64.endsWith("=") ? 1 : 0);
  if (decoded > IMAGE_BYTES_MAX) throw new Error("image_too_large");
  const record: ImageRecord = {
    id: input.id,
    mime: input.mime,
    b64: input.b64,
    prompt: input.prompt.slice(0, PROMPT_MAX),
    provider: input.provider.slice(0, 80),
    model: input.model.slice(0, 120),
    createdAt: new Date().toISOString(),
  };
  const body = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(body, "utf8") > RECORD_MAX) throw new Error("image_too_large");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = pathFor(input.id, dir);
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readImage(id: string, dir = imagesDir()): ImageRecord | null {
  let path: string;
  try {
    path = pathFor(id, dir);
  } catch {
    return null;
  }
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ImageRecord;
    if (!raw || raw.id !== id || !IMAGE_MIME.test(raw.mime) || typeof raw.b64 !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

export function deleteImage(id: string, dir = imagesDir()): void {
  try { unlinkSync(pathFor(id, dir)); } catch { /* ignore */ }
}

/** How long a record is kept before a sweep may call it an orphan. */
export const IMAGE_ORPHAN_GRACE_MS = 10 * 60 * 1000;

/**
 * Delete every stored image no thread event names any more, and return the
 * ids it dropped. Same rule as the widget sweep: the record is written before
 * the event that references it, so anything younger than the grace window is
 * left alone.
 */
export function sweepOrphanImages(
  referencedIds: Iterable<string>,
  dir = imagesDir(),
  now = Date.now(),
): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const keep = new Set(referencedIds);
  const dropped: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    if (!ID.test(id) || keep.has(id)) continue;
    const path = join(dir, name);
    try {
      if (now - statSync(path).mtimeMs < IMAGE_ORPHAN_GRACE_MS) continue;
    } catch {
      continue;
    }
    try {
      unlinkSync(path);
      dropped.push(id);
    } catch {
      // Gone already, or not ours to remove. The next sweep tries again.
    }
  }
  return dropped;
}
