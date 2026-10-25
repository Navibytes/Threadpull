"use client";

import type { RefObject } from "react";

export type PanelId = "drawer" | "evidence" | "notebook";

// The room's destinations. A panel tab opens a side panel over the board; the board is this page; a
// destination that is not built yet is listed honestly and takes no action.
export const ROOM_TABS = [
  { id: "drawer", label: "Filing drawer", kind: "panel" },
  { id: "board", label: "Investigation board", kind: "page" },
  { id: "evidence", label: "Checks & evidence", kind: "panel" },
  { id: "notebook", label: "Hazel's notebook", kind: "panel" },
  { id: "cro", label: "CRO brief", kind: "unbuilt" },
] as const;

export type RoomTab = (typeof ROOM_TABS)[number];

export function RoomNav({
  isOpen,
  onToggle,
  onBoard,
  panelIds,
  tabRefs,
}: {
  isOpen: (id: PanelId) => boolean;
  onToggle: (id: PanelId) => void;
  onBoard: () => void;
  panelIds: Record<PanelId, string>;
  tabRefs: RefObject<Partial<Record<PanelId, HTMLButtonElement | null>>>;
}) {
  return (
    <nav aria-label="Investigation room" className="flex min-w-0 flex-1 flex-wrap items-end justify-center gap-1.5">
      {ROOM_TABS.map((tab) => {
        const base = "paper-tab px-3.5 pb-2 pt-2.5 text-[13px] font-semibold tracking-[0.02em] transition-transform duration-150";
        if (tab.kind === "unbuilt")
          return (
            // plain text, not a control: nothing to click yet
            <span key={tab.id} data-unbuilt="" className={base}>
              {tab.label} <span className="font-normal">· not built yet</span>
            </span>
          );
        if (tab.kind === "page")
          return (
            <button key={tab.id} type="button" aria-current="page" onClick={onBoard} className={`${base} focus-visible:outline-2 focus-visible:outline-amber`}>
              {tab.label}
            </button>
          );
        const id = tab.id as PanelId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            aria-expanded={isOpen(id)}
            aria-controls={panelIds[id]}
            onClick={() => onToggle(id)}
            className={`${base} hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-amber`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
