"use client";

import { useEffect, useRef } from "react";

/** Trap modal keyboard focus, support Escape, and restore the opener on close. */
export function useDialogFocus(open: boolean, onClose: () => void, blocked: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, blocked });
  latest.current = { onClose, blocked };

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = container.current;
    if (!root) return;
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    ));
    (focusables()[0] ?? root).focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!latest.current.blocked) latest.current.onClose();
      }
      if (event.key !== "Tab") return;
      const elements = focusables();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        root.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", handleKey);
    return () => {
      root.removeEventListener("keydown", handleKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return container;
}
