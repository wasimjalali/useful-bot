import assert from "node:assert/strict";
import test from "node:test";
import {
  createThinkStream,
  flushThinkStream,
  noteInlineThink,
  rewrapThinkHistory,
  splitThinkBlock,
  splitThinkCompletion,
  usesInlineThink,
} from "../router/src/inline-think.ts";
import { withoutLeadingThink } from "../shared/inline-think.ts";

// Some models (MiniMax M3 through OpenCode, MiniMax's own API by default)
// write their thinking into the answer as `<think>…</think>` instead of the
// reasoning field. These are the ways splitting that out can go wrong.

type Delta = Record<string, unknown>;

function block(delta: Delta, extra: Record<string, unknown> = {}, index = 0): string {
  return `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "workhorse", choices: [{ index, delta, ...extra }] })}`;
}

/** Everything the client would read back, per choice, from the relayed blocks. */
function read(out: string[]): { content: string; reasoning: string; finish: string | null; done: boolean; toolCalls: number } {
  let content = "";
  let reasoning = "";
  let finish: string | null = null;
  let done = false;
  let toolCalls = 0;
  for (const chunk of out) {
    for (const event of chunk.split(/\n\n/)) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          done = true;
          continue;
        }
        const payload = JSON.parse(data);
        for (const choice of payload.choices ?? []) {
          const delta = choice.delta ?? {};
          if (typeof delta.content === "string") content += delta.content;
          if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
          if (Array.isArray(delta.tool_calls)) toolCalls += delta.tool_calls.length;
          if (choice.finish_reason) finish = choice.finish_reason;
        }
      }
    }
  }
  return { content, reasoning, finish, done, toolCalls };
}

function relay(pieces: string[], opts: { finish?: string; done?: boolean; flush?: boolean } = {}): { result: ReturnType<typeof read>; found: number } {
  let found = 0;
  const stream = createThinkStream(() => { found += 1; });
  const out: string[] = [];
  for (const piece of pieces) out.push(splitThinkBlock(block({ content: piece }), stream));
  if (opts.finish) out.push(splitThinkBlock(block({}, { finish_reason: opts.finish }), stream));
  if (opts.done ?? true) out.push(splitThinkBlock("data: [DONE]", stream));
  if (opts.flush) {
    const held = flushThinkStream(stream);
    if (held) out.push(held);
  }
  return { result: read(out), found };
}

test("a think block cut across chunks becomes reasoning, the answer stays text", () => {
  const { result, found } = relay(["<thi", "nk>Plan the ", "reply.</th", "ink>\n\nHello", " there."], { finish: "stop" });
  assert.equal(result.reasoning, "Plan the reply.");
  assert.equal(result.content, "Hello there.");
  assert.equal(result.finish, "stop");
  assert.equal(result.done, true);
  assert.equal(found, 1);
});

test("every single-character split still lands whole", () => {
  const raw = "  <think>a < b and </thin is not a close</think>\n\nAnswer <b>bold</b>.";
  const { result } = relay([...raw], { finish: "stop" });
  assert.equal(result.reasoning, "a < b and </thin is not a close");
  assert.equal(result.content, "Answer <b>bold</b>.");
});

test("the <thinking> spelling is split the same way", () => {
  const { result } = relay(["<thinking>step</thinking>Done"], { finish: "stop" });
  assert.equal(result.reasoning, "step");
  assert.equal(result.content, "Done");
});

test("an answer that opens with a different tag is left exactly as sent", () => {
  for (const pieces of [["<", "div>hi</div>"], ["<th", "ead>"], ["<3 thanks"], ["<thin", "k about it"], ["\n\n", "Plain"]]) {
    const { result, found } = relay(pieces, { finish: "stop" });
    assert.equal(result.content, pieces.join(""), JSON.stringify(pieces));
    assert.equal(result.reasoning, "");
    assert.equal(found, 0);
  }
});

test("a think tag in the middle of an answer is the answer's own text", () => {
  const { result, found } = relay(["Use ", "<think>", " tags like this: <think>x</think>"], { finish: "stop" });
  assert.equal(result.content, "Use <think> tags like this: <think>x</think>");
  assert.equal(result.reasoning, "");
  assert.equal(found, 0);
});

