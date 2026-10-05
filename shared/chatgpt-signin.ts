import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  verify,
  type JsonWebKey,
} from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readProviderStore, type Credential } from "./providers.ts";
import { statePath, webPort } from "./stack.ts";

/**
 * Sign in with ChatGPT, OpenAI's official route for open-source apps. A
 * browser authorization code flow with PKCE on a loopback callback, then the
 * public Responses API. The spec is the docs at
 * https://developers.openai.com/siwc/token-sharing-open-source/sign-in
 * and its profiles-and-sessions, token-reference and errors-and-recovery pages.
 *
 * This file holds the whole flow: the pending attempt, the host id and the
 * issued-client registration (a 0600 file, atomic like the providers store),
 * the code exchange, ID token validation, refresh and revoke. The web routes
 * only carry the browser callback and write the credential to the providers
 * store. Tokens, the authorize URL (it can carry id_token_hint) and the
 * callback query are never logged.
 */

const ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = "https://auth.openai.com/api/accounts/authorize";
const TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token";
const REVOKE_URL = "https://auth.openai.com/api/accounts/oauth/revoke";
const JWKS_URL = "https://auth.openai.com/.well-known/jwks.json";
const RESOURCE = "https://api.openai.com/v1";
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const DIRECT_SCOPE = "chatgpt.tokens.use.direct";
const DYNAMIC_CLIENT = "dynamic_agent_client";
const AGENT_NAME = "Useful Bot";

/** An attempt lives ten minutes. */
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
export const SIGNIN_POLL_INTERVAL_MS = 1000;
const CLOCK_SKEW_MS = 60_000;
const JWKS_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

type FetchFn = typeof fetch;

export type SignInErrorCode =
  | "chatgpt_plan_not_enabled"
  | "chatgpt_account_mismatch"
  | "chatgpt_registration_incomplete"
  | "chatgpt_client_mismatch"
  | "chatgpt_id_token_invalid"
  | "chatgpt_token_exchange"
  | "chatgpt_signin_refused";

interface Registration {
  clientId: string;
  subject: string;
  email: string | null;
  needsConsent: boolean;
}

interface Settled {
  status: "complete" | "denied" | "error";
  error?: string;
}

interface Pending {
  pollId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  /** The saved issued client id, or null when this attempt registers a new one. */
  clientId: string | null;
  isNew: boolean;
  createdAt: number;
  expiresAt: number;
  outcome: Settled | null;
}

interface SignInState {
  hostId: string | null;
  registration: Registration | null;
  pending: Pending | null;
}

export type SignInOutcome =
  | { status: "complete"; credential: Credential }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "error"; error: SignInErrorCode }
  /** The callback was not for the live attempt: nothing was touched. */
  | { status: "refused"; error: "chatgpt_state_mismatch" };

export interface SignInPoll {
  status: "pending" | "complete" | "denied" | "expired" | "error";
  error?: string;
}

export function chatGptSignInPath(): string {
  return process.env.UB_CHATGPT_SIGNIN_PATH || statePath("chatgpt-signin.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function readState(path = chatGptSignInPath()): SignInState {
  const empty: SignInState = { hostId: null, registration: null, pending: null };
  if (!existsSync(path)) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return empty;
  }
  if (!isRecord(raw)) return empty;
  const out: SignInState = { hostId: str(raw.hostId), registration: null, pending: null };
  const reg = raw.registration;
  if (isRecord(reg) && str(reg.clientId) && str(reg.subject)) {
    out.registration = {
      clientId: reg.clientId as string,
      subject: reg.subject as string,
      email: str(reg.email),
      needsConsent: reg.needsConsent === true,
    };
  }
  const p = raw.pending;
  if (
    isRecord(p) && str(p.pollId) && str(p.state) && str(p.nonce) && str(p.codeVerifier) && str(p.redirectUri)
    && typeof p.createdAt === "number" && typeof p.expiresAt === "number"
  ) {
    const outcome = isRecord(p.outcome) && (p.outcome.status === "complete" || p.outcome.status === "denied" || p.outcome.status === "error")
      ? { status: p.outcome.status, ...(str(p.outcome.error) ? { error: p.outcome.error as string } : {}) } as Settled
      : null;
    out.pending = {
      pollId: p.pollId as string,
      state: p.state as string,
      nonce: p.nonce as string,
      codeVerifier: p.codeVerifier as string,
      redirectUri: p.redirectUri as string,
      clientId: str(p.clientId),
      isNew: p.isNew === true,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      outcome,
    };
  }
  return out;
}

