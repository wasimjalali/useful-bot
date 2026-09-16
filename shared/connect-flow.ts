import {
  agentStorePath,
  appendAgentEvent,
  listProposalsOfKind,
  readProposal,
  updateProposal,
  type Proposal,
} from "./agent-store.ts";
import { authorizeConnector, countToolkitTools, forgetConnected, listConnectorToolkits } from "./composio.ts";
import { connectorsPath as defaultConnectorsPath } from "./connectors-store.ts";
import { queueHandoff, readHandoff } from "./handoffs.ts";
import { readShell } from "./shell-io.ts";
import { DEFAULT_BOT_ID } from "./shell-store.ts";

/**
 * The connect card's server side. Confirm starts Composio OAuth and parks the
 * card in `waiting`; the tick calls pumpConnects, which asks Composio whether
 * the account is active and, once it is, queues the resume handoff for the
 * bot that asked. The redirect URL is returned to the caller once and never
 * stored.
 */

export const CONNECT_WAIT_MS = 10 * 60 * 1000;
export const CONNECT_CHECK_MS = 5_000;
/** How long a Connected card may wait for its resume to land before it leaves anyway. */
export const CONNECT_LINGER_MS = 10 * 60 * 1000;

const lastCheck = new Map<string, number>();
/** Cards whose authorize call is in flight, so a double click mints one account, not two. */
const authorizing = new Set<string>();

export function resetConnectMemo(): void {
  lastCheck.clear();
  authorizing.clear();
}

type Stored = Extract<Proposal, { kind: "connectApp" }>;

function isConnect(proposal: Proposal | null): proposal is Stored {
  return proposal?.kind === "connectApp";
}

export async function startConnectAuthorize(
  proposalId: string,
  callbackUrl: string,
  opts: { storePath?: string; connectorsPath?: string; now?: number } = {},
): Promise<{ redirectUrl: string }> {
  const storePath = opts.storePath ?? agentStorePath();
  const proposal = readProposal(proposalId, storePath);
  if (!isConnect(proposal)) throw new Error("proposal_missing");
  if (proposal.status !== "pending") throw new Error("proposal_settled");
  if (proposal.phase === "connected") throw new Error("already_connected");
  // Same rule as every other confirm: a card past its TTL is not confirmable.
  const expiresAt = Date.parse(proposal.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= (opts.now ?? Date.now())) throw new Error("proposal_expired");
  if (authorizing.has(proposalId)) throw new Error("authorize_in_flight");
  authorizing.add(proposalId);
  try {
    const { redirectUrl, accountId } = await authorizeConnector(
      proposal.slug,
      callbackUrl,
      opts.connectorsPath ?? defaultConnectorsPath(),
    );
    const now = new Date(opts.now ?? Date.now()).toISOString();
    updateProposal(proposalId, (item) => {
      if (item.kind !== "connectApp" || item.status !== "pending") return;
      item.phase = "waiting";
      item.accountId = accountId;
      item.waitingSince = now;
    }, storePath);
    lastCheck.delete(proposalId);
    return { redirectUrl };
  } finally {
    authorizing.delete(proposalId);
  }
}

export async function pumpConnects(
  opts: { now?: number; storePath?: string; connectorsPath?: string } = {},
): Promise<{ connected: string[]; expired: string[] }> {
  const now = opts.now ?? Date.now();
  const storePath = opts.storePath ?? agentStorePath();
  const connectorsPath = opts.connectorsPath ?? defaultConnectorsPath();
  const connected: string[] = [];
  const expired: string[] = [];
  const cards = listProposalsOfKind("connectApp", storePath).filter((item) => item.status === "pending");
  // A Connected card stays docked until its resume handoff has landed (or
  // given up), so the owner sees the pill until the bot's next turn starts.
  for (const card of cards.filter((item) => item.phase === "connected")) {
    const handoff = card.handoffId ? readHandoff(card.handoffId) : null;
    const landed = !handoff || handoff.status !== "pending";
    const since = Date.parse(card.waitingSince ?? "");
    const lingered = !Number.isFinite(since) || now - since > CONNECT_LINGER_MS;
    if (landed || lingered) {
      updateProposal(card.id, (item) => {
        item.status = "confirmed";
      }, storePath);
    }
  }
  const waiting = cards.filter((item) => item.phase === "waiting");
  for (const card of waiting) {
    const since = Date.parse(card.waitingSince ?? "");
    if (!Number.isFinite(since) || now - since > CONNECT_WAIT_MS) {
      updateProposal(card.id, (item) => {
        if (item.kind === "connectApp") item.phase = "expired";
      }, storePath);
      lastCheck.delete(card.id);
      expired.push(card.id);
      continue;
    }
    const checked = lastCheck.get(card.id) ?? 0;
    if (now - checked < CONNECT_CHECK_MS) continue;
    lastCheck.set(card.id, now);
    let active = false;
    try {
      forgetConnected();
      const page = await listConnectorToolkits({ search: card.slug, limit: 20 }, connectorsPath);
      active = page.rows.some((row) => row.slug === card.slug && row.connected);
    } catch {
      continue;
    }
    if (!active) continue;
    const toolCount = await countToolkitTools(card.slug, connectorsPath);
    // Flip under the lock, and only from waiting: a dismiss that landed
    // between the check and here must win.
    const flipped = updateProposal(card.id, (item) => {
      if (item.kind !== "connectApp" || item.status !== "pending" || item.phase !== "waiting") return;
      item.phase = "connected";
      item.toolCount = toolCount;
    }, storePath);
    if (!flipped || flipped.kind !== "connectApp" || flipped.phase !== "connected") continue;
    try {
      appendAgentEvent(card.threadId, { kind: "note", text: `${card.name} connected` }, storePath);
    } catch {
      /* the resume below still tells the owner */
    }
    const targetId = card.sourceBotId ?? card.threadId;
    let targetName = "Useful Bot";
    try {
      targetName = readShell().bots.find((bot) => bot.id === targetId)?.name ?? targetName;
    } catch {
      /* the name is cosmetic */
    }
    let handoffId: string;
    try {
      handoffId = queueHandoff({
        sourceBotId: DEFAULT_BOT_ID,
        sourceName: "Useful Bot",
        targetBotId: targetId,
        targetName,
        message: `The owner connected ${card.name}. Continue the task: ${card.purpose}`,
        depth: 0,
      }).id;
    } catch {
      // No resume record means no resume. Put the card back to waiting so
      // the next tick sees the active account again and tries once more.
      updateProposal(card.id, (item) => {
        if (item.kind === "connectApp" && item.phase === "connected") item.phase = "waiting";
      }, storePath);
      lastCheck.delete(card.id);
      continue;
    }
    // Still pending: the card shows Connected until the handoff lands, and
    // waitingSince now bounds how long that can take.
    updateProposal(card.id, (item) => {
      if (item.kind !== "connectApp") return;
      item.handoffId = handoffId;
      item.waitingSince = new Date(now).toISOString();
    }, storePath);
    lastCheck.delete(card.id);
    connected.push(card.id);
  }
  return { connected, expired };
}
