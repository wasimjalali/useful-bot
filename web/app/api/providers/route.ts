import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import { apiError, errorCode, rateLimited, readJson } from "../../../lib/api-guard";
import { refreshProviderModels } from "../../../../shared/live-models.ts";
import { isEffortId, isSpeedId } from "../../../../shared/models.ts";
import {
  connectionId,
  parseConnectionId,
  providerDef,
  providerMode,
  type ProviderMode,
} from "../../../../shared/provider-catalog.ts";
import { accessTokenFor } from "../../../../shared/provider-oauth.ts";
import {
  clearConnection,
  clearProviderKey,
  composerState,
  legacyProviders,
  publicProviders,
  readProviderStore,
  setActiveConnection,
  setComposer,
  setProviderKey,
  setRole,
  writeProviderStore,
  type ProviderId,
  type ProviderStore,
} from "../../../../shared/providers.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function substituteFields(baseUrl: string, fields: Record<string, string>): string {
  return baseUrl.replace(/\{(\w+)\}/g, (_, name: string) => fields[name] ?? "");
}

/** Legacy provider ids map to their api connection, opencode-go to its plan. */
function legacyMode(providerId: string): "plan" | "api" {
  return providerId === "opencode-go" ? "plan" : "api";
}

function legacyConnectionId(providerId: string): string {
  return providerId === "opencode-go" ? "opencode-go:plan" : `${providerId}:api`;
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

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const store = readProviderStore();
  await syncActiveModels(store);
  return NextResponse.json(payload(store));
}

export async function PUT(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  if (rateLimited(`providers:${gate.session.callerId}`, 60)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let body: {
    providerId?: unknown;
    mode?: unknown;
    key?: unknown;
    fields?: unknown;
    activeConnectionId?: unknown;
    activeProviderId?: unknown;
    modelId?: unknown;
    effort?: unknown;
    speed?: unknown;
    roles?: unknown;
  };
  try {
    body = await readJson(request) as typeof body;
  } catch (err) {
    return apiError(err) ?? NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    let store = readProviderStore();
    if (body.providerId !== undefined) {
      if (typeof body.providerId !== "string" || !body.providerId) throw new Error("provider_unknown");
      providerDef(body.providerId);
      const mode = body.mode === undefined ? legacyMode(body.providerId) : body.mode;
      if (mode !== "api" && mode !== "plan" && mode !== "local") throw new Error("provider_mode_unknown");
      if (body.fields !== undefined && !isStringRecord(body.fields)) throw new Error("provider_field");
      const key = typeof body.key === "string" ? body.key : undefined;
      store = setProviderKey(store, body.providerId, mode, key, isStringRecord(body.fields) ? body.fields : undefined);
      // Connect and Use are separate actions: only take over when the active
      // connection has no usable credential of its own.
      if (!activeUsable(store)) store = setActiveConnection(store, connectionId(body.providerId, mode));
    }
    if (body.activeConnectionId !== undefined || body.activeProviderId !== undefined) {
      const target = body.activeConnectionId !== undefined
        ? (typeof body.activeConnectionId === "string" ? body.activeConnectionId : "")
        : (typeof body.activeProviderId === "string" ? legacyConnectionId(body.activeProviderId) : "");
      store = setActiveConnection(store, target);
    }
    let modelPatch = typeof body.modelId === "string" ? body.modelId : undefined;
    if (modelPatch !== undefined) {
      // "<connectionId>::<modelId>" switches connection and model in one write.
      const sep = modelPatch.lastIndexOf("::");
      if (sep >= 0) {
        const connId = modelPatch.slice(0, sep);
        const modelId = modelPatch.slice(sep + 2);
        parseConnectionId(connId);
        store = setActiveConnection(store, connId);
        modelPatch = modelId || undefined;
      }
    }
    if (modelPatch !== undefined || body.effort !== undefined || body.speed !== undefined) {
      store = setComposer(store, {
        modelId: modelPatch,
        effort: body.effort === null || isEffortId(body.effort) ? body.effort : undefined,
        speed: isSpeedId(body.speed) ? body.speed : undefined,
      });
    }
    if (body.roles !== undefined) {
      if (!isRecord(body.roles)) throw new Error("invalid");
      const reviewer = body.roles.reviewer;
      if (reviewer === null) {
        store = setRole(store, "reviewer", null);
      } else if (reviewer !== undefined) {
        if (!isRecord(reviewer) || typeof reviewer.connectionId !== "string" || typeof reviewer.modelId !== "string") {
          throw new Error("invalid");
        }
        store = setRole(store, "reviewer", {
          connectionId: reviewer.connectionId,
          modelId: reviewer.modelId,
          effort: isEffortId(reviewer.effort) ? reviewer.effort : null,
        });
      }
    }
    writeProviderStore(store);
    await syncActiveModels(store, true);
    return NextResponse.json(payload(store));
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  if (rateLimited(`providers:${gate.session.callerId}`, 60)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let body: { connectionId?: unknown; providerId?: unknown };
  try {
    body = await readJson(request) as typeof body;
  } catch (err) {
    return apiError(err) ?? NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    let store = readProviderStore();
    if (typeof body.connectionId === "string" && body.connectionId) {
      store = clearConnection(store, body.connectionId);
    } else if (typeof body.providerId === "string" && body.providerId) {
      providerDef(body.providerId);
      store = clearProviderKey(store, body.providerId as ProviderId);
    } else {
      throw new Error("invalid");
    }
    writeProviderStore(store);
    await syncActiveModels(store, true);
    return NextResponse.json(payload(store));
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}
