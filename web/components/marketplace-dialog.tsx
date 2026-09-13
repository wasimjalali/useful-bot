"use client";

import { CloseIcon } from "./icons";

export function ConnectorsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div aria-label="Connectors" aria-modal="true" className="market-modal" role="dialog">
        <header className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-[15px] font-semibold">Connectors</h2>
          <button aria-label="Close connectors" className="icon-btn size-8" onClick={onClose} type="button">
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="px-5 py-8 text-sm text-ink-muted">
          No connectors yet. MCP servers you add will show here.
        </div>
      </div>
    </div>
  );
}

export { ConnectorsDialog as MarketplaceDialog };
