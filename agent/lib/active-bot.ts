import { resolveSessionBot } from "../../shared/session-bindings.ts";
import { peekShell } from "../../shared/shell-io.ts";
import type { ShellStore } from "../../shared/shell-store.ts";

/** The subset of an eve ToolContext the active-bot resolution needs. */
interface ActiveBotContext {
  session?: { id?: string; parent?: unknown };
}

/** Thrown when no bot can be named for the acting session. */
export class BotContextMissingError extends Error {
  constructor() {
    super("bot_context_missing");
    this.name = "BotContextMissingError";
  }
}

/** What a tool that returns results hands back when no bot is bound. */
export const BOT_CONTEXT_MISSING = { status: "blocked", error: "bot_context_missing" } as const;

export function isBotContextMissing(err: unknown): boolean {
  return err instanceof BotContextMissingError;
}

/** How long a tool of a brand new session waits for the proxy to bind it. */
export const BINDING_WAIT_MS = 5_000;
const BINDING_POLL_MS = 50;

/**
 * Which bot is acting, read from the durable session binding
 * (shared/session-bindings.ts), never from `shell.selectedBotId`: the selected
 * bot is only where the owner last looked. An unbound session throws
 * `bot_context_missing`. A child session (eve `ctx.session.parent`) is unbound
 * by design and refuses too, whatever the pin says.
 * UB_ACTIVE_BOT_ID stays as the explicit test and probe override, ahead of
 * the binding, for a call that has no session.
 */
function resolveNow(shell: ShellStore | null, ctx?: ActiveBotContext): string | null {
  if (ctx?.session?.parent) throw new BotContextMissingError();
  const sessionId = ctx?.session?.id ?? null;
  if (!sessionId) return process.env.UB_ACTIVE_BOT_ID || null;
  const bound = resolveSessionBot(sessionId, shell);
  if (bound) return bound;
  return process.env.UB_ACTIVE_BOT_ID || null;
}

/** Synchronous, no wait: for callers that cannot await. Throws `bot_context_missing`. */
export function activeBotId(shell: ShellStore, ctx?: ActiveBotContext): string {
  const id = resolveNow(shell, ctx);
  if (!id) throw new BotContextMissingError();
  return id;
}

/**
 * The same, after a bounded wait for a just-created session. A new session's
 * first turn starts inside eve's create call and the proxy can only bind the
 * session once that call answers with its id, so the first tool call can run
 * a moment before the binding lands.
 */
export async function awaitActiveBotId(
  shell: ShellStore,
  ctx?: ActiveBotContext,
  timeoutMs = Number(process.env.UB_BINDING_WAIT_MS ?? BINDING_WAIT_MS),
): Promise<string> {
  const deadline = Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : BINDING_WAIT_MS);
  let roster: ShellStore | null = shell;
  for (;;) {
    const id = resolveNow(roster, ctx);
    if (id) return id;
    // No session id at all (a bare test call) will never gain one.
    if (!ctx?.session?.id || Date.now() >= deadline) throw new BotContextMissingError();
    await new Promise((resolve) => setTimeout(resolve, BINDING_POLL_MS));
    // The pointer a backfill reads may have landed while this waited.
    roster = peekShell();
  }
}
