import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

/**
 * What the agent makes belongs to the owner, like the chats: every generated
 * image and drawing is a real file under ~/Documents/Useful Bot, filed by bot
 * and month, and nothing here ever deletes one. The index next to the other
 * app state (~/.useful-bot/media.json) carries what the file cannot: the
 * prompt, the model, the bot, and where the file is now if the owner moved it.
 */

export type MediaKind = "image" | "drawing";

export type MediaItem = {
  id: string;
  kind: MediaKind;
  /** Absolute path of the file on disk. */
  path: string;
  botId: string;
  botName: string;
  title: string;
  prompt: string;
  model: string;
  provider: string;
  mime: string;
  createdAt: string;
  /**
   * The owner removed it from the Library. The entry stays as a tombstone so
   * a replayed chat that posts the same drawing again does not bring it back.
   */
  forgotten?: boolean;
};

type MediaIndex = { schemaVersion: 1; items: MediaItem[] };

const ID = /^[a-zA-Z0-9_-]{8,80}$/;
const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".excalidraw": "application/vnd.excalidraw+json",
};
const DRAWING_MIME = "application/vnd.excalidraw+json";
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 30_000;
const TITLE_MAX = 60;
const PROMPT_MAX = 2_000;

/** Under the test runner a write must name temp folders: a default here is the owner's real Documents. */
function assertNotRealUnderTest(value: string | undefined, name: string): void {
  if (!value && process.env.NODE_TEST_CONTEXT) throw new Error(`media under test needs ${name}`);
}

export function mediaRoot(root = process.env.UB_MEDIA_DIR): string {
  if (root) return root;
  assertNotRealUnderTest(root, "UB_MEDIA_DIR");
  return join(process.env.HOME ?? "/tmp", "Documents", "Useful Bot");
}

export function mediaIndexPath(path = process.env.UB_MEDIA_INDEX_PATH): string {
  if (path) return path;
  assertNotRealUnderTest(path, "UB_MEDIA_INDEX_PATH");
  return join(process.env.HOME ?? "/tmp", ".useful-bot", "media.json");
}

function emptyIndex(): MediaIndex {
  return { schemaVersion: 1, items: [] };
}

function isItem(value: unknown): value is MediaItem {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.id === "string" && ID.test(rec.id)
    && (rec.kind === "image" || rec.kind === "drawing")
    && typeof rec.path === "string" && isAbsolute(rec.path)
    && typeof rec.botId === "string" && typeof rec.botName === "string"
    && typeof rec.title === "string" && typeof rec.prompt === "string"
    && typeof rec.model === "string" && typeof rec.provider === "string"
    && typeof rec.mime === "string" && typeof rec.createdAt === "string"
    && (rec.forgotten === undefined || typeof rec.forgotten === "boolean");
}

/**
 * The index, or null when the file exists but will not parse. Callers that
 * write treat null as a refusal: rewriting an unreadable index would drop
 * every entry the owner has.
 */
function readIndexOrNull(path: string): MediaIndex | null {
  if (!existsSync(path)) return emptyIndex();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { schemaVersion?: unknown; items?: unknown };
    if (raw?.schemaVersion !== 1 || !Array.isArray(raw.items)) return null;
    return { schemaVersion: 1, items: raw.items.filter(isItem) };
  } catch {
    return null;
  }
}

export function readMediaIndex(path = mediaIndexPath()): MediaItem[] {
  return readIndexOrNull(path)?.items ?? [];
}

function writeIndex(index: MediaIndex, path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(index)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const fd = openSync(tmp, "r");
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(4));

/** Cross-process read/merge/write: eve saves images, the web service saves drawings. */
function withIndex<T>(fn: (index: MediaIndex) => T, path = mediaIndexPath()): T {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let held = false;
  while (!held) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      held = true;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmdirSync(lock);
      } catch { /* lock vanished; retry */ }
      if (Date.now() > deadline) break;
      Atomics.wait(SLEEP_SIGNAL, 0, 0, 15);
    }
  }
  if (!held) throw new Error("media_index_locked");
  try {
    const index = readIndexOrNull(path);
    if (!index) throw new Error("media_index_unreadable");
    const result = fn(index);
    writeIndex(index, path);
    return result;
  } finally {
    try { rmdirSync(lock); } catch { /* ignore */ }
  }
}

