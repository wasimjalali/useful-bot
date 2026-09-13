"use client";

import type { MouseEvent } from "react";
import {
  ChatIcon,
  ChevronIcon,
  MemoryIcon,
  MoreIcon,
  NewChatIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "./icons";
import { UsefulBotAvatar, UsefulBotLogo } from "./useful-bot-logo";
import {
  botsInSection,
  matchesQuery,
  pinnedBots,
  unassignedBots,
  type ShellBot,
  type ShellGroup,
  type ShellState,
} from "../../shared/shell-store.ts";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "B";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

function BotAvatar({ bot, large }: { bot: ShellBot; large?: boolean }) {
  if (bot.id === "bot-useful") {
    return <UsefulBotAvatar className={large ? "size-10 rounded-2xl" : "size-6 rounded-lg"} />;
  }
  return (
    <span className={["bot-avatar", large ? "size-10 rounded-2xl text-[11px]" : ""].filter(Boolean).join(" ")}>
      {initials(bot.name)}
    </span>
  );
}

export function BotRail({
  filter,
  onCreateInSection,
  onFilter,
  onMemory,
  onOpenCreate,
  onOpenContext,
  onOpenSettings,
  onSearchChats,
  onSelectBot,
  onSelectGroup,
  shell,
  view,
}: {
  filter: string;
  onCreateInSection: (sectionId: string | null, event: MouseEvent<HTMLButtonElement>) => void;
  onFilter: (value: string) => void;
  onMemory: () => void;
  onOpenCreate: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpenContext: (bot: ShellBot, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenSettings: () => void;
  onSearchChats: () => void;
  onSelectBot: (id: string) => void;
  onSelectGroup: (id: string) => void;
  shell: ShellState;
  view: "chat" | "memory";
}) {
  const needle = filter.trim();
  const pinned = pinnedBots(shell).filter((bot) => matchesQuery(bot, needle));
  const unassigned = unassignedBots(shell).filter((bot) => matchesQuery(bot, needle));
  const groups = needle
    ? shell.groups.filter((group) => group.name.toLowerCase().includes(needle.toLowerCase()))
    : shell.groups;

  return (
    <aside className="rail flex w-[248px] shrink-0 flex-col gap-4 px-3 py-4 max-lg:hidden">
      <div className="px-2 pt-1">
        <UsefulBotLogo />
      </div>

      <nav aria-label="Workspace" className="flex flex-col gap-0.5">
        <button className="nav-item text-sm" onClick={onOpenCreate} type="button">
          <NewChatIcon className="size-[18px] shrink-0" />
          <span className="flex-1">New chat</span>
          <ChevronIcon className="size-4 text-ink-faint" />
        </button>
        <button className="nav-item text-sm" onClick={onSearchChats} type="button">
          <SearchIcon className="size-[18px] shrink-0" />
          <span>Search chats</span>
        </button>
        <button
          aria-current={view === "memory" ? "page" : undefined}
          className="nav-item text-sm"
          onClick={onMemory}
          type="button"
        >
          <MemoryIcon className="size-[18px] shrink-0" />
          <span>Memory</span>
        </button>
      </nav>

      <div className="field-input flex min-h-9 items-center gap-2 px-2.5">
        <SearchIcon className="size-3.5 text-ink-faint" />
        <label className="sr-only" htmlFor="rail-filter">Filter bots</label>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          id="rail-filter"
          onChange={(event) => onFilter(event.target.value)}
          placeholder="Search"
          value={filter}
        />
      </div>

      <div className="uv-scroll -mr-1 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {pinned.length > 0 ? (
          <section aria-label="Pinned">
            <div className="section-label">
              <span>Pinned</span>
            </div>
            <div className="space-y-1.5">
              {pinned.map((bot) => (
                <PinnedCard
                  active={shell.activeKind === "bot" && shell.activeId === bot.id && view === "chat"}
                  bot={bot}
                  key={bot.id}
                  onOpenContext={onOpenContext}
                  onSelect={onSelectBot}
                />
              ))}
            </div>
          </section>
        ) : null}

        {groups.length > 0 ? (
          <section aria-label="Groups">
            <div className="section-label"><span>Groups</span></div>
            {groups.map((group) => (
              <GroupRow
                active={shell.activeKind === "group" && shell.activeId === group.id && view === "chat"}
                group={group}
                key={group.id}
                onSelect={onSelectGroup}
              />
            ))}
          </section>
        ) : null}

        {shell.sections.map((section) => {
          const bots = botsInSection(shell, section.id).filter((bot) => matchesQuery(bot, needle));
          return (
            <section aria-label={section.name} key={section.id}>
              <div className="section-label">
                <span>{section.name}</span>
                <button
                  aria-label={`Add bot to ${section.name}`}
                  className="icon-btn size-6"
                  onClick={(event) => onCreateInSection(section.id, event)}
                  type="button"
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </div>
              {bots.length === 0 ? (
                <p className="px-2 text-xs text-ink-faint">No bots in this section.</p>
              ) : (
                bots.map((bot) => (
                  <CompactRow
                    active={shell.activeKind === "bot" && shell.activeId === bot.id && view === "chat"}
                    bot={bot}
                    key={bot.id}
                    onOpenContext={onOpenContext}
                    onSelect={onSelectBot}
                  />
                ))
              )}
            </section>
          );
        })}

        <section aria-label="Unassigned">
          <div className="section-label">
            <span>Unassigned</span>
            <button
              aria-label="Add bot to Unassigned"
              className="icon-btn size-6"
              onClick={(event) => onCreateInSection(null, event)}
              type="button"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
          {unassigned.length === 0 ? (
            <p className="px-2 text-xs text-ink-faint">Default bots land here.</p>
          ) : (
            unassigned.map((bot) => (
              <CompactRow
                active={shell.activeKind === "bot" && shell.activeId === bot.id && view === "chat"}
                bot={bot}
                key={bot.id}
                onOpenContext={onOpenContext}
                onSelect={onSelectBot}
              />
            ))
          )}
        </section>
      </div>

      <div className="operator-row flex items-center gap-2.5 px-1.5 pt-3">
        <span aria-hidden="true" className="operator-avatar shrink-0">
          WJ
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{shell.operatorName}</p>
        <button
          aria-label="Settings"
          className="icon-btn tip size-7 shrink-0"
          data-tip="Settings"
          onClick={onOpenSettings}
          type="button"
        >
          <SettingsIcon className="size-4" />
        </button>
      </div>
    </aside>
  );
}

