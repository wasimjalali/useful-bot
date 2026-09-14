"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchBots, type ShellBot, type ShellStore } from "../../shared/shell-store.ts";
import { BotAvatar } from "./bot-avatar";
import { PlusIcon, UsersIcon } from "./icons";

export function NewChatPicker({
  onClose,
  onCreateBot,
  onCreateGroup,
  onSelectBot,
  store,
}: {
  onClose: () => void;
  onCreateBot: () => void;
  onCreateGroup: () => void;
  onSelectBot: (botId: string) => void;
  store: ShellStore;
}) {
  const [query, setQuery] = useState("");
  const [modifier, setModifier] = useState("Ctrl+");
  const inputRef = useRef<HTMLInputElement>(null);
  const bots = useMemo(() => searchBots(store, query).filter((bot) => !bot.hidden), [query, store]);

  useEffect(() => {
    setModifier(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+");
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "1") {
        event.preventDefault();
        onCreateBot();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "2") {
        event.preventDefault();
        onCreateGroup();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onCreateBot, onCreateGroup]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="to-header">
        <span className="text-[13px] font-semibold text-ink-muted">To</span>
        <label className="sr-only" htmlFor="to-search">Search or create bots</label>
        <input
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
          id="to-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or create bots"
          ref={inputRef}
          type="search"
          value={query}
        />
      </div>
      <div className="to-picker">
        <div className="uv-scroll to-picker-body">
          <button className="search-hit" onClick={onCreateBot} type="button">
            <PlusIcon className="size-4 shrink-0" />
            <span className="flex-1 text-left">New Bot</span>
            <kbd className="search-kbd">{modifier}1</kbd>
          </button>
          <button className="search-hit" onClick={onCreateGroup} type="button">
            <UsersIcon className="size-4 shrink-0" />
            <span className="flex-1 text-left">Create group chat</span>
            <kbd className="search-kbd">{modifier}2</kbd>
          </button>
          {bots.map((bot) => (
            <ToBotRow bot={bot} key={bot.id} onSelect={() => onSelectBot(bot.id)} />
          ))}
          {bots.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-muted">No matching bots.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToBotRow({ bot, onSelect }: { bot: ShellBot; onSelect: () => void }) {
  return (
    <button className="search-hit" onClick={onSelect} type="button">
      <BotAvatar bot={bot} size="sm" />
      <span className="min-w-0 flex-1 truncate text-left">{bot.name}</span>
      {bot.label ? <span className="bot-label">{bot.label}</span> : null}
    </button>
  );
}
