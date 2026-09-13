"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import type { BotProfilePatch, ShellBot } from "../../shared/shell-store.ts";
import { BotFacePicker } from "./bot-face-picker";
import { CloseIcon } from "./icons";

type MemoryNote = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
  truncated: boolean;
};

export function BotSettingsPanel({
  bot,
  onClose,
  onCreateRoutine,
  onPatch,
  routineNotice = false,
}: {
  bot: ShellBot;
  onClose: () => void;
  onCreateRoutine: () => void;
  onPatch: (patch: BotProfilePatch) => void;
  routineNotice?: boolean;
}) {
  const [name, setName] = useState(bot.name);
  const [label, setLabel] = useState(bot.label);
  const [description, setDescription] = useState(bot.description);
  const [notes, setNotes] = useState<MemoryNote[] | null>(null);

  useEffect(() => {
    setName(bot.name);
    setLabel(bot.label);
    setDescription(bot.description);
  }, [bot.id, bot.name, bot.label, bot.description]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/memory?botId=${encodeURIComponent(bot.id)}`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const body = await res.json() as { notes?: MemoryNote[] };
        setNotes(body.notes ?? []);
      } catch {
        if (!cancelled) setNotes([]);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bot.id]);

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
        <h2 className="text-[15px] font-semibold">Settings</h2>
        <button aria-label="Close settings" className="icon-btn size-8" onClick={onClose} type="button">
          <CloseIcon className="size-4" />
        </button>
      </header>
      <div className="flex flex-col gap-4 px-4 pb-5">
        <BotFacePicker bot={bot} onPatch={onPatch} />
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
          <label htmlFor="settings-label">Label (optional)</label>
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
            <p className="text-sm font-medium">Notifications</p>
            <p className="text-xs text-ink-muted">Get notified when this bot finishes.</p>
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
        <section>
          <h3 className="text-[13px] font-medium text-ink-muted">Memory</h3>
          <p className="mt-1 text-xs text-ink-muted">Notes for this bot only. Other bots cannot read them.</p>
          <div className="mt-2 space-y-2">
            {notes === null ? (
              <p className="text-sm text-ink-muted">Loading notes.</p>
            ) : notes.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing remembered for {bot.name} yet.</p>
            ) : (
              notes.map((note) => (
                <article className="memory-note" key={note.id}>
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-[13px] font-semibold">{note.title}</h4>
                    <time className="shrink-0 text-[11px] text-ink-faint" dateTime={note.updatedAt}>
                      {note.updatedAt.slice(0, 10)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-ink-muted">
                    {note.body}
                    {note.truncated ? "..." : ""}
                  </p>
                </article>
              ))
            )}
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
