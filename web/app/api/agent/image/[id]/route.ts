import { isGateError, requireOwner } from "../../../../../lib/desktop-gate";
import { readImage } from "../../../../../../shared/images-store.ts";

export const runtime = "nodejs";

/** One generated image's bytes, owner only. The transcript row names the id. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireOwner(request);
  if (isGateError(gate)) return gate.error;
  const { id } = await context.params;
  const record = readImage(id);
  if (!record) {
    return new Response("missing", { status: 404, headers: { "cache-control": "no-store" } });
  }
  return new Response(Buffer.from(record.b64, "base64"), {
    status: 200,
    headers: {
      "content-type": record.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
