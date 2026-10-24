import type { ApprovalStore } from "../../agent/lib/approvals.ts";
import type { Routine } from "../../shared/routines-store.ts";
import { resolveSessionBot } from "../../shared/session-bindings.ts";
import { readShell } from "../../shared/shell-io.ts";

/**
 * The refusals for an archived (earlier) bot, one rule for every route that
 * could start work on a bot. Plain data, not a Response, so a test can check
 * the rule without Next; a route turns it into JSON with the status.
 */

type Roster = ReadonlyArray<{ id: string; archived: boolean }>;
export type Refusal = { error: string; status: number };

/** A turn, a send or an answer aimed at a bot: an archived one takes none. */
export function archivedBotRefusal(roster: Roster, botId: string | null | undefined): Refusal | null {
  if (!botId) return null;
  return roster.some((bot) => bot.id === botId && bot.archived) ? { error: "shell_bot_archived", status: 409 } : null;
}

/** POST /api/routines: the bot must be on the roster, and an archived one gets no new routine. */
export function routineCreateRefusal(roster: Roster, botId: string): Refusal | null {
  if (!roster.some((bot) => bot.id === botId)) return { error: "bot_missing", status: 400 };
  return archivedBotRefusal(roster, botId);
}

/** POST /api/routines/:id/run: a routine of an archived bot does not run, even from the Test run button. */
export function routineRunRefusal(roster: Roster, routine: Pick<Routine, "botId">): Refusal | null {
  return archivedBotRefusal(roster, routine.botId);
}

/**
 * POST /api/approvals/:id: approving lets a parked tool call run, so an archived
 * bot's card cannot be approved. Denying it only closes the card and is always
 * allowed. The card names its session, and the session's binding names the bot.
 */
export function approvalDecisionRefusal(store: Pick<ApprovalStore, "get">, id: string, decision: "approve" | "deny"): Refusal | null {
  if (decision !== "approve") return null;
  const record = store.get(id);
  if (!record) return null;
  const shell = readShell();
  return archivedBotRefusal(shell.bots, resolveSessionBot(record.sessionId, shell));
}
