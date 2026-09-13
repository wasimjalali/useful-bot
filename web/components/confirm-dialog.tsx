"use client";

import { useState } from "react";
import { Dialog } from "./dialog";

export function ConfirmDialog({
  confirmLabel = "Delete",
  danger = true,
  message,
  onClose,
  onConfirm,
  title,
}: {
  confirmLabel?: string;
  danger?: boolean;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <Dialog ariaLabel={title} maxWidth="max-w-sm" onClose={onClose}>
      <div className="px-5 pb-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={danger ? "btn btn-danger min-h-9 px-3 text-sm" : "btn btn-primary min-h-9 px-3 text-sm"}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function PromptDialog({
  initial = "",
  label,
  onClose,
  onSubmit,
  placeholder,
  submitLabel = "Save",
  title,
}: {
  initial?: string;
  label: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  submitLabel?: string;
  title: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Dialog ariaLabel={title} maxWidth="max-w-sm" onClose={onClose}>
      <form
        className="px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          if (!next) return;
          onSubmit(next);
        }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="field mt-4">
          <label htmlFor="prompt-field">{label}</label>
          <input
            autoComplete="off"
            className="field-input min-h-10 w-full px-3 text-sm"
            id="prompt-field"
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            value={value}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary min-h-9 px-3 text-sm" disabled={!value.trim()} type="submit">
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
