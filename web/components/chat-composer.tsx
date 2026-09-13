"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { SendIcon, StopIcon } from "./icons";

const COMPACT_HEIGHT = 40;
const EXPANDED_MAX_HEIGHT = 192;

export function ChatComposer({
  disabled,
  onChange,
  onSend,
  onStop,
  pending,
  placeholder = "Ask Useful Bot",
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  pending: boolean;
  placeholder?: string;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [boxHeight, setBoxHeight] = useState(COMPACT_HEIGHT);
  const expanded = boxHeight > COMPACT_HEIGHT + 8;
  const canScroll = boxHeight >= EXPANDED_MAX_HEIGHT;

  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "0px";
    const next = Math.min(Math.max(field.scrollHeight, COMPACT_HEIGHT), EXPANDED_MAX_HEIGHT);
    field.style.height = `${next}px`;
    setBoxHeight(next);
  }, [value]);

  function submit() {
    if (disabled || pending || !value.trim()) return;
    onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="px-4 pb-3 pt-2 sm:px-6 sm:pb-6">
      <form
        className="mx-auto w-full max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className={[
            "field-input bg-surface shadow-raise",
            expanded
              ? "flex flex-col rounded-2xl px-2 pb-2 pt-1"
              : "flex items-center gap-1.5 rounded-full py-0 pl-2.5 pr-1",
          ].join(" ")}
        >
          <label className="sr-only" htmlFor="chat-question">
            Message
          </label>
          <textarea
            className={[
              "uv-scroll min-h-[40px] w-full resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-ink-faint focus:outline-none focus-visible:outline-none disabled:text-ink-faint",
              canScroll ? "overflow-y-auto" : "overflow-hidden",
            ].join(" ")}
            disabled={disabled}
            id="chat-question"
            maxLength={2000}
            name="message"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            ref={textareaRef}
            rows={1}
            value={value}
          />
          <div
            className={
              expanded
                ? "flex justify-end px-1"
                : "grid size-10 shrink-0 place-items-center"
            }
          >
            {pending && onStop ? (
              <button
                aria-label="Stop"
                className="btn btn-secondary size-9 shrink-0 rounded-full p-0"
                disabled={false}
                onClick={onStop}
                type="button"
              >
                <StopIcon className="size-4" />
              </button>
            ) : (
              <button
                aria-label="Send"
                className="btn btn-primary size-9 shrink-0 rounded-full p-0"
                disabled={disabled || pending || !value.trim()}
                type="submit"
              >
                <SendIcon className="size-4" />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