/** A name Finder shows cleanly: no path separators, no leading dot, no control characters. */
function safeName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .slice(0, TITLE_MAX)
    .trim();
  return cleaned || fallback;
}

/**
 * A short title from the prompt: its first clause, trimmed to a file name at
 * a word. A clause ends at punctuation followed by a space, so "16:9" or
 * "v2.5" stay whole.
 */
export function titleFromPrompt(prompt: string, fallback: string): string {
  const first = prompt.split(/[.:;!?](?:\s|$)|\n/)[0] ?? "";
  const words = first.trim().split(/\s+/);
  let title = "";
  for (const word of words) {
    const next = title ? `${title} ${word}` : word;
    if (next.length > TITLE_MAX) break;
    title = next;
  }
  return safeName(title || first, fallback);
}

function stamp(date: Date): { month: string; prefix: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  return { month, prefix: `${month}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}` };
}

/** Writes the bytes to a fresh file; a name already taken gets " 2", " 3" and so on, never an overwrite. */
function writeNewFile(dir: string, base: string, ext: string, bytes: Buffer): string {
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  for (let n = 1; n < 1000; n += 1) {
    const path = join(dir, `${base}${n === 1 ? "" : ` ${n}`}.${ext}`);
    try {
      writeFileSync(path, bytes, { flag: "wx", mode: 0o644 });
      return path;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw err;
    }
  }
  throw new Error("media_name_exhausted");
}

function saveFile(input: {
  id: string;
  kind: MediaKind;
  mime: string;
  ext: string;
  bytes: Buffer;
  botId: string;
  botName: string;
  title: string;
  prompt: string;
  model: string;
  provider: string;
  createdAt?: Date;
}, root = mediaRoot(), indexPath = mediaIndexPath()): MediaItem {
  if (!ID.test(input.id)) throw new Error("media_id");
  // One file per id, ever. The app posts a drawing again whenever a chat
  // replays it, and a second file per replay would fill the folder with
  // copies; an owner who moved or trashed the file keeps that choice too.
  const existing = findMedia(input.id, indexPath);
  if (existing) return existing;
  const when = input.createdAt ?? new Date();
  const { month, prefix } = stamp(when);
  const dir = join(root, safeName(input.botName, "Useful Bot"), month);
  const path = writeNewFile(dir, `${prefix} ${input.title}`, input.ext, input.bytes);
  const item: MediaItem = {
    id: input.id,
    kind: input.kind,
    path,
    botId: input.botId,
    botName: input.botName,
    title: input.title,
    prompt: input.prompt.slice(0, PROMPT_MAX),
    model: input.model.slice(0, 120),
    provider: input.provider.slice(0, 80),
    mime: input.mime,
    createdAt: when.toISOString(),
  };
  try {
    const kept = withIndex((index) => {
      // A save racing this one for the same id won: keep its file, drop ours.
      const raced = index.items.find((row) => row.id === item.id);
      if (raced) return raced;
      index.items.push(item);
      return null;
    }, indexPath);
    if (kept) {
      unlinkSync(path);
      return kept;
    }
  } catch (err) {
    // A file the index cannot name would be invisible to the chat and the
    // Library, so the write is undone and the failure goes up.
    try { unlinkSync(path); } catch { /* ignore */ }
    throw err;
  }
  return item;
}

export function saveImage(input: {
  id: string;
  mime: string;
  bytes: Buffer;
  prompt: string;
  model: string;
  provider: string;
  botId: string;
  botName: string;
  createdAt?: Date;
}, root = mediaRoot(), indexPath = mediaIndexPath()): MediaItem {
  const ext = IMAGE_EXT[input.mime];
  if (!ext) throw new Error("image_type");
  return saveFile({
    ...input,
    kind: "image",
    ext,
    title: titleFromPrompt(input.prompt, "Image"),
  }, root, indexPath);
}

