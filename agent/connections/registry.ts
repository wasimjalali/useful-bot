import {
  defineDynamic,
  defineMcpClientConnection,
  defineOpenAPIConnection,
} from "eve/connections";
import {
  isAuthHeaderName,
  readConnectionsStore,
  type ConnectionEntry,
} from "../../shared/connections-store.ts";
import { connectionSecretService, keychainGet, keychainSet } from "../../shared/keychain.ts";
import { refreshMcpOAuth, type OAuthTokenBundle } from "../../shared/mcp-oauth.ts";

function parseBundle(raw: string | null): OAuthTokenBundle | null {
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as OAuthTokenBundle;
    if (!rec || typeof rec.accessToken !== "string") return null;
    return rec;
  } catch {
    return null;
  }
}

async function bearerFromKeychain(id: string): Promise<{ token: string; expiresAt?: number }> {
  const raw = keychainGet(connectionSecretService(id));
  if (!raw) throw new Error(`connection_secret_missing:${id}`);
  return { token: raw };
}

async function oauthToken(entry: ConnectionEntry): Promise<{ token: string; expiresAt?: number }> {
  const service = connectionSecretService(entry.id);
  let bundle = parseBundle(keychainGet(service));
  if (!bundle) throw new Error(`connection_secret_missing:${entry.id}`);
  if (bundle.expiresAt && bundle.expiresAt < Date.now() + 30_000 && bundle.refreshToken) {
    bundle = await refreshMcpOAuth(bundle);
    keychainSet(service, JSON.stringify(bundle));
  }
  return { token: bundle.accessToken, expiresAt: bundle.expiresAt ?? undefined };
}

function definitionFor(entry: ConnectionEntry) {
  const tools = entry.toolsAllow ? { allow: entry.toolsAllow } : undefined;
  if (entry.kind === "openapi") {
    if (entry.authKind === "none") {
      return defineOpenAPIConnection({ spec: entry.url, description: entry.description });
    }
    if (entry.authKind === "apiKey") {
      const header = isAuthHeaderName(entry.authHeader) ? entry.authHeader : "X-Api-Key";
      return defineOpenAPIConnection({
        spec: entry.url,
        description: entry.description,
        headers: { [header]: async () => (await bearerFromKeychain(entry.id)).token },
      });
    }
    if (entry.authKind === "oauth") {
      return defineOpenAPIConnection({
        spec: entry.url,
        description: entry.description,
        instanceKey: entry.id,
        auth: { getToken: () => oauthToken(entry) },
      });
    }
    return defineOpenAPIConnection({
      spec: entry.url,
      description: entry.description,
      instanceKey: entry.id,
      auth: { getToken: () => bearerFromKeychain(entry.id) },
    });
  }
  if (entry.authKind === "none") {
    return defineMcpClientConnection({
      url: entry.url,
      description: entry.description,
      tools,
    });
  }
  if (entry.authKind === "apiKey") {
    const header = isAuthHeaderName(entry.authHeader) ? entry.authHeader : "X-Api-Key";
    return defineMcpClientConnection({
      url: entry.url,
      description: entry.description,
      instanceKey: entry.id,
      headers: { [header]: async () => (await bearerFromKeychain(entry.id)).token },
      tools,
    });
  }
  if (entry.authKind === "oauth") {
    return defineMcpClientConnection({
      url: entry.url,
      description: entry.description,
      instanceKey: entry.id,
      auth: { getToken: () => oauthToken(entry) },
      tools,
    });
  }
  return defineMcpClientConnection({
    url: entry.url,
    description: entry.description,
    instanceKey: entry.id,
    auth: { getToken: () => bearerFromKeychain(entry.id) },
    tools,
  });
}

export default defineDynamic({
  events: {
    "turn.started": async () => {
      const store = readConnectionsStore();
      if (store.connections.length === 0) return null;
      return Object.fromEntries(store.connections.map((entry) => [entry.id, definitionFor(entry)]));
    },
  },
});
