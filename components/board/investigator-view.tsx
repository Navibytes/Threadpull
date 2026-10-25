"use client";

import { MotionConfig } from "motion/react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/db/browser";
import type { Loan } from "@/lib/contracts/loan";
import { FilingDrawer } from "@/components/drawer";
import { previewLoanSource } from "@/components/drawer/preview-loan-source";
import { hazelState, previewFeed, supabaseFeed } from "@/lib/events";
import { HazelNotebook } from "@/components/notebook/hazel-notebook";
import { HazelStanding } from "@/components/notebook/hazel-standing";
import type { BoardCase, CardFocusRequest } from "./board-camera";
import { Corkboard, type Selection } from "./corkboard";
import { resolveDrawerSelection } from "./drawer-selection";
import { EvidencePanel } from "./evidence-panel";
import styles from "./investigator-layout.module.css";
import { RoomNav, type PanelId } from "./room-nav";
import { SidePanel } from "./side-panel";
import { StatusPlaque } from "./status-plaque";
import { useRunEvents } from "./use-run-events";

// The investigator's room: dark wallpaper, a large framed corkboard in the middle, paper tabs above it, a
// status plaque, and a desk ledge below where Hazel stands. The filing drawer opens from the left and the
// evidence inspector or Hazel's notebook from the right, over the board, instead of splitting the room.
// With ?run=<run_id> and Supabase configured, the board follows that run's event rows (history, then
// Realtime). Otherwise it shows the PREVIEW fixture, and says why.
export function InvestigatorView({ runId }: { runId?: string }) {
  const client = useMemo(() => (runId ? browserClient() : null), [runId]);
  const feed = useMemo(() => (runId && client ? supabaseFeed(client, runId) : previewFeed()), [runId, client]);
  const { board, errors, animateAfterSeq } = useRunEvents(feed);
  // Hazel's pose and the reaction to play, from the applied rows; history rows set the pose without a reaction.
  const hazel = useMemo(() => hazelState(board.events, animateAfterSeq), [board.events, animateAfterSeq]);
  const [selection, setSelection] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<"evidence" | "notebook" | null>(null);
  const [focusPanel, setFocusPanel] = useState(false); // opened from a tab: move focus into the panel
  const [drawerPreview, setDrawerPreview] = useState(false);
  const [drawerLoanId, setDrawerLoanId] = useState<string | null>(null);
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<CardFocusRequest | null>(null);
  const [cases, setCases] = useState<{ list: BoardCase[]; active: number | null }>({ list: [], active: null });
  const baseId = useId();
  const panelIds: Record<PanelId, string> = {
    drawer: `${baseId}-drawer`,
    evidence: `${baseId}-evidence`,
    notebook: `${baseId}-notebook`,
  };
  const tabRefs = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({});
  const hazelCorner = useRef<HTMLDivElement>(null); // the camera keeps cards out of Hazel's corner

  const isOpen = (id: PanelId) => (id === "drawer" ? drawerOpen : rightPanel === id);
  const close = (id: PanelId) => {
    if (id === "drawer") setDrawerOpen(false);
    else setRightPanel(null);
    tabRefs.current[id]?.focus(); // back to the tab that opens it
  };
  const toggle = (id: PanelId) => {
    if (isOpen(id)) return close(id);
    setFocusPanel(true);
    if (id === "drawer") setDrawerOpen(true);
    else setRightPanel(id);
  };
  const closeDrawer = () => close("drawer");
  const onCases = useCallback((list: BoardCase[], active: number | null) => setCases({ list, active }), []);

  const selectFromBoard = useCallback((next: Selection) => {
    setSelection(next);
    if (next) {
      // inspecting a card or a thread opens the evidence inspector; focus stays on the board
      setFocusPanel(false);
      setRightPanel("evidence");
    }
    if (next?.kind === "card") {
      setDrawerLoanId(next.id);
      setDrawerNotice(null);
    }
  }, []);
  const selectFromDrawer = (loan: Loan) => {
    setDrawerLoanId(loan.loan_id);
    const result = resolveDrawerSelection(board, loan.loan_id, drawerPreview ? "preview" : "api");
    setDrawerNotice(result.message);
    if (!result.cardId) return;
    setSelection({ kind: "card", id: result.cardId });
    // A new object makes a repeated selection of the same file an explicit camera action.
    setFocusRequest({ cardId: result.cardId });
    if (!window.matchMedia("(min-width: 1600px)").matches) closeDrawer();
  };

  const notices = [
    ...(runId && !client
      ? [`Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY), so run ${runId} can't be shown.`]
      : []),
    ...errors,
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className={`room ${styles.room} relative flex h-dvh flex-col overflow-hidden`}>
        <header className="relative z-30 flex items-end gap-x-6 px-[var(--wall)] pt-3">
          <StatusPlaque board={board} mode={feed.mode} runId={feed.runId} cases={cases.list} activeCase={cases.active} />
          <RoomNav
            isOpen={isOpen}
            onToggle={toggle}
            onBoard={() => {
              if (drawerOpen) close("drawer");
              if (rightPanel) close(rightPanel);
            }}
            panelIds={panelIds}
            tabRefs={tabRefs}
          />
          <p className="hidden max-w-[15rem] shrink-0 pb-2 text-right text-[13px] text-cream/75 min-[1600px]:block">
            Find the ring. Protect the innocent. Decide the deal.
          </p>
        </header>

        <main className="relative flex min-h-0 flex-1 justify-center px-[var(--wall)] pb-[var(--ledge-gap)] pt-3">
          <div className="relative flex w-full">
            {/* the frame stays still; the board pans and zooms inside the cork, clipped at the frame */}
            <div className="board-frame flex min-w-0 flex-1">
              <section aria-label="Corkboard" className="relative min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[#4a2c18]">
                <Corkboard
                  board={board}
                  animateAfterSeq={animateAfterSeq}
                  onSelect={selectFromBoard}
                  keepClear={hazelCorner}
                  focusRequest={focusRequest}
                  onCases={onCases}
                />
                {/* lamp light and the frame's inner shadow: on top, never taking clicks */}
                <div aria-hidden className="board-light pointer-events-none absolute inset-0 z-10" />
                <div aria-hidden className="board-recess pointer-events-none absolute inset-0 z-10" />
                <div className="pointer-events-none absolute left-5 top-5 z-20 max-w-[70%] space-y-2">
                  {feed.mode === "preview" && (
                    <p className="w-fit rounded-sm border border-honey bg-paper px-3 py-1.5 text-xs font-medium text-walnut shadow-[0_4px_10px_rgb(0_0_0/0.4)]">
                      PREVIEW · synthetic fixture · not a live or recorded investigation
                    </p>
                  )}
                  {notices.map((n) => (
                    <p
                      key={n}
                      role="status"
                      className="w-fit rounded-sm border border-terracotta bg-paper px-3 py-1.5 text-xs font-medium text-walnut shadow-[0_4px_10px_rgb(0_0_0/0.4)]"
                    >
                      {n}
                    </p>
                  ))}
                </div>
              </section>
            </div>

            <SidePanel id={panelIds.drawer} side="left" title="Filing drawer" open={drawerOpen} onClose={closeDrawer} focusOnOpen={focusPanel}>
              <div className={styles.drawerControls}>
                <label className={styles.previewChoice}>
                  <input
                    type="checkbox"
                    checked={drawerPreview}
                    onChange={(event) => {
                      setDrawerPreview(event.target.checked);
                      setDrawerLoanId(null);
                      setDrawerNotice(null);
                    }}
                  />
                  Synthetic drawer preview
                </label>
              </div>
              {drawerNotice && (
                <p role="status" className={styles.notice}>
                  {drawerNotice}
                </p>
              )}
              <div className={styles.drawerBody}>
                <FilingDrawer
                  source={drawerPreview ? previewLoanSource : undefined}
                  selectedLoanId={drawerLoanId}
                  onSelectLoan={selectFromDrawer}
                />
              </div>
            </SidePanel>

            {/* the right panels stop above the board's lower-right controls */}
            <SidePanel
              id={panelIds.evidence}
              side="right"
              title="Checks & evidence"
              open={rightPanel === "evidence"}
              onClose={() => close("evidence")}
              focusOnOpen={focusPanel}
              bottomClear
            >
              <EvidencePanel board={board} selection={selection} mode={feed.mode} />
            </SidePanel>
            <SidePanel
              id={panelIds.notebook}
              side="right"
              title="Hazel's notebook"
              open={rightPanel === "notebook"}
              onClose={() => close("notebook")}
              focusOnOpen={focusPanel}
              bottomClear
            >
              <div className="p-3">
                <HazelNotebook board={board} mode={feed.mode} />
              </div>
            </SidePanel>
          </div>
        </main>

        {/* the desk ledge Hazel stands on */}
        <div aria-hidden className="ledge relative z-10 h-[var(--ledge)] shrink-0" />

        {/* Hazel on the ledge at the lower left, in front of the frame, facing the board. The wrapper is her
            size and mirrors her; her own component and pose logic are unchanged. The camera keeps cards out of
            the part of the board she covers. */}
        <div ref={hazelCorner} className={`${styles.hazelSpot} pointer-events-none absolute z-20`}>
          <HazelStanding pose={hazel.pose} cue={hazel.cue} />
        </div>
      </div>
    </MotionConfig>
  );
}
