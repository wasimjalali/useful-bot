"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyEveEvent,
  consumeEveNdjson,
  createProjection,
  type StreamProjection,
} from "../../shared/eve-stream.ts";

let seq = 0;
function nextId() {
  seq += 1;
  return `m${seq}`;
}

export function titleFrom(text: string): string {
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

export function useEveChat(sessionId: string | null, authed: boolean) {
  const [error, setError] = useState("");
  const [proj, setProj] = useState<StreamProjection>(() => createProjection());
  const projSession = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projSession.current !== sessionId) {
      projSession.current = sessionId;
      setProj(createProjection());
      setError("");
    }
  }, [sessionId]);

  useEffect(() => {
    if (!authed || !sessionId) return;
    let cancelled = false;
    let controller = new AbortController();

    async function follow() {
      while (!cancelled && sessionId) {
        controller = new AbortController();
        try {
          const res = await fetch(`/eve/v1/session/${sessionId}/stream?startIndex=0`, {
            credentials: "include",
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            if (res.status === 401) {
              setError("Sign in expired");
              return;
            }
            throw new Error(res.status === 503 ? "Agent unavailable" : "Stream failed");
          }
          await consumeEveNdjson(res.body, (event) => {
            if (cancelled) return;
            setProj((current) => applyEveEvent(current, event));
          }, controller.signal);
        } catch (err) {
          if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
            return;
          }
          setError(err instanceof Error ? err.message : "Stream failed");
          setProj((current) => ({ ...current, pending: false }));
        }
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    void follow();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authed, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [proj.messages, proj.pending]);

  const sendLock = useRef(false);

  const resetLocal = useCallback(() => {
    projSession.current = null;
    setProj(createProjection());
    setError("");
  }, []);

  const send = useCallback(async (text: string, active: string | null): Promise<string | null> => {
    if (!text || proj.pending || sendLock.current) return active;
    sendLock.current = true;
    setError("");
    setProj((current) => ({
      ...current,
      pending: true,
      error: "",
      messages: [...current.messages, { role: "user", text, id: nextId() }],
    }));
    try {
      const res = await fetch(active ? `/eve/v1/session/${active}` : "/eve/v1/session", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        throw new Error(res.status === 503 ? "Agent unavailable" : "Send failed");
      }
      const body = (await res.json()) as { sessionId?: string };
      const sid = body.sessionId ?? active;
      if (sid) projSession.current = sid;
      return sid ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
      setProj((current) => ({ ...current, pending: false }));
      return active;
    } finally {
      sendLock.current = false;
    }
  }, [proj.pending]);

  const cancel = useCallback(async (active: string | null) => {
    if (!active) return;
    const settle = () => setProj((current) => ({ ...current, pending: false }));
    try {
      await Promise.race([
        fetch(`/eve/v1/session/${active}/cancel`, { method: "POST", credentials: "include" }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } finally {
      settle();
    }
  }, []);

  const messages = proj.messages;
  const pending = proj.pending;
  const displayError = error || proj.error;
  const showSpinner = pending && !proj.blockOpen && !proj.currentAssistantId;

  return {
    bottomRef,
    cancel,
    displayError,
    messages,
    pending,
    resetLocal,
    send,
    setError,
    showSpinner,
  };
}
