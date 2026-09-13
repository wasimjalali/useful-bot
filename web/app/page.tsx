"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { BotRail } from "../components/bot-rail";
import { ChatComposer } from "../components/chat-composer";
import { ChatSearchDialog, type SessionSummary } from "../components/chat-search-dialog";
import {
  BotContextMenu,
  BotSettingsPanel,
  ConfirmDialog,
  CreateBotDialog,
  CreateGroupDialog,
  CreateMenu,
  NameDialog,
} from "../components/shell-dialogs";
import { UsefulBotAvatar, UsefulBotMark } from "../components/useful-bot-logo";
import { titleFrom, useEveChat } from "../lib/use-eve-chat";
import {
  activeSessionId,
  activeTitle,
  createBot,
  createGroup,
  createSection,
  deleteBot,
  hideBot,
  moveBot,
  newChatForActive,
  pinBot,
  renameBot,
  seedShell,
  setActive,
  setActiveSession,
  updateBotSettings,
  type ShellState,
} from "../../shared/shell-store.ts";

type View = "chat" | "memory";
type MenuState =
  | { kind: "create"; x: number; y: number; sectionId: string | null }
  | { kind: "bot"; x: number; y: number; botId: string }
  | null;
type DialogState =
  | { kind: "create-bot"; sectionId: string | null }
  | { kind: "create-group" }
  | { kind: "rename"; botId: string }
  | { kind: "new-section"; botId: string }
  | { kind: "delete"; botId: string }
  | { kind: "hide"; botId: string }
  | null;