function PinnedCard({
  active,
  bot,
  onOpenContext,
  onSelect,
}: {
  active: boolean;
  bot: ShellBot;
  onOpenContext: (bot: ShellBot, event: MouseEvent<HTMLButtonElement>) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="group relative">
      <button
        aria-current={active ? "true" : undefined}
        className="pin-card"
        onClick={() => onSelect(bot.id)}
        type="button"
      >
        <BotAvatar bot={bot} large />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{bot.name}</span>
          <span className="block truncate text-[11px] text-ink-muted">{bot.label || "Pinned"}</span>
        </span>
      </button>
      <button
        aria-label={`Actions for ${bot.name}`}
        className="icon-btn absolute right-2 top-2 size-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onOpenContext(bot, event);
        }}
        type="button"
      >
        <MoreIcon className="size-4" />
      </button>
    </div>
  );
}

function CompactRow({
  active,
  bot,
  onOpenContext,
  onSelect,
}: {
  active: boolean;
  bot: ShellBot;
  onOpenContext: (bot: ShellBot, event: MouseEvent<HTMLButtonElement>) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="group relative">
      <button
        aria-current={active ? "true" : undefined}
        className="bot-row pr-8 text-[13px]"
        onClick={() => onSelect(bot.id)}
        type="button"
      >
        <BotAvatar bot={bot} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{bot.name}</span>
          {bot.label ? <span className="block truncate text-[11px] text-ink-faint">{bot.label}</span> : null}
        </span>
      </button>
      <button
        aria-label={`Actions for ${bot.name}`}
        className="icon-btn absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onOpenContext(bot, event);
        }}
        type="button"
      >
        <MoreIcon className="size-3.5" />
      </button>
    </div>
  );
}

function GroupRow({
  active,
  group,
  onSelect,
}: {
  active: boolean;
  group: ShellGroup;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      className="bot-row text-[13px]"
      onClick={() => onSelect(group.id)}
      type="button"
    >
      <UsersIcon className="size-4 shrink-0 text-ink-muted" />
      <span className="truncate">{group.name}</span>
      <ChatIcon className="ml-auto size-3.5 text-ink-faint" />
    </button>
  );
}
