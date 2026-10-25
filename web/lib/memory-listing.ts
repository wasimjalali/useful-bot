import type { MemoryNoteCard } from "../../agent/lib/memory.ts";

/** The store calls the listing needs; a test hands in the real store. */
type Listable = { list(botId: string, limit: number): MemoryNoteCard[]; countLive(botId: string): number };

/**
 * GET /api/memory without a note id: a page of at most 100 notes, and `total`,
 * how many live notes the bot has, so Settings can show the real count (Earlier
 * bots) however many fit on the page. No bot named is an empty listing.
 */
export function memoryListing(store: Listable | null, botId: string): { notes: MemoryNoteCard[]; total: number } {
  if (!store || !botId) return { notes: [], total: 0 };
  return { notes: store.list(botId, 100), total: store.countLive(botId) };
}
