export const ATTACH_MAX_BYTES = 1_048_576;
export const ATTACH_TEXT_MAX = 64 * 1024;
export const ATTACH_MAX_FILES = 5;

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/css",
  "text/xml",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
]);

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".go",
  ".rs",
  ".swift",
  ".yml",
  ".yaml",
  ".toml",
  ".sh",
  ".log",
]);

export function attachmentExt(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

export function safeAttachName(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? "file").replace(/[^A-Za-z0-9._-]/g, "_");
  const clipped = base.slice(0, 80) || "file";
  const lower = clipped.toLowerCase();
  if (lower.includes(".env") || lower.endsWith(".pem") || lower.endsWith(".key")) {
    throw new Error("attachment_forbidden");
  }
  return clipped;
}

export function isTextAttachment(name: string, type: string): boolean {
  if (TEXT_TYPES.has(type.toLowerCase())) return true;
  return TEXT_EXT.has(attachmentExt(name));
}

export function formatAttachedMessage(
  text: string,
  files: Array<{ name: string; text?: string; bytes: number }>,
): string {
  const parts = [text.trim()];
  for (const file of files) {
    if (file.text) {
      parts.push(`\n\nAttached file: ${file.name}\n\`\`\`\n${file.text}\n\`\`\``);
    } else {
      parts.push(`\n\nAttached file: ${file.name} (${file.bytes} bytes). Contents are not readable as text.`);
    }
  }
  return parts.join("").trim();
}
