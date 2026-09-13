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

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/shell", { credentials: "include" });
        if (res.status === 401) throw new Error("unauthorized");
        if (!res.ok) throw new Error("Shell failed");
        const body = (await res.json()) as { store?: unknown };
        if (!cancelled) setStore(parseShell(body.store ?? seedStore()));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Shell failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  const gen = useRef(0);

  const persist = useCallback(async (next: ShellStore) => {
    const token = await csrfToken();
    const res = await fetch("/api/shell", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json", "x-ub-csrf": token },
      body: JSON.stringify({ store: next }),
    });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) throw new Error("Shell save failed");
    const body = (await res.json()) as { store?: unknown };
    return parseShell(body.store ?? next);
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
      gen.current += 1;
      const mine = gen.current;
      pending.current = pending.current
        .then(async () => {
          try {
            const saved = await persist(next);
            if (mine === gen.current) {
              setStore(saved);
              setError("");
            }
          } catch (err) {
            if (mine === gen.current) {
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
