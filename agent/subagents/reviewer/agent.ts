import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";
import { POLICY_WINDOW_TOKENS } from "../../../shared/policy.ts";

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
  const token = process.env.UB_ROUTER_REVIEWER_TOKEN ?? process.env.UB_ROUTER_DESKTOP_TOKEN;
  if (!token) {
    throw new Error("reviewer router token missing");
  }
  const provider = createOpenAICompatible({
    name: "useful-bot-router",
    baseURL: process.env.UB_ROUTER_BASE_URL ?? "http://127.0.0.1:4319/v1",
    apiKey: token,
  });
  return provider.chatModel("reviewer");
}

export default defineAgent({
  model: reviewerModel(),
  modelContextWindowTokens: POLICY_WINDOW_TOKENS,
});
