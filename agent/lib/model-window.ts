import { catalogFor } from "../../shared/live-models.ts";
import { exactModelOption } from "../../shared/models.ts";
import { readProviderStore, resolveUpstream } from "../../shared/providers.ts";
import { botSelection, type ModelSelection, type TurnSelection } from "../../shared/session-selection.ts";
import { peekShell } from "../../shared/shell-io.ts";
import type { ShellBot, ShellStore } from "../../shared/shell-store.ts";
import { readSessionGrant } from "../../shared/workspace-store.ts";

/**
 * The window used to size compaction when the catalog does not say what the
 * selected model's is (a custom server, Ollama, LM Studio, an unlisted id).
 * Deliberately small: guessing 131,072 let a small local model overflow before
 * eve compacted. A model that really has more only compacts earlier than it
 * had to, which costs a summary, never a failed turn.
 */
export const UNKNOWN_WINDOW_TOKENS = 32_768;

/**
 * The context window of one selected model, from the catalog row for exactly
 * that connection and model. No stand-in row: a model the catalog does not
 * list, or lists without a window, is unknown, and unknown is 32,768.
 */
export function windowTokensFor(selection: ModelSelection): number {
  const tokens = exactModelOption(selection.modelId, catalogFor(selection.connectionId))?.contextTokens;
  return Number.isInteger(tokens) && (tokens as number) > 0 ? (tokens as number) : UNKNOWN_WINDOW_TOKENS;
}

/**
 * The bot that owns a session: it holds the session id (or opened it as a
 * carry-over), else the bot a test or probe pins with UB_ACTIVE_BOT_ID. Never
 * the selected bot and never a guess: the selected bot is only where the owner
 * last looked, the wrong model for a routine or handoff opening a new chat.
 */
function sessionOwner(shell: ShellStore | null, eveSessionId: string): ShellBot | undefined {
  if (!shell) return undefined;
  const owner = shell.bots.find((bot) => bot.sessionId === eveSessionId || bot.continuedSessionId === eveSessionId);
  if (owner) return owner;
  const pinned = process.env.UB_ACTIVE_BOT_ID;
  return pinned ? shell.bots.find((bot) => bot.id === pinned) : undefined;
}

/**
 * What a turn runs on, read once at its first step and held for the whole turn
 * (see session-model.ts). The session's grant carries the bot's selection,
 * stamped at turn start by the web layer. A grant that has none yet (the first
 * step of a brand new session can run before the stamp lands, or the grants
 * store could not be read) falls back to the bot that owns the session, then
 * to the bot UB_ACTIVE_BOT_ID names (tests, probes). Anything else throws
 * `turn_stamp_missing`: running a turn on the selected bot's model or on the
 * last pick would be the wrong model for someone else's chat. The store is
 * only read here, never written.
 */
export function freezeTurnSelection(eveSessionId: string): TurnSelection {
  let selection: ModelSelection | null = readSessionGrant(eveSessionId)?.selection ?? null;
  if (!selection) {
    const owner = sessionOwner(peekShell(), eveSessionId);
    if (!owner) throw new Error("turn_stamp_missing");
    selection = botSelection(owner, readProviderStore());
  }
  return { ...selection, windowTokens: windowTokensFor(selection) };
}

/** How long the first step of a brand new session waits for its stamp. */
export const STAMP_WAIT_MS = 10_000;
const STAMP_POLL_MS = 50;

/**
 * A new session's first turn starts inside eve's create call, and the web
 * layer can only stamp the grant once that call answers with the session id.
 * The first step can therefore run before the stamp lands, and no bot owns
 * the session yet either, so there is nothing safe to read. Wait, bounded,
 * until the grant carries a selection or a bot owns the session. Returns at
 * once for every session that already has either.
 */
export async function awaitTurnStamp(eveSessionId: string, timeoutMs = STAMP_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (readSessionGrant(eveSessionId)?.selection) return true;
    if (sessionOwner(peekShell(), eveSessionId)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, STAMP_POLL_MS));
  }
}

/**
 * The reviewer sub-agent's window, from the model its role resolves to right
 * now, by the same lookup and the same unknown rule as the workhorse. A role
 * that cannot resolve (no credential yet) has no model to size from, and the
 * call itself then fails with the router's own error, so the conservative
 * window here hides nothing.
 */
export function reviewerWindowTokens(): number {
  try {
    const resolved = resolveUpstream(readProviderStore(), "reviewer");
    return windowTokensFor({
      connectionId: resolved.connection.id,
      modelId: resolved.modelId,
      effort: resolved.effort,
      speed: resolved.speed,
    });
  } catch {
    return UNKNOWN_WINDOW_TOKENS;
  }
}
