"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MenuIcon, SettingsIcon } from "../components/icons";
import { UsefulBotMark } from "../components/useful-bot-logo";
import { ChatSearchDialog } from "../components/chat-search-dialog";
import { ChatComposer } from "../components/chat-composer";
import { BotRail } from "../components/bot-rail";
import { BotAvatar } from "../components/bot-avatar";
import { ChatMarkdown } from "../components/chat-markdown";
import { BotSettingsPanel } from "../components/bot-settings-panel";
import { CreateBotDialog, CreateGroupDialog } from "../components/create-dialogs";
import { ConfirmDialog, PromptDialog } from "../components/confirm-dialog";
import { NewChatPicker } from "../components/new-chat-picker";
import { AppSettingsDialog, type AppSettingsTab } from "../components/app-settings-dialog";
import { ConnectorsDialog } from "../components/marketplace-dialog";
import { SearchChips } from "../components/search-chips";
import { GroupSettingsPanel } from "../components/group-settings-panel";
import { OnboardingCard, ProposalCard, type ProposalDecision } from "../components/proposal-card";
import {
  applyEveEvent,
  consumeEveNdjson,
  createProjection,
  type StreamProjection,
} from "../../shared/eve-stream.ts";
import { DEFAULT_BOT_ID, PREVIEW_MAX, selectedBot, type ShellBot } from "../../shared/shell-store.ts";
import {
  parseSessionRouteHeader,
  type SessionRoute,
} from "../../shared/eve-proxy.ts";
import { useShell } from "../lib/use-shell.ts";
import { useAgentThread } from "../lib/use-agent-thread.ts";

type CreateKind = "bot" | "group" | "section";

