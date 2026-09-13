"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, Proposal } from "../../shared/agent-store.ts";

/**
 * Thread state for the open chat: the durable event log every bot and the owner
 * share, plus any proposal waiting on the owner. Polling also drives the
 * handoff pump so bot-to-bot deliveries keep moving while the owner reads.
 */
export function useAgentThread(authed: boolean, botId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState("");
  const loadedFor = useRef<string | null>(null);
  const busy = useRef(false);
  const csrf = useRef("");

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/agent/state?botId=${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Thread failed");
    const body = await res.json() as { events?: AgentEvent[]; proposals?: Proposal[] };
    return { events: body.events ?? [], proposals: body.proposals ?? [] };
  }, []);

  const tick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!csrf.current) {
        const session = await fetch("/api/auth/session", { credentials: "include" });
        if (session.ok) {
          csrf.current = (await session.json() as { csrfToken?: string }).csrfToken ?? "";
        }
      }
      const res = await fetch("/api/agent/tick?limit=2", {
        method: "POST",
        credentials: "include",
        headers: csrf.current ? { "x-ub-csrf": csrf.current } : {},
      });
      if (res.status === 403) csrf.current = "";
    } catch {
      /* the next poll retries */
    } finally {
      busy.current = false;
    }
  }, []);

  const refresh = useCallback(async (id: string) => {
    const next = await load(id);
    setEvents(next.events);
    setProposals(next.proposals);
    return next;
  }, [load]);

  useEffect(() => {
    if (!authed || !botId) {
      setEvents([]);
      setProposals([]);
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current !== botId) {
      loadedFor.current = botId;
      setEvents([]);
      setProposals([]);
    }
    let cancelled = false;
    let generation = 0;
    async function poll(id: string) {
      const mine = ++generation;
      try {
        const next = await load(id);
        // A slow earlier poll must not overwrite a newer response.
        if (cancelled || mine !== generation) return;
        setEvents(next.events);
        setProposals(next.proposals);
        setError("");
      } catch (err) {
        if (!cancelled && mine === generation) setError(err instanceof Error ? err.message : "Thread failed");
      }
    }
    void poll(botId);
    const timer = window.setInterval(() => {
      void poll(botId);
      void tick();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authed, botId, load, tick]);

  return { events, proposals, error, refresh, tick };
}
