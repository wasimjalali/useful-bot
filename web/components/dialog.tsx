"use client";

import { useCallback, useEffect, useRef } from "react";
import { CloseIcon } from "./icons";

export function Dialog({
  ariaLabel,
  children,
  maxWidth = "max-w-lg",
  onClose,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  maxWidth?: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusTarget =
      panel?.querySelector<HTMLElement>("input:not([type='hidden']), textarea, select") ??
      panel?.querySelector<HTMLElement>("button:not([disabled])") ??
      panel;
    focusTarget?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled])',
        ),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const handleBackdrop = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="dialog-overlay" onMouseDown={handleBackdrop} role="presentation">
      <div
        aria-label={ariaLabel}
        aria-modal="true"
        className={`dialog-panel ${maxWidth}`}
        ref={panelRef}
        role="dialog"
      >
        <div className="flex justify-end p-2">
          <button
            aria-label={`Close ${ariaLabel}`}
            className="icon-btn size-8"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
