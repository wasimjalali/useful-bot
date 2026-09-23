import { readAgentStore } from "../../shared/agent-store.ts";
import { deleteImage, legacyImageIds, readImage } from "../../shared/images-store.ts";
import { findMedia, saveImage } from "../../shared/media-store.ts";
import { peekShell } from "../../shared/shell-io.ts";

/**
 * Move the images stored as base64 records in ~/.useful-bot/images into the
 * media folder as real files, keeping their ids so the chat rows still load.
 * The old record is removed only once its file and index entry exist. A
 * record that fails stays where it is and the next call tries again.
 */
export function migrateLegacyImages(): { moved: number; failed: number } {
  const ids = legacyImageIds();
  if (ids.length === 0) return { moved: 0, failed: 0 };
  const owners = new Map<string, string>();
  for (const thread of readAgentStore().threads) {
    for (const event of thread.events) {
      if (event.imageId) owners.set(event.imageId, thread.botId);
    }
  }
  const bots = peekShell()?.bots ?? [];
  let moved = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      if (!findMedia(id)) {
        const record = readImage(id);
        if (!record) continue;
        const botId = owners.get(id) ?? "";
        saveImage({
          id,
          mime: record.mime,
          bytes: Buffer.from(record.b64, "base64"),
          prompt: record.prompt,
          model: record.model,
          provider: record.provider,
          botId,
          botName: bots.find((bot) => bot.id === botId)?.name ?? "Useful Bot",
          createdAt: Number.isNaN(Date.parse(record.createdAt)) ? undefined : new Date(record.createdAt),
        });
      }
      deleteImage(id);
      moved += 1;
    } catch (err) {
      failed += 1;
      console.error(`[media] could not migrate image ${id}`, err);
    }
  }
  return { moved, failed };
}
