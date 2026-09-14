"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MenuIcon, SettingsIcon } from "../components/icons";
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
import { groupMembers, parseMentions, speakerLabel, speakersFrom } from "../../shared/threads.ts";
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

  const [transcriptUser, setTranscriptUser] = useState<Array<{ id: string; text: string }>>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [failedSend, setFailedSend] = useState<string | null>(null);
  const [busyProposals, setBusyProposals] = useState<ReadonlySet<string>>(() => new Set());
  const [busyApprovals, setBusyApprovals] = useState<ReadonlySet<string>>(() => new Set());
  const busyApprovalsRef = useRef<Set<string>>(new Set());
  const projSession = useRef<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const hydrated = useRef(false);
  const sendLock = useRef(false);
  const { store, error: shellError, dispatch, resolveOnly, selected } = useShell(Boolean(authed));
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
  }, [selectedIdForThread]);

  useEffect(() => {
    // Drop busy flags as soon as the proposal is answered, instead of waiting
    // for the timeout.
    setBusyProposals((current) => {
      let changed = false;
      const next = new Set(current);
      for (const id of current) {
        if (!proposals.some((proposal) => proposal.id === id && proposal.status === "pending")) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [proposals]);

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
      stickRef.current = true;
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
    // Only follow the stream while the reader is already parked at the bottom;
    // scrolling up to read history must not be yanked back on every chunk.
    if (!stickRef.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [proj.messages, proj.pending]);

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickRef.current = distance < 80;
  }

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

  function attachBot(bot: ShellBot) {
    setPickerOpen(false);
    setRailOpen(false);
    const sid = bot.sessionId;
    if (sid !== activeRef.current) {
      projSession.current = null;
      stickRef.current = true;
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
    stickRef.current = true;
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

  async function send(text: string) {
    const message = text.trim();
    if (!message || proj.pending || sendLock.current || !selected) return;
    sendLock.current = true;
    setError("");
    setFailedSend(null);
    setDraft("");
    setPickerOpen(false);
    const optimisticId = nextId();
    stickRef.current = true;
    setProj((current) => ({
      ...current,
      pending: true,
      error: "",
      messages: [...current.messages, { role: "user", text: message, id: optimisticId }],
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
      // Always append: the merge pairs each optimistic entry against one
      // projected message, so repeated identical sends stay countable.
      setTranscriptUser((current) => [...current, { id: `u-${nextSeq()}`, text: message }]);
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
      const reason = err instanceof Error ? err.message : "Send failed";
      if (reason === "unauthorized") setAuthed(false);
      setError(reason === "unauthorized" ? "Sign in expired" : reason);
      // The POST never landed: drop the optimistic bubble and give the text back
      // so the message is not lost.
      setFailedSend(message);
      setProj((current) => ({
        ...current,
        pending: false,
        messages: current.messages.filter((entry) => entry.id !== optimisticId),
      }));
      setDraft(message);
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
    // Guard synchronously: the disabled attribute only lands on the next render,
    // so a fast double click would otherwise send two decisions.
    if (busyApprovalsRef.current.has(item.id)) return;
    busyApprovalsRef.current.add(item.id);
    setBusyApprovals((current) => new Set(current).add(item.id));
    try {
      let csrf: Record<string, string>;
      try {
        csrf = await csrfHeaders();
      } catch (err) {
        if (err instanceof Error && err.message === "unauthorized") {
          setAuthed(false);
          setError("Sign in expired");
        } else {
          setError("Approval failed");
        }
        return;
      }
      const out = await fetch(`/api/approvals/${item.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrf },
        body: JSON.stringify({ decision, actionSha256: item.hash }),
      });
      if (!out.ok) {
        setError("Approval failed");
        return;
      }
      setApprovals((current) => current.filter((row) => row.id !== item.id));
    } finally {
      busyApprovalsRef.current.delete(item.id);
      setBusyApprovals((current) => {
        if (!current.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
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
  // live stream projection. Event ids dedupe replays of the same turn; user text
  // is matched one-to-one so two identical messages ("hi", "hi") both survive.
  const groupRoster = bot && bot.kind === "group" && store
    ? groupMembers(speakersFrom(store.bots), bot.memberIds)
    : [];

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
    const durableUserCounts = new Map<string, number>();
    const durableAssistantCounts = new Map<string, number>();
    for (const event of threadEvents) {
      const counts = event.kind === "user"
        ? durableUserCounts
        : event.kind === "assistant"
          ? durableAssistantCounts
          : null;
      if (!counts) continue;
      counts.set(event.text, (counts.get(event.text) ?? 0) + 1);
    }
    for (const message of proj.messages) {
      if (streamIds.has(message.id)) continue;
      // Delivered replies exist both in the session stream and as durable
      // events with attribution; keep the durable row and drop the echo.
      if (message.role === "user" || message.role === "assistant") {
        const counts = message.role === "user" ? durableUserCounts : durableAssistantCounts;
        const remaining = counts.get(message.text) ?? 0;
        if (remaining > 0) {
          counts.set(message.text, remaining - 1);
          continue;
        }
      }
      rows.push({
        id: message.id,
        kind: message.role === "user" ? "user" : "assistant",
        text: message.text,
        authorName: null,
        authorBotId: null,
        handoffId: null,
        targetBotIds: [],
        order: head + rows.length,
      });
    }
    const projectedUserCounts = new Map<string, number>();
    for (const message of proj.messages) {
      if (message.role !== "user") continue;
      projectedUserCounts.set(message.text, (projectedUserCounts.get(message.text) ?? 0) + 1);
    }
    for (const item of transcriptUser) {
      const remaining = projectedUserCounts.get(item.text) ?? 0;
      if (remaining > 0) {
        projectedUserCounts.set(item.text, remaining - 1);
        continue;
      }
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
    // A group turn addressed to exactly one member was answered as that member
    // (the proxy tells the model so). Attribute the reply by the mention in the
    // turn that produced it, which works for the live turn and for replays.
    if (bot?.kind === "group" && groupRoster.length > 0) {
      rows.forEach((row, index) => {
        if (row.kind !== "assistant" || row.authorBotId) return;
        const previousUser = [...rows.slice(0, index)].reverse().find((item) => item.kind === "user");
        if (!previousUser) return;
        const mentionIds = parseMentions(previousUser.text, groupRoster).mentionIds;
        if (mentionIds.length !== 1) return;
        const label = speakerLabel({
          bot,
          speakers: groupRoster,
          route: { threadId: bot.id, kind: "group", mentionIds, untargeted: false },
        });
        if (label.authorBotId) {
          rows[index] = { ...row, authorBotId: label.authorBotId, authorName: label.authorName };
        }
      });
    }
    return rows;
  })();

  const isDefaultBot = !bot || bot.id === DEFAULT_BOT_ID;
  const openProposals = proposals.filter((proposal) => (
    proposal.status === "pending" && Date.parse(proposal.expiresAt) > Date.now()
  ));
  const showOnboarding = Boolean(bot)
    && !isDefaultBot
    && bot?.kind === "bot"
    && !onboardingDismissed
    && !bot.label.trim()
    && !bot.description.trim()
    && threadEvents.length === 0
    && threadRows.length === 0
    && openProposals.length === 0;

  function decideProposal(decision: ProposalDecision) {
    // Disable the card while the confirm is in flight so a double click cannot
    // queue the same decision twice. A set keeps other cards independent.
    setBusyProposals((current) => new Set(current).add(decision.proposalId));
    window.setTimeout(() => {
      setBusyProposals((current) => {
        if (!current.has(decision.proposalId)) return current;
        const next = new Set(current);
        next.delete(decision.proposalId);
        return next;
      });
    }, 15_000);
    const meta = {
      proposalId: decision.proposalId,
      proposalStatus: decision.proposalStatus,
    };
    if (decision.action) {
      dispatch(decision.action, meta);
      if (selectedIdForThread) void refreshThread(selectedIdForThread);
      return;
    }
    void resolveOnly(meta)
      .catch((err) => setError(err instanceof Error ? err.message : "Shell save failed"))
      .finally(() => {
        if (selectedIdForThread) void refreshThread(selectedIdForThread);
      });
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
      <div className="flex h-screen w-full items-center justify-center bg-canvas px-4 text-ink">
        <div className="text-center">
          <p className="text-sm text-ink-muted">Waiting for the local server.</p>
          <button
            className="btn btn-secondary mt-4 min-h-9 px-3 text-sm"
            onClick={() => window.location.reload()}
            type="button"
          >
            Retry
          </button>
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
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm text-danger sm:px-6" role="alert">
              <span className="min-w-0">{displayError}</span>
              {failedSend ? (
                <button
                  className="btn btn-secondary min-h-8 px-3 text-xs"
                  onClick={() => {
                    const retry = failedSend;
                    setFailedSend(null);
                    setError("");
                    void send(retry);
                  }}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {approvals.length > 0 ? (
            <div className="flex flex-col gap-2 px-4 py-2 sm:px-6">
              {approvals.map((item) => (
                <div className="approval-card" key={item.id}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-warning">Needs approval</div>
                    <div className="line-clamp-4 text-sm break-words text-ink">{item.preview}</div>
                    <div className="text-[12px] text-ink-muted">{item.tool}</div>
                  </div>
                  <button
                    className="btn btn-primary min-h-9 px-3 text-xs"
                    disabled={busyApprovals.has(item.id)}
                    onClick={() => void decide(item, "approve")}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-danger min-h-9 px-3 text-xs"
                    disabled={busyApprovals.has(item.id)}
                    onClick={() => void decide(item, "deny")}
                    type="button"
                  >
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
                  <div className="uv-scroll min-h-0 flex-1 overflow-y-auto" onScroll={onScroll} ref={scrollRef}>
                    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                      <div className="flex flex-col gap-6">
                        {showOnboarding ? (
                          <OnboardingCard
                            onDismiss={dismissOnboarding}
                            onFillForm={() => {
                              dismissOnboarding();
                              setSettingsOpen(true);
                            }}
                            name={bot.name}
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
                                pending={busyProposals.has(proposal.id)}
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
