"use client";

import { useEffect, useState } from "react";
import {
  HIDDEN_SECTION,
  UNASSIGNED_SECTION,
  hiddenBots,
  pinnedBots,
  sectionBots,
  type ShellAction,
  type ShellBot,
  type ShellStore,
} from "../../shared/shell-store.ts";
import { BotAvatar } from "./bot-avatar";
import {
  ChevronDownIcon,
  HideIcon,
  MarketplaceIcon,
  MenuIcon,
  MoreIcon,
  NewChatIcon,
  PencilIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
  UsageIcon,
  UsersIcon,
} from "./icons";
import { UsefulBotLogo } from "./useful-bot-logo";
import { MenuItem, Popover, type MenuPoint } from "./popover";

type CreateKind = "bot" | "group" | "section";

export function BotRail({
  onAction,
  onCreate,
  onDeleteRequest,
  onConnectors,
  onNewChat,
  newChatActive = false,
  onOpenAppSettings,
  onOpenSettings,
  onRenameRequest,
  onSearch,
  onSelect,
  onToggleMobile,
  operator,
  store,
}: {
  onAction: (action: ShellAction) => void;
  onCreate: (kind: CreateKind, sectionId?: string | null) => void;
  onDeleteRequest: (bot: ShellBot) => void;
  onConnectors: () => void;
  newChatActive?: boolean;
  onNewChat: () => void;
  onOpenAppSettings: (tab?: "general" | "usage" | "providers") => void;
  onOpenSettings: (botId: string) => void;
  onRenameRequest: (bot: ShellBot) => void;
  onSearch: () => void;
  onSelect: (botId: string) => void;
  onToggleMobile?: () => void;
  operator: { name: string; initials: string };
  store: ShellStore;
}) {
  const [kbd, setKbd] = useState("Ctrl+K");
  const [accountOpen, setAccountOpen] = useState<MenuPoint | null>(null);
  const [menu, setMenu] = useState<{ bot: ShellBot; point: MenuPoint; submenu?: boolean } | null>(null);
  const pinned = pinnedBots(store);
  const unassigned = sectionBots(store, null);
  const hidden = hiddenBots(store);

  useEffect(() => {
    setKbd(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl+K");
  }, []);

  function openMenu(event: React.MouseEvent, bot: ShellBot) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ bot, point: { x: event.clientX, y: event.clientY } });
  }

  return (
    <aside className="rail flex h-full w-[248px] shrink-0 flex-col gap-3 px-3 py-4">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <UsefulBotLogo />
        {onToggleMobile ? (
          <button aria-label="Close rail" className="icon-btn size-8 lg:hidden" onClick={onToggleMobile} type="button">
            <MenuIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <button className="search-trigger" onClick={onSearch} type="button">
        <SearchIcon className="size-3.5 shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1 truncate text-left text-[13px] text-ink-faint">Search</span>
        <kbd className="search-kbd">{kbd}</kbd>
      </button>

      <button
        aria-current={newChatActive ? "page" : undefined}
        className="new-bot-trigger"
        onClick={onNewChat}
        type="button"
      >
        <NewChatIcon className="size-4 shrink-0" />
        New Bot
      </button>

      <div className="uv-scroll -mr-1 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {pinned.length > 0 ? (
          <div className="space-y-2">
            {pinned.map((bot) => (
              <PinnedCard
                bot={bot}
                key={bot.id}
                onMenu={(event) => openMenu(event, bot)}
                onSelect={() => onSelect(bot.id)}
                selected={bot.id === store.selectedBotId}
              />
            ))}
          </div>
        ) : null}

        {store.sections.map((section) => {
          const bots = sectionBots(store, section.id);
          return (
            <SectionBlock
              collapsed={section.collapsed}
              key={section.id}
              label={section.name}
              onToggle={() => onAction({ type: "toggleSection", sectionId: section.id })}
            >
              {bots.map((bot) => (
                <BotRow
                  bot={bot}
                  key={bot.id}
                  onMenu={(event) => openMenu(event, bot)}
                  onSelect={() => onSelect(bot.id)}
                  selected={bot.id === store.selectedBotId}
                />
              ))}
            </SectionBlock>
          );
        })}

        <SectionBlock
          collapsed={store.collapsedUnassigned}
          label="Unassigned"
          onToggle={() => onAction({ type: "toggleSection", sectionId: UNASSIGNED_SECTION })}
        >
          {unassigned.length === 0 ? (
            <p className="px-2 py-1 text-xs text-ink-faint">Default home for new bots.</p>
          ) : (
            unassigned.map((bot) => (
              <BotRow
                bot={bot}
                key={bot.id}
                onMenu={(event) => openMenu(event, bot)}
                onSelect={() => onSelect(bot.id)}
                selected={bot.id === store.selectedBotId}
              />
            ))
          )}
        </SectionBlock>

        {hidden.length > 0 ? (
          <SectionBlock
            collapsed={store.collapsedHidden}
            label="Hidden"
            onToggle={() => onAction({ type: "toggleSection", sectionId: HIDDEN_SECTION })}
          >
            {hidden.map((bot) => (
              <BotRow
                bot={bot}
                key={bot.id}
                onMenu={(event) => openMenu(event, bot)}
                onSelect={() => onSelect(bot.id)}
                selected={bot.id === store.selectedBotId}
              />
            ))}
          </SectionBlock>
        ) : null}
      </div>

      <div className="operator-row space-y-1 pt-3">
        <button className="nav-item text-[13px]" onClick={onConnectors} type="button">
          <MarketplaceIcon className="size-4 shrink-0" />
          Connectors
        </button>
        <button
          className="flex w-full items-center gap-2.5 px-1.5 py-1.5"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setAccountOpen({ x: rect.left, y: rect.top });
          }}
          type="button"
        >
          <span aria-hidden="true" className="operator-avatar shrink-0">{operator.initials}</span>
          <p className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-ink">{operator.name}</p>
        </button>
      </div>

      {accountOpen ? (
        <Popover
          onClose={() => setAccountOpen(null)}
          placement="above"
          point={accountOpen}
          width={220}
        >
          <MenuItem
            onClick={() => {
              setAccountOpen(null);
              onOpenAppSettings("usage");
            }}
          >
            <UsageIcon className="size-3.5" />
            Weekly usage
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAccountOpen(null);
              onOpenAppSettings("general");
            }}
          >
            <SettingsIcon className="size-3.5" />
            Settings
          </MenuItem>
        </Popover>
      ) : null}

      {menu ? (
        <Popover onClose={() => setMenu(null)} point={menu.point} width={220}>
          {menu.submenu ? (
            <>
              <MenuItem
                onClick={() => {
                  onAction({ type: "move", botId: menu.bot.id, sectionId: null });
                  setMenu(null);
                }}
              >
                Unassigned
              </MenuItem>
              {store.sections.map((section) => (
                <MenuItem
                  key={section.id}
                  onClick={() => {
                    onAction({ type: "move", botId: menu.bot.id, sectionId: section.id });
                    setMenu(null);
                  }}
                >
                  {section.name}
                </MenuItem>
              ))}
              <MenuItem
                onClick={() => {
                  setMenu(null);
                  onCreate("section");
                }}
              >
                New section
              </MenuItem>
            </>
          ) : (
            <>
              <MenuItem
                onClick={() => {
                  onAction({ type: "pin", botId: menu.bot.id, pinned: !menu.bot.pinned });
                  setMenu(null);
                }}
              >
                <PinIcon className="size-3.5" />
                {menu.bot.pinned ? "Unpin" : "Pin"}
              </MenuItem>
              <MenuItem onClick={() => setMenu({ ...menu, submenu: true })}>
                Move to section
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenu(null);
                  onOpenSettings(menu.bot.id);
                }}
              >
                Settings
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenu(null);
                  onRenameRequest(menu.bot);
                }}
              >
                <PencilIcon className="size-3.5" />
                Rename
              </MenuItem>
              <MenuItem
                onClick={() => {
                  onAction({ type: "hide", botId: menu.bot.id, hidden: !menu.bot.hidden });
                  setMenu(null);
                }}
              >
                <HideIcon className="size-3.5" />
                {menu.bot.hidden ? "Unhide" : "Hide"}
              </MenuItem>
              <MenuItem
                danger
                disabled={store.bots.length <= 1}
                onClick={() => {
                  const bot = menu.bot;
                  setMenu(null);
                  onDeleteRequest(bot);
                }}
              >
                <TrashIcon className="size-3.5" />
                Delete
              </MenuItem>
            </>
          )}
        </Popover>
      ) : null}
    </aside>
  );
}

