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
 * carry-over). Never the selected bot and never a guess: the selected bot is
 * only where the owner last looked, the wrong model for a routine or handoff
 * opening a new chat.
 */
function sessionOwner(shell: ShellStore | null, eveSessionId: string): ShellBot | undefined {
  return shell?.bots.find((bot) => bot.sessionId === eveSessionId || bot.continuedSessionId === eveSessionId);
}

/** The bot a test or probe pins with UB_ACTIVE_BOT_ID, the last resort for an unowned session. */
function pinnedBot(shell: ShellStore | null): ShellBot | undefined {
  const pinned = process.env.UB_ACTIVE_BOT_ID;
  return pinned ? shell?.bots.find((bot) => bot.id === pinned) : undefined;
}

/**
 * What a turn runs on, read once at its first step and held for the whole turn
 * (see session-model.ts), so a pick made mid-turn applies to the next turn.
 * The source, in order: the bot that owns the session, by its CURRENT
 * selection (turns eve starts by itself, sub-agent reports and background
 * task notifications, never pass the proxy stamp, so the grant can still hold
 * the previous turn's pick); else the grant's selection (a brand new session
 * whose owner pointer has not landed yet); else the bot UB_ACTIVE_BOT_ID names
 * (tests, probes). Anything else throws `turn_stamp_missing`: running a turn
 * on the selected bot's model or on the last pick would be the wrong model for
 * someone else's chat. The store is only read here, never written.
 */
export function freezeTurnSelection(eveSessionId: string): TurnSelection {
  const shell = peekShell();
  const owner = sessionOwner(shell, eveSessionId);
  let selection: ModelSelection | null = owner ? botSelection(owner, readProviderStore()) : null;
  if (!selection) selection = readSessionGrant(eveSessionId)?.selection ?? null;
  if (!selection) {
    const pinned = pinnedBot(shell);
    if (!pinned) throw new Error("turn_stamp_missing");
    selection = botSelection(pinned, readProviderStore());
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
 * until a bot owns the session or the grant carries a selection. Returns at
 * once for every session that already has either.
 */
export async function awaitTurnStamp(eveSessionId: string, timeoutMs = STAMP_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (sessionOwner(peekShell(), eveSessionId)) return true;
    if (readSessionGrant(eveSessionId)?.selection) return true;
    if (pinnedBot(peekShell())) return true;
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
