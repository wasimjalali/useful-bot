"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ATTACH_MAX_FILES, formatAttachedMessage } from "../../shared/attachments.ts";
import type { ComposerPublic, EffortId, SpeedId } from "../../shared/models.ts";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronIcon,
  CloseIcon,
  FolderIcon,
  McpIcon,
  PlusIcon,
  SendIcon,
  StopIcon,
} from "./icons";

const COMPACT_HEIGHT = 32;
const EXPANDED_MAX_HEIGHT = 160;

type Attached = { id: string; name: string; bytes: number; text?: string; preview?: string };
type Flyout = "effort" | "model" | null;
type MenuPoint = { left: number; top: number; right: number };

async function csrfHeaders(): Promise<Record<string, string>> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (!res.ok) throw new Error("unauthorized");
  const session = await res.json() as { csrfToken?: string };
  if (!session.csrfToken) throw new Error("Session failed");
  return { "x-ub-csrf": session.csrfToken };
}

async function loadComposer(): Promise<ComposerPublic | null> {
  const res = await fetch("/api/providers", { credentials: "include" });
  if (!res.ok) return null;
  const body = await res.json() as { composer?: ComposerPublic };
  return body.composer ?? null;
}

function chipLabel(composer: ComposerPublic | null): string {
  if (!composer) return "Model";
  return [composer.effortLabel, composer.speed === "fast" ? "Fast" : null].filter(Boolean).join(" ")
    || composer.modelLabel;
}

function ModeChip({
  chip,
  chipRef,
  onClick,
}: {
  chip: string;
  chipRef: RefObject<HTMLButtonElement | null>;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-label="Effort, speed, and model"
      className="composer-mode"
      onClick={onClick}
      ref={chipRef}
      type="button"
    >
      <span className="min-w-0 truncate">{chip}</span>
      <ChevronDownIcon className="size-3 shrink-0" />
    </button>
  );
}

