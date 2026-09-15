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

type ProposalMeta = {
  proposalId?: string;
  proposalStatus?: "confirmed" | "dismissed";
};

export function useShell(authed: boolean) {
  const [store, setStore] = useState<ShellStore | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef<ShellStore | null>(null);

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
        if (!cancelled) {
          latest.current = next;
          setStore(next);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Shell failed");
      }
    })();
    const timer = window.setInterval(() => {
      if (dirty.current) return;
      void load()
        .then((next) => {
          if (!dirty.current) {
            latest.current = next;
            setStore(next);
          }
        })
        .catch(() => undefined);
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authed, load]);

  const persist = useCallback(async (action: ShellAction, meta: ProposalMeta) => {
    const token = await csrfToken();
    const res = await fetch("/api/shell", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json", "x-ub-csrf": token },
      body: JSON.stringify({ action, ...meta }),
    });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) throw new Error("Shell save failed");
    const body = (await res.json()) as { store?: unknown };
    return parseShell(body.store ?? seedStore());
  }, []);

  // The previous version queued the save from inside the setState updater.
  // React invokes updaters more than once in development (StrictMode), so one
  // click sent two PUTs and one confirm created two bots. Compute the next
  // store synchronously and keep the updater pure instead.
  const dispatch = useCallback((action: ShellAction, meta: ProposalMeta = {}) => {
    const base = latest.current ?? seedStore();
    let next: ShellStore;
    try {
      next = applyShellAction(base, action).store;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shell action failed");
      return;
    }
    latest.current = next;
    dirty.current = true;
    gen.current += 1;
    const mine = gen.current;
    pending.current = pending.current
      .then(async () => {
        try {
          const saved = await persist(action, meta);
          if (mine === gen.current) {
            dirty.current = false;
            latest.current = saved;
            setStore(saved);
            setError("");
          }
        } catch (err) {
          // A failed save must surface even when a newer action has taken
          // over: gated on the generation, the rejected edit would sit on
          // screen with no error until the newer save resolved.
          if (mine === gen.current) dirty.current = false;
          setError(err instanceof Error ? err.message : "Shell save failed");
          // The optimistic store may not exist on the server. Put the server
          // snapshot back so the next poll cannot resurrect a rejected edit.
          try {
            const fresh = await load();
            // A newer action's optimistic state is live and its own result
            // will replace the view, so this reload must not overwrite it.
            if (mine === gen.current) {
              latest.current = fresh;
              setStore(fresh);
            }
          } catch {
            /* server unreachable: keep the last known view */
          }
        }
      })
      .catch(() => undefined);
    setStore(next);
  }, [load, persist]);

  // Dismissing a card carries no shell action; send the proposal fields alone.
  // Route it through the same generation/queue as dispatch so a slow earlier
  // save cannot land after this resolve and overwrite the newer snapshot.
  const resolveOnly = useCallback((meta: {
    proposalId: string;
    proposalStatus: "confirmed" | "dismissed";
  }) => {
    gen.current += 1;
    const mine = gen.current;
    dirty.current = true;
    const run = pending.current.then(async () => {
      try {
        const token = await csrfToken();
        const res = await fetch("/api/shell", {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json", "x-ub-csrf": token },
          body: JSON.stringify(meta),
        });
        if (res.status === 401) throw new Error("unauthorized");
        if (!res.ok) throw new Error("Shell save failed");
        const body = (await res.json()) as { store?: unknown };
        const fresh = parseShell(body.store ?? seedStore());
        if (mine === gen.current) {
          dirty.current = false;
          latest.current = fresh;
          setStore(fresh);
        }
        return fresh;
      } catch (err) {
        if (mine === gen.current) dirty.current = false;
        throw err;
      }
    });
    pending.current = run.then(() => undefined).catch(() => undefined);
    return run;
  }, []);

  return {
    store,
    error,
    dispatch,
    resolveOnly,
    selected: store ? selectedBot(store) : null,
  };
}
