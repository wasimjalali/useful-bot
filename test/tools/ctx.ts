import type { RowInput, ToolCtx } from "../../agent/lib/tool.ts";
import type { OkSnapshot } from "../../agent/lib/turn-snapshot.ts";

export type TestCtx = ToolCtx & { rows: RowInput[]; abort: () => void };

/**
 * A tool context for a test: the fields a tool reads, rows collected in
 * `rows` (idempotent by key, as the engine's appendRow is) and a signal the
 * test can fire with `abort()`.
 */
export function fakeCtx(over: Partial<Pick<ToolCtx, "chatId" | "botId" | "turnId" | "callId" | "origin">> = {}): TestCtx {
  const chatId = over.chatId ?? "chat-test";
  const turnId = over.turnId ?? "turn-test";
  const controller = new AbortController();
  const rows: RowInput[] = [];
  const snapshot = {
    status: "ok",
    sessionId: chatId,
    turnId,
    botId: over.botId ?? "bot-useful",
    context: { bot: { name: "Useful Bot", label: "", description: "" } },
  } as unknown as OkSnapshot;
  return {
    chatId,
    botId: over.botId ?? "bot-useful",
    turnId,
    callId: over.callId ?? "call-test",
    origin: over.origin ?? "owner",
    abortSignal: controller.signal,
    snapshot,
    session: { id: chatId, turn: { id: turnId } },
    async appendRow(row) {
      if (!rows.some((item) => item.key === row.key)) rows.push(row);
    },
    rows,
    abort: () => controller.abort(),
  };
}
