import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import { apiError, errorCode, rateLimited, readJson } from "../../../lib/api-guard";
import { refreshProviderModels } from "../../../../shared/live-models.ts";
import { isEffortId, isSpeedId } from "../../../../shared/models.ts";
import {
  catalogItem,
  clearProviderKey,
  composerState,
  publicProviders,
  readProviderStore,
  setActiveProvider,
  setComposer,
  setProviderKey,
  writeProviderStore,
  type ProviderId,
} from "../../../../shared/providers.ts";

const IDS = new Set(["opencode-go", "openai", "anthropic", "openrouter", "google"]);

function asId(value: unknown): ProviderId {
  if (typeof value !== "string" || !IDS.has(value)) throw new Error("provider_unknown");
  return value as ProviderId;
}

async function syncComposerModels(store: ReturnType<typeof readProviderStore>, force = false): Promise<void> {
  const active = catalogItem(store.activeProviderId);
  const key = store.keys[active.id]?.key ?? (active.id === "opencode-go" ? process.env.UB_OPENCODE_GO_KEY : undefined);
  await refreshProviderModels({
    providerId: active.id,
    baseUrl: active.id === "opencode-go" ? (process.env.UB_OPENCODE_GO_BASE || active.baseUrl) : active.baseUrl,
    key,
    force,
  });
}

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const store = readProviderStore();
  await syncComposerModels(store);
  return NextResponse.json({
    ok: true,
    providers: publicProviders(store),
    activeProviderId: store.activeProviderId,
    composer: composerState(store),
  });
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
    key?: unknown;
    activeProviderId?: unknown;
    modelId?: unknown;
    effort?: unknown;
    speed?: unknown;
  };
  try {
    body = await readJson(request) as typeof body;
  } catch (err) {
    return apiError(err) ?? NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    let store = readProviderStore();
    let modelsDirty = false;
    if (typeof body.key === "string" && body.providerId) {
      const id = asId(body.providerId);
      store = setProviderKey(store, id, body.key);
      // Connect and Use are separate actions: only take over when the active
      // provider has no usable key of its own.
      const activeKey = store.keys[store.activeProviderId]?.key
        ?? (store.activeProviderId === "opencode-go" ? process.env.UB_OPENCODE_GO_KEY : undefined);
      if (!activeKey && catalogItem(id).compatible && store.activeProviderId !== id) {
        store = setActiveProvider(store, id);
      }
      modelsDirty = true;
    }
    if (body.activeProviderId) {
      store = setActiveProvider(store, asId(body.activeProviderId));
      modelsDirty = true;
    }
    if (body.modelId !== undefined || body.effort !== undefined || body.speed !== undefined) {
      store = setComposer(store, {
        modelId: typeof body.modelId === "string" ? body.modelId : undefined,
        effort: body.effort === null || isEffortId(body.effort) ? body.effort : undefined,
        speed: isSpeedId(body.speed) ? body.speed : undefined,
      });
    }
    writeProviderStore(store);
    await syncComposerModels(store, modelsDirty);
    return NextResponse.json({
      ok: true,
      providers: publicProviders(store),
      activeProviderId: store.activeProviderId,
      composer: composerState(store),
    });
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
  let body: { providerId?: unknown };
  try {
    body = await readJson(request) as { providerId?: unknown };
  } catch (err) {
    return apiError(err) ?? NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    const store = clearProviderKey(readProviderStore(), asId(body.providerId));
    writeProviderStore(store);
    return NextResponse.json({
      ok: true,
      providers: publicProviders(store),
      activeProviderId: store.activeProviderId,
      composer: composerState(store),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorCode(err) }, { status: 400 });
  }
}
