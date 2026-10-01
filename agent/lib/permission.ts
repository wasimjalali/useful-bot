import { peekShell } from "../../shared/shell-io.ts";
import { orchestratorId, type ShellBot, type ShellStore } from "../../shared/shell-store.ts";
import { readSessionGrant, type WorkspacePermission } from "../../shared/workspace-store.ts";
import { awaitActiveBotId, BOT_CONTEXT_MISSING, isBotContextMissing } from "./active-bot.ts";
import type { ApprovalStore } from "./approvals.ts";
import { waitUntilNotPending } from "./approvals.ts";

export { orchestratorId };

/**
 * The bot's permission for this session. A session with no grant is one the
 * web server did not stamp, so it fails closed to Read only; a call with no
 * session at all (tests, evals) is Auto.
 */
export function sessionPermission(ctx?: { session?: { id?: string } }): WorkspacePermission {
  const id = ctx?.session?.id;
  if (!id) return "auto";
  return readSessionGrant(id)?.permission ?? "read_only";
}

export type Gate = "run" | "ask" | "refuse";

/**
 * What the permission says about an action inside the app itself: the rail,
 * routines, memory, chat history. Read only refuses every change. Auto runs
 * them without a card, except the two that erase things nothing can bring
 * back (deleting a bot, clearing a chat): those ask. Full access runs those
 * too. Reads never come here; they run in every mode.
 */
export function inAppGate(permission: WorkspacePermission, irreversible = false): Gate {
  if (permission === "read_only") return "refuse";
  if (permission === "full_access") return "run";
  return irreversible ? "ask" : "run";
}

/**
 * Settle a requested card the way the gate says: approve it on the spot, or
 * wait for the owner. Callers still go through `executeIfApproved`, so the
 * approval record binds the action either way and a replay is refused. A
 * card that waited was raised under one permission; if the owner narrowed
 * it while the card sat open, the approval must not spend on the old
 * posture, the way bash and write_file refuse a changed workspace.
 */
export async function settle(
  store: ApprovalStore,
  id: string,
  hash: string,
  gate: Exclude<Gate, "refuse">,
  ctx?: { session?: { id?: string } },
  permissionAtRequest?: WorkspacePermission,
): Promise<void> {
  if (gate === "run") {
    store.decide(id, "approve", hash);
    return;
  }
  await waitUntilNotPending(store, id);
  if (permissionAtRequest !== undefined && sessionPermission(ctx) !== permissionAtRequest) {
    throw new Error("permission_changed");
  }
}

/** The blocked result every gated tool returns when Read only refuses it. */
export const READ_ONLY_BLOCKED = { status: "blocked", error: "workspace_read_only" } as const;

/**
 * The cross-bot rule. Who is calling decides how far a tool reaches:
 * - `orchestrator`: the default bot (or the first visible bot when it is gone),
 *   which may act on any bot;
 * - `bot`: a plain bot, which acts only on itself and its own routines;
 * - `group`: a group session, which acts on itself (its routines, its chat,
 *   its notes under the group id) and may message its own members.
 * Checked at execution time against the resolved target.
 */
export type CallerRole = "orchestrator" | "bot" | "group";

export type Caller = { id: string; role: CallerRole; bot: ShellBot };

export function callerRole(shell: Pick<ShellStore, "bots">, bot: ShellBot): CallerRole {
  if (bot.kind === "group") return "group";
  return bot.id === orchestratorId(shell) ? "orchestrator" : "bot";
}

export type CallerResult =
  | { ok: true; caller: Caller }
  | { ok: false; result: typeof BOT_CONTEXT_MISSING };

/**
 * The acting bot and its class, from the durable session binding (after a
 * bounded wait for a just-created session). An unbound or child session, or a
 * bound bot the roster no longer has, is `bot_context_missing`.
 */
export async function callerOf(
  shell: ShellStore,
  ctx?: { session?: { id?: string; parent?: unknown } },
): Promise<CallerResult> {
  let id: string;
  try {
    id = await awaitActiveBotId(shell, ctx);
  } catch (err) {
    if (isBotContextMissing(err)) return { ok: false, result: BOT_CONTEXT_MISSING };
    throw err;
  }
  const bot = shell.bots.find((item) => item.id === id);
  if (!bot) return { ok: false, result: BOT_CONTEXT_MISSING };
  return { ok: true, caller: { id, role: callerRole(shell, bot), bot } };
}

/** Only the orchestrator acts on a bot other than itself. */
export function mayActOn(caller: Caller, targetBotId: string): boolean {
  return caller.role === "orchestrator" || caller.id === targetBotId;
}

/**
 * `mayActOn` again against the roster as it stands now, for the moment an
 * approval card is spent: the caller can have lost the orchestrator role, or
 * been deleted, while the owner was deciding.
 */
export function mayStillActOn(callerId: string, targetBotId: string, shell: ShellStore | null = peekShell()): boolean {
  const actor = shell?.bots.find((bot) => bot.id === callerId);
  if (!shell || !actor) return false;
  return callerId === targetBotId || callerRole(shell, actor) === "orchestrator";
}

/** The refusal every cross-bot check returns. */
export function notAvailable(hint: string) {
  return { status: "blocked", error: "not_available_for_this_bot", hint } as const;
}

export const ORCHESTRATOR_ONLY_HINT = "Only the Generalist does that. Ask the owner, or hand it to the Generalist.";
export const SELF_ONLY_HINT = "This bot can only do that for itself.";
