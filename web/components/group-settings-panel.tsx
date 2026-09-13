"use client";

import { useEffect, useState } from "react";
import type { BotProfilePatch, ShellBot, ShellStore } from "../../shared/shell-store.ts";
import { GROUP_MAX_MEMBERS, GROUP_MIN_MEMBERS, DEFAULT_BOT_ID } from "../../shared/shell-store.ts";
import { BotAvatar } from "./bot-avatar";
import { BotFacePicker } from "./bot-face-picker";
import { CloseIcon, TrashIcon } from "./icons";

/**
 * Group chat pane: rename, members, standing instructions. Member bots are
 * picked from the real 1:1 bots; the default Useful Bot is excluded because it
 * answers untargeted group turns as the orchestrator.
 */
export function GroupSettingsPanel({
  group,
  store,
  onClose,
  onPatch,
  onDeleteRequest,
}: {
  group: ShellBot;
  store: ShellStore;
  onClose: () => void;
  onPatch: (patch: BotProfilePatch) => void;
  onDeleteRequest: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setName(group.name);
    setDescription(group.description);
  }, [group.id, group.name, group.description]);

  const candidates = store.bots.filter((bot) => (
    bot.kind === "bot" && bot.id !== DEFAULT_BOT_ID && !bot.hidden
  ));
  const members = group.memberIds;

  function toggle(id: string) {
    setNotice("");
    if (members.includes(id)) {
      if (members.length <= GROUP_MIN_MEMBERS) {
        setNotice(`A group needs at least ${GROUP_MIN_MEMBERS} bots.`);
        return;
      }
      onPatch({ memberIds: members.filter((item) => item !== id) });
      return;
    }
    if (members.length >= GROUP_MAX_MEMBERS) {
      setNotice(`A group holds at most ${GROUP_MAX_MEMBERS} bots.`);
      return;
    }
    onPatch({ memberIds: [...members, id] });
  }

  function commitName() {
    const next = name.trim();
    if (!next) {
      setName(group.name);
      return;
    }
    if (next !== group.name) onPatch({ name: next });
  }

  function commitDescription() {
    if (description !== group.description) onPatch({ description });
  }

  return (
    <aside className="settings-pane uv-scroll" aria-label={`${group.name} settings`}>
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[15px] font-semibold">Group</h2>
        <button aria-label="Close settings" className="icon-btn size-8" onClick={onClose} type="button">
          <CloseIcon className="size-4" />
        </button>
      </header>
      <div className="flex flex-col gap-4 px-4 pb-5">
        <BotFacePicker bot={group} onPatch={onPatch} />
        <div className="field">
          <label htmlFor="group-settings-name">Name</label>
          <input
            autoComplete="off"
            className="field-input min-h-10 w-full px-3 text-sm"
            id="group-settings-name"
            onBlur={commitName}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            value={name}
          />
        </div>
        <div className="field">
          <label htmlFor="group-settings-description">Instructions</label>
          <textarea
            className="field-input min-h-20 w-full resize-none px-3 py-2 text-sm"
            id="group-settings-description"
            onBlur={commitDescription}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="How this room should run"
            value={description}
          />
        </div>

        <section>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-medium text-ink-muted">Members</h3>
            <span className="text-[11px] text-ink-faint">{members.length}/{GROUP_MAX_MEMBERS}</span>
          </div>
          <div className="mt-2 space-y-1">
            {candidates.map((bot) => {
              const active = members.includes(bot.id);
              return (
                <button
                  aria-pressed={active}
                  className={active ? "member-row member-row-on" : "member-row"}
                  key={bot.id}
                  onClick={() => toggle(bot.id)}
                  type="button"
                >
                  <BotAvatar bot={bot} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-left text-[13px]">{bot.name}</span>
                  <span className="text-[11px] text-ink-faint">{active ? "In group" : "Add"}</span>
                </button>
              );
            })}
            {candidates.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Create another bot first. A group needs two member bots.</p>
            ) : null}
          </div>
          <p className="mt-2 text-[12px] leading-5 text-ink-muted">
            Use @name in the composer to direct a turn at one member. Untargeted messages go to the orchestrator.
          </p>
          {notice ? <p className="mt-1.5 text-[12px] text-warning">{notice}</p> : null}
        </section>

        <button className="btn btn-danger min-h-9 px-3 text-sm" onClick={onDeleteRequest} type="button">
          <TrashIcon className="size-3.5" />
          Delete group
        </button>
      </div>
    </aside>
  );
}
