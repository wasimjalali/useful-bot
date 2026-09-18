import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../../../lib/desktop-gate";
import { errorCode, rateLimited } from "../../../../../lib/api-guard";
import { refreshProviderModels } from "../../../../../../shared/live-models.ts";
import {
  connectionId,
  parseConnectionId,
  providerMode,
  type ProviderMode,
} from "../../../../../../shared/provider-catalog.ts";
import { accessTokenFor, cancelDeviceFlow, pollDeviceFlow } from "../../../../../../shared/provider-oauth.ts";
import {
  composerState,
  legacyProviders,
  publicProviders,
  readProviderStore,
  setActiveConnection,
  setOAuthCredential,
  writeProviderStore,
  type ProviderStore,
} from "../../../../../../shared/providers.ts";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function substituteFields(baseUrl: string, fields: Record<string, string>): string {
  return baseUrl.replace(/\{(\w+)\}/g, (_, name: string) => fields[name] ?? "");
}

/** Connected means a credential, or a local server that needs none. */
function connectionUsable(store: ProviderStore, id: string): boolean {
  const conn = store.connections[id];
  if (!conn) return false;
  return conn.credential.kind !== "none" || conn.mode === "local";
}

/**
 * The chat connection is usable when the stored active connection carries a
 * credential. A missing or Go-plan entry falls back to the implicit env key.
 */
function activeUsable(store: ProviderStore): boolean {
  const id = store.activeConnectionId;
  if (id && connectionUsable(store, id)) return true;
  if (id && id !== "opencode-go:plan") return false;
  return Boolean(process.env.UB_OPENCODE_GO_KEY);
}

/**
 * Refresh the active connection's model list. The cache is keyed by
 * connection id, so plan and api lists never collide.
 */
async function syncActiveModels(store: ProviderStore, force = false): Promise<void> {
  const env = process.env;
  const activeId = store.activeConnectionId
    ?? (!store.connections["opencode-go:plan"] && env.UB_OPENCODE_GO_KEY ? "opencode-go:plan" : null);
  if (!activeId) return;
  const conn = store.connections[activeId] ?? null;
  let mode: ProviderMode;
  let baseUrl: string;
  let key: string | null = null;
  let headers: Record<string, string>;
  if (conn) {
    mode = providerMode(conn.providerId, conn.mode);
    if (!mode.listsModels) return;
    baseUrl = substituteFields(mode.baseUrl, conn.fields);
    if (conn.providerId === "opencode-go" && env.UB_OPENCODE_GO_BASE) baseUrl = env.UB_OPENCODE_GO_BASE;
    headers = { ...(mode.headers ?? {}) };
    if (conn.credential.kind === "key") {
      key = conn.credential.key;
    } else if (conn.credential.kind === "oauth") {
      const auth = accessTokenFor(conn.providerId, conn.credential);
      key = auth.token;
      headers = { ...headers, ...auth.headers };
    }
  } else {
    // The implicit env connection for the Go plan.
    mode = providerMode("opencode-go", "plan");
    if (!mode.listsModels) return;
    key = env.UB_OPENCODE_GO_KEY ?? null;
    baseUrl = env.UB_OPENCODE_GO_BASE || mode.baseUrl;
    headers = { ...(mode.headers ?? {}) };
  }
  await refreshProviderModels({
    providerId: activeId,
    baseUrl,
    key,
    keyHeader: mode.keyHeader,
    headers,
    force,
  });
}

function legacyActiveId(store: ProviderStore): string | null {
  if (!store.activeConnectionId) return null;
  try {
    return parseConnectionId(store.activeConnectionId).providerId;
  } catch {
    return null;
  }
}

function payload(store: ProviderStore) {
  return {
    ok: true as const,
    ...publicProviders(store),
    composer: composerState(store),
    providers: legacyProviders(store),
    activeProviderId: legacyActiveId(store),
  };
}

/**
 * The poll route needs the provider of a pending device flow to store its
 * credential. The contract keeps pending entries in
 * ~/.useful-bot/provider-oauth.json (written by startDeviceFlow), so read the
 * matching entry out of that file without assuming one exact layout.
 */
function findPollEntry(value: unknown, pollId: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findPollEntry(item, pollId);
      if (hit) return hit;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.pollId === pollId) return value;
  for (const child of Object.values(value)) {
    const hit = findPollEntry(child, pollId);
    if (hit) return hit;
  }
  return null;
}

function pendingProviderId(pollId: string): string | null {
  const path = join(process.env.HOME ?? "/tmp", ".useful-bot/provider-oauth.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  const entry = findPollEntry(parsed, pollId);
  return entry && typeof entry.providerId === "string" && entry.providerId ? entry.providerId : null;
}

/** Completing the flow writes the credential, so the poll is a POST with the CSRF header like every other write. */
export async function POST(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  if (rateLimited(`providers-oauth:${gate.session.callerId}`, 60)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { pollId } = await context.params;
  try {
    const result = await pollDeviceFlow(pollId);
    if (result.status === "complete" && result.credential) {
      const providerId = pendingProviderId(pollId);
      if (!providerId) return NextResponse.json({ ok: true, status: "error" });
      let store = readProviderStore();
      store = setOAuthCredential(store, providerId, result.credential);
      if (!activeUsable(store)) store = setActiveConnection(store, connectionId(providerId, "oauth"));
      writeProviderStore(store);
      await syncActiveModels(store, true);
      return NextResponse.json({ ...payload(store), status: "complete" });
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  if (rateLimited(`providers-oauth:${gate.session.callerId}`, 60)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { pollId } = await context.params;
  try {
    cancelDeviceFlow(pollId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}