export default function Page() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [csrf, setCsrf] = useState("");
  const [token, setToken] = useState("");
  const [signError, setSignError] = useState("");
  const [view, setView] = useState<View>("chat");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [shell, setShell] = useState<ShellState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shellRef = useRef<ShellState | null>(null);

  const sessionId = shell ? activeSessionId(shell) : null;
  const chat = useEveChat(sessionId, Boolean(authed));

  const persist = useCallback((next: ShellState, tokenValue: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/shell", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json", "x-ub-csrf": tokenValue },
        body: JSON.stringify({ shell: next }),
      });
    }, 200);
  }, []);

  const commit = useCallback((next: ShellState) => {
    shellRef.current = next;
    setShell(next);
    if (csrf) persist(next, csrf);
  }, [csrf, persist]);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then(async (res) => {
        setAuthed(res.ok);
        if (res.ok) {
          const body = await res.json() as { csrfToken?: string };
          setCsrf(body.csrfToken ?? "");
        }
      })
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    void fetch("/api/shell", { credentials: "include" })
      .then((res) => res.json())
      .then((body: { shell?: ShellState }) => {
        const next = body.shell ?? seedShell();
        shellRef.current = next;
        setShell(next);
      })
      .catch(() => {
        const next = seedShell();
        shellRef.current = next;
        setShell(next);
      });
  }, [authed]);

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
    if (!sessionId) return;
    const first = chat.messages.find((message) => message.role === "user");
    if (!first) return;
    setSessions((current) => {
      const title = titleFrom(first.text);
      const rest = current.filter((item) => item.id !== sessionId);
      return [{ id: sessionId, title }, ...rest];
    });
  }, [sessionId, chat.messages]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setSignError("");
    const res = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setSignError("Sign in failed");
      return;
    }
    const body = await res.json() as { csrfToken?: string };
    setToken("");
    setCsrf(body.csrfToken ?? "");
    setAuthed(true);
  }

  function selectBot(id: string) {
    if (!shell) return;
    commit(setActive(shell, "bot", id));
    chat.resetLocal();
    setView("chat");
    const bot = shell.bots.find((item) => item.id === id);
    syncUrl(bot?.sessionId ?? null);
  }

  function selectGroup(id: string) {
    if (!shell) return;
    commit(setActive(shell, "group", id));
    chat.resetLocal();
    setView("chat");
    const group = shell.groups.find((item) => item.id === id);
    syncUrl(group?.sessionId ?? null);
  }

  function startNewChat() {
    if (!shell) return;
    commit(newChatForActive(shell));
    chat.resetLocal();
    setView("chat");
    syncUrl(null);
  }

  async function send() {
    const text = draft.trim();
    if (!text || !shell) return;
    setDraft("");
    setView("chat");
    const sid = await chat.send(text, sessionId);
    const current = shellRef.current ?? shell;
    if (sid && sid !== sessionId) {
      commit(setActiveSession(current, sid));
      syncUrl(sid);
    }
    if (sid) {
      setSessions((current) => {
        const rest = current.filter((item) => item.id !== sid);
        return [{ id: sid, title: titleFrom(text) }, ...rest];
      });
    }
  }

  function openSession(id: string) {
    if (!shell) return;
    commit(setActiveSession(shell, id));
    chat.resetLocal();
    setView("chat");
    syncUrl(id);
  }

  function menuPoint(event: MouseEvent<HTMLButtonElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: rect.left, y: rect.bottom + 4 };
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
              <div className="field-error">{signError}</div>
            </div>
            <button className="btn btn-primary mt-2 w-full" type="submit">
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!shell) {
    return <div className="flex h-screen w-full bg-canvas" />;
  }

  const contextBot = menu?.kind === "bot" ? shell.bots.find((bot) => bot.id === menu.botId) : null;
  const settingsBot = shell.activeKind === "bot"
    ? shell.bots.find((bot) => bot.id === shell.activeId) ?? null
    : null;
  const displayError = chat.displayError || signError;
  const pending = chat.pending;
  const messages = chat.messages;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      <BotRail
        filter={filter}
        onCreateInSection={(sectionId, event) => {
          event.preventDefault();
          setMenu({ kind: "create", sectionId, ...menuPoint(event) });
        }}
        onFilter={setFilter}
        onMemory={() => setView("memory")}
        onOpenCreate={(event) => setMenu({ kind: "create", sectionId: null, ...menuPoint(event) })}
        onOpenContext={(bot, event) => setMenu({ kind: "bot", botId: bot.id, ...menuPoint(event) })}
        onOpenSettings={() => setSettingsOpen(true)}
        onSearchChats={() => setSearchOpen(true)}
        onSelectBot={selectBot}
        onSelectGroup={selectGroup}
        shell={shell}
        view={view}
      />

      <div className="flex min-w-0 flex-1 p-2.5 lg:pl-0">
        <main className="stage flex min-w-0 flex-1 flex-col">
          {displayError ? (
            <div className="px-4 py-2 text-sm text-danger sm:px-6" role="alert">
              {displayError}
            </div>
          ) : null}

          {view === "memory" ? (
            <MemoryPlaceholder />
          ) : messages.length === 0 && !pending ? (
            <div className="rise flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
              <h1 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">
                What can I do for you?
              </h1>
              <p className="mt-2 max-w-md text-[15px] leading-6 text-ink-muted">
                {activeTitle(shell)} on this Mac. Writes and commands need your approval.
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
                              <span className="text-sm font-semibold text-ink">{activeTitle(shell)}</span>
                            </div>
                            <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">
                              {message.text}
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                    {chat.showSpinner ? (
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
                    <div ref={chat.bottomRef} />
                  </div>
                </div>
              </div>
              <ChatComposer
                disabled={false}
                onChange={setDraft}
                onSend={() => void send()}
                onStop={() => void chat.cancel(sessionId)}
                pending={pending}
                value={draft}
              />
            </>
          )}
        </main>
        {settingsOpen && settingsBot ? (
          <BotSettingsPanel
            bot={settingsBot}
            onChange={(patch) => commit(updateBotSettings(shell, settingsBot.id, patch))}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
      </div>

      {searchOpen ? (
        <ChatSearchDialog
          onClose={() => setSearchOpen(false)}
          onNewChat={() => {
            startNewChat();
            setSearchOpen(false);
          }}
          onSelect={(id) => {
            openSession(id);
            setSearchOpen(false);
          }}
          sessions={sessions}
        />
      ) : null}

      {menu?.kind === "create" ? (
        <CreateMenu
          onClose={() => setMenu(null)}
          onCreateBot={() => {
            setDialog({ kind: "create-bot", sectionId: menu.sectionId });
            setMenu(null);
          }}
          onCreateGroup={() => {
            setDialog({ kind: "create-group" });
            setMenu(null);
          }}
          onNewChat={() => {
            startNewChat();
            setMenu(null);
          }}
          x={menu.x}
          y={menu.y}
        />
      ) : null}

      {menu?.kind === "bot" && contextBot ? (
        <BotContextMenu
          bot={contextBot}
          onClose={() => setMenu(null)}
          onDelete={() => {
            setDialog({ kind: "delete", botId: contextBot.id });
            setMenu(null);
          }}
          onHide={() => {
            setDialog({ kind: "hide", botId: contextBot.id });
            setMenu(null);
          }}
          onMove={(sectionId) => {
            commit(moveBot(shell, contextBot.id, sectionId));
            setMenu(null);
          }}
          onNewSection={() => {
            setDialog({ kind: "new-section", botId: contextBot.id });
            setMenu(null);
          }}
          onPin={() => {
            commit(pinBot(shell, contextBot.id));
            setMenu(null);
          }}
          onRename={() => {
            setDialog({ kind: "rename", botId: contextBot.id });
            setMenu(null);
          }}
          onSettings={() => {
            commit(setActive(shell, "bot", contextBot.id));
            setSettingsOpen(true);
            setMenu(null);
          }}
          sections={shell.sections}
          x={menu.x}
          y={menu.y}
        />
      ) : null}

      {dialog?.kind === "create-bot" ? (
        <CreateBotDialog
          defaultSection={dialog.sectionId}
          onClose={() => setDialog(null)}
          onSubmit={(input) => {
            commit(createBot(shell, { ...input, sectionId: input.sectionId }, crypto.randomUUID()));
            chat.resetLocal();
            setView("chat");
            setDialog(null);
          }}
          sections={shell.sections}
        />
      ) : null}

      {dialog?.kind === "create-group" ? (
        <CreateGroupDialog
          bots={shell.bots}
          onClose={() => setDialog(null)}
          onSubmit={(input) => {
            commit(createGroup(shell, input, crypto.randomUUID()));
            chat.resetLocal();
            setView("chat");
            setDialog(null);
          }}
        />
      ) : null}

      {dialog?.kind === "rename" ? (
        <NameDialog
          initial={shell.bots.find((bot) => bot.id === dialog.botId)?.name}
          label="Name"
          onClose={() => setDialog(null)}
          onSubmit={(value) => {
            commit(renameBot(shell, dialog.botId, value));
            setDialog(null);
          }}
          title="Rename bot"
        />
      ) : null}

      {dialog?.kind === "new-section" ? (
        <NameDialog
          label="Section name"
          onClose={() => setDialog(null)}
          onSubmit={(value) => {
            const id = crypto.randomUUID();
            let next = createSection(shell, value, id);
            next = moveBot(next, dialog.botId, id);
            commit(next);
            setDialog(null);
          }}
          title="New section"
        />
      ) : null}

      {dialog?.kind === "delete" ? (
        <ConfirmDialog
          confirmLabel="Delete"
          message="This removes the bot from the rail on this Mac. Chats already on disk stay put."
          onClose={() => setDialog(null)}
          onConfirm={() => {
            commit(deleteBot(shell, dialog.botId));
            setDialog(null);
          }}
          title="Delete bot?"
        />
      ) : null}

      {dialog?.kind === "hide" ? (
        <ConfirmDialog
          confirmLabel="Hide"
          message="Hidden bots leave the rail. You can create another bot anytime."
          onClose={() => setDialog(null)}
          onConfirm={() => {
            commit(hideBot(shell, dialog.botId));
            setDialog(null);
          }}
          title="Hide this bot?"
        />
      ) : null}
    </div>
  );
}

function MemoryPlaceholder() {
  return (
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
  );
}

function syncUrl(sessionId: string | null) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", sessionId ? `?session=${sessionId}` : window.location.pathname);
}
