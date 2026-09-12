"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatIcon, MemoryIcon, NewChatIcon, SearchIcon, SettingsIcon, TrashIcon } from "../components/icons";
import { UsefulBotAvatar, UsefulBotLogo, UsefulBotMark } from "../components/useful-bot-logo";
import { ChatSearchDialog, type SessionSummary } from "../components/chat-search-dialog";
import { ChatComposer } from "../components/chat-composer";

type View = "chat" | "memory";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  id: string;
};

let seq = 0;
function nextId() {
  seq += 1;
  return `m${seq}`;
}

export default function Page() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("chat");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [approval, setApproval] = useState<{ id: string; hash: string; preview: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((res) => setAuthed(res.ok))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    setAuthed(res.ok);
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Sign in failed");
      return;
    }
    setToken("");
    await refreshSession();
  }

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setPending(true);
    setError("");
    setDraft("");
    setMessages((current) => [...current, { role: "user", text, id: nextId() }]);
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
      const sid = body.sessionId;
      if (sid) {
        setActive(sid);
        setSessions((current) => {
          const title = text.length > 42 ? `${text.slice(0, 42)}...` : text;
          const rest = current.filter((s) => s.id !== sid);
          return [{ id: sid, title }, ...rest];
        });
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", `?session=${sid}`);
        }
      }
      setMessages((current) => [...current, { role: "assistant", text: "Turn accepted.", id: nextId() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    if (!active) return;
    await fetch(`/eve/v1/session/${active}/cancel`, { method: "POST", credentials: "include" });
    setPending(false);
  }

  async function decide(decision: "approve" | "deny") {
    if (!approval) return;
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const session = await res.json();
    await fetch(`/api/approvals/${approval.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-ub-csrf": session.csrfToken ?? "" },
      body: JSON.stringify({ decision, actionSha256: approval.hash }),
    });
    setApproval(null);
  }

  function removeSession(id: string) {
    setSessions((current) => current.filter((s) => s.id !== id));
    if (active === id) {
      setActive(null);
      setMessages([]);
    }
  }

  if (authed === null) {
    return <div className="flex h-screen w-full bg-canvas" />;
  }

  if (!authed) {
    return (
      <div className="flex h-screen w-full bg-canvas text-ink">
        <div className="mx-auto grid w-full max-w-md place-items-center px-4">
          <form className="w-full" onSubmit={signIn}>
            <div className="mb-8 flex flex-col items-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-brand">
                <UsefulBotMark tone="dark" className="h-8 w-auto" />
              </span>
              <h1 className="text-xl font-semibold tracking-[-0.03em]">Sign in to Useful Bot</h1>
            </div>
            <div className="field">
              <label htmlFor="device-token">Device token</label>
              <input
                autoComplete="off"
                className="field-input min-h-11 w-full px-3 text-sm"
                id="device-token"
                onChange={(event) => setToken(event.target.value)}
                type="password"
                value={token}
              />
              <div className="field-error">{error}</div>
            </div>
            <button className="btn btn-primary mt-2 w-full" type="submit">
              Sign in
            </button>
          </form>
        </div>
        <svg height="0" style={{ position: "absolute" }} width="0" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      <aside className="rail flex w-[248px] shrink-0 flex-col gap-5 px-3 py-4 max-lg:hidden">
        <div className="px-2 pt-1">
          <UsefulBotLogo />
        </div>

        <nav aria-label="Workspace" className="flex flex-col gap-0.5">
          <button
            className="nav-item text-sm"
            onClick={() => {
              setActive(null);
              setMessages([]);
              setView("chat");
            }}
            type="button"
          >
            <NewChatIcon className="size-[18px] shrink-0" />
            <span>New chat</span>
          </button>
          <button className="nav-item text-sm" onClick={() => setSearchOpen(true)} type="button">
            <SearchIcon className="size-[18px] shrink-0" />
            <span>Search</span>
          </button>
          <button
            aria-current={view === "memory" ? "page" : undefined}
            className="nav-item text-sm"
            onClick={() => setView("memory")}
            type="button"
          >
            <MemoryIcon className="size-[18px] shrink-0" />
            <span>Memory</span>
          </button>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="px-2 text-[11px] text-ink-faint">Recents</p>
          {sessions.length > 0 ? (
            <div className="uv-scroll -mr-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {sessions.map((session) => {
                const isActive = session.id === active && view === "chat";
                return (
                  <div className="group relative" key={session.id}>
                    <button
                      aria-current={isActive ? "true" : undefined}
                      className={[
                        "flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-2.5 pr-8 text-left text-[13px] transition",
                        isActive
                          ? "bg-sunken text-ink"
                          : "text-ink-muted hover:bg-sunken hover:text-ink",
                      ].join(" ")}
                      onClick={() => {
                        setActive(session.id);
                        setView("chat");
                      }}
                      type="button"
                    >
                      <ChatIcon className="size-4 shrink-0 opacity-70" />
                      <span className="truncate">{session.title}</span>
                    </button>
                    <button
                      aria-label={`Delete chat: ${session.title}`}
                      className="icon-btn absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100"
                      onClick={() => removeSession(session.id)}
                      type="button"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-2 text-xs leading-5 text-ink-faint">Chats will appear here.</p>
          )}
        </div>

        <div className="operator-row flex items-center gap-2.5 px-1.5 pt-3">
          <span aria-hidden="true" className="operator-avatar shrink-0">
            WJ
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">Wasim</p>
          <button
            aria-label="Settings"
            className="icon-btn tip size-7 shrink-0"
            data-tip="Settings"
            type="button"
          >
            <SettingsIcon className="size-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 p-2.5 lg:pl-0">
        <main className="stage flex min-w-0 flex-1 flex-col">
          {error ? (
            <div className="px-4 py-2 text-sm text-danger sm:px-6" role="alert">
              {error}
            </div>
          ) : null}
          {approval ? (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
              <span className="status-label status-warning">{approval.preview}</span>
              <button className="btn btn-primary min-h-9 px-3 text-xs" onClick={() => void decide("approve")} type="button">
                Approve
              </button>
              <button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => void decide("deny")} type="button">
                Deny
              </button>
            </div>
          ) : null}

          {view === "memory" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <header className="flex items-center justify-between px-4 py-3 sm:px-6">
                <h1 className="text-[15px] font-semibold">Memory</h1>
              </header>
              <div className="uv-scroll min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                  <div className="empty-state rise">
                    <h2 className="text-lg font-semibold">Nothing remembered yet</h2>
                    <p>
                      Ask Useful Bot to remember a preference and it will land here after you
                      approve it. Notes stay on this Mac.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : messages.length === 0 && !pending ? (
            <div className="rise flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
              <h1 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">
                What can I do for you?
              </h1>
              <p className="mt-2 max-w-md text-[15px] leading-6 text-ink-muted">
                Runs locally on this Mac. Writes and commands need your approval.
              </p>
              <div className="mt-8 w-full max-w-2xl">
                <ChatComposer
                  disabled={false}
                  onChange={setDraft}
                  onSend={() => void send()}
                  pending={false}
                  value={draft}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="uv-scroll min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                  <div className="flex flex-col gap-6">
                    {messages.map((message) =>
                      message.role === "user" ? (
                        <div className="msg-in flex justify-end" key={message.id}>
                          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-sunken px-4 py-2.5 text-[15px] leading-6 text-ink">
                            {message.text}
                          </div>
                        </div>
                      ) : (
                        <div className="msg-in flex gap-3" key={message.id}>
                          <UsefulBotAvatar />
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink">Useful Bot</span>
                            </div>
                            <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">
                              {message.text}
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                    {pending ? (
                      <div className="msg-in flex gap-3" role="status">
                        <UsefulBotAvatar />
                        <div className="pt-1.5">
                          <div className="flex items-center gap-2.5">
                            <span className="size-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                            <span className="text-sm text-ink-muted">Working.</span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <ChatComposer
                disabled={false}
                onChange={setDraft}
                onSend={() => void send()}
                onStop={() => void cancel()}
                pending={pending}
                value={draft}
              />
            </>
          )}
        </main>
      </div>

      {searchOpen ? (
        <ChatSearchDialog
          onClose={() => setSearchOpen(false)}
          onNewChat={() => {
            setActive(null);
            setMessages([]);
            setView("chat");
            setSearchOpen(false);
          }}
          onSelect={(id) => {
            setActive(id);
            setView("chat");
            setSearchOpen(false);
          }}
          sessions={sessions}
        />
      ) : null}
    </div>
  );
}