function writeState(state: SignInState, path = chatGptSignInPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const fd = openSync(tmp, "r");
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The callback URI is always the numeric loopback, never localhost and never the configured base URL. */
function redirectUri(): string {
  return `http://127.0.0.1:${webPort()}/auth/callback`;
}

function storedChatGptCredential(): Credential | null {
  return readProviderStore().connections["openai:oauth"]?.credential ?? null;
}

/**
 * Begin a sign-in. A new start replaces any attempt still pending, so the old
 * callback is refused. `storedCredential` is the openai:oauth credential the
 * store holds now (read from the store when left out); its ID token becomes
 * id_token_hint only when it belongs to the saved client id.
 */
export function startChatGptSignIn(
  opts: { storedCredential?: Credential | null; now?: number } = {},
): { pollId: string; authorizeUrl: string; expiresAt: number; intervalMs: number } {
  const now = opts.now ?? Date.now();
  const state = readState();
  const hostId = state.hostId ?? `urn:uuid:${randomUUID()}`;
  const registration = state.registration;
  const verifier = randomToken();
  const attempt: Pending = {
    pollId: randomBytes(16).toString("hex"),
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: verifier,
    redirectUri: redirectUri(),
    clientId: registration?.clientId ?? null,
    isNew: !registration,
    createdAt: now,
    expiresAt: now + ATTEMPT_TTL_MS,
    outcome: null,
  };
  const params = new URLSearchParams({
    response_type: "code",
    client_id: registration?.clientId ?? DYNAMIC_CLIENT,
  });
  if (!registration) params.set("agent_name_hint", AGENT_NAME);
  params.set("ext_agent_host_id", hostId);
  if (registration) {
    if (registration.email) params.set("login_hint", registration.email);
    const held = opts.storedCredential === undefined ? storedChatGptCredential() : opts.storedCredential;
    if (held && held.kind === "oauth" && held.idToken && held.clientId === registration.clientId) {
      params.set("id_token_hint", held.idToken);
    }
    if (registration.needsConsent) params.set("prompt", "consent");
  }
  params.set("redirect_uri", attempt.redirectUri);
  params.set("scope", SCOPE);
  params.set("resource", RESOURCE);
  params.set("state", attempt.state);
  params.set("nonce", attempt.nonce);
  params.set("code_challenge_method", "S256");
  params.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  writeState({ hostId, registration, pending: attempt });
  return {
    pollId: attempt.pollId,
    authorizeUrl: `${AUTHORIZE_URL}?${params.toString()}`,
    expiresAt: attempt.expiresAt,
    intervalMs: SIGNIN_POLL_INTERVAL_MS,
  };
}

/** Attempts whose code exchange is running, so a replayed callback cannot start a second one. */
const inFlight = new Set<string>();

const REFUSED: SignInOutcome = { status: "refused", error: "chatgpt_state_mismatch" };

/**
 * Settle the attempt `pollId`, unless it was replaced or cancelled while the
 * exchange ran (then the result is dropped and the callback is refused).
 */
function settle(pollId: string, outcome: Settled, registration?: Registration | null): boolean {
  const state = readState();
  if (!state.pending || state.pending.pollId !== pollId || state.pending.outcome) return false;
  writeState({
    hostId: state.hostId,
    registration: registration === undefined ? state.registration : registration,
    pending: { ...state.pending, outcome },
  });
  return true;
}

function failed(pollId: string, error: SignInErrorCode, registration?: Registration | null): SignInOutcome {
  if (!settle(pollId, { status: "error", error }, registration)) return REFUSED;
  return { status: "error", error };
}

/**
 * The browser callback. The order matters: a callback that is not for the live
 * attempt is refused before anything else and leaves the attempt untouched.
 */
export async function completeChatGptSignIn(
  params: { state: string | null; code: string | null; error: string | null; clientId: string | null },
  fetchImpl: FetchFn = fetch,
): Promise<SignInOutcome> {
  const { pending, registration } = readState();
  if (!pending || pending.outcome || !params.state || !sameSecret(pending.state, params.state) || inFlight.has(pending.pollId)) {
    return REFUSED;
  }
  if (pending.expiresAt <= Date.now()) return { status: "expired" };
  inFlight.add(pending.pollId);
  try {
    return await finishAttempt(pending, registration, params, fetchImpl);
  } finally {
    inFlight.delete(pending.pollId);
  }
}

async function finishAttempt(
  pending: Pending,
  registration: Registration | null,
  params: { code: string | null; error: string | null; clientId: string | null },
  fetchImpl: FetchFn,
): Promise<SignInOutcome> {
  const { pollId } = pending;
  if (params.error) {
    if (params.error === "access_denied") {
      return settle(pollId, { status: "denied" }) ? { status: "denied" } : REFUSED;
    }
    return failed(pollId, "chatgpt_signin_refused");
  }
  // The issued client id: the saved one on reauth, the callback's on a new registration.
  let clientId: string;
  if (pending.clientId === null) {
    if (!params.clientId || params.clientId === DYNAMIC_CLIENT) return failed(pollId, "chatgpt_registration_incomplete");
    clientId = params.clientId;
  } else {
    if (params.clientId && params.clientId !== pending.clientId) return failed(pollId, "chatgpt_client_mismatch");
    clientId = pending.clientId;
  }
  if (!params.code) return failed(pollId, "chatgpt_signin_refused");

  let tokens: Record<string, unknown>;
  try {
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "useful-bot/1.0" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: params.code,
        code_verifier: pending.codeVerifier,
        redirect_uri: pending.redirectUri,
        resource: RESOURCE,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = res.status === 200 ? await res.json() as unknown : null;
    if (!isRecord(body) || !str(body.access_token)) return failed(pollId, "chatgpt_token_exchange");
    tokens = body;
  } catch {
    return failed(pollId, "chatgpt_token_exchange");
  }

  let identity: { sub: string; email: string | null };
  try {
    const idToken = str(tokens.id_token);
    if (!idToken) throw new Error("id_token_missing");
    identity = await validateIdToken(idToken, { clientId, nonce: pending.nonce }, fetchImpl);
  } catch {
    return failed(pollId, "chatgpt_id_token_invalid");
  }

  // A returning account must be the same account. Clearing the registration
  // makes the next attempt register fresh instead of looping on the old one.
  if (registration && registration.subject !== identity.sub) {
    return failed(pollId, "chatgpt_account_mismatch", null);
  }

  const scopes = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : [];
  const granted = scopes.includes(DIRECT_SCOPE);
  const saved: Registration = { clientId, subject: identity.sub, email: identity.email, needsConsent: !granted };
  if (!granted) return failed(pollId, "chatgpt_plan_not_enabled", saved);

  if (!settle(pollId, { status: "complete" }, saved)) return REFUSED;
  const expiresIn = typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in) && tokens.expires_in > 0
    ? tokens.expires_in
    : null;
  return {
    status: "complete",
    credential: {
      kind: "oauth",
      accessToken: tokens.access_token as string,
      refreshToken: str(tokens.refresh_token),
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
      accountId: null,
      clientId,
      idToken: str(tokens.id_token),
      scopes,
      subject: identity.sub,
      email: identity.email,
    },
  };
}

