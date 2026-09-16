import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * MCP App widget payloads. The HTML bundle is too large for the transcript
 * (TEXT_MAX is 4000). Each widget is a 0600 file named by its id.
 */

export type WidgetRecord = {
  id: string;
  connectionId: string;
  toolName: string;
  resourceUri: string | null;
  arguments: Record<string, unknown>;
  result: unknown;
  createdAt: string;
};

const ID = /^[a-zA-Z0-9_-]{8,80}$/;

export function widgetsDir(root = process.env.UB_WIDGETS_DIR): string {
  if (root) return root;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/widgets");
}

function pathFor(id: string, dir = widgetsDir()): string {
  if (!ID.test(id)) throw new Error("widget_id");
  return join(dir, `${id}.json`);
}

const RECORD_MAX = 400_000;

export function writeWidget(record: WidgetRecord, dir = widgetsDir()): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = pathFor(record.id, dir);
  const body = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(body, "utf8") > RECORD_MAX) throw new Error("widget_too_large");
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readWidget(id: string, dir = widgetsDir()): WidgetRecord | null {
  const path = pathFor(id, dir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as WidgetRecord;
    if (!raw || raw.id !== id) return null;
    return raw;
  } catch {
    return null;
  }
}

export function deleteWidget(id: string, dir = widgetsDir()): void {
  try { unlinkSync(pathFor(id, dir)); } catch { /* ignore */ }
}
