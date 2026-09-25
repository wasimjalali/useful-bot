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

/**
 * A whole message that opens with a think block, split in two. The answer
 * loses the blank lines that separated it from the thinking. An unclosed
 * block is all thinking. Null when the message does not open with one.
 */
export function splitLeadingThink(text: string): { thinking: string; answer: string } | null {
  const trimmed = text.trimStart();
  for (const tag of THINK_TAGS) {
    if (!trimmed.startsWith(tag.open)) continue;
    const end = trimmed.indexOf(tag.close, tag.open.length);
    if (end < 0) return { thinking: trimmed.slice(tag.open.length), answer: "" };
    return {
      thinking: trimmed.slice(tag.open.length, end),
      answer: trimmed.slice(end + tag.close.length).trimStart(),
    };
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
