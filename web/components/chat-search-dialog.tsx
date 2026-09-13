"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChatIcon, HideIcon, NewChatIcon, SearchIcon } from "./icons";
import { BotAvatar } from "./bot-avatar";
import { searchShell, type ShellSearchHit, type ShellStore } from "../../shared/shell-store.ts";

export function ChatSearchDialog({
  onClose,
  onNewChat,
  onOpenRecent,
  onSelect,
  store,
}: {
  onClose: () => void;
  onNewChat: () => void;
  onOpenRecent: (recentId: string) => void;
  onSelect: (id: string) => void;
  store: ShellStore;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchShell(store, query), [store, query]);
  const count = hits.length;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(hit: ShellSearchHit | undefined) {
    if (!hit) return;
    if (hit.kind === "new-chat") onNewChat();
    else if (hit.kind === "recent") onOpenRecent(hit.recent.id);
    else onSelect(hit.bot.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % Math.max(count, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + count) % Math.max(count, 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      run(hits[active]);
    }
  }

  return (
    <div
      className="dialog-overlay search-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        aria-label="Search chats and bots"
        aria-modal="true"
        className="search-palette"
        role="dialog"
      >
        <div className="search-palette-head">
          <SearchIcon className="size-4 shrink-0 text-ink-faint" />
          <label className="sr-only" htmlFor="chat-search">Search chats and bots</label>
          <input
            aria-activedescendant={count > 0 ? `search-hit-${active}` : undefined}
            aria-autocomplete="list"
            aria-controls="chat-search-results"
            aria-expanded="true"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            id="chat-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search chats and bots"
            ref={inputRef}
            role="combobox"
            type="text"
            value={query}
          />
        </div>

        <div className="uv-scroll search-palette-body" id="chat-search-results" ref={listRef} role="listbox">
          {hits.map((hit, index) => {
            const prev = hits[index - 1];
            const heading = headingFor(hit, prev);
            return (
              <div key={hitKey(hit, index)}>
                {heading ? <p className="search-palette-label">{heading}</p> : null}
                <SearchHitRow
                  active={index === active}
                  hit={hit}
                  index={index}
                  onHover={() => setActive(index)}
                  onRun={() => run(hit)}
                />
              </div>
            );
          })}
          {hits.length === 1 && query.trim() ? (
            <p className="px-3 py-3 text-sm text-ink-muted">No matching chats or bots.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function headingFor(hit: ShellSearchHit, prev: ShellSearchHit | undefined): string | null {
  if (hit.kind === "recent" && prev?.kind !== "recent") return "Recents";
  if (hit.kind === "bot" && prev?.kind !== "bot") return "Bots";
  return null;
}

function hitKey(hit: ShellSearchHit, index: number): string {
  if (hit.kind === "new-chat") return "new-chat";
  if (hit.kind === "recent") return `recent-${hit.recent.id}`;
  if (hit.kind === "bot") return `bot-${hit.bot.id}`;
  return String(index);
}

function SearchHitRow({
  active,
  hit,
  index,
  onHover,
  onRun,
}: {
  active: boolean;
  hit: ShellSearchHit;
  index: number;
  onHover: () => void;
  onRun: () => void;
}) {
  const className = ["search-hit", active ? "search-hit-active" : ""].join(" ");
  if (hit.kind === "new-chat") {
    return (
      <button
        aria-selected={active}
        className={className}
        data-index={index}
        id={`search-hit-${index}`}
        onClick={onRun}
        onMouseEnter={onHover}
        role="option"
        type="button"
      >
        <NewChatIcon className="size-4 shrink-0" />
        <span className="truncate">New chat</span>
      </button>
    );
  }
  if (hit.kind === "recent") {
    const bot = hit.bot;
    return (
      <button
        aria-selected={active}
        className={className}
        data-index={index}
        id={`search-hit-${index}`}
        onClick={onRun}
        onMouseEnter={onHover}
        role="option"
        type="button"
      >
        {bot ? <BotAvatar bot={bot} size="sm" /> : <ChatIcon className="size-4 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="block truncate">{hit.recent.title}</span>
          <span className="block truncate text-[11px] text-ink-muted">
            {[bot?.name, hit.recent.preview].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
    );
  }
  return (
    <button
      aria-selected={active}
      className={className}
      data-index={index}
      id={`search-hit-${index}`}
      onClick={onRun}
      onMouseEnter={onHover}
      role="option"
      type="button"
    >
      <BotAvatar bot={hit.bot} size="sm" />
      <span className="min-w-0 flex-1 truncate text-left">{hit.bot.name}</span>
      {hit.bot.label ? <span className="bot-label">{hit.bot.label}</span> : null}
      {hit.bot.hidden ? (
        <span className="bot-label">
          <HideIcon className="mr-1 inline size-3" />
          Hidden
        </span>
      ) : null}
    </button>
  );
}
