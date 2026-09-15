"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./icons";

/**
 * Connectors: the owner's Composio key, then the app catalogue with a
 * Connect or Disconnect per app. Connect opens Composio's hosted OAuth page
 * in the browser; the row shows Pending and the list polls until Composio
 * reports the account active, or gives up after two minutes.
 */

type Toolkit = {
  slug: string;
  name: string;
  logo: string | null;
  noAuth: boolean;
  connected: boolean;
  accountId: string | null;
  status: string | null;
};

type Payload = {
  ok?: boolean;
  error?: string;
  hasKey?: boolean;
  last4?: string | null;
  toolkits?: Toolkit[];
};

const POLL_MS = 3000;
const POLL_LIMIT_MS = 120_000;
const LOAD_ERROR = "Could not load connectors.";
const UPSTREAM_ERROR = "Composio did not answer. Check the key, then try again.";
const RATE_ERROR = "Too many requests. Wait a moment.";
/** Errors a background poll may clear; an action's own message stays until the next action. */
const LOAD_ERRORS = new Set([LOAD_ERROR, UPSTREAM_ERROR, RATE_ERROR]);

/** Only an https page from Composio's own hosts is opened for sign-in. */
function safeSignInUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!/(^|\.)composio\.dev$/.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  const session = (await res.json()) as { csrfToken?: string };
  return { "content-type": "application/json", "x-ub-csrf": session.csrfToken ?? "" };
}

