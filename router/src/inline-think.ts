// Some models write their thinking into the answer as `<think>…</think>`
// instead of the reasoning field: MiniMax M3 through OpenCode does, and so
// does MiniMax's own API unless asked otherwise. The AI SDK only reads the
// field, so the thinking reached eve as answer text and both apps showed it
// in the bubble. A think block that opens a message is moved into the
// reasoning field here, for any model, so it lands where every other model's
// thinking does. A tag further into the answer is left alone: that is the
// model writing about tags.
//
// Those models also expect their thinking back in the history the same way
// (MiniMax's docs: keep the thinking in `content`, unmodified), so a model
// seen doing this gets its reasoning re-wrapped into the content it sends.

import { THINK_TAGS, splitLeadingThink } from "../../shared/inline-think.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `start`: nothing but whitespace or the first characters of an opening tag
 * yet, held back until it is clear which. `inside`: in the think block, with
 * any partial closing tag held back. `gap`: past the block, dropping the
 * blank lines before the answer. `text`: the answer, passed through.
 */
type Mode = "start" | "inside" | "gap" | "text";

interface ChoiceState {
  mode: Mode;
  held: string;
  close: string;
}

export interface ThinkStream {
  choices: Map<number, ChoiceState>;
  found: boolean;
  onFound?: () => void;
  /** The last chunk's envelope, for a chunk the router has to add itself. */
  template: Record<string, unknown> | null;
}

/** Per stream. `onFound` runs once, the first time a think block opens. */
export function createThinkStream(onFound?: () => void): ThinkStream {
  return { choices: new Map(), found: false, onFound, template: null };
}

interface Split {
  content: string;
  reasoning: string;
}

function feed(stream: ThinkStream, state: ChoiceState, piece: string): Split {
  const out: Split = { content: "", reasoning: "" };
  let rest = piece;
  while (rest) {
    if (state.mode === "start") {
      const text = state.held + rest;
      rest = "";
      const trimmed = text.trimStart();
      const tag = THINK_TAGS.find((candidate) => trimmed.startsWith(candidate.open));
      if (tag) {
        state.mode = "inside";
        state.close = tag.close;
        state.held = "";
        rest = trimmed.slice(tag.open.length);
        if (!stream.found) {
          stream.found = true;
          stream.onFound?.();
        }
      } else if (THINK_TAGS.some((candidate) => candidate.open.startsWith(trimmed))) {
        state.held = text;
      } else {
        state.mode = "text";
        state.held = "";
        out.content += text;
      }
    } else if (state.mode === "inside") {
      const text = state.held + rest;
      rest = "";
      const end = text.indexOf(state.close);
      if (end >= 0) {
        out.reasoning += text.slice(0, end);
        state.held = "";
        state.mode = "gap";
        rest = text.slice(end + state.close.length);
      } else {
        // Hold back the longest tail that could still become the closing tag.
        let keep = 0;
        for (let length = Math.min(state.close.length - 1, text.length); length > 0; length -= 1) {
          if (state.close.startsWith(text.slice(-length))) {
            keep = length;
            break;
          }
        }
        out.reasoning += text.slice(0, text.length - keep);
        state.held = text.slice(text.length - keep);
      }
    } else if (state.mode === "gap") {
      const trimmed = rest.trimStart();
      rest = "";
      if (trimmed) {
        state.mode = "text";
        out.content += trimmed;
      }
    } else {
      out.content += rest;
      rest = "";
    }
  }
  return out;
}

/** What a choice still holds when its stream ends: text before a tag was clear, thinking inside one. */
function flush(state: ChoiceState): Split {
  const out: Split = { content: "", reasoning: "" };
  if (state.mode === "start") out.content = state.held;
  else if (state.mode === "inside") out.reasoning = state.held;
  state.mode = "text";
  state.held = "";
  return out;
}

/**
 * Split thinking goes into whichever reasoning field the chunk already uses,
 * after what it already holds; the SDK reads `reasoning_content` over
 * `reasoning`, so filling the other one would hide the first.
 */
function addReasoning(delta: Record<string, unknown>, reasoning: string): void {
  if (!reasoning) return;
  if (typeof delta.reasoning_content === "string") delta.reasoning_content += reasoning;
  else if (typeof delta.reasoning === "string") delta.reasoning += reasoning;
  else delta.reasoning_content = reasoning;
}

function settled(stream: ThinkStream): boolean {
  if (stream.choices.size === 0) return false;
  for (const state of stream.choices.values()) if (state.mode !== "text") return false;
  return true;
}