/** Poll an attempt. A terminal status is reported once, then the pending row is dropped. */
export function pollChatGptSignIn(pollId: string): SignInPoll {
  const state = readState();
  const pending = state.pending;
  if (!pending || pending.pollId !== pollId) throw new Error("oauth_poll_unknown");
  const drop = () => writeState({ hostId: state.hostId, registration: state.registration, pending: null });
  if (pending.outcome) {
    drop();
    return pending.outcome.error
      ? { status: pending.outcome.status, error: pending.outcome.error }
      : { status: pending.outcome.status };
  }
  if (pending.expiresAt <= Date.now()) {
    drop();
    return { status: "expired" };
  }
  return { status: "pending" };
}

/** Forget an attempt: a callback that arrives later is refused. */
export function cancelChatGptSignIn(pollId: string): void {
  const state = readState();
  if (!state.pending || state.pending.pollId !== pollId) return;
  writeState({ hostId: state.hostId, registration: state.registration, pending: null });
}

/** True when the pollId belongs to the ChatGPT attempt, so the poll route can route it. */
export function isChatGptPollId(pollId: string): boolean {
  return readState().pending?.pollId === pollId;
}

let jwksCache: { fetchedAt: number; keys: JsonWebKey[] } | null = null;

async function fetchJwks(fetchImpl: FetchFn): Promise<JsonWebKey[]> {
  const res = await fetchImpl(JWKS_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (res.status !== 200) throw new Error("jwks_unavailable");
  const body = await res.json() as unknown;
  if (!isRecord(body) || !Array.isArray(body.keys)) throw new Error("jwks_unavailable");
  const keys = body.keys.filter(isRecord) as JsonWebKey[];
  jwksCache = { fetchedAt: Date.now(), keys };
  return keys;
}

/** The signing key for `kid`: from the one-hour cache, refetched once when the kid is unknown. */
async function signingKey(kid: string, fetchImpl: FetchFn) {
  const find = (keys: JsonWebKey[]) => keys.find((key) => (key as { kid?: string }).kid === kid && key.kty === "RSA");
  const cached = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS ? jwksCache.keys : null;
  let jwk = cached ? find(cached) : undefined;
  if (!jwk) jwk = find(await fetchJwks(fetchImpl));
  if (!jwk) throw new Error("kid_unknown");
  return createPublicKey({ key: jwk, format: "jwk" });
}

function decodePart(part: string): Record<string, unknown> {
  const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
  if (!isRecord(value)) throw new Error("jwt_malformed");
  return value;
}

/**
 * Validate an ID token against OpenAI's published keys: RS256 signature, then
 * issuer, audience (the issued client id), expiry, not-before, issued-at, the
 * nonce of this attempt and a non-empty subject. Throws on any failure.
 */
async function validateIdToken(
  token: string,
  expect: { clientId: string; nonce: string },
  fetchImpl: FetchFn,
): Promise<{ sub: string; email: string | null }> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("jwt_malformed");
  const header = decodePart(parts[0]!);
  const claims = decodePart(parts[1]!);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) throw new Error("jwt_header");
  const key = await signingKey(header.kid, fetchImpl);
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2]!, "base64url"));
  if (!ok) throw new Error("jwt_signature");
  const now = Date.now();
  if (claims.iss !== ISSUER) throw new Error("jwt_iss");
  const aud = claims.aud;
  if (!(aud === expect.clientId || (Array.isArray(aud) && aud.includes(expect.clientId)))) throw new Error("jwt_aud");
  if (typeof claims.exp !== "number" || claims.exp * 1000 + CLOCK_SKEW_MS <= now) throw new Error("jwt_exp");
  if (claims.iat !== undefined && (typeof claims.iat !== "number" || claims.iat * 1000 - CLOCK_SKEW_MS > now)) throw new Error("jwt_iat");
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf * 1000 - CLOCK_SKEW_MS > now)) throw new Error("jwt_nbf");
  if (typeof claims.nonce !== "string" || !sameSecret(claims.nonce, expect.nonce)) throw new Error("jwt_nonce");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("jwt_sub");
  return { sub: claims.sub, email: str(claims.email) };
}

