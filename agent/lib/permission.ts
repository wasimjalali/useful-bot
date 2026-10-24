import { peekShell, readShell } from "../../shared/shell-io.ts";
import type { ShellBot, ShellStore } from "../../shared/shell-store.ts";
import { readSessionGrant, type WorkspacePermission } from "../../shared/workspace-store.ts";
import {
  awaitActiveBotId,
  BOT_CONTEXT_MISSING,
  isBotContextMissing,
  type ActiveBotContext,
} from "./active-bot.ts";
import type { ApprovalStore } from "./approvals.ts";
import { waitUntilNotPending } from "./approvals.ts";

/**
 * The bot's permission for this session. A session with no grant is one the
 * web server did not stamp, so it fails closed to Read only; a call with no
 * session at all (tests, evals) is Auto.
 */
export function sessionPermission(ctx?: ActiveBotContext): WorkspacePermission {
  const id = ctx?.session?.id;
  if (!id) return "auto";
  return readSessionGrant(id)?.permission ?? "read_only";
}

export type Gate = "run" | "ask" | "refuse";

/**
 * What the permission says about an action inside the app itself:
 * routines, memory. Read only refuses every change. Auto runs them without a
 * card, except one that erases something nothing can bring back (installing
 * a CLI): that asks. Full access runs those too. Reads never come here; they
 * run in every mode.
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

/** The bot a tool call acts for, read from the session binding and the live roster. */
export type Caller = { id: string; bot: ShellBot };

export type CallerResult =
  | { ok: true; caller: Caller }
  | { ok: false; result: typeof BOT_CONTEXT_MISSING };

/**
 * The acting bot, from the durable session binding (after a bounded wait for
 * a just-created session). An unbound session, or a bound bot the roster no
 * longer has, is `bot_context_missing`.
 */
export async function callerOf(shell: ShellStore, ctx?: ActiveBotContext): Promise<CallerResult> {
  let id: string;
  try {
    id = await awaitActiveBotId(shell, ctx);
  } catch (err) {
    if (isBotContextMissing(err)) return { ok: false, result: BOT_CONTEXT_MISSING };
    throw err;
  }
  // Looked up in the roster as it stands after the wait: the snapshot the tool
  // read before waiting may predate the binding and a roster change.
  const bot = readShell().bots.find((item) => item.id === id);
  if (!bot) return { ok: false, result: BOT_CONTEXT_MISSING };
  return { ok: true, caller: { id, bot } };
}

/** A bot acts only on itself and its own routines. */
export function mayActOn(caller: Caller, targetBotId: string): boolean {
  return caller.id === targetBotId;
}

/**
 * `mayActOn` again against the roster as it stands now, for the moment an
 * approval card is spent: the caller can have been deleted while the owner
 * was deciding.
 */
export function mayStillActOn(callerId: string, targetBotId: string, shell: ShellStore | null = peekShell()): boolean {
  return callerId === targetBotId && Boolean(shell?.bots.some((bot) => bot.id === callerId));
}

/** The refusal every self-only check returns. */
export function notAvailable(hint: string) {
  return { status: "blocked", error: "not_available_for_this_bot", hint } as const;
}

export const SELF_ONLY_HINT = "This bot can only do that for itself.";
