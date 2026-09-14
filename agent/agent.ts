import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";
import { POLICY_WINDOW_TOKENS } from "../shared/policy.ts";

const PLANTED = "S2-TOOL-PLANT-001";

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(new Error("aborted"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(chunks: string[], signal: AbortSignal | undefined, delayMs: number): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for (const chunk of chunks) {
          await sleep(delayMs, signal);
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function hasToolResult(messages: Array<{ role?: string }>): boolean {
  return messages.some((message) => message.role === "tool");
}

async function fixtureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (process.env.UB_S2_FIXTURE !== "1") {
    throw new Error("fixture fetch invoked without UB_S2_FIXTURE=1");
  }
  const raw = init?.body;
  const body = raw ? JSON.parse(typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer).toString("utf8")) : {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const stream = body.stream === true;
  const signal = init?.signal ?? undefined;

  if (!hasToolResult(messages)) {
    const toolCall = {
      id: "s2cmpl_tool",
      object: stream ? "chat.completion.chunk" : "chat.completion",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          ...(stream
            ? {
                delta: {
                  role: "assistant",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_plant",
                      type: "function",
                      function: { name: "plant_read", arguments: "{}" },
                    },
                  ],
                },
              }
            : {
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "call_plant",
                      type: "function",
                      function: { name: "plant_read", arguments: "{}" },
                    },
                  ],
                },
              }),
        },
      ],
    };
    return stream ? sseResponse([JSON.stringify(toolCall)], signal, 0) : jsonResponse(toolCall);
  }

  if (stream) {
    const first = JSON.stringify({
      id: "s2cmpl_stream",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { role: "assistant", content: PLANTED }, finish_reason: null }],
    });
    const last = JSON.stringify({
      id: "s2cmpl_stream",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    });
    return sseResponse([first, last], signal, 250);
  }

  return jsonResponse({
    id: "s2cmpl_final",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: PLANTED },
      },
    ],
  });
}

function s2FixtureModel() {
  const provider = createOpenAICompatible({
    name: "s2-fixture",
    baseURL: "http://s2.invalid/v1",
    apiKey: "s2-fixture",
    fetch: fixtureFetch,
  });
  return provider.chatModel("s2-fixture");
}

// One id per process when the env does not pin one, so every model request in
// a process reports the same session/turn instead of a fresh random uuid.
const PROCESS_SESSION_ID = process.env.UB_SESSION_ID ?? crypto.randomUUID();
const PROCESS_TURN_ID = process.env.UB_TURN_ID ?? crypto.randomUUID();

function requireModel() {
  if (process.env.UB_S2_FIXTURE === "1") {
    return s2FixtureModel();
  }
  const token = process.env.UB_ROUTER_DESKTOP_TOKEN;
  if (!token) {
    throw new Error("UB_ROUTER_DESKTOP_TOKEN missing; S2 probe sets UB_S2_FIXTURE=1");
  }
  const provider = createOpenAICompatible({
    name: "useful-bot-router",
    baseURL: process.env.UB_ROUTER_BASE_URL ?? "http://127.0.0.1:4319/v1",
    apiKey: token,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-useful-session-id", PROCESS_SESSION_ID);
      headers.set("x-useful-turn-id", PROCESS_TURN_ID);
      headers.set("x-useful-request-id", crypto.randomUUID());
      return fetch(input, { ...init, headers });
    },
  });
  return provider.chatModel("workhorse");
}

export default defineAgent({
  model: requireModel(),
  modelContextWindowTokens: POLICY_WINDOW_TOKENS,
});