export function ConnectorsDialog({ onClose }: { onClose: () => void }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ slug: string; since: number } | null>(null);
  const [timedOut, setTimedOut] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchLive = useRef("");
  searchLive.current = search;

  const load = useCallback(async (query: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
      const res = await fetch(`/api/connectors${params}`, { credentials: "include" });
      const body = (await res.json()) as Payload;
      if (!res.ok && res.status !== 502) throw new Error(body.error ?? "connectors_failed");
      setPayload(body);
      // A quiet poll only clears a load error it could have caused; a message
      // from Connect or Disconnect stays until the owner acts again.
      const next = body.ok === false ? UPSTREAM_ERROR : "";
      setError((current) => (quiet && !LOAD_ERRORS.has(current) && current ? current : next));
      return body;
    } catch (err) {
      const message = err instanceof Error && err.message === "rate_limited" ? RATE_ERROR : LOAD_ERROR;
      setError((current) => (quiet && current ? current : message));
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(search), payload ? 250 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, load]);

  useEffect(() => {
    const target = payload?.hasKey ? searchRef.current : keyRef.current;
    target?.focus();
  }, [payload?.hasKey]);

  // Escape closes, Tab stays inside, and focus returns to the rail button on
  // close, the same contract as the shared Dialog.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      const panel = panelRef.current;
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])"),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  // While an OAuth tab is open, ask Composio every few seconds whether the
  // account is active yet. Stops on success, on close, or after two minutes.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const body = await load(searchLive.current, true);
        const row = body?.toolkits?.find((item) => item.slug === pending.slug);
        if (row?.connected) {
          setPending(null);
        } else if (Date.now() - pending.since > POLL_LIMIT_MS) {
          setPending(null);
          setTimedOut(pending.slug);
        }
      })();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pending, load]);

  async function saveKey() {
    const apiKey = keyDraft.trim();
    if (!apiKey) return;
    setBusy("key");
    setError("");
    try {
      const res = await fetch("/api/connectors", {
        method: "PUT",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({ apiKey }),
      });
      const body = (await res.json()) as Payload;
      if (!res.ok || !body.ok) throw new Error(body.error === "connectors_key" ? "That key looks invalid." : "Could not save the key.");
      setKeyDraft("");
      await load("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
    } finally {
      setBusy(null);
    }
  }

  async function removeKey() {
    setBusy("key");
    setError("");
    try {
      const res = await fetch("/api/connectors", {
        method: "PUT",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({ apiKey: null }),
      });
      if (!res.ok) throw new Error("Could not remove the key.");
      setSearch("");
      setPending(null);
      await load("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the key.");
    } finally {
      setBusy(null);
    }
  }

  async function connect(row: Toolkit) {
    setBusy(row.slug);
    setError("");
    setTimedOut(null);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({ toolkit: row.slug }),
      });
      const body = (await res.json()) as { ok?: boolean; redirectUrl?: string; error?: string };
      if (!res.ok || !body.ok || !body.redirectUrl) throw new Error(`Could not start connecting ${row.name}.`);
      const target = safeSignInUrl(body.redirectUrl);
      if (!target) throw new Error("Composio sent a sign-in link this app will not open.");
      const opened = window.open(target.toString(), "_blank", "noopener");
      if (!opened) throw new Error("The sign-in page was blocked. Allow pop-ups for this page, then try again.");
      setPending({ slug: row.slug, since: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not start connecting ${row.name}.`);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(row: Toolkit) {
    if (!row.accountId) return;
    setBusy(row.slug);
    setError("");
    try {
      const res = await fetch("/api/connectors", {
        method: "DELETE",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({ accountId: row.accountId }),
      });
      const body = (await res.json()) as { ok?: boolean };
      if (!res.ok || !body.ok) throw new Error(`Could not disconnect ${row.name}.`);
      await load(search, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not disconnect ${row.name}.`);
    } finally {
      setBusy(null);
    }
  }

  const hasKey = payload?.hasKey === true;
  const rows = payload?.toolkits ?? [];

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div aria-label="Connectors" aria-modal="true" className="market-modal" ref={panelRef} role="dialog">
        <header className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-[15px] font-semibold">Connectors</h2>
          <button aria-label="Close connectors" className="icon-btn size-8" onClick={onClose} type="button">
            <CloseIcon className="size-4" />
          </button>
        </header>

        {payload === null ? (
          <div className="px-5 py-6" aria-busy="true">
            <div className="skeleton h-10 w-full" />
          </div>
        ) : !hasKey ? (
          <form
            className="flex flex-col gap-4 px-5 pb-6 pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveKey();
            }}
          >
            <div className="field">
              <label htmlFor="composio-key">Composio API key</label>
              <input
                autoComplete="off"
                className="field-input min-h-10 w-full px-3 text-sm"
                id="composio-key"
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder="Paste key"
                ref={keyRef}
                type="password"
                value={keyDraft}
              />
              <p className="field-error" role="alert">{error}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-primary min-h-10 px-4 text-xs" disabled={busy === "key" || !keyDraft.trim()} type="submit">
                Save key
              </button>
              <a className="cursor-pointer text-sm text-ink-muted underline-offset-2 hover:underline" href="https://platform.composio.dev" rel="noreferrer" target="_blank">
                Get a key at composio.dev
              </a>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
              <label className="search-trigger min-w-0 flex-1 cursor-text" htmlFor="connector-search">
                <SearchIcon className="size-4 shrink-0" />
                <input
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                  id="connector-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search apps"
                  ref={searchRef}
                  type="search"
                  value={search}
                />
              </label>
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <span>Key ·…{payload?.last4}</span>
                <button className="btn btn-secondary min-h-8 px-3 text-xs" disabled={busy === "key"} onClick={() => void removeKey()} type="button">
                  Remove
                </button>
              </div>
            </div>
            {error ? (
              <div className="flex items-center gap-3 px-5 pt-3">
                <p className="text-sm text-danger" role="alert">{error}</p>
                <button className="btn btn-secondary min-h-8 px-3 text-xs" onClick={() => void load(search)} type="button">
                  Retry
                </button>
              </div>
            ) : null}
            <div className="uv-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
              {loading && rows.length === 0 ? (
                <div className="settings-group" aria-busy="true">
                  {[0, 1, 2, 3].map((index) => (
                    <div className="settings-row" key={index}>
                      <div className="flex items-center gap-3">
                        <div className="skeleton size-7 rounded-lg" />
                        <div className="skeleton h-3.5 w-28" />
                      </div>
                      <div className="skeleton h-8 w-20" />
                    </div>
                  ))}
                </div>
              ) : rows.length === 0 ? (
                error ? null : <p className="py-10 text-center text-sm text-ink-muted">
                  {search.trim() ? `No apps match “${search.trim()}”.` : "No apps to show."}
                </p>
              ) : (
                <ul className="settings-group" aria-busy={loading}>
                  {rows.map((row) => {
                    const isPending = pending?.slug === row.slug || (!row.connected && row.status === "INITIATED" && pending?.slug === row.slug);
                    const statusText = row.connected
                      ? "Connected"
                      : isPending
                        ? "Waiting for approval in the browser"
                        : timedOut === row.slug
                          ? "Still not connected. Try again."
                          : row.noAuth
                            ? "No sign-in needed"
                            : "Not connected";
                    return (
                      <li className="settings-row" key={row.slug}>
                        <div className="flex min-w-0 items-center gap-3">
                          <AppLogo name={row.name} src={row.logo} />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-ink">{row.name}</p>
                            <p aria-live="polite" className={`text-xs ${row.connected ? "text-success" : "text-ink-muted"}`} role="status">
                              {statusText}
                            </p>
                          </div>
                        </div>
                        {row.connected ? (
                          <button
                            className="btn btn-secondary min-h-8 px-3 text-xs"
                            disabled={busy === row.slug || !row.accountId}
                            onClick={() => void disconnect(row)}
                            type="button"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary min-h-8 px-3 text-xs"
                            disabled={busy === row.slug || pending !== null}
                            onClick={() => void connect(row)}
                            type="button"
                          >
                            {isPending ? "Connecting" : "Connect"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AppLogo({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sunken text-xs font-semibold text-ink-muted">
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img alt="" className="size-7 shrink-0 rounded-lg object-contain" onError={() => setFailed(true)} src={src} />;
}

export { ConnectorsDialog as MarketplaceDialog };
