import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import {
  appendAgentEvent,
  claimProposal,
  clearThread,
  readProposal,
  threadIdFor,
  type Proposal,
} from "../../../../shared/agent-store.ts";
import { fanOut } from "../../../lib/agent-exec";
import { applyShellAction, parseShell, type ShellAction } from "../../../../shared/shell-store.ts";
import { readShell, writeShell } from "../../../../shared/shell-io.ts";
import { groupMembers, speakersFrom } from "../../../../shared/threads.ts";

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  try {
    return NextResponse.json({ ok: true, store: readShell() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/**
 * Side effects the UI asks for alongside a shell action:
 *  - a confirmed fan-out (a bot proposed a group post) queues one handoff per
 *    member bot and touches both sides of every transcript;
 *  - clearing a thread drops that bot's agent transcript with its eve session.
 */
function applyFollowUp(action: ShellAction | undefined): number {
  if (!action) return 0;
  if (action.type === "sendToBot") {
    const shell = readShell();
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

// Shell writes are read/apply/write over one JSON file. The client serializes
// its own calls, but two tabs (or a retry) could still interleave, so requests
// in this process run one at a time.
let shellWriteChain: Promise<void> = Promise.resolve();
function withShellWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = shellWriteChain.then(task);
  shellWriteChain = result.then(() => undefined, () => undefined);
  return result;
}

export async function PUT(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  return withShellWrite(async () => {
  try {
    const body = await request.json() as {
      store?: unknown;
      action?: ShellAction;
      proposalId?: string;
      proposalStatus?: "confirmed" | "dismissed";
    };
    const current = readShell();
    // Validate and compute the next store before claiming, so an invalid
    // action leaves a pending proposal pending.
    const next = body.action
      ? applyShellAction(current, body.action).store
      : body.store !== undefined
        ? parseShell(body.store)
        : current;
    // A proposal is confirmable once. claimProposal only returns to the caller
    // that flips it out of pending, so two concurrent confirms cannot both
    // apply the same createBot.
    let claimed: Proposal | null = null;
    if (body.proposalId) {
      const status = body.proposalStatus === "dismissed" ? "dismissed" : "confirmed";
      claimed = claimProposal(body.proposalId, status);
      if (!claimed) {
        const existing = readProposal(body.proposalId);
        if (!existing) {
          return NextResponse.json({ ok: false, error: "proposal_missing" }, { status: 410 });
        }
        return NextResponse.json({ ok: true, store: current, queued: 0, replay: true });
      }
    }
    writeShell(next);
    let queued = 0;
    if (body.action) {
      try {
        queued = applyFollowUp(body.action);
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
    return NextResponse.json({ ok: true, store: next, queued });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  });
}
