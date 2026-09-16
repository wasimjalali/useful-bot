import { readSessionGrant, type WorkspacePermission } from "../../shared/workspace-store.ts";
import type { ApprovalStore } from "./approvals.ts";
import { waitUntilNotPending } from "./approvals.ts";

/**
 * The bot's permission for this session. Auto when the session carries no
 * grant: that only happens for a turn the web server did not stamp, which is
 * the owner's own channel.
 */
export function sessionPermission(ctx?: { session?: { id?: string } }): WorkspacePermission {
  const grant = ctx?.session?.id ? readSessionGrant(ctx.session.id) : null;
  return grant?.permission ?? "auto";
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
 * approval record binds the action either way and a replay is refused.
 */
export async function settle(store: ApprovalStore, id: string, hash: string, gate: Exclude<Gate, "refuse">): Promise<void> {
  if (gate === "run") {
    store.decide(id, "approve", hash);
    return;
  }
  await waitUntilNotPending(store, id);
}

/** The blocked result every gated tool returns when Read only refuses it. */
export const READ_ONLY_BLOCKED = { status: "blocked", error: "workspace_read_only" } as const;