/**
 * An Excalidraw drawing as a .excalidraw file, the format excalidraw.com and
 * the desktop apps open. The widget carries its scene as an elements array,
 * sometimes JSON-encoded as a string.
 */
export function saveDrawing(input: {
  id: string;
  elements: unknown;
  title: string;
  botId: string;
  botName: string;
  provider: string;
  createdAt?: Date;
}, root = mediaRoot(), indexPath = mediaIndexPath()): MediaItem {
  let elements = input.elements;
  if (typeof elements === "string") elements = JSON.parse(elements) as unknown;
  if (!Array.isArray(elements)) throw new Error("drawing_elements");
  const scene = {
    type: "excalidraw",
    version: 2,
    source: "Useful Bot",
    elements: elements.filter((el) => el && typeof el === "object" && (el as { type?: unknown }).type !== "cameraUpdate"),
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
  return saveFile({
    id: input.id,
    kind: "drawing",
    mime: DRAWING_MIME,
    ext: "excalidraw",
    bytes: Buffer.from(`${JSON.stringify(scene, null, 2)}\n`, "utf8"),
    botId: input.botId,
    botName: input.botName,
    title: safeName(input.title, "Drawing"),
    prompt: "",
    model: "",
    provider: input.provider,
    createdAt: input.createdAt,
  }, root, indexPath);
}

export function findMedia(id: string, indexPath = mediaIndexPath()): MediaItem | null {
  return readMediaIndex(indexPath).find((item) => item.id === id) ?? null;
}

export type MediaBytes =
  | { status: "ok"; item: MediaItem; mime: string; bytes: Buffer }
  | { status: "moved"; item: MediaItem }
  | { status: "missing" };

/** The file behind an id: "moved" when the index names it but the file is gone from its path. */
export function readMediaBytes(id: string, indexPath = mediaIndexPath()): MediaBytes {
  const item = findMedia(id, indexPath);
  if (!item || item.forgotten) return { status: "missing" };
  try {
    return { status: "ok", item, mime: item.mime, bytes: readFileSync(item.path) };
  } catch {
    return { status: "moved", item };
  }
}

export function listMedia(
  filter: { kind?: MediaKind; botId?: string; query?: string } = {},
  indexPath = mediaIndexPath(),
): Array<MediaItem & { exists: boolean }> {
  const q = filter.query?.trim().toLowerCase();
  return readMediaIndex(indexPath)
    .filter((item) => !item.forgotten)
    .filter((item) => !filter.kind || item.kind === filter.kind)
    .filter((item) => !filter.botId || item.botId === filter.botId)
    .filter((item) => !q || item.title.toLowerCase().includes(q) || item.prompt.toLowerCase().includes(q) || item.botName.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => ({ ...item, exists: existsSync(item.path) }));
}

/**
 * Point an entry at the file the owner found after moving it. The new file
 * must be the same kind (an image stays an image), so a relink cannot turn
 * the owner-gated image route into a reader of arbitrary files.
 */
export function relinkMedia(id: string, newPath: string, indexPath = mediaIndexPath()): MediaItem {
  if (!isAbsolute(newPath)) throw new Error("media_path");
  const path = resolve(newPath);
  const mime = EXT_MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error("media_type");
  if (!statSync(path).isFile()) throw new Error("media_path");
  return withIndex((index) => {
    const item = index.items.find((row) => row.id === id);
    if (!item || item.forgotten) throw new Error("media_missing");
    const sameKind = item.kind === "drawing" ? mime === DRAWING_MIME : mime !== DRAWING_MIME;
    if (!sameKind) throw new Error("media_type");
    item.path = path;
    item.mime = mime;
    return { ...item };
  }, indexPath);
}

/**
 * Take an entry out of the Library. The file itself is the owner's: the app
 * moves it to the Trash first. The entry stays as a tombstone (see
 * `forgotten`), so the same id is never saved again.
 */
export function forgetMedia(id: string, indexPath = mediaIndexPath()): boolean {
  return withIndex((index) => {
    const item = index.items.find((row) => row.id === id);
    if (!item || item.forgotten) return false;
    item.forgotten = true;
    return true;
  }, indexPath);
}
