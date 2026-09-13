"use client";

import { useMemo, useState } from "react";
import type { ShellBot } from "../../shared/shell-store.ts";
import { Dialog } from "./dialog";

export function CreateBotDialog({
  onClose,
  onSubmit,
  sectionName,
}: {
  onClose: () => void;
  onSubmit: (input: { name: string; label: string; description: string }) => void;
  sectionName?: string;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog ariaLabel="Create bot" maxWidth="max-w-md" onClose={onClose}>
      <form
        className="px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onSubmit({ name: name.trim(), label: label.trim(), description: description.trim() });
        }}
      >
        <h2 className="text-base font-semibold">Create bot</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {sectionName ? `Added to ${sectionName}.` : "Lands in Unassigned until you move it."}
        </p>
        <div className="mt-4 grid gap-3">
          <div className="field">
            <label htmlFor="bot-name">Name</label>
            <input
              autoComplete="off"
              className="field-input min-h-10 w-full px-3 text-sm"
              id="bot-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="field">
            <label htmlFor="bot-label">Label</label>
            <input
              autoComplete="off"
              className="field-input min-h-10 w-full px-3 text-sm"
              id="bot-label"
              onChange={(event) => setLabel(event.target.value)}
              placeholder="CEO, research, home"
              value={label}
            />
          </div>
          <div className="field">
            <label htmlFor="bot-description">Description</label>
            <textarea
              className="field-input min-h-20 w-full resize-none px-3 py-2 text-sm"
              id="bot-description"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary min-h-9 px-3 text-sm" disabled={!name.trim()} type="submit">
            Create bot
          </button>
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
  onSubmit: (input: { name: string; memberIds: string[] }) => void;
}) {
  const candidates = useMemo(() => bots.filter((bot) => bot.kind === "bot" && !bot.hidden), [bots]);
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  function toggle(id: string) {
    setMemberIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }
  return (
    <Dialog ariaLabel="Create group chat" maxWidth="max-w-md" onClose={onClose}>
      <form
        className="px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onSubmit({ name: name.trim(), memberIds });
        }}
      >
        <h2 className="text-base font-semibold">Create group chat</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Local group label. Replies still stream from the Useful Bot agent.
        </p>
        <div className="field mt-4">
          <label htmlFor="group-name">Name</label>
          <input
            autoComplete="off"
            className="field-input min-h-10 w-full px-3 text-sm"
            id="group-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        <fieldset className="mt-4">
          <legend className="text-[13px] font-medium text-ink-muted">Members</legend>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto uv-scroll">
            {candidates.map((bot) => (
              <label className="nav-item cursor-pointer text-sm" key={bot.id}>
                <input
                  checked={memberIds.includes(bot.id)}
                  onChange={() => toggle(bot.id)}
                  type="checkbox"
                />
                <span className="truncate">{bot.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary min-h-9 px-3 text-sm" disabled={!name.trim()} type="submit">
            Create group
          </button>
        </div>
      </form>
    </Dialog>
  );
}
