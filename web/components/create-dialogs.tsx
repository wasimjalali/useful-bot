"use client";

import { useMemo, useState } from "react";
import { DEFAULT_BOT_ID, GROUP_MAX_MEMBERS, type ShellBot } from "../../shared/shell-store.ts";
import { Dialog } from "./dialog";

export function CreateBotDialog({
  onClose,
  onSubmit,
  sectionName,
}: {
  onClose: () => void;
  onSubmit: (input: { name: string; petname: string; label: string; description: string }) => void;
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
          onSubmit({
            name: name.trim(),
            petname: name.trim(),
            label: label.trim(),
            description: description.trim(),
          });
        }}
      >
        <h2 className="text-base font-semibold">Create bot</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {sectionName ? `Added to ${sectionName}. ` : "Lands in Unassigned until you move it. "}
          Leave the name blank-ish if you want the bot to ask what it should be: you can confirm the real name in chat.
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
  const candidates = useMemo(() => bots.filter((bot) => (
    bot.kind === "bot" && !bot.hidden && bot.id !== DEFAULT_BOT_ID
  )), [bots]);
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  function toggle(id: string) {
    setMemberIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= GROUP_MAX_MEMBERS) return current;
      return [...current, id];
    });
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
          Pick 2 to 6 bots. Untargeted messages go to Useful Bot as orchestrator; @name directs one member.
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
          <legend className="text-[13px] font-medium text-ink-muted">
            Members {memberIds.length}/6
          </legend>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto uv-scroll">
            {candidates.length === 0 ? (
              <p className="px-1 py-1 text-[13px] text-ink-muted">
                Create a second bot first, then this group can hold both.
              </p>
            ) : null}
            {candidates.map((bot) => (
              <label className="nav-item cursor-pointer text-sm" key={bot.id}>
                <input
                  checked={memberIds.includes(bot.id)}
                  disabled={!memberIds.includes(bot.id) && memberIds.length >= GROUP_MAX_MEMBERS}
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
          <button
            className="btn btn-primary min-h-9 px-3 text-sm"
            disabled={!name.trim() || memberIds.length < 2}
            type="submit"
          >
            Create group
          </button>
        </div>
      </form>
    </Dialog>
  );
}
