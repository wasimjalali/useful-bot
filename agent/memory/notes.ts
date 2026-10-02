import { defineMemory, defineMemoryProvider } from "eve/memory";
import { renderNotesBlock, NOTES_FULL_COUNT, type NoteCard } from "../../shared/notes-block.ts";
import { sharedMemoryStore, type MemoryStore } from "../lib/memory.ts";
import { boundBotId, type SnapshotCtx } from "../lib/turn-snapshot.ts";

/**
 * The bot's own notes, recalled before each turn and after compaction (UB-009).
 * They arrive as a user-role record, so a note can never pass as a system
 * rule, and eve keeps it verbatim through compaction. The slot adds no tools:
 * the app's own memory_* tools stay as they are.
 *
 * Failure rules (spike: evals/results/2026-10-01-ub009-spikes/eve-spikes.md):
 * a throwing `scope` or `recall` fails the turn, so both catch and return
 * null. A null scope hides the slot and every earlier record of it, which is
 * the safe shape for an unbound session. A null recall keeps the previous
 * record. The same record id is replaced each time, and an empty list sends a
 * sentinel because blank content is refused and a recall cannot retract.
 */
export const NOTES_RECORD_ID = "bot-notes";
const OPERATION_CAP = 256;

/** The rendered block per operation: eve replays a recall and refuses a different result. */
const byOperation = new Map<string, string>();

/** Which bot's notes this session holds: the same claim and binding the turn snapshot uses. Never throws. */
export async function notesScope(ctx: SnapshotCtx): Promise<string | null> {
  try {
    return await boundBotId(ctx);
  } catch (err) {
    console.error("[memory] notes scope failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The bot's live notes as cards: the newest few with their whole body, the rest as previews. */
function loadCards(store: MemoryStore, botId: string): NoteCard[] {
  return store.list(botId, 100).map((card, index) => ({
    id: card.id,
    title: card.title,
    body: index < NOTES_FULL_COUNT ? store.readCard(card.id, botId).body : card.body,
    updatedAt: card.updatedAt,
    source: card.source,
  }));
}

/** The recall result for one operation. Never throws: a failure returns null. */
export function recallNotes(
  ctx: { operationId: string; memory: { scope: { value: string | readonly string[] } } },
  store: () => MemoryStore = sharedMemoryStore,
) {
  try {
    // The scope is the bot id the slot resolved; anything else is not a bot.
    const botId = ctx.memory.scope.value;
    if (typeof botId !== "string" || !botId) return null;
    // Keyed by bot too, so a cached render can never reach another bot.
    const key = `${botId}\u0000${ctx.operationId}`;
    let content = byOperation.get(key);
    if (content === undefined) {
      content = renderNotesBlock(loadCards(store(), botId));
      if (byOperation.size >= OPERATION_CAP) byOperation.delete(byOperation.keys().next().value as string);
      byOperation.set(key, content);
    }
    return { messages: [{ id: NOTES_RECORD_ID, content }] };
  } catch (err) {
    console.error("[memory] notes recall failed", err instanceof Error ? err.message : err);
    return null;
  }
}

export default defineMemory({
  description: "The bot's own saved notes.",
  provider: defineMemoryProvider({
    recall: {
      "turn.started": (ctx) => recallNotes(ctx),
      "compaction.completed": (ctx) => recallNotes(ctx),
    },
  }),
  scope: (ctx) => notesScope(ctx),
});
