"use client";

import { useMemo, useState } from "react";
import { NewChatIcon, SearchIcon } from "./icons";
import { Dialog } from "./dialog";
import { BotAvatar } from "./bot-avatar";
import type { ShellBot } from "../../shared/shell-store.ts";

export function ChatSearchDialog({
  bots,
  onClose,
  onNewChat,
  onSelect,
}: {
  bots: ShellBot[];
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bots.filter((bot) => !bot.hidden);
    return bots.filter((bot) => `${bot.name} ${bot.label} ${bot.description}`.toLowerCase().includes(needle));
  }, [bots, query]);

  return (
    <Dialog ariaLabel="Search bots" maxWidth="max-w-2xl" onClose={onClose}>
      <div className="search-modal">
        <div className="field-input flex min-h-10 flex-1 items-center gap-2 px-3">
          <SearchIcon className="size-4 text-ink-faint" />
          <label className="sr-only" htmlFor="chat-search">Search bots</label>
          <input
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
            id="chat-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search bots..."
            type="search"
            value={query}
          />
        </div>

        <button className="nav-item w-full text-sm" onClick={onNewChat} type="button">
          <NewChatIcon className="size-4" />
          New chat
        </button>

        <div>
          <p className="px-2 pb-2 text-[11px] text-ink-faint">Bots</p>
          {matches.length === 0 ? (
            <p className="px-2 text-sm text-ink-muted">No matching bots.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {matches.map((bot) => (
                <li key={bot.id}>
                  <button
                    className="nav-item w-full text-sm"
                    onClick={() => onSelect(bot.id)}
                    type="button"
                  >
                    <BotAvatar bot={bot} size="sm" />
                    <span className="truncate">{bot.name}</span>
                    {bot.label ? <span className="bot-label">{bot.label}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
