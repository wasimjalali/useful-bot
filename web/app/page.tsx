"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MenuIcon, SettingsIcon } from "../components/icons";
import { UsefulBotMark } from "../components/useful-bot-logo";
import { ChatSearchDialog } from "../components/chat-search-dialog";
import { ChatComposer } from "../components/chat-composer";
import { BotRail } from "../components/bot-rail";
import { BotAvatar } from "../components/bot-avatar";
import { BotSettingsPanel } from "../components/bot-settings-panel";
import { CreateBotDialog, CreateGroupDialog } from "../components/create-dialogs";
import { ConfirmDialog, PromptDialog } from "../components/confirm-dialog";
import {
  applyEveEvent,
  consumeEveNdjson,
  createProjection,
  type StreamProjection,
} from "../../shared/eve-stream.ts";
import { selectedBot, type ShellBot } from "../../shared/shell-store.ts";
import { useShell } from "../lib/use-shell.ts";

type View = "chat" | "memory";
type CreateKind = "chat" | "bot" | "group" | "section";

let seq = 0;
function nextId() {
  seq += 1;
  return `m${seq}`;
}

function titleFrom(text: string): string {
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

function setQuery(botId: string | null, sessionId: string | null) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (botId) params.set("bot", botId);
  if (sessionId) params.set("session", sessionId);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export default function Page() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("chat");
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [createSectionId, setCreateSectionId] = useState<string | null>(null);
  const [renameBot, setRenameBot] = useState<ShellBot | null>(null);
  const [deleteBot, setDeleteBot] = useState<ShellBot | null>(null);
  const [routineNotice, setRoutineNotice] = useState(false);
  const [approval, setApproval] = useState<{ id: string; hash: string; preview: string } | null>(null);
  const [proj, setProj] = useState<StreamProjection>(() => createProjection());
  const projSession = useRef<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);
  const sendLock = useRef(false);
  const { store, error: shellError, dispatch, selected } = useShell(Boolean(authed));
  activeRef.current = active;

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

  useEffect(() => {
    if (!store || hydrated.current) return;
    hydrated.current = true;
    const params = new URLSearchParams(window.location.search);
    const botId = params.get("bot");
    const sessionId = params.get("session");
    if (botId && store.bots.some((bot) => bot.id === botId)) {
      dispatch({ type: "select", botId });
    }
    const bot = store.bots.find((item) => item.id === (botId ?? store.selectedBotId)) ?? store.bots[0];
    const sid = sessionId ?? bot.sessionId;
    if (sessionId && sessionId !== bot.sessionId) {
      dispatch({ type: "setSession", botId: bot.id, sessionId });
    }
    if (sid) {
      setActive(sid);
      setQuery(bot.id, sid);
    } else {
      setQuery(bot.id, null);
    }
  }, [dispatch, store]);

  useEffect(() => {
    if (!authed || !active) return;
    if (projSession.current !== active) {
      projSession.current = active;
      setProj(createProjection());
    }
    let cancelled = false;
    let controller = new AbortController();

    async function follow() {
      while (!cancelled && active) {
        controller = new AbortController();
        try {
          const res = await fetch(`/eve/v1/session/${active}/stream?startIndex=0`, {
            credentials: "include",
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            if (res.status === 401) {
              setAuthed(false);
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
  }, [authed, active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [proj.messages, proj.pending]);

  useEffect(() => {
    const first = proj.messages.find((message) => message.role === "user");
    if (!first || !selected) return;
    if (selected.name === "New chat" || selected.name.startsWith("New chat ")) {
      dispatch({ type: "renameBot", botId: selected.id, name: titleFrom(first.text) });
    }
  }, [dispatch, proj.messages, selected]);

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    setAuthed(res.ok);
  }, []);

  function attachBot(bot: ShellBot) {
    setView("chat");
    setRailOpen(false);
    const sid = bot.sessionId;
    if (sid !== activeRef.current) {
      projSession.current = null;
      setActive(sid);
      setProj(createProjection());
    }
    setQuery(bot.id, sid);
  }

  function selectBot(id: string) {
    dispatch({ type: "select", botId: id });
    setView("chat");
    setRailOpen(false);
  }

  const selectedId = selected?.id;
  useEffect(() => {
    if (!hydrated.current || !selected) return;
    attachBot(selected);
    setRoutineNotice(false);
  }, [selectedId]);

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

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    setAuthed(false);
  }

  async function send() {
    const text = draft.trim();
    if (!text || proj.pending || sendLock.current || !selected) return;
    sendLock.current = true;
    setError("");
    setDraft("");
    setView("chat");
    setProj((current) => ({
      ...current,
      pending: true,
      error: "",
      messages: [...current.messages, { role: "user", text, id: nextId() }],
    }));
    try {
      const sessionId = selected.sessionId ?? active;
      const res = await fetch(sessionId ? `/eve/v1/session/${sessionId}` : "/eve/v1/session", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        throw new Error(res.status === 503 ? "Agent unavailable" : "Send failed");
      }
      const body = (await res.json()) as { sessionId?: string };
      const sid = body.sessionId ?? sessionId;
      if (sid) {
        projSession.current = sid;
        setActive(sid);
        dispatch({ type: "setSession", botId: selected.id, sessionId: sid });
        setQuery(selected.id, sid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
      setProj((current) => ({ ...current, pending: false }));
    } finally {
      sendLock.current = false;
    }
  }

  async function cancel() {
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

  const messages = proj.messages;
  const pending = proj.pending;
  const displayError = error || proj.error || shellError;
  const showSpinner = pending && !proj.blockOpen && !proj.currentAssistantId;
  const bot = selected ?? (store ? selectedBot(store) : null);

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
              <div className="field-error">{displayError}</div>
            </div>
            <button className="btn btn-primary mt-2 w-full" type="submit">
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!store || !bot) {
    return <div className="flex h-screen w-full bg-canvas" />;
  }

  const rail = (
    <BotRail
      memoryActive={view === "memory"}
      onAction={dispatch}
      onCreate={(kind, sectionId) => {
        if (kind === "chat") {
          dispatch({ type: "newChat" });
          projSession.current = null;
          setActive(null);
          setProj(createProjection());
          setView("chat");
          setQuery(null, null);
          return;
        }
        setCreateSectionId(sectionId ?? null);
        setCreateKind(kind);
      }}
      onDeleteRequest={setDeleteBot}
      onMemory={() => {
        setView("memory");
        setSettingsOpen(false);
        setRailOpen(false);
      }}
      onOpenSettings={(id) => {
        dispatch({ type: "select", botId: id });
        const next = store.bots.find((item) => item.id === id);
        if (next) attachBot(next);
        setSettingsOpen(true);
      }}
      onRenameRequest={setRenameBot}
      onSearch={() => setSearchOpen(true)}
      onSelect={selectBot}
      onSignOut={() => void signOut()}
      onToggleMobile={() => setRailOpen(false)}
      store={store}
    />
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      <div className="hidden lg:flex">{rail}</div>
      {railOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button aria-label="Close rail" className="flex-1 bg-ink/20" onClick={() => setRailOpen(false)} type="button" />
          <div className="h-full shadow-pop">{rail}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 p-2.5 lg:pl-0">
        <main className="stage flex min-w-0 flex-1 flex-col">
          {displayError ? (
            <div className="px-4 py-2 text-sm text-danger sm:px-6" role="alert">
              {displayError}
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
              <header className="flex items-center gap-2 px-4 py-3 sm:px-6">
                <button aria-label="Open rail" className="icon-btn size-8 lg:hidden" onClick={() => setRailOpen(true)} type="button">
                  <MenuIcon className="size-4" />
                </button>
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
          ) : (
            <div className="relative flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
                  <button aria-label="Open rail" className="icon-btn size-8 lg:hidden" onClick={() => setRailOpen(true)} type="button">
                    <MenuIcon className="size-4" />
                  </button>
                  <BotAvatar bot={bot} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h1 className="truncate text-[15px] font-semibold">{bot.name}</h1>
                      {bot.label ? <span className="bot-label">{bot.label}</span> : null}
                    </div>
                    {bot.description ? (
                      <p className="truncate text-[12px] text-ink-muted">{bot.description}</p>
                    ) : null}
                  </div>
                  <button
                    aria-label="Bot settings"
                    className="icon-btn tip size-8"
                    data-tip="Bot settings"
                    onClick={() => setSettingsOpen((open) => !open)}
                    type="button"
                  >
                    <SettingsIcon className="size-4" />
                  </button>
                </header>

                {messages.length === 0 && !pending ? (
                  <div className="rise flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
                    <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">
                      What can I do for you?
                    </h2>
                    <p className="mt-2 max-w-md text-[15px] leading-6 text-ink-muted">
                      {bot.kind === "group"
                        ? "Group chat on this Mac. Replies still come from Useful Bot."
                        : "Runs locally on this Mac. Writes and commands need your approval."}
                    </p>
                    <div className="mt-8 w-full max-w-2xl">
                      <ChatComposer
                        disabled={false}
                        onChange={setDraft}
                        onSend={() => void send()}
                        pending={false}
                        placeholder={`Ask ${bot.name}`}
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
                                <BotAvatar bot={bot} size="md" />
                                <div className="min-w-0 flex-1">
                                  <div className="mb-2 flex items-center gap-2">
                                    <span className="text-sm font-semibold text-ink">{bot.name}</span>
                                  </div>
                                  <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">
                                    {message.text}
                                  </div>
                                </div>
                              </div>
                            ),
                          )}
                          {showSpinner ? (
                            <div className="msg-in flex gap-3" role="status">
                              <BotAvatar bot={bot} size="md" />
                              <div className="pt-1.5">
                                <div className="flex items-center gap-2.5">
                                  <span className="size-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                                  <span className="text-sm text-ink-muted">Working.</span>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <div ref={bottomRef} />
                        </div>
                      </div>
                    </div>
                    <ChatComposer
                      disabled={false}
                      onChange={setDraft}
                      onSend={() => void send()}
                      onStop={() => void cancel()}
                      pending={pending}
                      placeholder={`Ask ${bot.name}`}
                      value={draft}
                    />
                  </>
                )}
              </div>
              {settingsOpen ? (
                <BotSettingsPanel
                  bot={bot}
                  onClose={() => {
                    setSettingsOpen(false);
                    setRoutineNotice(false);
                  }}
                  onCreateRoutine={() => setRoutineNotice(true)}
                  onPatch={(patch) => dispatch({ type: "updateBot", botId: bot.id, patch })}
                  routineNotice={routineNotice}
                  store={store}
                />
              ) : null}
            </div>
          )}
        </main>
      </div>

      {searchOpen ? (
        <ChatSearchDialog
          bots={store.bots}
          onClose={() => setSearchOpen(false)}
          onNewChat={() => {
            dispatch({ type: "newChat" });
            projSession.current = null;
            setActive(null);
            setProj(createProjection());
            setView("chat");
            setSearchOpen(false);
            setQuery(null, null);
          }}
          onSelect={(id) => {
            selectBot(id);
            setSearchOpen(false);
          }}
        />
      ) : null}

      {createKind === "bot" ? (
        <CreateBotDialog
          onClose={() => setCreateKind(null)}
          onSubmit={(input) => {
            dispatch({
              type: "createBot",
              name: input.name,
              label: input.label,
              description: input.description,
              sectionId: createSectionId,
            });
            projSession.current = null;
            setActive(null);
            setProj(createProjection());
            setView("chat");
            setCreateKind(null);
            setSettingsOpen(true);
          }}
          sectionName={store.sections.find((section) => section.id === createSectionId)?.name}
        />
      ) : null}

      {createKind === "group" ? (
        <CreateGroupDialog
          bots={store.bots}
          onClose={() => setCreateKind(null)}
          onSubmit={(input) => {
            dispatch({ type: "createGroup", name: input.name, memberIds: input.memberIds, sectionId: createSectionId });
            projSession.current = null;
            setActive(null);
            setProj(createProjection());
            setView("chat");
            setCreateKind(null);
            setSettingsOpen(true);
          }}
        />
      ) : null}

      {createKind === "section" ? (
        <PromptDialog
          label="Section name"
          onClose={() => setCreateKind(null)}
          onSubmit={(name) => {
            dispatch({ type: "createSection", name });
            setCreateKind(null);
          }}
          submitLabel="Create section"
          title="Create section"
        />
      ) : null}

      {renameBot ? (
        <PromptDialog
          initial={renameBot.name}
          label="Name"
          onClose={() => setRenameBot(null)}
          onSubmit={(name) => {
            dispatch({ type: "renameBot", botId: renameBot.id, name });
            setRenameBot(null);
          }}
          submitLabel="Rename"
          title="Rename"
        />
      ) : null}

      {deleteBot ? (
        <ConfirmDialog
          message={`Delete ${deleteBot.name}? This removes it from the local shell. Eve sessions stay on disk.`}
          onClose={() => setDeleteBot(null)}
          onConfirm={() => {
            dispatch({ type: "deleteBot", botId: deleteBot.id });
            if (deleteBot.sessionId && deleteBot.sessionId === active) {
              projSession.current = null;
              setActive(null);
              setProj(createProjection());
            }
            setDeleteBot(null);
          }}
          title="Delete bot"
        />
      ) : null}
    </div>
  );
}
