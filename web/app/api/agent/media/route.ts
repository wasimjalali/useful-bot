import { NextResponse } from "next/server";
import { isGateError, requireOwner } from "../../../../lib/desktop-gate";
import { errorCode } from "../../../../lib/api-guard";
import { migrateDrawings, migrateLegacyImages } from "../../../../lib/media-migrate";
import { listMedia, mediaRoot, type MediaKind } from "../../../../../shared/media-store.ts";

export const runtime = "nodejs";

/** The Library: every saved image and drawing, newest first, owner only. */
export async function GET(request: Request) {
  const gate = await requireOwner(request);
  if (isGateError(gate)) return gate.error;
  // Catch up anything not in the folder yet. A failure here is logged and the
  // Library still lists what it has; the next load tries again.
  try {
    migrateLegacyImages();
    migrateDrawings();
  } catch (err) {
    console.error("[media] catch-up failed", err);
  }
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind: MediaKind | undefined = kindParam === "image" || kindParam === "drawing" ? kindParam : undefined;
  try {
    const items = listMedia({
      kind,
      botId: url.searchParams.get("botId") ?? undefined,
      query: url.searchParams.get("q")?.slice(0, 200) ?? undefined,
    });
    return NextResponse.json({ ok: true, root: mediaRoot(), items }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[media] Library list failed", err);
    return NextResponse.json({ ok: false, error: errorCode(err, "media_list_failed") }, { status: 500 });
  }
}