/** Everything the stream still holds, as one chunk of its own, or null. */
export function flushThinkStream(stream: ThinkStream): string | null {
  const choices: Array<Record<string, unknown>> = [];
  for (const [index, state] of stream.choices) {
    const held = flush(state);
    if (!held.content && !held.reasoning) continue;
    const delta: Record<string, unknown> = {};
    if (held.content) delta.content = held.content;
    addReasoning(delta, held.reasoning);
    choices.push({ index, delta, finish_reason: null });
  }
  if (choices.length === 0 || !stream.template) return null;
  return `data: ${JSON.stringify({ ...stream.template, choices })}`;
}

/**
 * One SSE block of a chat-completions stream, with a leading think block
 * moved into the reasoning field. Held text is released on the choice's
 * finish reason, or before `[DONE]` when none came. A choice that first
 * appears after every earlier one reached its answer passes through as it
 * is; eve never asks for more than one.
 */
export function splitThinkBlock(block: string, stream: ThinkStream): string {
  // Once the answer is under way, blocks pass straight through unparsed.
  if (settled(stream) && !block.includes("[DONE]")) return block;
  let changed = false;
  const lines = block.split("\n").map((line) => {
    if (!line.startsWith("data:")) return line;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      const held = flushThinkStream(stream);
      if (!held) return line;
      changed = true;
      return `${held}\n\n${line}`;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return line;
    }
    if (!isRecord(payload) || !Array.isArray(payload.choices)) return line;
    const { choices: _choices, usage: _usage, ...envelope } = payload;
    stream.template = envelope;
    let touched = false;
    for (const choice of payload.choices) {
      if (!isRecord(choice)) continue;
      const index = typeof choice.index === "number" ? choice.index : 0;
      let state = stream.choices.get(index);
      if (!state) {
        state = { mode: "start", held: "", close: "" };
        stream.choices.set(index, state);
      }
      if (state.mode === "text") continue;
      const delta = isRecord(choice.delta) ? choice.delta : null;
      const split: Split = { content: "", reasoning: "" };
      let hadContent = false;
      if (delta && typeof delta.content === "string") {
        hadContent = true;
        const got = feed(stream, state, delta.content);
        split.content += got.content;
        split.reasoning += got.reasoning;
      }
      if (typeof choice.finish_reason === "string" && choice.finish_reason) {
        const held = flush(state);
        split.content += held.content;
        split.reasoning += held.reasoning;
      }
      if (!hadContent && !split.content && !split.reasoning) continue;
      const target = delta ?? {};
      if (hadContent || split.content) target.content = split.content;
      addReasoning(target, split.reasoning);
      choice.delta = target;
      touched = true;
    }
    if (!touched) return line;
    changed = true;
    return `data: ${JSON.stringify(payload)}`;
  });
  return changed ? lines.join("\n") : block;
}

/** The same split for a non-streamed completion, in place. True when a block was found. */
export function splitThinkCompletion(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return false;
  let found = false;
  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) continue;
    const message = choice.message;
    if (typeof message.content !== "string") continue;
    const split = splitLeadingThink(message.content);
    if (!split) continue;
    found = true;
    message.content = split.answer;
    addReasoning(message, split.thinking);
  }
  return found;
}

// Models seen writing inline thinking, per provider and model. Learned from
// replies rather than listed, so a model that starts doing it is handled
// without a code change; a router restart relearns on the next reply.
const inlineThinkModels = new Set<string>();

function modelKey(providerId: string, model: string): string {
  return `${providerId}\u0000${model}`;
}

/** True the first time a model is seen doing it. */
export function noteInlineThink(providerId: string, model: string): boolean {
  const key = modelKey(providerId, model);
  if (inlineThinkModels.has(key)) return false;
  inlineThinkModels.add(key);
  return true;
}

export function usesInlineThink(providerId: string, model: string): boolean {
  return inlineThinkModels.has(modelKey(providerId, model));
}

/**
 * The history for a model that writes inline thinking: each assistant
 * message's reasoning goes back in front of its content as a think block, the
 * shape the model wrote it in. A message whose content already opens with one
 * (stored before the split) keeps it and drops the duplicate. A new array;
 * the caller's messages are not changed.
 */
export function rewrapThinkHistory(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  return messages.map((item) => {
    if (!isRecord(item) || item.role !== "assistant") return item;
    const reasoning = item.reasoning_content;
    if (typeof reasoning !== "string" || !reasoning) return item;
    const { reasoning_content: _reasoning, ...rest } = item;
    const content = typeof rest.content === "string" ? rest.content : "";
    if (splitLeadingThink(content)) return rest;
    return { ...rest, content: content ? `<think>${reasoning}</think>\n\n${content}` : `<think>${reasoning}</think>` };
  });
}
