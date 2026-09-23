import { isGateError, requireOwner } from "../../../../../lib/desktop-gate";
import { migrateLegacyImages } from "../../../../../lib/media-migrate";
import { readMediaBytes } from "../../../../../../shared/media-store.ts";

export const runtime = "nodejs";

/**
 * One generated image's bytes, owner only. The transcript row names the id.
 * A 404 says why in its body: "moved" when the index names a file that is no
 * longer at its path (the row offers Locate), "missing" when nothing does.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireOwner(request);
  if (isGateError(gate)) return gate.error;
  const { id } = await context.params;
  let found = readMediaBytes(id);
  if (found.status === "missing" && migrateLegacyImages().moved > 0) found = readMediaBytes(id);
  if (found.status !== "ok" || found.item.kind !== "image") {
    const reason = found.status === "moved" ? "moved" : "missing";
    return new Response(reason, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return new Response(new Uint8Array(found.bytes), {
    status: 200,
    headers: {
      "content-type": found.mime,
      // Not immutable: a relinked file answers under the same id.
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
