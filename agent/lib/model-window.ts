import { catalogFor } from "../../shared/live-models.ts";
import { exactModelOption } from "../../shared/models.ts";
import { readProviderStore, resolveUpstream } from "../../shared/providers.ts";
import { botSelection, lastPick, type ModelSelection, type TurnSelection } from "../../shared/session-selection.ts";
import { peekShell } from "../../shared/shell-io.ts";
import { readSessionGrant } from "../../shared/workspace-store.ts";
import { activeBotId } from "./active-bot.ts";

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
 * What a turn runs on, read once at its first step and held for the whole turn
 * (see session-model.ts). The session's grant carries the bot's selection,
 * stamped at turn start by the web layer. A grant that has none yet (the first
 * step of a brand new session can run before the stamp lands, or the grants
 * store could not be read) falls back to the bot the session belongs to, then
 * to the last pick. The store is only read here, never written.
 */
export function freezeTurnSelection(eveSessionId: string): TurnSelection {
  const grant = readSessionGrant(eveSessionId);
  let selection: ModelSelection | null = grant?.selection ?? null;
  if (!selection) {
    const store = readProviderStore();
    const shell = peekShell();
    const botId = shell ? activeBotId(shell, { session: { id: eveSessionId } }) : null;
    const bot = shell && botId ? shell.bots.find((item) => item.id === botId) : undefined;
    selection = bot ? botSelection(bot, store) : lastPick(store);
  }
  return { ...selection, windowTokens: windowTokensFor(selection) };
}

/** How long the first step of a brand new session waits for its stamp. */
export const STAMP_WAIT_MS = 3_000;
const STAMP_POLL_MS = 50;

/**
 * A new session's first turn starts inside eve's create call, and the web
 * layer can only stamp the grant once that call answers with the session id.
 * The first step can therefore run before the stamp lands, and no bot owns
 * the session yet either, so the fallback would read the selected bot or the
 * last pick: the wrong model for a routine or handoff opening a new chat.
 * Wait, bounded, until the grant carries a selection or a bot owns the
 * session. Returns at once for every session that already has either.
 */
export async function awaitTurnStamp(eveSessionId: string, timeoutMs = STAMP_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (readSessionGrant(eveSessionId)?.selection) return true;
    const shell = peekShell();
    if (shell?.bots.some((bot) => bot.sessionId === eveSessionId)) return true;
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
