import { findConnectionById, isAuthHeaderName, type ConnectionEntry } from "./connections-store.ts";
import { connectionSecretService, keychainGet, keychainSet } from "./keychain.ts";
import { McpError } from "./mcp-http.ts";
import { OAuthRefreshError, refreshMcpOAuth, type OAuthTokenBundle } from "./mcp-oauth.ts";

/**
 * How a connection proves who it is. eve owns this for the connections it
 * mounts; the tools this app mounts on demand call the same server over plain
 * HTTP and need the same headers, so the builders live here rather than
 * inside the eve registry file that used to hold them.
 */

export function parseBundle(raw: string | null): OAuthTokenBundle | null {
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as OAuthTokenBundle;
    if (!rec || typeof rec.accessToken !== "string") return null;
    return rec;
  } catch {
    return null;
  }
}

/**
 * An OAuth connection whose access token has run out and could not be renewed:
 * there is no refresh token, or the server said it is no longer good
 * (`invalid_grant`). The stale token is never sent. The owner has to sign in
 * again.
 */
export class OAuthExpiredError extends Error {
  readonly code = "oauth_expired";

  constructor() {
    super("oauth_expired");
    this.name = "OAuthExpiredError";
  }
}

export async function bearerFromKeychain(id: string): Promise<{ token: string; expiresAt?: number }> {
  const raw = keychainGet(connectionSecretService(id));
  if (!raw) throw new Error(`connection_secret_missing:${id}`);
  return { token: raw };
}

function isExpiring(bundle: OAuthTokenBundle): boolean {
  return Boolean(bundle.expiresAt && bundle.expiresAt < Date.now() + 30_000);
}

/**
 * What a failed refresh means. Only a refresh token the server says is spent
 * ends the sign-in: a network error, a timeout, an address this app will not
 * call or a server that is down says nothing about the token, and treating it
 * as expiry sent the owner to sign in again over an outage.
 */
function refreshFailure(err: unknown): Error {
  if (err instanceof OAuthRefreshError) {
    if ((err.status === 400 || err.status === 401) && err.code === "invalid_grant") return new OAuthExpiredError();
    if (err.status === 429 || err.status >= 500) {
      return new McpError("unreachable", "oauth_refresh_unreachable", { status: err.status });
    }
    return new McpError("auth", `oauth_refresh_${err.status}`, { status: err.status });
  }
  return new McpError("unreachable", "oauth_refresh_unreachable");
}

/**
 * One refresh per connection at a time. A refresh token is often single use,
 * so two callers refreshing together spend it twice and the second is refused
 * for a token the first just replaced.
 */
const refreshing = new Map<string, Promise<OAuthTokenBundle>>();

function refreshOnce(id: string): Promise<OAuthTokenBundle> {
  const running = refreshing.get(id);
  if (running) return running;
  const service = connectionSecretService(id);
  const run = (async () => {
    // Read again, not the caller's copy: another process may have refreshed
    // since, and its refresh token is the one that still works.
    const stored = parseBundle(keychainGet(service));
    if (!stored) throw new Error(`connection_secret_missing:${id}`);
    if (!isExpiring(stored)) return stored;
    if (!stored.refreshToken) throw new OAuthExpiredError();
    let next: OAuthTokenBundle;
    try {
      next = await refreshMcpOAuth(stored);
    } catch (err) {
      throw refreshFailure(err);
    }
    // The owner may have removed the connection while the server was thinking;
    // a credential written now would have no row pointing at it.
    if (!findConnectionById(id)) throw new Error("connection_missing");
    keychainSet(service, JSON.stringify(next));
    return next;
  })().finally(() => refreshing.delete(id));
  refreshing.set(id, run);
  return run;
}

/**
 * The access token for an OAuth connection, refreshed when it is about to
 * expire. The refreshed bundle is written back, so the next caller (eve's own
 * registry or a tool wrapper) reads the live one.
 */
export async function oauthToken(entry: ConnectionEntry): Promise<{ token: string; expiresAt?: number }> {
  let bundle = parseBundle(keychainGet(connectionSecretService(entry.id)));
  if (!bundle) throw new Error(`connection_secret_missing:${entry.id}`);
  if (isExpiring(bundle)) {
    if (!bundle.refreshToken) throw new OAuthExpiredError();
    bundle = await refreshOnce(entry.id);
  }
  return { token: bundle.accessToken, expiresAt: bundle.expiresAt ?? undefined };
}

/** The header name an `apiKey` connection puts its secret in. */
export function apiKeyHeaderName(entry: ConnectionEntry): string {
  return isAuthHeaderName(entry.authHeader) ? entry.authHeader : "X-Api-Key";
}

/**
 * The request headers for one connection, for the direct HTTP path. Never
 * logged and never returned to the model: the caller passes them straight to
 * `listMcpTools` or `callMcpTool`.
 */
export async function connectionHeaders(entry: ConnectionEntry): Promise<Record<string, string>> {
  if (entry.authKind === "none") return {};
  if (entry.authKind === "apiKey") {
    return { [apiKeyHeaderName(entry)]: (await bearerFromKeychain(entry.id)).token };
  }
  if (entry.authKind === "oauth") {
    return { authorization: `Bearer ${(await oauthToken(entry)).token}` };
  }
  return { authorization: `Bearer ${(await bearerFromKeychain(entry.id)).token}` };
}