/**
 * Refresh grant. Access token, rotating refresh token, expiry, scopes and
 * ID token are replaced together. Callers serialize this per connection, or
 * two parallel refreshes spend the same refresh token.
 */
export async function refreshChatGptCredential(credential: Credential, fetchImpl: FetchFn = fetch): Promise<Credential> {
  if (credential.kind !== "oauth" || !credential.clientId || !credential.refreshToken) throw new Error("oauth_refresh");
  let raw: unknown;
  try {
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "useful-bot/1.0" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: credential.clientId,
        refresh_token: credential.refreshToken,
        resource: RESOURCE,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status !== 200) throw new Error("oauth_refresh");
    raw = await res.json();
  } catch {
    throw new Error("oauth_refresh");
  }
  if (!isRecord(raw) || !str(raw.access_token)) throw new Error("oauth_refresh");
  const expiresIn = typeof raw.expires_in === "number" && Number.isFinite(raw.expires_in) && raw.expires_in > 0 ? raw.expires_in : null;
  return {
    ...credential,
    accessToken: raw.access_token as string,
    refreshToken: str(raw.refresh_token) ?? credential.refreshToken,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : credential.expiresAt,
    scopes: typeof raw.scope === "string" ? raw.scope.split(/\s+/).filter(Boolean) : credential.scopes,
    idToken: str(raw.id_token) ?? credential.idToken,
  };
}

/**
 * End the renewable session at the revocation endpoint. True only on an HTTP
 * 200 (also what an already-invalid token gets). A network error or 5xx is
 * retried once after `retryDelayMs`; any other status is not confirmed.
 */
export async function revokeChatGptCredential(
  credential: Credential,
  fetchImpl: FetchFn = fetch,
  retryDelayMs = 1000,
): Promise<boolean> {
  if (credential.kind !== "oauth" || !credential.clientId || !credential.refreshToken) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchImpl(REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "useful-bot/1.0" },
        body: new URLSearchParams({
          token: credential.refreshToken,
          token_type_hint: "refresh_token",
          client_id: credential.clientId,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 200) return true;
      if (res.status < 500) return false;
    } catch {
      // Network error or timeout: one retry below.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return false;
}
