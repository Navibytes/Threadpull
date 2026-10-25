"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";

export type PanelId = "drawer" | "evidence" | "notebook";

// The room's destinations, as paper tabs hung on the board's frame. A panel tab opens one side panel over the
// board; Board is this page with every panel closed; a destination that is not built yet is listed honestly and
// takes no action. `label` is the short word on the tab; `name` is the full accessible name.
export const ROOM_TABS = [
  { id: "drawer", label: "Files", name: "Filing drawer", kind: "panel" },
  { id: "board", label: "Board", name: "Investigation board", kind: "page" },
  { id: "evidence", label: "Evidence", name: "Checks and evidence", kind: "panel" },
  { id: "notebook", label: "Notes", name: "Hazel's notebook", kind: "panel" },
  { id: "cro", label: "Brief", name: "CRO brief, not built yet", kind: "unbuilt" },
] as const;

export type RoomTab = (typeof ROOM_TABS)[number];

// Small ink drawings, a little uneven on purpose. Decorative: the tab's text carries the name.
const ICONS: Record<RoomTab["id"], ReactNode> = {
  drawer: <path d="M3.6 7.6c0-1 .6-1.7 1.6-1.7h4l1.9 2.1h7.7c1 0 1.6.6 1.6 1.6v7.5c0 1-.6 1.7-1.6 1.7H5.2c-1 0-1.6-.7-1.6-1.7z" />,
  board: (
    <>
      <circle cx="6" cy="7" r="2.1" />
      <circle cx="18" cy="8.2" r="2.1" />
      <circle cx="11" cy="18" r="2.1" />
      <path d="M8.1 7.4l7.8.6M7 9l3 7M17.2 10l-4.9 6.4" />
    </>
  ),
  evidence: (
    <>
      <circle cx="10.4" cy="10.6" r="5.5" />
      <path d="M14.5 14.8l5.2 5" />
    </>
  ),
  notebook: <path d="M6 4h11c1 0 1.5.5 1.5 1.5v13c0 1-.5 1.5-1.5 1.5H6zM9.2 4v16M12 9h4M12 12.5h4" />,
  cro: <path d="M7 3.6h7l4 4V19c0 1-.5 1.5-1.5 1.5H7c-1 0-1.5-.5-1.5-1.5V5c0-1 .5-1.5 1.5-1.4zM14 3.6v4h4M9 12h6M9 15.5h6" />,
};

function Icon({ id }: { id: RoomTab["id"] }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-85">
      {ICONS[id]}
    </svg>
  );
}

// Each tab is a layered sheet: a back sheet peeking out (the wrapper's ::before) and the tab itself, with a
// slightly different tilt and edge. Fixed per tab, so nothing shifts between renders.
const SHEET = [
  { tilt: -0.9, kraft: true },
  { tilt: 0.5, kraft: false },
  { tilt: -0.4, kraft: true },
  { tilt: 0.8, kraft: false },
  { tilt: -0.6, kraft: true },
] as const;

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
  const anyOpen = isOpen("drawer") || isOpen("evidence") || isOpen("notebook");
  return (
    <nav aria-label="Investigation room" className="room-tabs relative z-30 -mb-7 flex min-w-0 items-end justify-center gap-1 sm:gap-1.5">
      {ROOM_TABS.map((tab, i) => {
        const sheet = SHEET[i];
        const active = tab.kind === "page" ? !anyOpen : tab.kind === "panel" && isOpen(tab.id);
        const text = (
          <>
            <Icon id={tab.id} />
            {/* the short word on the tab; below 900px the icon stands alone and the full name stays readable to assistive tech */}
            <span aria-hidden className="tab-word max-[900px]:hidden">
              {tab.label}
            </span>
            <span className="sr-only">{tab.name}</span>
          </>
        );
        const cls = `paper-tab ${sheet.kraft ? "paper-tab-kraft" : ""} flex items-center gap-1.5 px-3 pb-3.5 pt-2 text-[13px] font-semibold tracking-[0.02em] max-[900px]:px-2.5 focus-visible:outline-2 focus-visible:outline-amber`;
        return (
          <div key={tab.id} className="paper-sheet" data-active={active || undefined} style={{ "--tilt": `${sheet.tilt}deg` } as CSSProperties}>
            {tab.kind === "unbuilt" ? (
              // plain text, not a control: nothing to click yet
              <span data-unbuilt="" title="The CRO brief isn't built yet" className={cls}>
                {text}
              </span>
            ) : tab.kind === "page" ? (
              <button type="button" aria-current={active ? "page" : undefined} onClick={onBoard} className={cls}>
                {text}
              </button>
            ) : (
              <button
                type="button"
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                aria-expanded={active}
                aria-controls={panelIds[tab.id]}
                onClick={() => onToggle(tab.id)}
                className={cls}
              >
                {text}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
