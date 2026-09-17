import {
  agentStorePath,
  appendAgentEvent,
  listProposalsOfKind,
  readProposal,
  updateProposal,
  type Proposal,
} from "./agent-store.ts";
import { assertConnectionUrl } from "./connection-url.ts";
import {
  allocateConnectionId,
  findConnectionByUrl,
  isAuthHeaderName,
  upsertConnection,
  type ConnectionAuthKind,
  type ConnectionEntry,
} from "./connections-store.ts";
import { connectionSecretService, keychainSet } from "./keychain.ts";
import { listHandoffs, queueHandoff } from "./handoffs.ts";
import { wrapUntrusted } from "./untrusted.ts";
import { countOpenApiOperations, listMcpTools, modelToolNames } from "./mcp-http.ts";
import { completeMcpOAuth, findOauthPending, startMcpOAuth } from "./mcp-oauth.ts";
import { readShell } from "./shell-io.ts";
import { DEFAULT_BOT_ID } from "./shell-store.ts";

/**
 * Connect-server card. Confirm writes the registry (and Keychain, and OAuth).
 * The tick's pump expires waiting cards and retries a resume that failed to
 * queue. Mirror of connect-flow.ts; do not share mutable memo with it.
 */

export const SERVER_WAIT_MS = 10 * 60 * 1000;
export const SERVER_LINGER_MS = 10 * 60 * 1000;

const authorizing = new Set<string>();

export function resetConnectionMemo(): void {
  authorizing.clear();
}

type Stored = Extract<Proposal, { kind: "connectServer" }>;

function isServer(proposal: Proposal | null): proposal is Stored {
  return proposal?.kind === "connectServer";
}

