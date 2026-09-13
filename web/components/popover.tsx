"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type MenuPoint = { x: number; y: number };

export function Popover({
  onClose,
  placement = "below",
  point,
  width = 220,
  children,
}: {
  onClose: () => void;
  placement?: "above" | "below";
  point: MenuPoint;
  width?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = Math.max(8, Math.min(point.x, window.innerWidth - rect.width - 8));
    const y = placement === "above"
      ? Math.max(8, point.y - rect.height - 8)
      : Math.max(8, Math.min(point.y, window.innerHeight - rect.height - 8));
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  }, [placement, point.x, point.y]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pop-menu"
      ref={ref}
      role="menu"
      style={{ left: point.x, top: point.y, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({
  danger,
  disabled,
  onClick,
  children,
}: {
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={["pop-item", danger ? "pop-item-danger" : "", disabled ? "opacity-50" : ""].join(" ")}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {children}
    </button>
  );
}
