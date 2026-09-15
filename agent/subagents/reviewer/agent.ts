import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";
import { POLICY_WINDOW_TOKENS } from "../../../shared/policy.ts";

// One id per process when the env does not pin one, so every model request in
// a process reports the same session/turn instead of a fresh random uuid.
const PROCESS_SESSION_ID = process.env.UB_SESSION_ID ?? crypto.randomUUID();
const PROCESS_TURN_ID = process.env.UB_TURN_ID ?? crypto.randomUUID();

function reviewerModel() {
  if (process.env.UB_S2_FIXTURE === "1") {
    const provider = createOpenAICompatible({
      name: "s2-fixture",
      baseURL: "http://s2.invalid/v1",
      apiKey: "s2-fixture",
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "rev",
            object: "chat.completion",
            choices: [{
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: "reviewer-offline" },
            }],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    return provider.chatModel("s2-fixture");
  }
  // The desktop token's profile forbids the reviewer alias, so only the
  // reviewer credential works here.
  const token = process.env.UB_ROUTER_REVIEWER_TOKEN;
  if (!token) {
    throw new Error("reviewer router token missing");
  }
  const provider = createOpenAICompatible({
    name: "useful-bot-router",
    baseURL: process.env.UB_ROUTER_BASE_URL ?? "http://127.0.0.1:4319/v1",
    apiKey: token,
    // The router refuses /v1/chat/completions without the x-useful-* UUIDs,
    // so every call carries the process session and turn plus a fresh id.
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-useful-session-id", PROCESS_SESSION_ID);
      headers.set("x-useful-turn-id", PROCESS_TURN_ID);
      headers.set("x-useful-request-id", crypto.randomUUID());
      return fetch(input, { ...init, headers });
    },
  });
  return provider.chatModel("reviewer");
}

export default defineAgent({
  model: reviewerModel(),
  modelContextWindowTokens: POLICY_WINDOW_TOKENS,
  description: "Read-only defect finder over supplied text. No tools, no delegation.",
});
