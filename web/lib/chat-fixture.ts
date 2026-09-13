type FixtureTurn = {
  sessionId: string;
  userText: string;
  assistantText: string;
};

const turns = new Map<string, FixtureTurn[]>();
let seq = 0;

function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

function assistantFor(text: string): string {
  const clipped = text.trim().slice(0, 240);
  return `Fixture reply on this cloud VM. You said: ${clipped || "(empty)"}`;
}

export function fixtureEnabled(): boolean {
  return process.env.UB_CHAT_FIXTURE === "1";
}

export function fixtureHandle(method: string, suffix: string, request: Request): Promise<Response> | Response | null {
  if (!fixtureEnabled()) return null;
  if (suffix === "health" || suffix === "info") {
    return Response.json({ ok: true, fixture: true });
  }
  if (method === "POST" && suffix === "session") {
    return createTurn(null, request);
  }
  const parts = suffix.split("/");
  if (parts[0] !== "session" || !parts[1]) return null;
  const sessionId = parts[1];
  if (method === "POST" && parts.length === 2) {
    return createTurn(sessionId, request);
  }
  if (method === "POST" && parts[2] === "cancel") {
    return Response.json({ ok: true, cancelled: true });
  }
  if (method === "GET" && parts[2] === "stream") {
    return streamSession(sessionId, request.signal);
  }
  return null;
}

async function createTurn(existing: string | null, request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { message?: unknown };
  const userText = typeof body.message === "string" ? body.message : "";
  const sessionId = existing ?? `fixture-${newId("sess")}`;
  const list = turns.get(sessionId) ?? [];
  list.push({
    sessionId,
    userText,
    assistantText: assistantFor(userText),
  });
  turns.set(sessionId, list);
  return Response.json({ sessionId, ok: true, fixture: true });
}

function streamSession(sessionId: string, signal: AbortSignal): Response {
  const list = turns.get(sessionId) ?? [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        for (const [index, turn] of list.entries()) {
          if (signal.aborted) break;
          send({ type: "turn.started", data: { turnId: `t${index}` }, meta: { id: `e-${sessionId}-${index}-start` } });
          send({
            type: "message.received",
            data: { message: turn.userText },
            meta: { id: `e-${sessionId}-${index}-user` },
          });
          const chunks = splitDelta(turn.assistantText);
          let assembled = "";
          for (const [chunkIndex, chunk] of chunks.entries()) {
            if (signal.aborted) break;
            assembled += chunk;
            send({
              type: "message.appended",
              data: { messageDelta: chunk },
              meta: { id: `e-${sessionId}-${index}-d${chunkIndex}` },
            });
            await sleep(40, signal);
          }
          send({
            type: "message.completed",
            data: { message: assembled || turn.assistantText, finishReason: "stop" },
            meta: { id: `e-${sessionId}-${index}-done` },
          });
          send({ type: "session.waiting", data: {}, meta: { id: `e-${sessionId}-${index}-wait` } });
        }
        await hangUntilAbort(signal);
      } catch {
        /* aborted */
      } finally {
        try { controller.close(); } catch { /* ignore */ }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
    },
  });
}

function splitDelta(text: string): string[] {
  if (!text) return [" "];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += 18) {
    parts.push(text.slice(i, i + 18));
  }
  return parts;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }, { once: true });
  });
}

function hangUntilAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
