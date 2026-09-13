"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyShellAction,
  parseShell,
  seedStore,
  selectedBot,
  type ShellAction,
  type ShellStore,
} from "../../shared/shell-store.ts";

async function csrfToken(): Promise<string> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (!res.ok) throw new Error("unauthorized");
  const body = (await res.json()) as { csrfToken?: string };
  return body.csrfToken ?? "";
}

export function useShell(authed: boolean) {
  const [store, setStore] = useState<ShellStore | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<Promise<void>>(Promise.resolve());

  const gen = useRef(0);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/shell", { credentials: "include" });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) throw new Error("Shell failed");
    const body = (await res.json()) as { store?: unknown };
    return parseShell(body.store ?? seedStore());
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await load();
        if (!cancelled) setStore(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Shell failed");
      }
    })();
    const timer = window.setInterval(() => {
      if (dirty.current) return;
      void load()
        .then((next) => {
          if (!dirty.current) setStore(next);
        })
        .catch(() => undefined);
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authed, load]);

  const persist = useCallback(async (action: ShellAction) => {
    const token = await csrfToken();
    const res = await fetch("/api/shell", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json", "x-ub-csrf": token },
      body: JSON.stringify({ action }),
    });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) throw new Error("Shell save failed");
    const body = (await res.json()) as { store?: unknown };
    return parseShell(body.store ?? seedStore());
  }, []);

  const dispatch = useCallback((action: ShellAction) => {
    setStore((current) => {
      const base = current ?? seedStore();
      let next: ShellStore;
      try {
        next = applyShellAction(base, action).store;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Shell action failed");
        return base;
      }
      dirty.current = true;
      gen.current += 1;
      const mine = gen.current;
      pending.current = pending.current
        .then(async () => {
          try {
            const saved = await persist(action);
            if (mine === gen.current) {
              dirty.current = false;
              setStore(saved);
              setError("");
            }
          } catch (err) {
            if (mine === gen.current) {
              dirty.current = false;
              setError(err instanceof Error ? err.message : "Shell save failed");
            }
          }
        })
        .catch(() => undefined);
      return next;
    });
  }, [persist]);

  return {
    store,
    error,
    dispatch,
    selected: store ? selectedBot(store) : null,
  };
}
