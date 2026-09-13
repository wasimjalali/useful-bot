"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import type { ShellBot, ShellStore } from "../../shared/shell-store.ts";
import { CloseIcon } from "./icons";

export function BotSettingsPanel({
  bot,
  store,
  onClose,
  onCreateRoutine,
  onPatch,
  routineNotice = false,
}: {
  bot: ShellBot;
  store: ShellStore;
  onClose: () => void;
  onCreateRoutine: () => void;
  onPatch: (patch: Partial<Pick<ShellBot, "name" | "label" | "description" | "notify" | "memberIds">>) => void;
  routineNotice?: boolean;
}) {
  const [name, setName] = useState(bot.name);
  const [label, setLabel] = useState(bot.label);
  const [description, setDescription] = useState(bot.description);
  const members = store.bots.filter((item) => item.kind === "bot" && item.id !== bot.id && !item.hidden);

  useEffect(() => {
    setName(bot.name);
    setLabel(bot.label);
    setDescription(bot.description);
  }, [bot.id, bot.name, bot.label, bot.description]);

  function commitName() {
    const next = name.trim();
    if (!next) {
      setName(bot.name);
      return;
    }
    if (next !== bot.name) onPatch({ name: next });
  }
  function commitLabel() {
    const next = label.trim();
    if (next !== bot.label) onPatch({ label: next });
  }
  function commitDescription() {
    if (description !== bot.description) onPatch({ description });
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <aside className="settings-pane uv-scroll" aria-label={`${bot.name} settings`}>
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[15px] font-semibold">Bot settings</h2>
        <button aria-label="Close settings" className="icon-btn size-8" onClick={onClose} type="button">
          <CloseIcon className="size-4" />
        </button>
      </header>
      <div className="flex flex-col gap-4 px-4 pb-5">
        <div className="field">
          <label htmlFor="settings-name">Name</label>
          <input
            autoComplete="off"
            className="field-input min-h-10 w-full px-3 text-sm"
            id="settings-name"
            onBlur={commitName}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={blurOnEnter}
            value={name}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-label">Label</label>
          <input
            autoComplete="off"
            className="field-input min-h-10 w-full px-3 text-sm"
            id="settings-label"
            onBlur={commitLabel}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={blurOnEnter}
            value={label}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-description">Description</label>
          <textarea
            className="field-input min-h-24 w-full resize-none px-3 py-2 text-sm"
            id="settings-description"
            onBlur={commitDescription}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Notify</p>
            <p className="text-xs text-ink-muted">Local reminder flag. No push yet.</p>
          </div>
          <button
            aria-checked={bot.notify}
            className={bot.notify ? "switch switch-on" : "switch"}
            onClick={() => onPatch({ notify: !bot.notify })}
            role="switch"
            type="button"
          >
            <span className="switch-knob" />
          </button>
        </div>
        {bot.kind === "group" ? (
          <fieldset>
            <legend className="text-[13px] font-medium text-ink-muted">Members</legend>
            <div className="mt-2 space-y-1">
              {members.map((item) => {
                const checked = bot.memberIds.includes(item.id);
                return (
                  <label className="nav-item cursor-pointer text-sm" key={item.id}>
                    <input
                      checked={checked}
                      onChange={() => {
                        const memberIds = checked
                          ? bot.memberIds.filter((id) => id !== item.id)
                          : [...bot.memberIds, item.id];
                        onPatch({ memberIds });
                      }}
                      type="checkbox"
                    />
                    <span className="truncate">{item.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <section>
          <h3 className="text-[13px] font-medium text-ink-muted">Computer</h3>
          <div className="mt-2 rounded-xl border border-border px-3 py-3">
            <p className="text-sm text-ink-muted">
              Virtual computer preview is not in this build.
            </p>
            <button className="btn btn-secondary mt-3 min-h-9 px-3 text-sm" disabled type="button">
              Open computer
            </button>
          </div>
        </section>
        <section>
          <h3 className="text-[13px] font-medium text-ink-muted">Routines</h3>
          <div className="mt-2 rounded-xl border border-border px-3 py-3">
            <p className="text-sm text-ink-muted">No routines yet. Scheduler is not wired.</p>
            <button className="btn btn-secondary mt-3 min-h-9 px-3 text-sm" onClick={onCreateRoutine} type="button">
              Create routine
            </button>
            {routineNotice ? (
              <p className="mt-2 text-xs text-ink-muted">
                Create routine is stubbed until the scheduler API ships.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  );
}