function ComposerModeMenu({
  composer,
  onClose,
  onOpenProviders,
  onSave,
  point,
}: {
  composer: ComposerPublic;
  onClose: () => void;
  onOpenProviders?: () => void;
  onSave: (patch: { modelId?: string; effort?: EffortId | null; speed?: SpeedId }) => void;
  point: MenuPoint;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState({ left: point.left, top: Math.max(8, point.top - 148), reverse: false });
  const canFast = composer.speeds.some((item) => item.id === "fast");
  const models = composer.models.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return item.label.toLowerCase().includes(needle);
  });

  useLayoutEffect(() => {
    const card = cardRef.current;
    const fly = stackRef.current?.querySelector(".composer-mode-flyout") as HTMLElement | null;
    if (!card) return;
    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;
    const flyH = fly?.offsetHeight ?? 0;
    const stackH = Math.max(cardH, flyH);
    let left = point.left;
    let top = point.top - 8 - cardH;
    if (left + cardW > window.innerWidth - 8) left = window.innerWidth - cardW - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + stackH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - stackH - 8);
    const reverse = left + cardW + 266 > window.innerWidth && left > 266;
    setPos({ left, top, reverse });
  }, [flyout, point.left, point.top, query]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (flyout) setFlyout(null);
      else onClose();
    }
    function onPointer(event: globalThis.MouseEvent) {
      if (stackRef.current && !stackRef.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [flyout, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={pos.reverse ? "composer-mode-stack composer-mode-stack-left" : "composer-mode-stack"}
      ref={stackRef}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="composer-mode-card" ref={cardRef}>
        {canFast ? (
          <button
            aria-pressed={composer.speed === "fast"}
            className="composer-mode-row"
            onClick={() => onSave({ speed: composer.speed === "fast" ? "standard" : "fast" })}
            type="button"
          >
            <span>Fast</span>
            <span aria-hidden="true" className={composer.speed === "fast" ? "switch switch-on" : "switch"}>
              <span className="switch-knob" />
            </span>
          </button>
        ) : null}
        {composer.efforts.length > 0 ? (
          <button
            aria-expanded={flyout === "effort"}
            className={flyout === "effort" ? "composer-mode-row composer-mode-row-on" : "composer-mode-row"}
            onClick={() => setFlyout((current) => (current === "effort" ? null : "effort"))}
            type="button"
          >
            <span>Effort</span>
            <span className="composer-mode-value">
              {composer.effortLabel}
              <ChevronIcon className="size-3.5" />
            </span>
          </button>
        ) : null}
        <div className="composer-mode-rule" />
        <button
          aria-expanded={flyout === "model"}
          className={flyout === "model" ? "composer-mode-row composer-mode-row-on" : "composer-mode-row"}
          onClick={() => setFlyout((current) => (current === "model" ? null : "model"))}
          type="button"
        >
          <span>Model</span>
          <span className="composer-mode-value">
            {composer.modelLabel}
            <ChevronIcon className="size-3.5" />
          </span>
        </button>
      </div>

      {flyout === "effort" ? (
        <div className="composer-mode-flyout">
          {composer.efforts.map((item) => (
            <button
              className={composer.effort === item.id ? "composer-mode-row composer-mode-row-on" : "composer-mode-row"}
              key={item.id}
              onClick={() => onSave({ effort: item.id })}
              type="button"
            >
              <span className="min-w-0 flex-1 text-left">{item.label}</span>
              {composer.effort === item.id ? <CheckIcon className="size-3.5 shrink-0 text-ink-muted" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {flyout === "model" ? (
        <div className="composer-mode-flyout">
          <label className="composer-mode-search">
            <span className="sr-only">Search models</span>
            <input
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
              type="search"
              value={query}
            />
          </label>
          <div className="composer-mode-flyout-body uv-scroll">
            {models.length === 0 ? (
              <p className="composer-mode-empty">No models match</p>
            ) : models.map((item) => {
              const selected = composer.modelId === item.id;
              const meta = [selected ? composer.effortLabel : null, composer.speed === "fast" ? "Fast" : null]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  className={selected ? "composer-mode-row composer-mode-row-on" : "composer-mode-row"}
                  key={item.id}
                  onClick={() => onSave({ modelId: item.id })}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {item.label}
                    {selected && meta ? ` ${meta}` : ""}
                  </span>
                  {selected ? <CheckIcon className="size-3.5 shrink-0 text-ink-muted" /> : null}
                </button>
              );
            })}
          </div>
          <button
            className="composer-mode-row composer-mode-add"
            onClick={() => {
              onClose();
              onOpenProviders?.();
            }}
            type="button"
          >
            Add models
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export function ChatComposer({
  disabled,
  onChange,
  onOpenConnectors,
  onOpenProviders,
  onSend,
  onStop,
  pending,
  placeholder = "Message Useful Bot",
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  onOpenConnectors?: () => void;
  onOpenProviders?: () => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  pending: boolean;
  placeholder?: string;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const filesRef = useRef<Attached[]>([]);
  const [boxHeight, setBoxHeight] = useState(COMPACT_HEIGHT);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modePoint, setModePoint] = useState<MenuPoint | null>(null);
  const [files, setFiles] = useState<Attached[]>([]);
  const [attachError, setAttachError] = useState("");
  const [composer, setComposer] = useState<ComposerPublic | null>(null);
  filesRef.current = files;
  const stacked = files.length > 0;
  const tall = boxHeight > COMPACT_HEIGHT + 10;
  const canScroll = boxHeight >= EXPANDED_MAX_HEIGHT;
  const composed = formatAttachedMessage(value, files);
  const canSend = Boolean(composed);
  const chip = chipLabel(composer);
  const shell = [
    "composer",
    stacked ? "composer-stack" : "",
    tall && !stacked ? "composer-expanded" : "",
  ].filter(Boolean).join(" ");

  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "0px";
    const next = Math.min(Math.max(field.scrollHeight, COMPACT_HEIGHT), EXPANDED_MAX_HEIGHT);
    field.style.height = `${next}px`;
    setBoxHeight(next);
  }, [value, stacked]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const next = await loadComposer();
      if (!cancelled && next) setComposer(next);
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const file of filesRef.current) {
        if (file.preview) URL.revokeObjectURL(file.preview);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!modePoint) return;
    const node = chipRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (
      Math.abs(rect.left - modePoint.left) < 1
      && Math.abs(rect.top - modePoint.top) < 1
      && Math.abs(rect.right - modePoint.right) < 1
    ) return;
    setModePoint({ left: rect.left, top: rect.top, right: rect.right });
  }, [modePoint, stacked]);

  useEffect(() => {
    if (!plusOpen) return;
    function onPointer(event: globalThis.MouseEvent) {
      const target = event.target as Node;
      if (plusRef.current?.contains(target)) return;
      const menu = document.querySelector(".composer-plus-menu");
      if (menu?.contains(target)) return;
      setPlusOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [plusOpen]);

  function submit() {
    if (disabled || pending || !composed) return;
    onSend(composed);
    onChange("");
    for (const file of files) {
      if (file.preview) URL.revokeObjectURL(file.preview);
    }
    setFiles([]);
    setAttachError("");
    setModePoint(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  async function saveComposer(patch: { modelId?: string; effort?: EffortId | null; speed?: SpeedId }) {
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json", ...(await csrfHeaders()) },
        body: JSON.stringify(patch),
      });
      const body = await res.json() as { composer?: ComposerPublic };
      if (res.ok && body.composer) setComposer(body.composer);
    } catch {
      /* keep last */
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setAttachError("");
    const room = ATTACH_MAX_FILES - files.length;
    const incoming = Array.from(list).slice(0, room);
    try {
      const csrf = await csrfHeaders();
      const next: Attached[] = [];
      for (const file of incoming) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/attachments", {
          method: "POST",
          credentials: "include",
          headers: csrf,
          body,
        });
        const json = await res.json() as { ok?: boolean; name?: string; bytes?: number; text?: string; error?: string };
        if (!res.ok || !json.name || typeof json.bytes !== "number") {
          throw new Error(json.error ?? "Attach failed");
        }
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: json.name,
          bytes: json.bytes,
          text: json.text,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      }
      setFiles((current) => [...current, ...next].slice(0, ATTACH_MAX_FILES));
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Attach failed");
    }
  }

  function openMode(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPlusOpen(false);
    setModePoint({ left: rect.left, top: rect.top, right: rect.right });
    void loadComposer().then((next) => {
      if (next) setComposer(next);
    });
  }

  function removeFile(id: string) {
    setFiles((current) => {
      const found = current.find((item) => item.id === id);
      if (found?.preview) URL.revokeObjectURL(found.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  const modeChip = <ModeChip chip={chip} chipRef={chipRef} onClick={openMode} />;
  const sendButton = pending && onStop ? (
    <button aria-label="Stop" className="composer-send" onClick={onStop} type="button">
      <StopIcon className="size-4" />
    </button>
  ) : (
    <button
      aria-label="Send"
      className="composer-send"
      disabled={disabled || pending || !canSend}
      type="submit"
    >
      <SendIcon className="size-4" />
    </button>
  );
  const textarea = (
    <textarea
      className={[
        "composer-input uv-scroll",
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
  );

  return (
    <div className="composer-wrap">
      {attachError ? <p className="composer-attach-error">{attachError}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className={shell}>
          <input
            className="hidden"
            multiple
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
            ref={fileRef}
            type="file"
          />
          {stacked ? (
            <div className="composer-thumbs">
              {files.map((file) => (
                file.preview ? (
                  <span className="composer-thumb" key={file.id}>
                    <img alt={file.name} src={file.preview} />
                    <button
                      aria-label={`Remove ${file.name}`}
                      className="composer-thumb-x"
                      onClick={() => removeFile(file.id)}
                      type="button"
                    >
                      <CloseIcon className="size-3" />
                    </button>
                  </span>
                ) : (
                  <span className="composer-file" key={file.id}>
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      aria-label={`Remove ${file.name}`}
                      className="grid size-5 place-items-center rounded-full text-ink-muted"
                      onClick={() => removeFile(file.id)}
                      type="button"
                    >
                      <CloseIcon className="size-3" />
                    </button>
                  </span>
                )
              ))}
            </div>
          ) : null}
          {stacked ? textarea : null}
          <div className="composer-row">
            <button
              aria-expanded={plusOpen}
              aria-label="Attach a file or open connectors"
              className="composer-plus"
              onClick={() => {
                setModePoint(null);
                setPlusOpen((open) => !open);
              }}
              ref={plusRef}
              type="button"
            >
              <PlusIcon className="size-4" />
            </button>
            {stacked ? modeChip : null}
            <label className="sr-only" htmlFor="chat-question">
              Message
            </label>
            {stacked ? null : textarea}
            <div className="composer-trail">
              {stacked ? null : modeChip}
              {sendButton}
            </div>
          </div>
        </div>
      </form>

      {plusOpen ? (
        <div className="composer-plus-menu">
          <div className="composer-plus-body">
            <button
              className="composer-plus-item"
              onClick={() => {
                setPlusOpen(false);
                fileRef.current?.click();
              }}
              type="button"
            >
              <FolderIcon className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 text-left">
                <span className="block text-[13px] font-medium">Attach file</span>
                <span className="block text-[12px] text-ink-muted">Add a file to this message</span>
              </span>
            </button>
            <button
              className="composer-plus-item"
              onClick={() => {
                setPlusOpen(false);
                onOpenConnectors?.();
              }}
              type="button"
            >
              <McpIcon className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 text-left">
                <span className="block text-[13px] font-medium">Connectors</span>
                <span className="block text-[12px] text-ink-muted">MCPs and connected tools</span>
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {modePoint && composer ? (
        <ComposerModeMenu
          composer={composer}
          onClose={() => setModePoint(null)}
          onOpenProviders={onOpenProviders}
          onSave={(patch) => void saveComposer(patch)}
          point={modePoint}
        />
      ) : null}
    </div>
  );
}
