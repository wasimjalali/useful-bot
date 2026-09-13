import { NextResponse } from "next/server";
import { isGateError, requireDesktop } from "../../../lib/desktop-gate";
import {
  ATTACH_MAX_BYTES,
  ATTACH_TEXT_MAX,
  isTextAttachment,
  safeAttachName,
} from "../../../../shared/attachments.ts";

export async function POST(request: Request) {
  const gate = await requireDesktop(request);
  if (isGateError(gate)) return gate.error;
  const csrf = request.headers.get("x-ub-csrf");
  if (!csrf || csrf !== gate.session.csrf) {
    return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("attachment_missing");
    if (file.size <= 0 || file.size > ATTACH_MAX_BYTES) throw new Error("attachment_size");
    const name = safeAttachName(file.name);
    const type = file.type || "application/octet-stream";
    const bytes = Buffer.from(await file.arrayBuffer());
    let text: string | undefined;
    if (isTextAttachment(name, type) && bytes.length <= ATTACH_TEXT_MAX) {
      text = bytes.toString("utf8");
      if (text.includes("\0")) text = undefined;
    }
    return NextResponse.json({ ok: true, name, type, bytes: bytes.length, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
