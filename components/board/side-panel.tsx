"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A side panel that slides over the board from one edge of the room. Not modal: the board stays usable
// beside it. Opened from a tab it takes focus (its heading); opened by selecting something on the board it
// leaves focus there. It closes with its button or Esc; the caller returns focus to whatever opened it.
// `bottomClear` stops it above the board's lower-right controls so they stay reachable.
export function SidePanel({
  id,
  side,
  title,
  open,
  onClose,
  focusOnOpen = true,
  bottomClear = false,
  children,
}: {
  id: string;
  side: "left" | "right";
  title: string;
  open: boolean;
  onClose: () => void;
  focusOnOpen?: boolean;
  bottomClear?: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open && focusOnOpen) heading.current?.focus();
  }, [open, focusOnOpen]);

  return (
    <aside
      id={id}
      aria-labelledby={`${id}-title`}
      hidden={!open}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className={`side-panel absolute top-0 z-40 flex w-[min(360px,calc(100%-24px))] flex-col rounded-md ${
        side === "left" ? "left-0" : "right-0"
      } ${bottomClear ? "bottom-[var(--controls-clear,112px)]" : "bottom-0"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-walnut/15 px-4 pb-2 pt-3">
        <h2 ref={heading} id={`${id}-title`} tabIndex={-1} className="font-display text-lg font-semibold outline-none">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="min-h-9 rounded-[3px] border border-walnut/25 px-2.5 text-[13px] font-medium hover:bg-walnut/10 focus-visible:outline-2 focus-visible:outline-amber"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
