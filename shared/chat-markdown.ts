export type MdAlign = "leading" | "center" | "trailing";

export type MdBlock =
  | { type: "p"; text: string }
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "table"; headers: string[]; aligns: MdAlign[]; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "rule" };

const QUOTE = /^\s*>\s?/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
/** The row under a table header: pipes, dashes and optional alignment colons. */
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Cells of one table row. An escaped `\|` stays inside its cell. */
function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of trimmed) {
    if (escaped) {
      current += char === "|" ? "|" : `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function alignOf(cell: string): MdAlign {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  if (left && right) return "center";
  if (right) return "trailing";
  return "leading";
}

/** True when `line` starts a pipe table, which needs its delimiter row too. */
function startsTable(line: string, next: string | undefined): boolean {
  return line.includes("|") && next !== undefined && TABLE_DELIMITER.test(next);
}

export type InlineSegment =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "link"; text: string; href: string };

// Note: single underscores are deliberately not emphasis. They turn snake_case
// identifiers (my_var_name) into accidental italics, so only ** and __ bold and
// * emphasis are recognized. Links allow https/http only, which keeps
// javascript:, data: and vbscript: URLs from ever becoming anchors.
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;

export function parseInline(source: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let rest = source;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      segments.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) segments.push({ type: "text", text: rest.slice(0, match.index) });
    if (match[1] !== undefined) segments.push({ type: "code", text: match[1] });
    else if (match[2] !== undefined) segments.push({ type: "strong", text: match[2] });
    else if (match[3] !== undefined) segments.push({ type: "strong", text: match[3] });
    else if (match[4] !== undefined) segments.push({ type: "em", text: match[4] });
    else if (match[5] !== undefined && match[6] !== undefined) {
      segments.push({ type: "link", text: match[5], href: match[6] });
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return segments;
}

export function blocksFromMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }
    if (startsTable(line, lines[i + 1])) {
      const headers = splitRow(line);
      // One column is a sentence with a pipe in it, not a table.
      if (headers.length > 1) {
        const aligns = splitRow(lines[i + 1] ?? "").map(alignOf);
        while (aligns.length < headers.length) aligns.push("leading");
        aligns.length = headers.length;
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length) {
          const row = lines[i] ?? "";
          if (!row.includes("|") || row.trim() === "") break;
          const cells = splitRow(row);
          while (cells.length < headers.length) cells.push("");
          cells.length = headers.length;
          rows.push(cells);
          i += 1;
        }
        blocks.push({ type: "table", headers, aligns, rows });
        continue;
      }
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? "")) {
        quoted.push((lines[i] ?? "").replace(QUOTE, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quoted.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "h", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const para = [line];
    i += 1;
    while (
      i < lines.length
      && (lines[i] ?? "").trim() !== ""
      && !(lines[i] ?? "").startsWith("```")
      && !/^(#{1,3})\s+/.test(lines[i] ?? "")
      && !/^\s*[-*]\s+/.test(lines[i] ?? "")
      && !/^\s*\d+\.\s+/.test(lines[i] ?? "")
      && !QUOTE.test(lines[i] ?? "")
      && !RULE.test(lines[i] ?? "")
      // A table's header row is an ordinary line until its delimiter proves
      // otherwise, so the paragraph has to let go of it.
      && !startsTable(lines[i] ?? "", lines[i + 1])
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "p", text: para.join("\n") });
  }
  return blocks;
}