function oneLine(value: string, max: number): string {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

function resumeMessage(card: Stored): string {
  return `The owner connected the server ${card.connectionId}. Continue the original task.\n${wrapUntrusted("connect-purpose", oneLine(card.purpose, 120))}`;
}

function queueResume(card: Stored, storePath: string): boolean {
  const targetId = card.sourceBotId ?? card.threadId;
  let targetName = "Useful Bot";
  try {
    targetName = readShell().bots.find((bot) => bot.id === targetId)?.name ?? targetName;
  } catch {
    /* the name is cosmetic */
  }
  const message = resumeMessage(card);
  let handoffId: string;
  try {
    const flippedAt = Date.parse(card.waitingSince ?? "");
    const existing = listHandoffs().find(
      (record) => record.targetBotId === targetId
        && record.message === message
        && record.sourceBotId === DEFAULT_BOT_ID
        && record.status !== "failed"
        && Number.isFinite(flippedAt)
        && Date.parse(record.createdAt) >= flippedAt - 1_000,
    );
    handoffId = existing?.id ?? queueHandoff({
      sourceBotId: DEFAULT_BOT_ID,
      sourceName: "Useful Bot",
      targetBotId: targetId,
      targetName,
      message,
      depth: 0,
    }).id;
  } catch {
    return false;
  }
  try {
    updateProposal(card.id, (item) => {
      if (item.kind !== "connectServer" || item.handoffId) return;
      item.handoffId = handoffId;
    }, storePath);
  } catch {
    return false;
  }
  return true;
}

async function probeToolCount(entry: ConnectionEntry, headers: Record<string, string> = {}): Promise<number | null> {
  try {
    if (entry.kind === "openapi") return await countOpenApiOperations(entry.url);
    const tools = await listMcpTools(entry.url, headers);
    const names = entry.toolsAllow ?? modelToolNames(tools);
    return names.length;
  } catch {
    return null;
  }
}

function authHeaders(authKind: ConnectionAuthKind, secret: string | null, authHeader: string | null): Record<string, string> {
  if (!secret) return {};
  if (authKind === "bearer") return { authorization: `Bearer ${secret}` };
  if (authKind === "apiKey") {
    const name = isAuthHeaderName(authHeader) ? authHeader : "X-Api-Key";
    return { [name]: secret };
  }
  return {};
}

function writeSecret(connectionId: string, secret: string): void {
  keychainSet(connectionSecretService(connectionId), secret);
}

function markConnected(
  proposalId: string,
  entry: ConnectionEntry,
  toolCount: number | null,
  now: number,
  storePath: string,
): Stored | null {
  updateProposal(proposalId, (item) => {
    if (item.kind !== "connectServer" || item.status !== "pending") return;
    item.phase = "connected";
    item.toolCount = toolCount;
    item.waitingSince = new Date(now).toISOString();
    item.redirectHost = null;
  }, storePath);
  const flipped = readProposal(proposalId, storePath);
  if (!isServer(flipped) || flipped.phase !== "connected") return null;
  try {
    appendAgentEvent(flipped.threadId, { kind: "note", text: `${entry.name} connected` }, storePath);
  } catch {
    /* the resume still tells the owner */
  }
  if (queueResume(flipped, storePath)) {
    updateProposal(proposalId, (item) => {
      if (item.status === "pending") item.status = "confirmed";
    }, storePath);
  }
  return flipped;
}

export async function startConnectionConfirm(
  proposalId: string,
  opts: {
    secret?: string;
    callbackUrl: string;
    storePath?: string;
    now?: number;
  },
): Promise<{ redirectUrl?: string; redirectHost?: string }> {
  const storePath = opts.storePath ?? agentStorePath();
  const proposal = readProposal(proposalId, storePath);
  if (!isServer(proposal)) throw new Error("proposal_missing");
  if (proposal.status !== "pending") throw new Error("proposal_settled");
  if (proposal.phase === "connected") throw new Error("already_connected");
  const expiresAt = Date.parse(proposal.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= (opts.now ?? Date.now())) throw new Error("proposal_expired");
  if (authorizing.has(proposalId)) throw new Error("authorize_in_flight");
  authorizing.add(proposalId);
  try {
    const url = assertConnectionUrl(proposal.url);
    const existing = findConnectionByUrl(url);
    if (existing && existing.id !== proposal.connectionId) {
      // An identical URL the owner already approved, under another id: point
      // this card at that row instead of minting a second one. Two rows mount
      // the same server twice, so the model sees every one of its tools twice
      // and they both count against the tool cap. propose_connection refuses a
      // URL that is already connected, and one pending card per thread, but
      // two bots can each hold a card for the same server and the owner can
      // authorize both.
      //
      // The id moves on the card, not just in this function: writeSecret, the
      // OAuth start and the entry below all read it from there, and
      // completeConnectionOAuth refuses a card whose id no longer matches the
      // pending OAuth state.
      updateProposal(proposalId, (item) => {
        if (item.kind === "connectServer" && item.status === "pending") item.connectionId = existing.id;
      }, storePath);
      proposal.connectionId = existing.id;
    }
    if (proposal.authKind === "oauth") {
      const { authorizeUrl, redirectHost } = await startMcpOAuth({
        mcpUrl: url,
        name: proposal.name,
        proposalId,
        connectionId: proposal.connectionId,
        redirectUri: opts.callbackUrl,
      });
      const now = new Date(opts.now ?? Date.now()).toISOString();
      updateProposal(proposalId, (item) => {
        if (item.kind !== "connectServer" || item.status !== "pending" || item.phase === "connected") return;
        item.phase = "waiting";
        item.redirectHost = redirectHost;
        item.waitingSince = now;
      }, storePath);
      return { redirectUrl: authorizeUrl, redirectHost };
    }
    if (proposal.authKind === "apiKey" || proposal.authKind === "bearer") {
      const secret = (opts.secret ?? "").trim();
      if (secret.length < 8 || secret.length > 4096) throw new Error("secret_invalid");
      writeSecret(proposal.connectionId, secret);
    }
    const toolsAllow = proposal.connectionId === "excalidraw" ? ["read_me", "create_view"] : null;
    const entry: ConnectionEntry = {
      id: proposal.connectionId || existing?.id || allocateConnectionId(proposal.name),
      kind: proposal.connectionKind,
      name: proposal.name,
      url,
      description: proposal.description || `${proposal.name} MCP server`,
      authKind: proposal.authKind,
      authHeader: proposal.authKind === "apiKey" ? (proposal.authHeader ?? "X-Api-Key") : null,
      toolsAllow,
      createdAt: new Date(opts.now ?? Date.now()).toISOString(),
    };
    upsertConnection(entry);
    const headers = authHeaders(
      proposal.authKind,
      proposal.authKind === "none" ? null : (opts.secret ?? "").trim() || null,
      entry.authHeader,
    );
    const toolCount = await probeToolCount(entry, headers);
    markConnected(proposalId, entry, toolCount, opts.now ?? Date.now(), storePath);
    return {};
  } finally {
    authorizing.delete(proposalId);
  }
}

export async function completeConnectionOAuth(
  code: string,
  state: string,
  opts: { storePath?: string; now?: number } = {},
): Promise<{ proposalId: string }> {
  const pendingPeek = findOauthPending(state);
  if (!pendingPeek || !pendingPeek.proposalId.startsWith("prp_")) throw new Error("oauth_state");
  const storePath = opts.storePath ?? agentStorePath();
  const proposal = readProposal(pendingPeek.proposalId, storePath);
  if (!isServer(proposal) || proposal.status !== "pending") throw new Error("proposal_missing");
  if (proposal.phase !== "waiting") throw new Error("proposal_phase");
  if (proposal.connectionId !== pendingPeek.connectionId) throw new Error("proposal_mismatch");
  const expiresAt = Date.parse(proposal.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= (opts.now ?? Date.now())) throw new Error("proposal_expired");
  const { bundle, pending } = await completeMcpOAuth({ code, state });
  if (pending.proposalId !== pendingPeek.proposalId || pending.connectionId !== pendingPeek.connectionId) {
    throw new Error("oauth_state");
  }
  keychainSet(connectionSecretService(pending.connectionId), JSON.stringify(bundle));
  const url = assertConnectionUrl(proposal.url);
  const entry: ConnectionEntry = {
    id: pending.connectionId,
    kind: proposal.connectionKind,
    name: proposal.name,
    url,
    description: proposal.description || `${proposal.name} MCP server`,
    authKind: "oauth",
    authHeader: null,
    toolsAllow: null,
    createdAt: new Date(opts.now ?? Date.now()).toISOString(),
  };
  upsertConnection(entry);
  const toolCount = await probeToolCount(entry, { authorization: `Bearer ${bundle.accessToken}` });
  markConnected(pending.proposalId, entry, toolCount, opts.now ?? Date.now(), storePath);
  return { proposalId: pending.proposalId };
}

let pumpQueue: Promise<unknown> = Promise.resolve();

export function pumpConnections(
  opts: { now?: number; storePath?: string } = {},
): Promise<{ connected: string[]; expired: string[] }> {
  const run = pumpQueue.then(() => pumpOnce(opts), () => pumpOnce(opts));
  pumpQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function pumpOnce(
  opts: { now?: number; storePath?: string },
): Promise<{ connected: string[]; expired: string[] }> {
  const now = opts.now ?? Date.now();
  const storePath = opts.storePath ?? agentStorePath();
  const connected: string[] = [];
  const expired: string[] = [];
  const cards = listProposalsOfKind("connectServer", storePath).filter((item) => item.status === "pending");
  for (const card of cards.filter((item) => item.phase === "connected")) {
    const since = Date.parse(card.waitingSince ?? "");
    const lingered = !Number.isFinite(since) || now - since > SERVER_LINGER_MS;
    const queued = card.handoffId ? true : queueResume(card, storePath);
    if (queued || lingered) {
      updateProposal(card.id, (item) => {
        if (item.status === "pending") item.status = "confirmed";
      }, storePath);
      if (queued) connected.push(card.id);
    }
  }
  for (const card of cards.filter((item) => item.phase === "waiting")) {
    const since = Date.parse(card.waitingSince ?? "");
    if (Number.isFinite(since) && now - since <= SERVER_WAIT_MS) continue;
    let didExpire = false;
    updateProposal(card.id, (item) => {
      if (item.kind === "connectServer" && item.phase === "waiting" && item.waitingSince === card.waitingSince) {
        item.phase = "expired";
        didExpire = true;
      }
    }, storePath);
    if (didExpire) expired.push(card.id);
  }
  return { connected, expired };
}