test("a stream cut inside the thinking loses nothing and shows no text", () => {
  const { result } = relay(["<think>long thought that never", " ends </thi"], { finish: "length" });
  assert.equal(result.reasoning, "long thought that never ends </thi");
  assert.equal(result.content, "");
  assert.equal(result.finish, "length");
});

test("a stream that ends on half an opening tag still delivers it as text", () => {
  const { result } = relay(["<th"], { finish: "stop" });
  assert.equal(result.content, "<th");
  assert.equal(result.reasoning, "");
});

test("held text is flushed before [DONE] when no finish reason came", () => {
  const { result } = relay(["<think>tho", "ught</thi"], { done: true });
  assert.equal(result.reasoning, "thought</thi");
  assert.equal(result.done, true);
});

test("a stream with neither finish reason nor [DONE] gives up held text at the end", () => {
  const { result } = relay(["<th"], { done: false, flush: true });
  assert.equal(result.content, "<th");
});

test("thinking followed only by a tool call leaves no text behind", () => {
  const stream = createThinkStream();
  const out = [
    splitThinkBlock(block({ role: "assistant", content: "<think>Need the file.</think>\n\n" }), stream),
    splitThinkBlock(block({ tool_calls: [{ index: 0, id: "t1", type: "function", function: { name: "read", arguments: "{}" } }] }), stream),
    splitThinkBlock(block({}, { finish_reason: "tool_calls" }), stream),
    splitThinkBlock("data: [DONE]", stream),
  ];
  const result = read(out);
  assert.equal(result.reasoning, "Need the file.");
  assert.equal(result.content, "");
  assert.equal(result.toolCalls, 1);
  assert.equal(result.finish, "tool_calls");
});

test("a chunk that already carries reasoning keeps it, ahead of the split thinking", () => {
  const stream = createThinkStream();
  const out = [splitThinkBlock(block({ reasoning_content: "native ", content: "<think>inline</think>ok" }), stream)];
  const result = read(out);
  assert.equal(result.reasoning, "native inline");
  assert.equal(result.content, "ok");
});

test("a chunk that uses the `reasoning` field keeps a single reasoning field", () => {
  const stream = createThinkStream();
  const out = splitThinkBlock(block({ reasoning: "native ", content: "<think>inline</think>ok" }), stream);
  const delta = JSON.parse(out.slice(5)).choices[0].delta;
  assert.equal(delta.reasoning, "native inline");
  assert.equal(delta.reasoning_content, undefined);
});

test("an empty think block leaves the answer untouched", () => {
  const { result } = relay(["<think></think>", "\n\nHi"], { finish: "stop" });
  assert.equal(result.reasoning, "");
  assert.equal(result.content, "Hi");
});

test("the answer's own inner whitespace survives, only the gap after thinking goes", () => {
  const { result } = relay(["<think>x</think>\n\n", "\n", "Line one\n\n  Line two"], { finish: "stop" });
  assert.equal(result.content, "Line one\n\n  Line two");
});

test("each choice keeps its own state", () => {
  const stream = createThinkStream();
  const out = [
    splitThinkBlock(block({ content: "<think>a" }, {}, 0), stream),
    splitThinkBlock(block({ content: "Plain" }, {}, 1), stream),
    splitThinkBlock(block({ content: "</think>A" }, {}, 0), stream),
  ];
  const texts: Record<number, { c: string; r: string }> = { 0: { c: "", r: "" }, 1: { c: "", r: "" } };
  for (const chunk of out) {
    const choice = JSON.parse(chunk.slice(5)).choices[0];
    texts[choice.index].c += choice.delta.content ?? "";
    texts[choice.index].r += choice.delta.reasoning_content ?? "";
  }
  assert.deepEqual(texts, { 0: { c: "A", r: "a" }, 1: { c: "Plain", r: "" } });
});

