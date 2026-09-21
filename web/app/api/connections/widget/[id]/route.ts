import { isGateError, requireOwner } from "../../../../../lib/desktop-gate";
import { htmlForWidget } from "../../../../../../shared/mcp-app-host.ts";
import { readWidget } from "../../../../../../shared/widgets-store.ts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireOwner(request);
  if (isGateError(gate)) return gate.error;
  const { id } = await context.params;
  const record = readWidget(id);
  if (!record) {
    return new Response("missing", { status: 404, headers: { "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") === "mobile" ? "mobile" as const : "desktop" as const;
  const width = Number(url.searchParams.get("width"));
  const height = Number(url.searchParams.get("height"));
  const { html } = await htmlForWidget(record, {
    platform,
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
  });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-frame-options": "SAMEORIGIN",
    },
  });
}
