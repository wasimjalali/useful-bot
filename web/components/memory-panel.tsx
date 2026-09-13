"use client";

import { MenuIcon } from "./icons";

type MemoryNote = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
  truncated: boolean;
};

export function MemoryPanel({
  notes,
  onOpenRail,
}: {
  notes: MemoryNote[] | null;
  onOpenRail: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 px-4 py-3 sm:px-6">
        <button aria-label="Open rail" className="icon-btn size-8 lg:hidden" onClick={onOpenRail} type="button">
          <MenuIcon className="size-4" />
        </button>
        <h1 className="text-[15px] font-semibold">Memory</h1>
      </header>
      <div className="uv-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          {notes === null ? (
            <div className="empty-state rise">
              <h2 className="text-lg font-semibold">Loading notes</h2>
              <p>Reading desktop memory on this Mac.</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="empty-state rise">
              <h2 className="text-lg font-semibold">Nothing remembered yet</h2>
              <p>
                Ask Useful Bot to remember a preference. You will approve the note here, then it
                lands in this list. Notes stay on this Mac.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {notes.map((note) => (
                <article className="memory-note rise" key={note.id}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{note.title}</h2>
                    <time className="shrink-0 text-[12px] text-ink-faint" dateTime={note.updatedAt}>
                      {note.updatedAt.slice(0, 10)}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-ink-muted">
                    {note.body}
                    {note.truncated ? "..." : ""}
                  </p>
                  {note.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {note.tags.map((tag) => (
                        <span className="status-label status-neutral" key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
