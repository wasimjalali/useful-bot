import { join } from "node:path";
import { NextResponse } from "next/server";
import { MemoryStore } from "../../../../agent/lib/memory.ts";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";

export const runtime = "nodejs";

// The pane polls every few seconds, so one store per process root: a fresh
// MemoryStore per request leaks its sqlite handle until GC and re-runs the
// migration each time. The root matches the store's own default.
function memoryRootResolved(): string {
  return process.env.UB_MEMORY_ROOT ?? join(process.env.HOME ?? "/tmp", ".useful-bot/memory");
}

let sharedStore: MemoryStore | null = null;
let sharedRoot = "";
function memoryStore(): MemoryStore {
  const root = memoryRootResolved();
  if (!sharedStore || sharedRoot !== root) {
    sharedStore = new MemoryStore(root);
    sharedRoot = root;
  }
  return sharedStore;
}

export async function GET(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const botId = new URL(request.url).searchParams.get("botId")?.trim() ?? "";
  if (!botId) return NextResponse.json({ ok: true, notes: [] });
  const notes = memoryStore().list("desktop", 100, botId);
  return NextResponse.json({ ok: true, notes });
}
