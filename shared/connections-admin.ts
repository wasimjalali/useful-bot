import { discoverConnection } from "./connection-tools.ts";
import { reauthorizeProposalId } from "./connection-flow.ts";
import {
  connectionIndex,
  connectionStatus,
  removeConnectionIndex,
  type ConnectionState,
} from "./connection-tools-store.ts";
import {
  EXCALIDRAW_CONNECTION,
  findConnectionById,
  readConnectionsStore,
  removeConnection,
  type ConnectionAuthKind,
  type ConnectionEntry,
  type ConnectionKind,
} from "./connections-store.ts";
import { connectionSecretService, keychainDel } from "./keychain.ts";
import { startMcpOAuth } from "./mcp-oauth.ts";

/**
 * What the Connectors page can do with a direct (MCP or OpenAPI) connection:
 * read it, list it again, sign it in again, remove it. The route is a thin
 * layer over these so they can be exercised without a signed-in session.
 * Nothing here returns a token, a header or the Keychain item.
 */

export type PublicConnection = {
  id: string;
  name: string;
  url: string;
  kind: ConnectionKind;
  authKind: ConnectionAuthKind;
  /** Seeded with the app. It cannot be removed. */
  builtin: boolean;
  state: ConnectionState;
  lastError: { code: string; message: string } | null;
  checkedAt: string | null;
  toolCount: number | null;
  tools: Array<{ name: string; description: string }>;
};

function oneLine(value: string, max: number): string {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

export function publicConnection(entry: ConnectionEntry): PublicConnection {
  const status = connectionStatus(entry.id);
  const index = connectionIndex(entry.id);
  // A row from before status was kept is described by what its listing holds.
  const state: ConnectionState = status?.state
    ?? (index ? (index.failed ? "discovery_failed" : index.tools.length > 0 ? "ready" : "zero_tools") : "pending");
  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    kind: entry.kind,
    authKind: entry.authKind,
    builtin: entry.id === EXCALIDRAW_CONNECTION.id,
    state,
    lastError: status?.lastError ?? null,
    checkedAt: status?.checkedAt ?? index?.fetchedAt ?? null,
    toolCount: status?.toolCount ?? (index && !index.failed ? index.tools.length : null),
    tools: (index?.tools ?? []).map((tool) => ({ name: tool.name, description: oneLine(tool.description, 200) })),
  };
}

export function listPublicConnections(): PublicConnection[] {
  return readConnectionsStore().connections.map(publicConnection);
}

export async function refreshConnection(id: string): Promise<PublicConnection> {
  const entry = findConnectionById(id);
  if (!entry) throw new Error("connection_missing");
  // Reads the credential itself; one it cannot find comes back in the status.
  await discoverConnection(entry);
  return publicConnection(entry);
}

/**
 * Start the sign-in again for a connection that is already registered. The
 * pending state is keyed to the connection, not to a card, and the callback
 * route stores the new tokens under the same id.
 */
export async function reauthorizeConnection(
  id: string,
  callbackUrl: string,
): Promise<{ authorizeUrl: string; redirectHost: string }> {
  const entry = findConnectionById(id);
  if (!entry) throw new Error("connection_missing");
  if (entry.kind !== "mcp" || entry.authKind !== "oauth") throw new Error("not_oauth");
  const { authorizeUrl, redirectHost } = await startMcpOAuth({
    mcpUrl: entry.url,
    name: entry.name,
    proposalId: reauthorizeProposalId(entry.id),
    connectionId: entry.id,
    redirectUri: callbackUrl,
  });
  return { authorizeUrl, redirectHost };
}

/** Remove the row, its Keychain item, its listing and its status. */
export function deleteConnection(id: string): void {
  if (id === EXCALIDRAW_CONNECTION.id) throw new Error("connection_builtin");
  if (!findConnectionById(id)) throw new Error("connection_missing");
  // The credential first: if this throws the row is still there to retry
  // against, where a row removed first would leave the secret with no way to
  // find it again. Deleting an item that was never stored is not an error.
  keychainDel(connectionSecretService(id));
  removeConnection(id);
  removeConnectionIndex(id);
}
