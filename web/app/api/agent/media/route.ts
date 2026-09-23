import { NextResponse } from "next/server";
import { isGateError, requireOwner } from "../../../../lib/desktop-gate";
import { migrateLegacyImages } from "../../../../lib/media-migrate";
import { listMedia, mediaRoot, type MediaKind } from "../../../../../shared/media-store.ts";

export const runtime = "nodejs";

/** The Library: every saved image and drawing, newest first, owner only. */
export async function GET(request: Request) {
  const gate = await requireOwner(request);
  if (isGateError(gate)) return gate.error;
  migrateLegacyImages();
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind: MediaKind | undefined = kindParam === "image" || kindParam === "drawing" ? kindParam : undefined;
  const items = listMedia({
    kind,
    botId: url.searchParams.get("botId") ?? undefined,
    query: url.searchParams.get("q")?.slice(0, 200) ?? undefined,
  });
  return NextResponse.json({ ok: true, root: mediaRoot(), items }, { headers: { "cache-control": "no-store" } });
}
