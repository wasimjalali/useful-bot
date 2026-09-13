import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import {
  appendAgentEvent,
  clearThread,
  readProposal,
  resolveProposal,
  threadIdFor,
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

function noteProposal(
  action: ShellAction | undefined,
  proposalId: string | undefined,
  status: "confirmed" | "dismissed",
  queued: number,
): void {
  if (!proposalId) return;
  const resolved = resolveProposal(proposalId, status);
  if (!resolved) return;
  const fallback = action && "botId" in action ? threadIdFor(action.botId) : "";
  const threadId = resolved.threadId || fallback;
  if (!threadId) return;
  const label = status === "confirmed" ? "Confirmed" : "Dismissed";
  const extra = queued > 0 ? ` and queued ${queued} handoff${queued === 1 ? "" : "s"}` : "";
  appendAgentEvent(threadId, {
    kind: "note",
    text: `${label} ${resolved.kind}${extra}.`,
    threadKind: resolved.kind === "fanout" && resolved.groupId ? "group" : "bot",
  });
}

export async function PUT(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  try {
    const body = await request.json() as {
      store?: unknown;
      action?: ShellAction;
      proposalId?: string;
      proposalStatus?: "confirmed" | "dismissed";
    };
    const current = readShell();
    // A proposal is confirmable once. A double click or a retried request must
    // not apply the action again (the same createBot would land two bots).
    if (body.proposalId) {
      const existing = readProposal(body.proposalId);
      if (existing && existing.status !== "pending") {
        return NextResponse.json({ ok: true, store: current, queued: 0, replay: true });
      }
    }
    const next = body.action
      ? applyShellAction(current, body.action).store
      : parseShell(body.store);
    writeShell(next);
    let queued = 0;
    if (body.action) {
      try {
        queued = applyFollowUp(body.action);
      } catch {
        /* the shell action already landed; the handoff pump reports the rest */
      }
    }
    if (body.proposalId) {
      const status = body.proposalStatus === "dismissed" ? "dismissed" : "confirmed";
      try {
        noteProposal(body.action, body.proposalId, status, queued);
      } catch {
        /* the transcript note is best effort */
      }
    }
    return NextResponse.json({ ok: true, store: next, queued });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
