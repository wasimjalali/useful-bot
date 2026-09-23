import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  findMedia,
  forgetMedia,
  listMedia,
  readMediaBytes,
  relinkMedia,
  saveDrawing,
  saveImage,
  titleFromPrompt,
} from "../shared/media-store.ts";
import { writeImage } from "../shared/images-store.ts";
import { appendAgentEvent } from "../shared/agent-store.ts";
import { readShell, writeShell } from "../shared/shell-io.ts";
import { migrateLegacyImages } from "../web/lib/media-migrate.ts";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function box() {
  const dir = mkdtempSync(join(tmpdir(), "ub-media-"));
  return { root: join(dir, "Useful Bot"), index: join(dir, "media.json"), dir };
}

test("an image is a real file filed by bot and month, and reads back by id", () => {
  const { root, index } = box();
  const when = new Date(2026, 8, 23, 11, 5);
  const item = saveImage({
    id: "imgfox000001", mime: "image/png", bytes: PNG, prompt: "A red fox: in the snow", model: "flux", provider: "openrouter",
    botId: "bot-1", botName: "Test/Bot", createdAt: when,
  }, root, index);
  assert.equal(item.path, join(root, "Test Bot", "2026-09", "2026-09-23 11.05 A red fox.png"));
  assert.deepEqual(readFileSync(item.path), PNG);
  const read = readMediaBytes("imgfox000001", index);
  assert.equal(read.status, "ok");
  assert.equal(read.status === "ok" ? read.mime : "", "image/png");

  // The same title in the same minute never overwrites.
  const second = saveImage({
    id: "imgfox000002", mime: "image/png", bytes: PNG, prompt: "A red fox", model: "", provider: "",
    botId: "bot-1", botName: "Test/Bot", createdAt: when,
  }, root, index);
  assert.equal(second.path, join(root, "Test Bot", "2026-09", "2026-09-23 11.05 A red fox 2.png"));
  assert.throws(() => saveImage({ id: "../escape", mime: "image/png", bytes: PNG, prompt: "", model: "", provider: "", botId: "", botName: "" }, root, index), /media_id/);
  assert.throws(() => saveImage({ id: "imghtml00001", mime: "text/html", bytes: PNG, prompt: "", model: "", provider: "", botId: "", botName: "" }, root, index), /image_type/);
});

test("a moved file reads as moved, Locate relinks it, and only to the same kind", () => {
  const { root, index, dir } = box();
  const item = saveImage({ id: "imgmove00001", mime: "image/png", bytes: PNG, prompt: "cat", model: "", provider: "", botId: "b", botName: "B" }, root, index);
  const moved = join(dir, "elsewhere.png");
  renameSync(item.path, moved);
  assert.equal(readMediaBytes("imgmove00001", index).status, "moved");
  assert.equal(listMedia({}, index)[0]?.exists, false);
  const drawingPath = join(dir, "scene.excalidraw");
  writeFileSync(drawingPath, "{}");
  assert.throws(() => relinkMedia("imgmove00001", drawingPath, index), /media_type/);
  assert.throws(() => relinkMedia("imgmove00001", "relative.png", index), /media_path/);
  relinkMedia("imgmove00001", moved, index);
  assert.equal(readMediaBytes("imgmove00001", index).status, "ok");
  assert.equal(readMediaBytes("imgnothing01", index).status, "missing");
});

test("a drawing saves as a .excalidraw scene without camera steps, and the Library filters", () => {
  const { root, index } = box();
  const drawing = saveDrawing({
    id: "call_drawing01",
    elements: JSON.stringify([{ type: "cameraUpdate", width: 400 }, { type: "rectangle", id: "a" }]),
    title: "Drawing - Flow",
    botId: "bot-2",
    botName: "Designer",
    provider: "excalidraw",
  }, root, index);
  assert.ok(drawing.path.endsWith(" Drawing - Flow.excalidraw"));
  // A replayed chat posts the same drawing again: no second file.
  const again = saveDrawing({ id: "call_drawing01", elements: "[]", title: "Drawing - Flow", botId: "bot-2", botName: "Designer", provider: "excalidraw" }, root, index);
  assert.equal(again.path, drawing.path);
  assert.deepEqual(readdirSync(dirname(drawing.path)).length, 1);
  const scene = JSON.parse(readFileSync(drawing.path, "utf8")) as { type: string; elements: Array<{ type: string }> };
  assert.equal(scene.type, "excalidraw");
  assert.deepEqual(scene.elements.map((el) => el.type), ["rectangle"]);
  saveImage({ id: "imglib000001", mime: "image/png", bytes: PNG, prompt: "a lighthouse at dusk", model: "", provider: "", botId: "bot-1", botName: "One" }, root, index);
  assert.deepEqual(listMedia({ kind: "drawing" }, index).map((row) => row.id), ["call_drawing01"]);
  assert.deepEqual(listMedia({ botId: "bot-1" }, index).map((row) => row.id), ["imglib000001"]);
  assert.deepEqual(listMedia({ query: "LIGHTHOUSE" }, index).map((row) => row.id), ["imglib000001"]);
  // Forget takes it out of the Library, never deletes the file, and a later
  // save of the same id (a replayed chat) does not bring it back.
  const kept = findMedia("imglib000001", index)!;
  assert.equal(forgetMedia("imglib000001", index), true);
  assert.equal(forgetMedia("imglib000001", index), false);
  assert.equal(listMedia({}, index).some((row) => row.id === "imglib000001"), false);
  assert.equal(readMediaBytes("imglib000001", index).status, "missing");
  assert.equal(existsSync(kept.path), true);
  saveImage({ id: "imglib000001", mime: "image/png", bytes: PNG, prompt: "a lighthouse at dusk", model: "", provider: "", botId: "bot-1", botName: "One" }, root, index);
  assert.equal(listMedia({}, index).some((row) => row.id === "imglib000001"), false);
});

