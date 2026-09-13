"use client";

import { useEffect, useRef } from "react";
import { Dialog } from "./dialog";
import { BellIcon, HideIcon, PinIcon, PlusIcon, TrashIcon, UsersIcon } from "./icons";
import type { ShellBot, ShellSection } from "../../shared/shell-store.ts";

export function ConfirmDialog({
  confirmLabel,
  message,
  onClose,
  onConfirm,
  title,
}: {
  confirmLabel: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <Dialog ariaLabel={title} maxWidth="max-w-md" onClose={onClose}>
      <div className="px-5 pb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-danger min-h-9 px-3 text-sm" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function NameDialog({
  initial,
  label,
  onClose,
  onSubmit,
  title,
}: {
  initial?: string;
  label: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <Dialog ariaLabel={title} maxWidth="max-w-md" onClose={onClose}>
      <form
        className="px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          const value = ref.current?.value.trim() ?? "";
          if (!value) return;
          onSubmit(value);
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="field mt-4">
          <label htmlFor="shell-name">{label}</label>
          <input
            className="field-input min-h-11 w-full px-3 text-sm"
            defaultValue={initial ?? ""}
            id="shell-name"
            maxLength={80}
            ref={ref}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary min-h-9 px-3 text-sm" type="submit">
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CreateBotDialog({
  defaultSection,
  onClose,
  onSubmit,
  sections,
}: {
  defaultSection?: string | null;
  onClose: () => void;
  onSubmit: (input: { name: string; label: string; description: string; sectionId: string | null }) => void;
  sections: ShellSection[];
}) {
  return (
    <Dialog ariaLabel="Create bot" maxWidth="max-w-md" onClose={onClose}>
      <form
        className="px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const name = String(data.get("name") ?? "").trim();
          if (!name) return;
          const sectionRaw = String(data.get("section") ?? "");
          onSubmit({
            name,
            label: String(data.get("label") ?? ""),
            description: String(data.get("description") ?? ""),
            sectionId: sectionRaw === "" ? null : sectionRaw,
          });
        }}
      >
        <h2 className="text-lg font-semibold">Create bot</h2>
        <p className="mt-1 text-sm text-ink-muted">Saved on this Mac. Same agent until later PRs add routing.</p>
        <div className="mt-4 grid gap-3">
          <div className="field">
            <label htmlFor="create-bot-name">Name</label>
            <input className="field-input min-h-11 w-full px-3 text-sm" id="create-bot-name" maxLength={80} name="name" required />
          </div>
          <div className="field">
            <label htmlFor="create-bot-label">Label</label>
            <input className="field-input min-h-11 w-full px-3 text-sm" id="create-bot-label" maxLength={80} name="label" />
          </div>
          <div className="field">
            <label htmlFor="create-bot-desc">Description</label>
            <textarea className="field-input min-h-20 w-full px-3 py-2 text-sm" id="create-bot-desc" maxLength={500} name="description" />
          </div>
          <div className="field">
            <label htmlFor="create-bot-section">Section</label>
            <select className="field-input min-h-11 w-full px-3 text-sm" defaultValue={defaultSection ?? ""} id="create-bot-section" name="section">
              <option value="">Unassigned</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary min-h-9 px-3 text-sm" type="submit">Create</button>
        </div>
      </form>
    </Dialog>
  );
}

export function CreateGroupDialog({
  bots,
  onClose,
  onSubmit,
}: {
  bots: ShellBot[];
  onClose: () => void;
  onSubmit: (input: { name: string; botIds: string[] }) => void;
}) {
  return (
    <Dialog ariaLabel="Create group chat" maxWidth="max-w-md" onClose={onClose}>
      <form
        className="px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const name = String(data.get("name") ?? "").trim();
          const botIds = data.getAll("bots").map(String);
          if (!name || botIds.length === 0) return;
          onSubmit({ name, botIds });
        }}
      >
        <h2 className="text-lg font-semibold">Create group chat</h2>
        <p className="mt-1 text-sm text-ink-muted">One shared thread for the selected bots.</p>
        <div className="field mt-4">
          <label htmlFor="create-group-name">Name</label>
          <input className="field-input min-h-11 w-full px-3 text-sm" id="create-group-name" maxLength={80} name="name" required />
        </div>
        <fieldset className="mt-4">
          <legend className="text-[13px] font-medium text-ink-muted">Bots</legend>
          <div className="mt-2 grid gap-1">
            {bots.filter((bot) => !bot.hidden).map((bot) => (
              <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken" key={bot.id}>
                <input defaultChecked={bot.id === "bot-useful"} name="bots" type="checkbox" value={bot.id} />
                <span>{bot.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary min-h-9 px-3 text-sm" type="submit">Create</button>
        </div>
      </form>
    </Dialog>
  );
}

export function CreateMenu({
  onClose,
  onCreateBot,
  onCreateGroup,
  onNewChat,
  x,
  y,
}: {
  onClose: () => void;
  onCreateBot: () => void;
  onCreateGroup: () => void;
  onNewChat: () => void;
  x: number;
  y: number;
}) {
  return (
    <MenuFrame onClose={onClose} x={x} y={y}>
      <button className="menu-item" onClick={onNewChat} type="button">
        <PlusIcon className="size-4" />
        New chat
      </button>
      <button className="menu-item" onClick={onCreateBot} type="button">
        <PlusIcon className="size-4" />
        Create bot
      </button>
      <button className="menu-item" onClick={onCreateGroup} type="button">
        <UsersIcon className="size-4" />
        Create group chat
      </button>
    </MenuFrame>
  );
}

export function BotContextMenu({
  bot,
  onClose,
  onDelete,
  onHide,
  onMove,
  onNewSection,
  onPin,
  onRename,
  onSettings,
  sections,
  x,
  y,
}: {
  bot: ShellBot;
  onClose: () => void;
  onDelete: () => void;
  onHide: () => void;
  onMove: (sectionId: string | null) => void;
  onNewSection: () => void;
  onPin: () => void;
  onRename: () => void;
  onSettings: () => void;
  sections: ShellSection[];
  x: number;
  y: number;
}) {
  return (
    <MenuFrame onClose={onClose} x={x} y={y}>
      <button className="menu-item" onClick={onPin} type="button">
        <PinIcon className="size-4" />
        {bot.pinned ? "Unpin" : "Pin"}
      </button>
      <button className="menu-item" onClick={onRename} type="button">Rename</button>
      <button className="menu-item" onClick={onSettings} type="button">Settings</button>
      <p className="px-2.5 pt-2 pb-1 text-[11px] text-ink-faint">Move to section</p>
      <button className="menu-item" onClick={() => onMove(null)} type="button">Unassigned</button>
      {sections.map((section) => (
        <button className="menu-item" key={section.id} onClick={() => onMove(section.id)} type="button">
          {section.name}
        </button>
      ))}
      <button className="menu-item" onClick={onNewSection} type="button">New section</button>
      <button className="menu-item" onClick={onHide} type="button">
        <HideIcon className="size-4" />
        Hide
      </button>
      <button className="menu-item menu-danger" onClick={onDelete} type="button">
        <TrashIcon className="size-4" />
        Delete
      </button>
    </MenuFrame>
  );
}

export function BotSettingsPanel({
  bot,
  onChange,
  onClose,
}: {
  bot: ShellBot;
  onChange: (patch: { name?: string; label?: string; description?: string; notify?: boolean }) => void;
  onClose: () => void;
}) {
  return (
    <aside className="settings-pane flex shrink-0 flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="text-[15px] font-semibold">Agent settings</h2>
        <button className="icon-btn size-8" onClick={onClose} type="button">Close</button>
      </header>
      <div className="uv-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        <div className="field">
          <label htmlFor="bot-name">Name</label>
          <input
            className="field-input min-h-11 w-full px-3 text-sm"
            id="bot-name"
            maxLength={80}
            onChange={(event) => onChange({ name: event.target.value })}
            value={bot.name}
          />
        </div>
        <div className="field">
          <label htmlFor="bot-label">Label</label>
          <input
            className="field-input min-h-11 w-full px-3 text-sm"
            id="bot-label"
            maxLength={80}
            onChange={(event) => onChange({ label: event.target.value })}
            value={bot.label}
          />
        </div>
        <div className="field">
          <label htmlFor="bot-desc">Description</label>
          <textarea
            className="field-input min-h-24 w-full px-3 py-2 text-sm"
            id="bot-desc"
            maxLength={500}
            onChange={(event) => onChange({ description: event.target.value })}
            value={bot.description}
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            <BellIcon className="size-4 text-ink-muted" />
            Notify
          </span>
          <input
            checked={bot.notify}
            onChange={(event) => onChange({ notify: event.target.checked })}
            type="checkbox"
          />
        </label>
        <div>
          <p className="text-[13px] font-medium text-ink">Routines</p>
          <p className="mt-1 text-sm text-ink-muted">No scheduler in v1. This list is a placeholder.</p>
          <ul className="mt-2 rounded-xl border border-border px-3 py-2 text-sm text-ink-faint">
            <li>No routines yet</li>
          </ul>
          <button
            className="btn btn-secondary mt-3 min-h-9 px-3 text-sm"
            onClick={() => {
              const note = document.getElementById("routine-stub");
              if (note) note.hidden = false;
            }}
            type="button"
          >
            Create routine
          </button>
          <p className="mt-2 text-xs text-ink-faint" hidden id="routine-stub">
            Routines stay stubbed until a scheduler exists.
          </p>
        </div>
      </div>
    </aside>
  );
}

function MenuFrame({
  children,
  onClose,
  x,
  y,
}: {
  children: React.ReactNode;
  onClose: () => void;
  x: number;
  y: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);
  const left = Math.min(x, typeof window === "undefined" ? x : window.innerWidth - 220);
  const top = Math.min(y, typeof window === "undefined" ? y : window.innerHeight - 320);
  return (
    <div className="menu-pop" ref={ref} role="menu" style={{ left, top }}>
      {children}
    </div>
  );
}
