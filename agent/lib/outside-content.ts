import { turnSnapshot } from "./turn-snapshot.ts";

/** The slice of an eve tool or policy context the marker needs. */
export type OutsideCtx = { session?: { id?: string; turn?: { id?: string } } };

/**
 * Whether this turn has read content the owner did not write: a web page, a
 * connected app's answer, a file, a command's output, or another bot's handoff.
 * A note the model writes after that is stored as
 * `model-after-outside-content`, so Settings can show it and the owner can
 * delete it in one click. The marker is per session and turn and lives in this
 * process only: a restart mid-turn forgets it, and the next turn starts clean.
 */
const REGISTRY_KEY = Symbol.for("useful-bot.outside-content");
const CAP = 256;

function seen(): Set<string> {
  const holder = globalThis as unknown as Record<symbol, Set<string> | undefined>;
  return (holder[REGISTRY_KEY] ??= new Set());
}

function keyOf(ctx: OutsideCtx | undefined): string | null {
  const sessionId = ctx?.session?.id;
  if (!sessionId) return null;
  return `${sessionId}\u0000${ctx?.session?.turn?.id ?? ""}`;
}

/** Record that this turn read outside content. A call with no session (a test) is ignored. */
export function markOutside(ctx: OutsideCtx | undefined): void {
  const key = keyOf(ctx);
  if (!key) return;
  const set = seen();
  set.delete(key);
  set.add(key);
  if (set.size > CAP) set.delete(set.values().next().value as string);
}

/** True once a tool marked the turn, or when the turn is a handoff (the snapshot says so). */
export function seenOutside(ctx: OutsideCtx | undefined): boolean {
  const key = keyOf(ctx);
  if (!key) return false;
  if (seen().has(key)) return true;
  const sessionId = ctx?.session?.id as string;
  const snapshot = turnSnapshot(sessionId, ctx?.session?.turn?.id);
  return snapshot?.status === "ok" && snapshot.outside;
}
