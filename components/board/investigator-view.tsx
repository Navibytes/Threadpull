"use client";

import { MotionConfig } from "motion/react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/db/browser";
import type { Loan } from "@/lib/contracts/loan";
import { FilingDrawer } from "@/components/drawer";
import { previewLoanSource } from "@/components/drawer/preview-loan-source";
import { hazelPose, previewFeed, supabaseFeed } from "@/lib/events";
import { HazelNotebook } from "@/components/notebook/hazel-notebook";
import { HazelStanding } from "@/components/notebook/hazel-standing";
import { Corkboard, type Selection } from "./corkboard";
import { EvidencePanel } from "./evidence-panel";
import { ModeBadge } from "./mode-badge";
import { useRunEvents } from "./use-run-events";
import type { CardFocusRequest } from "./board-camera";
import { resolveDrawerSelection } from "./drawer-selection";
import styles from "./investigator-layout.module.css";

// With ?run=<run_id> and Supabase configured, the board follows that run's event rows (history, then
// Realtime). Otherwise it shows the PREVIEW fixture, and says why.
export function InvestigatorView({ runId }: { runId?: string }) {
  const client = useMemo(() => (runId ? browserClient() : null), [runId]);
  const feed = useMemo(() => (runId && client ? supabaseFeed(client, runId) : previewFeed()), [runId, client]);
  const { board, errors, animateAfterSeq } = useRunEvents(feed);
  const [selection, setSelection] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPreview, setDrawerPreview] = useState(false);
  const [drawerLoanId, setDrawerLoanId] = useState<string | null>(null);
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<CardFocusRequest | null>(null);
  const drawerId = useId();
  const drawerToggle = useRef<HTMLButtonElement>(null);
  const hazelCorner = useRef<HTMLDivElement>(null); // the camera keeps cards out of Hazel's corner

  const closeDrawer = () => {
    setDrawerOpen(false);
    drawerToggle.current?.focus();
  };
  const selectFromBoard = useCallback((next: Selection) => {
    setSelection(next);
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
      <div className="desk flex h-dvh flex-col">
        <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-black/40 bg-black/25 px-6 py-3 shadow-[0_1px_0_rgb(255_220_180/0.06)]">
          <h1 className="font-display text-2xl font-semibold text-cream">Threadpull</h1>
          <button ref={drawerToggle} type="button" className={styles.toggle} aria-controls={drawerId}
            aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}>
            {drawerOpen ? "Collapse filing drawer" : "Open filing drawer"}
          </button>
          <p className="text-sm text-cream/75">Find the ring. Protect the innocent. Decide the deal.</p>
          <div className="ml-auto self-center">
            <ModeBadge mode={feed.mode} runId={feed.runId} />
          </div>
        </header>

        {/* extra gap and floor so Hazel can step past the board's frame without covering the panels */}
        <main className={`${styles.workspace} flex min-h-0 flex-1 gap-10 px-4 pb-9 pt-4`}>
          <aside id={drawerId} aria-label="Loan filing sidebar" hidden={!drawerOpen} className={styles.drawer}
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeDrawer(); } }}>
            <div className={styles.drawerControls}>
              <label className={styles.previewChoice}>
                <input type="checkbox" checked={drawerPreview} onChange={(event) => {
                  setDrawerPreview(event.target.checked);
                  setDrawerLoanId(null);
                  setDrawerNotice(null);
                }} />
                Synthetic drawer preview
              </label>
              <button type="button" className={styles.toggle} onClick={closeDrawer} aria-label="Close filing drawer">Close</button>
            </div>
            {drawerNotice && <p role="status" className={styles.notice}>{drawerNotice}</p>}
            <div className={styles.drawerBody}>
              <FilingDrawer source={drawerPreview ? previewLoanSource : undefined}
                selectedLoanId={drawerLoanId} onSelectLoan={selectFromDrawer} />
            </div>
          </aside>
          <div className="relative flex min-w-0 flex-1">
            <div className="board-frame flex min-w-0 flex-1 p-[18px]">
              <section aria-label="Corkboard" className="relative min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[#4a2c18]">
                <Corkboard board={board} animateAfterSeq={animateAfterSeq} onSelect={selectFromBoard}
                  keepClear={hazelCorner} focusRequest={focusRequest} />
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
            {/* box-less wrapper: Hazel keeps her own position; the camera measures her through it */}
            <div ref={hazelCorner} className="contents">
              <HazelStanding pose={hazelPose(board.events).pose} />
            </div>
          </div>
          <div className="flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 text-walnut">
            <HazelNotebook board={board} mode={feed.mode} />
            <EvidencePanel board={board} selection={selection} mode={feed.mode} />
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
