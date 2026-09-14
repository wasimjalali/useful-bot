import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import { apiError, errorCode, rateLimited, readJson } from "../../../lib/api-guard";
import {
  appendAgentEvent,
  claimProposal,
  clearThread,
  deleteThread,
  readProposal,
  reopenProposal,
  threadIdFor,
  type Proposal,
} from "../../../../shared/agent-store.ts";
import { fanOut } from "../../../lib/agent-exec";
import { deleteRoutinesForBot } from "../../../../shared/routines-store.ts";
import { applyShellAction, type ShellAction, type ShellStore } from "../../../../shared/shell-store.ts";
import { readShell, updateShell } from "../../../../shared/shell-io.ts";
import { groupMembers, speakersFrom } from "../../../../shared/threads.ts";

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  try {
    return NextResponse.json({ ok: true, store: readShell() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err, "shell_unavailable") }, { status: 400 });
  }
}

/**
 * Side effects the UI asks for alongside a shell action:
 *  - a confirmed fan-out (a bot proposed a group post) queues one handoff per
 *    member bot and touches both sides of every transcript;
 *  - clearing a thread drops that bot's agent transcript with its eve session.
 *
 * Deleting a bot is not here: see `detachBot`, which has to run before the
 * roster commit rather than after it.
 */
function applyFollowUp(action: ShellAction | undefined, shell: ShellStore): number {
  if (!action) return 0;
  if (action.type === "sendToBot") {
    const target = shell.bots.find((bot) => bot.id === action.botId);
    if (!target) return 0;
    const source = action.sourceBotId
      ? shell.bots.find((bot) => bot.id === action.sourceBotId) ?? null
      : null;
    const from = source ? { id: source.id, name: source.name } : null;
    if (target.kind === "group") {
      const members = groupMembers(speakersFrom(shell.bots), target.memberIds);
      return fanOut({
        source: from,
        targets: members.map((member) => ({ id: member.id, name: member.name })),
        message: action.message,
        group: { id: target.id, name: target.name },
      });
    }
    return fanOut({
      source: from,
      targets: [{ id: target.id, name: target.name }],
      message: action.message,
    });
  }
  if (action.type === "clearThread") {
    clearThread(action.botId);
  }
  return 0;
}

/**
 * What a bot owns outside the shell store: its routines and its transcript.
 *
 * This runs after the roster commit, not before it. Before means a commit that
 * throws (a contended shell lock, a guard inside `applyShellAction`) has
 * already destroyed the routines and the transcript of a bot that still
 * exists, which is worse than the orphan it was trying to avoid. Nothing here
 * can be atomic with the roster write anyway: three stores, three locks. So
 * the roster is the authority, this is best effort, and `sweepOrphans` on the
 * tick is what makes a failure here temporary instead of permanent.
 *
 * Returns the error when it could not finish, so the caller can say so rather
 * than swallow it the way this path used to.
 */
function detachBot(botId: string): string | null {
  try {
    deleteRoutinesForBot(botId);
    deleteThread(botId);
    return null;
  } catch (err) {
    return errorCode(err, "detach_failed");
  }
}

/** The action a card sends must match every field the proposal carried. */
function proposalMatchesAction(proposal: Proposal, action: ShellAction | undefined): boolean {
  if (!action) return false;
  const sameName = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();
  const sameSet = (left: string[], right: string[]) => {
    const a = [...new Set(left)].sort();
    const b = [...new Set(right)].sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  };
  switch (proposal.kind) {
    case "createBot":
      return action.type === "createBot"
        && sameName(action.name, proposal.name)
        && (action.petname ?? "") === proposal.petname
        && (action.label ?? "") === proposal.title
        && (action.description ?? "") === proposal.description
        && (action.sectionId ?? null) === proposal.sectionId;
    case "createGroup":
      return action.type === "createGroup"
        && sameName(action.name, proposal.name)
        && sameSet(action.memberIds, proposal.memberIds);
    case "updateBotProfile":
      return action.type === "updateBot"
        && action.botId === proposal.botId
        && (action.patch?.name ?? "") === proposal.patch.name
        && (action.patch?.label ?? "") === proposal.patch.title
        && (action.patch?.description ?? "") === proposal.patch.description
        && (action.patch?.avatarShape ?? null) === proposal.patch.avatarShape
        && (action.patch?.avatarColor ?? null) === proposal.patch.avatarColor;
    case "fanout":
      return action.type === "sendToBot"
        && action.message === proposal.message
        && (action.botId === proposal.groupId || proposal.targetIds.includes(action.botId));
  }
}