test("blocks that carry no content come back byte for byte", () => {
  const stream = createThinkStream();
  const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } })}`;
  assert.equal(splitThinkBlock(usage, stream), usage);
  assert.equal(splitThinkBlock(": keep-alive", stream), ": keep-alive");
  assert.equal(splitThinkBlock("data: not json", stream), "data: not json");
  // Once the answer is under way, text blocks pass straight through.
  splitThinkBlock(block({ content: "Hello" }), stream);
  const later = block({ content: " <think>" });
  assert.equal(splitThinkBlock(later, stream), later);
});

test("a stream that already sends native reasoning is split but not learned", () => {
  let found = 0;
  const stream = createThinkStream(() => { found += 1; });
  splitThinkBlock(block({ reasoning_content: "native thought" }), stream);
  const out = splitThinkBlock(block({ content: "<think>quoted</think>Answer" }), stream);
  const delta = JSON.parse(out.slice(5)).choices[0].delta;
  assert.equal(delta.content, "Answer");
  assert.equal(found, 0);
});

test("a flood of leading whitespace is released instead of held", () => {
  const stream = createThinkStream();
  const spaces = " ".repeat(300);
  const out = splitThinkBlock(block({ content: spaces }), stream);
  assert.equal(JSON.parse(out.slice(5)).choices[0].delta.content, spaces);
  const later = block({ content: "<think>x</think>" });
  assert.equal(splitThinkBlock(later, stream), later);
});

test("a non-streamed reply is split the same way", () => {
  const json = { choices: [{ index: 0, message: { role: "assistant", content: "\n<think>why</think>\n\nBecause." }, finish_reason: "stop" }] };
  assert.equal(splitThinkCompletion(json), true);
  assert.deepEqual(json.choices[0].message, { role: "assistant", content: "Because.", reasoning_content: "why" });

  const unclosed = { choices: [{ message: { role: "assistant", content: "<think>cut off" } }] };
  splitThinkCompletion(unclosed);
  assert.deepEqual(unclosed.choices[0].message, { role: "assistant", content: "", reasoning_content: "cut off" });

  const plain = { choices: [{ message: { role: "assistant", content: "Use <think> tags." } }] };
  assert.equal(splitThinkCompletion(plain), false);
  assert.equal(plain.choices[0].message.content, "Use <think> tags.");

  const tools = { choices: [{ message: { role: "assistant", content: null, tool_calls: [] } }] };
  assert.equal(splitThinkCompletion(tools), false);
});

test("history goes back as inline thinking only to models that wrote it that way", () => {
  noteInlineThink("opencode-go", "minimax-m3");
  assert.equal(usesInlineThink("opencode-go", "minimax-m3"), true);
  assert.equal(usesInlineThink("opencode-go", "minimax-m2.7"), false);
  assert.equal(usesInlineThink("minimax", "minimax-m3"), false);

  const history = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hello", reasoning_content: "greet" },
    { role: "assistant", content: null, reasoning_content: "need a file", tool_calls: [{ id: "t1", type: "function", function: { name: "read", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "t1", content: "data" },
    { role: "assistant", content: "<think>old</think>\n\nStored before the fix" },
    { role: "assistant", content: "No thinking" },
    { role: "assistant", content: [{ type: "text", text: "parts" }], reasoning_content: "kept apart" },
  ];
  const out = rewrapThinkHistory(history) as Array<Record<string, unknown>>;
  assert.deepEqual(out[1], { role: "assistant", content: "<think>greet</think>\n\nHello" });
  assert.deepEqual(out[2], { role: "assistant", content: "<think>need a file</think>", tool_calls: history[2].tool_calls });
  assert.deepEqual(out[4], history[4]);
  assert.deepEqual(out[5], history[5]);
  assert.equal(out[6], history[6]);
  assert.equal(out[0], history[0]);
  // The caller's history is not mutated.
  assert.equal(history[1].reasoning_content, "greet");
});

test("stored bubbles hide a leading think block, and only a leading one", () => {
  assert.equal(withoutLeadingThink("<think>plan</think>\n\nThe page is ready."), "The page is ready.");
  assert.equal(withoutLeadingThink("  <thinking>plan</thinking>Done"), "Done");
  assert.equal(withoutLeadingThink("<think>All checks pass.\n\nMark todo final.</think>\n\n"), "");
  assert.equal(withoutLeadingThink("<think>still thinking"), "");
  assert.equal(withoutLeadingThink("<thi"), "");
  assert.equal(withoutLeadingThink("Use <think> tags."), "Use <think> tags.");
  assert.equal(withoutLeadingThink("<div>html</div>"), "<div>html</div>");
  assert.equal(withoutLeadingThink("Plain answer"), "Plain answer");
  assert.equal(withoutLeadingThink(""), "");
});