let seq = 0;
function nextSeq() {
  seq += 1;
  return seq;
}
function nextId() {
  return `m${nextSeq()}`;
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("Session failed");
  const session = await res.json() as { csrfToken?: string };
  if (!session.csrfToken) throw new Error("Session failed");
  return { "x-ub-csrf": session.csrfToken };
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
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [appSettingsTab, setAppSettingsTab] = useState<AppSettingsTab>("general");
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [createSectionId, setCreateSectionId] = useState<string | null>(null);
  const [renameBot, setRenameBot] = useState<ShellBot | null>(null);
  const [deleteBot, setDeleteBot] = useState<ShellBot | null>(null);
  const [routineNotice, setRoutineNotice] = useState(false);
  const [operator, setOperator] = useState({ name: "Desktop owner", initials: "DO" });
  const [approvals, setApprovals] = useState<Array<{ id: string; hash: string; preview: string; tool: string }>>([]);
  const [proj, setProj] = useState<StreamProjection>(() => createProjection());
  const [route, setRoute] = useState<SessionRoute | null>(null);
  const [transcriptUser, setTranscriptUser] = useState<Array<{ id: string; text: string }>>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const projSession = useRef<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);
  const sendLock = useRef(false);
  const { store, error: shellError, dispatch, selected } = useShell(Boolean(authed));
  const selectedIdForThread = selected?.id ?? null;
  const {
    events: threadEvents,
    proposals,
    error: threadError,
    refresh: refreshThread,
  } = useAgentThread(Boolean(authed), selectedIdForThread);
  activeRef.current = active;

  useEffect(() => {
    setTranscriptUser([]);
    setRoute(null);
  }, [selectedIdForThread]);

  useEffect(() => {
    const key = selectedIdForThread ? `ub-onboarding:${selectedIdForThread}` : "";
    if (!key) return;
    try {
      setOnboardingDismissed(window.localStorage.getItem(key) === "1");
    } catch {
      setOnboardingDismissed(false);
    }
  }, [selectedIdForThread]);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((res) => setAuthed(res.ok))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch("/api/status", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((body: { operator?: { name?: string; initials?: string } } | null) => {
        if (body?.operator?.name && body.operator.initials) {
          setOperator({ name: body.operator.name, initials: body.operator.initials });
        }
      })
      .catch(() => undefined);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    async function pollApprovals() {
      try {
        const res = await fetch("/api/approvals", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const body = await res.json() as {
          approvals?: Array<{ id: string; actionSha256: string; preview: string; tool: string }>;
        };
        setApprovals((body.approvals ?? []).map((item) => ({
          id: item.id,
          hash: item.actionSha256,
          preview: item.preview,
          tool: item.tool,
        })));
      } catch {
        /* keep last */
      }
    }
    void pollApprovals();
    const timer = window.setInterval(() => void pollApprovals(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authed]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
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

  useEffect(() => {
    if (!selected || proj.pending) return;
    if ((selected.sessionId ?? null) !== active) return;
    const last = proj.messages.at(-1);
    if (!last?.text) return;
    // The store clips previews, so compare against the clipped form: comparing
    // the full text re-dispatched touchChat forever for any long reply.
    if (last.text.trim().slice(0, PREVIEW_MAX) === selected.lastPreview) return;
    dispatch({ type: "touchChat", botId: selected.id, preview: last.text });
  }, [active, dispatch, proj.messages, proj.pending, selected]);

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    setAuthed(res.ok);
  }, []);

  function attachBot(bot: ShellBot) {
    setPickerOpen(false);
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
    setPickerOpen(false);
    setRailOpen(false);
  }

  function startNewChat(botId?: string) {
    const id = botId ?? store?.selectedBotId;
    if (botId) dispatch({ type: "select", botId });
    if (id) dispatch({ type: "clearThread", botId: id });
    setTranscriptUser([]);
    projSession.current = null;
    setActive(null);
    setProj(createProjection());
    setPickerOpen(false);
    setSearchOpen(false);
    setQuery(id ?? null, null);
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

  async function send(text: string) {
    const message = text.trim();
    if (!message || proj.pending || sendLock.current || !selected) return;
    sendLock.current = true;
    setError("");
    setDraft("");
    setPickerOpen(false);
    setProj((current) => ({
      ...current,
      pending: true,
      error: "",
      messages: [...current.messages, { role: "user", text: message, id: nextId() }],
    }));
    dispatch({ type: "touchChat", botId: selected.id, preview: message });
    try {
      const sessionId = selected.sessionId ?? active;
      const csrf = await csrfHeaders();
      const res = await fetch(sessionId ? `/eve/v1/session/${sessionId}` : "/eve/v1/session", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrf },
        body: JSON.stringify({ message, botId: selected.id }),
      });
      if (!res.ok) {
        throw new Error(res.status === 503 ? "Agent unavailable" : "Send failed");
      }
      const nextRoute = parseSessionRouteHeader(res.headers.get("x-ub-route"));
      if (nextRoute) setRoute(nextRoute);
      setTranscriptUser((current) => (
        current.some((item) => item.text === message) ? current : [...current, { id: `u-${nextSeq()}`, text: message }]
      ));
      const body = (await res.json()) as { sessionId?: string };
      const sid = body.sessionId ?? sessionId;
      if (sid) {
        projSession.current = sid;
        setActive(sid);
        dispatch({ type: "touchChat", botId: selected.id, preview: message, sessionId: sid });
        setQuery(selected.id, sid);
      }
      void refreshThread(selected.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      if (message === "unauthorized") setAuthed(false);
      setError(message === "unauthorized" ? "Sign in expired" : message);
      setProj((current) => ({ ...current, pending: false }));
    } finally {
      sendLock.current = false;
    }
  }

  async function cancel() {
    if (!active) return;
    const settle = () => setProj((current) => ({ ...current, pending: false }));
    try {
      const csrf = await csrfHeaders();
      await Promise.race([
        fetch(`/eve/v1/session/${active}/cancel`, {
          method: "POST",
          credentials: "include",
          headers: csrf,
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } finally {
      settle();
    }
  }

  async function decide(item: { id: string; hash: string }, decision: "approve" | "deny") {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const session = await res.json() as { csrfToken?: string };
    const out = await fetch(`/api/approvals/${item.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-ub-csrf": session.csrfToken ?? "" },
      body: JSON.stringify({ decision, actionSha256: item.hash }),
    });
    if (!out.ok) {
      setError("Approval failed");
      return;
    }
    setApprovals((current) => current.filter((row) => row.id !== item.id));
  }

  const messages = proj.messages;
  const pending = proj.pending;
  const searchHits = proj.searchHits;
  const displayError = error || proj.error || shellError || threadError;
  const showSpinner = pending && !proj.blockOpen && !proj.currentAssistantId;
  const bot = selected ?? (store ? selectedBot(store) : null);

  type ThreadRow = {
    id: string;
    kind: "user" | "assistant" | "handoff" | "post" | "note" | "proposal";
    text: string;
    authorName: string | null;
    authorBotId: string | null;
    handoffId: string | null;
    targetBotIds: string[];
    order: number;
  };

  const memberNames = bot && bot.kind === "group" && store
    ? bot.memberIds
      .map((id) => store.bots.find((item) => item.id === id)?.name ?? "")
      .filter((name) => name.length > 0)
    : [];

  // Durable transcript (handoffs, routed replies, confirmations) merged with the
  // live stream projection. Event ids dedupe replays of the same turn.
  const threadRows: ThreadRow[] = (() => {
    const rows: ThreadRow[] = threadEvents.map((event, index) => ({
      id: event.id,
      kind: event.kind,
      text: event.text,
      authorName: event.authorName,
      authorBotId: event.authorBotId,
      handoffId: event.handoffId,
      targetBotIds: event.targetBotIds,
      order: index,
    }));
    const head = proj.messages.length;
    const streamIds = new Set(threadEvents.map((event) => event.id));
    const streamedUserTexts = new Set(
      proj.messages.filter((message) => message.role === "user").map((message) => message.text),
    );
    for (const message of proj.messages) {
      if (streamIds.has(message.id)) continue;
      if (message.role === "user" && streamedUserTexts.has(message.text)) {
        const known = rows.some((row) => row.kind === "user" && row.text === message.text);
        if (known) continue;
      }
      rows.push({
        id: message.id,
        kind: message.role === "user" ? "user" : "assistant",
        text: message.text,
        authorName: message.role === "user" ? null : null,
        authorBotId: message.role === "user" ? null : null,
        handoffId: null,
        targetBotIds: [],
        order: head + rows.length,
      });
    }
    for (const item of transcriptUser) {
      const known = rows.some((row) => row.kind === "user" && row.text === item.text);
      if (known) continue;
      rows.push({
        id: item.id,
        kind: "user",
        text: item.text,
        authorName: null,
        authorBotId: null,
        handoffId: null,
        targetBotIds: [],
        order: head + rows.length,
      });
    }
    return rows;
  })();

  const isDefaultBot = !bot || bot.id === DEFAULT_BOT_ID;
  const openProposals = proposals.filter((proposal) => proposal.status === "pending");
  const showOnboarding = Boolean(bot)
    && !isDefaultBot
    && bot?.kind === "bot"
    && !onboardingDismissed
    && threadEvents.length === 0
    && threadRows.length === 0
    && openProposals.length === 0;

  function decideProposal(decision: ProposalDecision) {
    if (decision.action) dispatch(decision.action, {
      proposalId: decision.proposalId,
      proposalStatus: decision.proposalStatus,
    });
    else dispatch({ type: "select", botId: bot?.id ?? store?.selectedBotId ?? DEFAULT_BOT_ID }, {
      proposalId: decision.proposalId,
      proposalStatus: decision.proposalStatus,
    });
    if (selectedIdForThread) void refreshThread(selectedIdForThread);
  }

  function dismissOnboarding() {
    if (!selectedIdForThread) return;
    try {
      window.localStorage.setItem(`ub-onboarding:${selectedIdForThread}`, "1");
    } catch {
      /* private mode: the card just comes back next launch */
    }
    setOnboardingDismissed(true);
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
    return (
      <div className="flex h-screen w-full items-center justify-center bg-canvas text-ink">
        {shellError ? <p className="text-sm text-danger" role="alert">{shellError}</p> : null}
      </div>
    );
  }

  const rail = (
    <BotRail
      onAction={dispatch}
      onCreate={(kind, sectionId) => {
        setCreateSectionId(sectionId ?? null);
        setCreateKind(kind);
      }}
      onDeleteRequest={setDeleteBot}
      newChatActive={pickerOpen}
      onConnectors={() => setConnectorsOpen(true)}
      onNewChat={() => {
        setPickerOpen(true);
        setSettingsOpen(false);
        setRailOpen(false);
      }}
      onOpenAppSettings={(tab) => {
        setAppSettingsTab(tab ?? "general");
        setAppSettingsOpen(true);
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
      operator={operator}
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
          {approvals.length > 0 ? (
            <div className="flex flex-col gap-2 px-4 py-2 sm:px-6">
              {approvals.map((item) => (
                <div className="approval-card" key={item.id}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-warning">Needs approval</div>
                    <div className="truncate text-sm text-ink">{item.preview}</div>
                    <div className="text-[12px] text-ink-muted">{item.tool}</div>
                  </div>
                  <button className="btn btn-primary min-h-9 px-3 text-xs" onClick={() => void decide(item, "approve")} type="button">
                    Approve
                  </button>
                  <button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => void decide(item, "deny")} type="button">
                    Deny
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {pickerOpen ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <header className="flex items-center gap-2 px-3 py-2.5 sm:px-5 lg:hidden">
                <button aria-label="Open rail" className="icon-btn size-8" onClick={() => setRailOpen(true)} type="button">
                  <MenuIcon className="size-4" />
                </button>
              </header>
              <NewChatPicker
                onClose={() => setPickerOpen(false)}
                onCreateBot={() => {
                  setPickerOpen(false);
                  setCreateKind("bot");
                }}
                onCreateGroup={() => {
                  setPickerOpen(false);
                  setCreateKind("group");
                }}
                onSelectBot={(id) => startNewChat(id)}
                store={store}
              />
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <header className="chat-head">
                  <button aria-label="Open rail" className="icon-btn size-8 lg:hidden" onClick={() => setRailOpen(true)} type="button">
                    <MenuIcon className="size-4" />
                  </button>
                  <BotAvatar bot={bot} size="sm" />
                  <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {bot.name}
                    {bot.kind === "group" && memberNames.length > 0 ? (
                      <span className="ml-2 text-[12px] font-normal text-ink-faint">
                        {memberNames.length} members
                      </span>
                    ) : null}
                  </h1>
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

                {threadRows.length === 0 && openProposals.length === 0 && !pending && !showOnboarding ? (
                  <div className="rise flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
                    <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">
                      What can I do for you?
                    </h2>
                    <p className="mt-2 max-w-md text-[15px] leading-6 text-ink-muted">
                      {bot.kind === "group"
                        ? `Group chat with ${memberNames.join(", ") || "no members yet"}. Untargeted messages go to the orchestrator; @name directs one bot.`
                        : "Runs locally on this Mac. Writes and commands need your approval."}
                    </p>
                  </div>
                ) : (
                  <div className="uv-scroll min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                      <div className="flex flex-col gap-6">
                        {showOnboarding ? (
                          <OnboardingCard
                            onDismiss={dismissOnboarding}
                            onFillForm={() => {
                              dismissOnboarding();
                              setSettingsOpen(true);
                            }}
                            petname={bot.petname || bot.name}
                          />
                        ) : null}
                        {threadRows.map((row) => {
                          if (row.kind === "user") {
                            return (
                              <div className="msg-in flex justify-end" key={row.id}>
                                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-sunken px-4 py-2.5 text-[15px] leading-6 text-ink">
                                  {row.text}
                                </div>
                              </div>
                            );
                          }
                          const speaker = row.authorBotId
                            ? store.bots.find((item) => item.id === row.authorBotId) ?? bot
                            : bot;
                          const handoff = row.kind === "handoff" || row.kind === "post";
                          const targetNames = row.targetBotIds
                            .map((id) => store.bots.find((item) => item.id === id)?.name ?? "")
                            .filter((name) => name.length > 0);
                          return (
                            <div className="msg-in flex gap-3" key={row.id}>
                              <BotAvatar bot={speaker} size="sm" />
                              <div className="min-w-0 flex-1 pt-0.5">
                                {handoff || row.authorName || row.kind === "note" ? (
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-faint">
                                    {row.kind === "handoff" && targetNames.length > 0
                                      ? `Handoff to ${targetNames.join(", ")}`
                                      : row.kind === "post"
                                        ? `${row.authorName ?? "A bot"} to this chat`
                                        : row.authorName ?? speaker.name}
                                  </p>
                                ) : null}
                                {row.kind === "note" ? (
                                  <p className="text-[13px] text-ink-muted">{row.text}</p>
                                ) : (
                                  <ChatMarkdown text={row.text} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {openProposals.map((proposal) => (
                          <div className="msg-in flex gap-3" key={proposal.id}>
                            <BotAvatar bot={bot} size="sm" />
                            <div className="min-w-0 flex-1 pt-0.5">
                              <ProposalCard
                                bots={store.bots}
                                onDecision={decideProposal}
                                pending={false}
                                proposal={proposal}
                              />
                            </div>
                          </div>
                        ))}
                        {showSpinner ? (
                          <div className="msg-in flex gap-3" role="status">
                            <BotAvatar bot={bot} size="sm" />
                            <div className="pt-1.5">
                              <div className="flex items-center gap-2.5">
                                <span className="size-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                                <span className="text-sm text-ink-muted">Working.</span>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {searchHits.length > 0 ? <SearchChips hits={searchHits} /> : null}
                        <div ref={bottomRef} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
                  <ChatComposer
                    disabled={false}
                    onChange={setDraft}
                    onOpenConnectors={() => setConnectorsOpen(true)}
                    onOpenProviders={() => {
                      setAppSettingsTab("providers");
                      setAppSettingsOpen(true);
                    }}
                    onSend={(text) => void send(text)}
                    onStop={() => void cancel()}
                    pending={pending}
                    placeholder={bot.kind === "group"
                      ? `Message this group. @name to direct one bot`
                      : `Message ${bot.name}`}
                    value={draft}
                  />
                </div>
              </div>
              {settingsOpen && bot.kind === "group" ? (
                <GroupSettingsPanel
                  group={bot}
                  onClose={() => setSettingsOpen(false)}
                  onDeleteRequest={() => setDeleteBot(bot)}
                  onPatch={(patch) => dispatch({ type: "updateBot", botId: bot.id, patch })}
                  store={store}
                />
              ) : null}
              {settingsOpen && bot.kind === "bot" ? (
                <BotSettingsPanel
                  bot={bot}
                  onClose={() => {
                    setSettingsOpen(false);
                    setRoutineNotice(false);
                  }}
                  onCreateRoutine={() => setRoutineNotice(true)}
                  onPatch={(patch) => dispatch({ type: "updateBot", botId: bot.id, patch })}
                  routineNotice={routineNotice}
                />
              ) : null}
            </div>
          )}
        </main>
      </div>

      {searchOpen ? (
        <ChatSearchDialog
          onClose={() => setSearchOpen(false)}
          onNewChat={() => {
            setSearchOpen(false);
            setPickerOpen(true);
          }}
          onOpenRecent={(recentId) => {
            const recent = store.recents.find((item) => item.id === recentId);
            dispatch({ type: "openRecent", recentId });
            setSearchOpen(false);
            setPickerOpen(false);
            setRailOpen(false);
            projSession.current = null;
            setProj(createProjection());
            setActive(recent?.sessionId ?? null);
            setQuery(recent?.botId ?? store.selectedBotId, recent?.sessionId ?? null);
          }}
          onSelect={(id) => {
            selectBot(id);
            setSearchOpen(false);
          }}
          store={store}
        />
      ) : null}

      {createKind === "bot" ? (
        <CreateBotDialog
          onClose={() => setCreateKind(null)}
          onSubmit={(input) => {
            dispatch({
              type: "createBot",
              name: input.name,
              petname: input.petname,
              label: input.label,
              description: input.description,
              sectionId: createSectionId,
            });
            projSession.current = null;
            setActive(null);
            setProj(createProjection());
            setRoute(null);
            setCreateKind(null);
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
            setRoute(null);
            setCreateKind(null);
            setSettingsOpen(true);
          }}
        />
      ) : null}

      {appSettingsOpen ? (
        <AppSettingsDialog
          key={appSettingsTab}
          initialTab={appSettingsTab}
          onClose={() => setAppSettingsOpen(false)}
          operator={operator}
          onSignOut={() => {
            setAppSettingsOpen(false);
            void signOut();
          }}
        />
      ) : null}

      {connectorsOpen ? <ConnectorsDialog onClose={() => setConnectorsOpen(false)} /> : null}

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
          message={deleteBot.kind === "group"
            ? `Delete ${deleteBot.name}? The group and its roster go away. Member bots stay.`
            : `Delete ${deleteBot.name}? This removes the bot, its profile and its transcript. Workspace files stay.`}
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