/** Note that the proposal was answered, on the thread that raised it. */
function noteProposal(claimed: Proposal, action: ShellAction | undefined, queued: number): void {
  const fallback = action && "botId" in action && typeof action.botId === "string"
    ? threadIdFor(action.botId)
    : "";
  const threadId = claimed.threadId || fallback;
  if (!threadId) return;
  const label = claimed.status === "confirmed" ? "Confirmed" : "Dismissed";
  const extra = queued > 0 ? ` and queued ${queued} handoff${queued === 1 ? "" : "s"}` : "";
  appendAgentEvent(threadId, {
    kind: "note",
    text: `${label} ${claimed.kind}${extra}.`,
    threadKind: claimed.kind === "fanout" && claimed.groupId ? "group" : "bot",
  });
}

export async function PUT(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  if (rateLimited(`shell:${gate.session.callerId}`, 120)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let claimed: Proposal | null = null;
  try {
    const body = await readJson(request) as {
      action?: ShellAction;
      proposalId?: string;
      proposalStatus?: "confirmed" | "dismissed";
    };
    if (!body.action && !body.proposalId) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const current = readShell();

    // Resolve fan-out recipients before anything is claimed or written, so an
    // empty or missing group cannot consume a proposal or leave a phantom card.
    if (body.action?.type === "sendToBot") {
      const action = body.action;
      const target = current.bots.find((bot) => bot.id === action.botId);
      if (!target) {
        return NextResponse.json({ ok: false, error: "target_missing" }, { status: 400 });
      }
      if (target.kind === "group") {
        const members = groupMembers(speakersFrom(current.bots), target.memberIds);
        if (members.length === 0) {
          return NextResponse.json({ ok: false, error: "fanout_empty" }, { status: 400 });
        }
      }
    }

    // A proposal is confirmable once. claimProposal only returns to the caller
    // that flips it out of pending, so two concurrent confirms cannot both
    // apply the same createBot.
    if (body.proposalId) {
      const status = body.proposalStatus === "dismissed" ? "dismissed" : "confirmed";
      // A decision that lost the race is only a benign replay when the winner
      // matches it. If the other outcome won (dismiss vs confirm), report the
      // conflict instead of telling the owner their click succeeded. The store
      // is re-read so a race loser does not replay a pre-race snapshot.
      const settled = (existingStatus: Proposal["status"]) =>
        existingStatus === status
          ? NextResponse.json({ ok: true, store: readShell(), queued: 0, replay: true })
          : NextResponse.json({ ok: false, error: "proposal_conflict", status: existingStatus }, { status: 409 });
      if (status === "confirmed") {
        const existing = readProposal(body.proposalId);
        if (!existing) {
          return NextResponse.json({ ok: false, error: "proposal_missing" }, { status: 410 });
        }
        if (existing.status !== "pending") return settled(existing.status);
        if (Date.parse(existing.expiresAt) <= Date.now()) {
          return NextResponse.json({ ok: false, error: "proposal_expired" }, { status: 410 });
        }
        if (!proposalMatchesAction(existing, body.action)) {
          return NextResponse.json({ ok: false, error: "proposal_mismatch" }, { status: 400 });
        }
      }
      claimed = claimProposal(body.proposalId, status);
      if (!claimed) {
        const existing = readProposal(body.proposalId);
        if (!existing) {
          return NextResponse.json({ ok: false, error: "proposal_missing" }, { status: 410 });
        }
        if (existing.status === "pending") {
          return NextResponse.json({ ok: false, error: "proposal_expired" }, { status: 410 });
        }
        return settled(existing.status);
      }
    }

    const action = body.action;
    const next = action
      ? updateShell((shell) => applyShellAction(shell, action).store)
      : current;
    // Only once the roster commit stood. A failure here is reported, not
    // swallowed, and the tick's sweep clears whatever was left behind.
    const detachError = action?.type === "deleteBot" ? detachBot(action.botId) : null;
    let queued = 0;
    if (action) {
      try {
        queued = applyFollowUp(action, next);
      } catch {
        /* the shell action already landed; the handoff pump reports the rest */
      }
    }
    if (claimed) {
      try {
        noteProposal(claimed, body.action, queued);
      } catch {
        /* the transcript note is best effort */
      }
    }
    return NextResponse.json({ ok: true, store: next, queued, detachError });
  } catch (err) {
    const guarded = apiError(err);
    if (guarded) return guarded;
    // Applying the action failed after the claim; give the card back so the
    // owner can retry instead of losing the proposal to a 400.
    if (claimed) {
      try { reopenProposal(claimed.id); } catch { /* best effort */ }
    }
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}