function SectionBlock({
  children,
  collapsed,
  label,
  onToggle,
}: {
  children: React.ReactNode;
  collapsed: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <section>
      <div className="section-head">
        <button className="section-toggle" onClick={onToggle} type="button">
          <ChevronDownIcon className={collapsed ? "size-3 -rotate-90" : "size-3"} />
          <span>{label}</span>
        </button>
      </div>
      {collapsed ? null : <div className="mt-0.5 space-y-0.5">{children}</div>}
    </section>
  );
}

function formatRailTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BotRow({
  bot,
  onMenu,
  onSelect,
  selected,
}: {
  bot: ShellBot;
  onMenu: (event: React.MouseEvent) => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const preview = bot.lastPreview || bot.description;
  const time = formatRailTime(bot.lastAt);
  return (
    <div className="group relative">
      <button
        aria-current={selected ? "true" : undefined}
        className={["bot-row", selected ? "bot-row-active" : ""].join(" ")}
        onClick={onSelect}
        onContextMenu={onMenu}
        type="button"
      >
        <BotAvatar bot={bot} size="sm" />
        <span className="bot-row-copy">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate font-semibold">{bot.name}</span>
            {bot.kind === "group" ? <UsersIcon className="size-3 shrink-0 text-ink-faint" /> : null}
            {bot.label ? <span className="bot-label">{bot.label}</span> : null}
          </span>
          {preview ? <span className="mt-0.5 block truncate text-[11px] leading-4 text-ink-muted">{preview}</span> : null}
        </span>
        {time ? <span className="tnum shrink-0 pt-0.5 text-[10px] text-ink-faint">{time}</span> : null}
      </button>
      <button
        aria-label={`${bot.name} actions`}
        className="bot-row-actions icon-btn absolute right-0.5 top-1.5 size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={onMenu}
        type="button"
      >
        <MoreIcon className="size-3.5" />
      </button>
    </div>
  );
}

function PinnedCard({
  bot,
  onMenu,
  onSelect,
  selected,
}: {
  bot: ShellBot;
  onMenu: (event: React.MouseEvent) => void;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={["bot-card", selected ? "bot-card-active" : ""].join(" ")}
      onClick={onSelect}
      onContextMenu={onMenu}
      type="button"
    >
      <div className="flex items-start gap-2.5">
        <BotAvatar bot={bot} size="lg" />
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold">{bot.name}</p>
            {bot.label ? <span className="bot-label">{bot.label}</span> : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-muted">
            {bot.lastPreview || bot.description || "Pinned"}
          </p>
        </div>
      </div>
    </button>
  );
}