test("an unreadable index refuses writes instead of dropping every entry", () => {
  const { root, index } = box();
  writeFileSync(index, "{ not json");
  assert.throws(() => saveImage({ id: "imgbad000001", mime: "image/png", bytes: PNG, prompt: "x", model: "", provider: "", botId: "b", botName: "B" }, root, index), /media_index_unreadable/);
  assert.equal(readFileSync(index, "utf8"), "{ not json");
  // The file written before the index refused is undone.
  assert.equal(existsSync(join(root, "B")) && listMedia({}, index).length > 0, false);
});

test("titles come from the prompt's first clause", () => {
  assert.equal(titleFromPrompt("Design a wide infographic: AI deck", "Image"), "Design a wide infographic");
  assert.equal(titleFromPrompt("Make a polished wide 16:9 poster. More detail", "Image"), "Make a polished wide 16 9 poster");
  assert.equal(titleFromPrompt("Create a high-quality, polished wide 16:9 infographic titled YOUR PERSONAL AGENT", "Image"), "Create a high-quality, polished wide 16 9 infographic titled");
  assert.equal(titleFromPrompt("   ", "Image"), "Image");
  // Separators and leading dots never reach the file name.
  assert.equal(titleFromPrompt("../../etc/passwd", "Image"), "etc passwd");
  assert.equal(titleFromPrompt("...", "Image"), "Image");
});

test("legacy base64 records move into the media folder under their bot, keeping their ids", () => {
  const { root, index, dir } = box();
  const previous = {
    media: process.env.UB_MEDIA_DIR, index: process.env.UB_MEDIA_INDEX_PATH, images: process.env.UB_IMAGES_DIR,
    agents: process.env.UB_AGENT_STORE_PATH, shell: process.env.UB_SHELL_PATH,
  };
  process.env.UB_MEDIA_DIR = root;
  process.env.UB_MEDIA_INDEX_PATH = index;
  process.env.UB_IMAGES_DIR = join(dir, "legacy");
  process.env.UB_AGENT_STORE_PATH = join(dir, "agents.json");
  process.env.UB_SHELL_PATH = join(dir, "shell.json");
  try {
    const shell = readShell();
    const bot = shell.bots[0]!;
    writeShell(shell);
    writeImage({ id: "imglegacy001", mime: "image/png", b64: PNG.toString("base64"), prompt: "old sunset", provider: "openai", model: "gpt-image-1" });
    appendAgentEvent(bot.id, { kind: "image", text: "old sunset", imageId: "imglegacy001", id: "img_imglegacy001" });
    assert.deepEqual(migrateLegacyImages(), { moved: 1, failed: 0 });
    const item = findMedia("imglegacy001", index);
    assert.equal(item?.botId, bot.id);
    assert.ok(item?.path.startsWith(join(root, bot.name.replace(/[/\\:]/g, " "))));
    assert.deepEqual(readFileSync(item!.path), PNG);
    assert.equal(existsSync(join(dir, "legacy", "imglegacy001.json")), false);
    assert.deepEqual(migrateLegacyImages(), { moved: 0, failed: 0 });
  } finally {
    for (const [key, value] of Object.entries({
      UB_MEDIA_DIR: previous.media, UB_MEDIA_INDEX_PATH: previous.index, UB_IMAGES_DIR: previous.images,
      UB_AGENT_STORE_PATH: previous.agents, UB_SHELL_PATH: previous.shell,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
