import { sharedMemoryStore } from "../../agent/lib/memory.ts";
import { deleteThread } from "../../shared/agent-store.ts";
import { deleteRoutinesForBot } from "../../shared/routines-store.ts";
import { unbindBot } from "../../shared/session-bindings.ts";
import { readShell, updateShell } from "../../shared/shell-io.ts";
import {
  applyShellAction,
  DEFAULT_BOT_ID,
  staleSessionIds,
  type ShellAction,
  type ShellStore,
} from "../../shared/shell-store.ts";
import { removeSessionGrant } from "../../shared/workspace-store.ts";
import { errorCode } from "./api-guard.ts";

/**
 * What the shell route does for the two Earlier bots actions, kept out of the
 * route so it can be tested without booting Next.
 */

/**
 * Drop the filesystem capabilities an action just took away. `staleSessionIds`
 * works out which ones; this spends them.
 *
 * Best effort, like `detachBot`: the roster is the authority, and the stamp at
 * the next turn is the backstop. It must not turn a locked grants store into a
 * failed roster action the owner already saw succeed.
 */
export function revokeGrantsFor(
  action: ShellAction | undefined,
  before: ShellStore,
  after: ShellStore,
): void {
  for (const id of staleSessionIds(action, before, after)) {
    try {
      removeSessionGrant(id);
    } catch {
      /* the next turn's stamp revokes it; a locked store is not this action's failure */
    }
  }
}

/**
 * What an earlier bot owns outside the shell store: its routines (none, the
 * archive migration moved them), its transcript and its session bindings.
 *
 * This runs after the roster commit, not before it. Before means a commit that
 * throws (a contended shell lock, a guard inside `applyShellAction`) has
 * already destroyed the transcript of a bot that still exists, which is worse
 * than the orphan it was trying to avoid. Nothing here can be atomic with the
 * roster write anyway: several stores, several locks. So the roster is the
 * authority, this is best effort, and `sweepOrphanState` on the tick is what
 * makes a failure here temporary instead of permanent.
 *
 * Returns the error when it could not finish, so the caller can say so rather
 * than swallow it.
 */
export function detachBot(botId: string): string | null {
  const errors: string[] = [];
  // Independently: a locked routines store is no reason to leave the
  // transcript behind as well, and the caller needs to hear about both.
  try {
    deleteRoutinesForBot(botId);
  } catch (err) {
    errors.push(`routines:${errorCode(err, "detach_failed")}`);
  }
  try {
    deleteThread(botId);
  } catch (err) {
    errors.push(`transcript:${errorCode(err, "detach_failed")}`);
  }
  // The removed bot's session bindings go with it: the only way a row leaves
  // the identity store.
  try {
    unbindBot(botId);
  } catch (err) {
    errors.push(`sessions:${errorCode(err, "detach_failed")}`);
  }
  return errors.length > 0 ? errors.join(",") : null;
}

/**
 * "Move notes": the action changes no roster row, it only says whether the move
 * is allowed (an archived earlier bot that is not the default one), and the
 * notes move here. Throws the action's refusal before anything moves.
 */
export function moveEarlierBotNotes(fromBotId: string): { store: ShellStore; moved: number } {
  applyShellAction(readShell(), { type: "moveNotes", fromBotId });
  const moved = sharedMemoryStore().moveBotNotes(fromBotId, DEFAULT_BOT_ID);
  return { store: readShell(), moved };
}

/**
 * "Remove": validate, archive the bot's notes, then drop the record.
 *
 * The notes go first. After the roster commit the bot is gone, a retry would
 * answer `shell_bot_missing` and the notes would stay active under an id
 * nothing can reach. Before it, a failed archive leaves the record in place and
 * the owner presses Remove again; archiving is idempotent, so a retry after a
 * failed commit has nothing left to do and goes on to the commit. The notes are
 * archived (files kept), not deleted.
 */
export function removeEarlierBot(botId: string): { store: ShellStore; detachError: string | null } {
  const action: ShellAction = { type: "removeArchivedBot", botId };
  const before = readShell();
  applyShellAction(before, action);
  sharedMemoryStore().archiveBotNotes(botId);
  const next = updateShell((shell) => applyShellAction(shell, action).store);
  revokeGrantsFor(action, before, next);
  return { store: next, detachError: detachBot(botId) };
}
