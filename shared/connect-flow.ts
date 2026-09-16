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
import { queueHandoff } from "./handoffs.ts";
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

const lastCheck = new Map<string, number>();

export function resetConnectMemo(): void {
  lastCheck.clear();
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
  const { redirectUrl, accountId } = await authorizeConnector(
    proposal.slug,
    callbackUrl,
    opts.connectorsPath ?? defaultConnectorsPath(),
  );
  const now = new Date(opts.now ?? Date.now()).toISOString();
  updateProposal(proposalId, (item) => {
    if (item.kind !== "connectApp") return;
    item.phase = "waiting";
    item.accountId = accountId;
    item.waitingSince = now;
  }, storePath);
  lastCheck.delete(proposalId);
  return { redirectUrl };
}

export async function pumpConnects(
  opts: { now?: number; storePath?: string; connectorsPath?: string } = {},
): Promise<{ connected: string[]; expired: string[] }> {
  const now = opts.now ?? Date.now();
  const storePath = opts.storePath ?? agentStorePath();
  const connectorsPath = opts.connectorsPath ?? defaultConnectorsPath();
  const connected: string[] = [];
  const expired: string[] = [];
  const waiting = listProposalsOfKind("connectApp", storePath).filter(
    (item) => item.status === "pending" && item.phase === "waiting",
  );
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
    queueHandoff({
      sourceBotId: DEFAULT_BOT_ID,
      sourceName: "Useful Bot",
      targetBotId: targetId,
      targetName,
      message: `The owner connected ${card.name}. Continue the task: ${card.purpose}`,
      depth: 0,
    });
    updateProposal(card.id, (item) => {
      item.status = "confirmed";
    }, storePath);
    lastCheck.delete(card.id);
    connected.push(card.id);
  }
  return { connected, expired };
}
