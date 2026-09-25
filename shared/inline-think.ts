/**
 * Some models write their thinking into the answer as `<think>…</think>`
 * rather than the reasoning field (MiniMax M3 through OpenCode, MiniMax's own
 * API by default). The router splits it out on the way through (see
 * router/src/inline-think.ts); replies stored before that still carry it, and
 * this keeps it out of their bubbles. Only a block that opens the message
 * counts: a tag further in is the answer talking about tags.
 */

export const THINK_TAGS = [
  { open: "<think>", close: "</think>" },
  { open: "<thinking>", close: "</thinking>" },
] as const;

export type ThinkTag = (typeof THINK_TAGS)[number];

/**
 * Where a think block ends, in the text after its opening tag. A model that
 * thinks about these tags quotes them, so the same tag is counted in pairs
 * and a quoted `<think>…</think>` does not end the block. A closing tag
 * followed by a blank line ends it whatever the count, so a lone quoted
 * opening tag cannot swallow the answer. `final` means no more text follows;
 * otherwise a tag or a close still waiting for what comes after it is left
 * unread from `safe` on, with the count at that point.
 */
export function scanThink(
  text: string,
  tag: ThinkTag,
  depth: number,
  final: boolean,
): { closed: true; end: number; after: number } | { closed: false; safe: number; depth: number } {
  let i = 0;
  while (i < text.length) {
    if (text.startsWith(tag.close, i)) {
      const after = i + tag.close.length;
      if (depth <= 1) return { closed: true, end: i, after };
      const next = text.slice(after, after + 2);
      if (next === "\n\n") return { closed: true, end: i, after };
      if (final && !text.slice(after).trim()) return { closed: true, end: i, after };
      if (!final && (next === "" || next === "\n")) return { closed: false, safe: i, depth };
      depth -= 1;
      i = after;
      continue;
    }
    if (text.startsWith(tag.open, i)) {
      depth += 1;
      i += tag.open.length;
      continue;
    }
    if (!final && text[i] === "<") {
      const tail = text.slice(i);
      if (tag.open.startsWith(tail) || tag.close.startsWith(tail)) return { closed: false, safe: i, depth };
    }
    i += 1;
  }
  return { closed: false, safe: text.length, depth };
}

/**
 * A whole message that opens with a think block, split in two. The answer
 * loses the blank lines that separated it from the thinking. An unclosed
 * block is all thinking. Null when the message does not open with one.
 */
export function splitLeadingThink(text: string): { thinking: string; answer: string } | null {
  const trimmed = text.trimStart();
  for (const tag of THINK_TAGS) {
    if (!trimmed.startsWith(tag.open)) continue;
    const body = trimmed.slice(tag.open.length);
    const scan = scanThink(body, tag, 1, true);
    if (!scan.closed) return { thinking: body, answer: "" };
    return { thinking: body.slice(0, scan.end), answer: body.slice(scan.after).trimStart() };
  }
  return null;
}

/**
 * The bubble text for a stored reply: a leading think block and the blank
 * lines after it removed. An unclosed block, or the start of an opening tag
 * still streaming in, shows nothing yet.
 */
export function withoutLeadingThink(text: string): string {
  const split = splitLeadingThink(text);
  if (split) return split.answer;
  const trimmed = text.trimStart();
  return trimmed.startsWith("<") && THINK_TAGS.some((tag) => tag.open.startsWith(trimmed)) ? "" : text;
}
