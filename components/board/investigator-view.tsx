"use client";

import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/db/browser";
import type { Loan } from "@/lib/contracts/loan";
import { FilingDrawer } from "@/components/drawer";
import { hazelState, previewFeed, replayFeed, SCENARIOS, scenarioById, scenarioRunId, supabaseFeed, supabaseReplayFeed, type RunEventFeed } from "@/lib/events";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HazelNotebook } from "@/components/notebook/hazel-notebook";
import { portfolioSeed } from "@/components/twin-compare/twin-compare";
import { HazelStanding } from "@/components/notebook/hazel-standing";
import { HazelThoughts } from "@/components/notebook/hazel-thoughts";
import type { BoardCase, CardFocusRequest } from "./board-camera";
import { Corkboard, type Selection } from "./corkboard";
import { resolveDrawerSelection } from "./drawer-selection";
import { EvidencePanel } from "./evidence-panel";
import styles from "./investigator-layout.module.css";
import { RoomNav, type PanelId } from "./room-nav";
import { SidePanel } from "./side-panel";
import { CaseSummary } from "./case-summary";
import { RunProgressStrip } from "./run-progress";
import { StatusPlaque } from "./status-plaque";
import { CaseRoomIntro } from "./case-room-intro";
import { useRunEvents } from "./use-run-events";
import { dashboardHref } from "@/lib/dashboard/links";

// The investigator's room: dark wallpaper, a large framed corkboard in the middle, paper tabs above it, a
// status plaque, and a desk ledge below where Hazel stands. The filing drawer opens from the left and the
// evidence inspector or Hazel's notebook from the right, over the board, instead of splitting the room.
// With ?run=<run_id> and Supabase configured, the board follows that run's event rows (history, then
// Realtime). Otherwise it shows the fixture board.
export function InvestigatorView({ runId, scenario, replay, feed: given }: { runId?: string; scenario?: string; replay?: number; feed?: RunEventFeed }) {
  const router = useRouter();
  const sc = useMemo(() => scenarioById(scenario), [scenario]); // the sample situation, when no run is given
  const client = useMemo(() => (runId ? browserClient() : null), [runId]);
  const [take, setTake] = useState(0); // a replay starts again when this changes
  // A replay plays the rows back in order, spaced like the original; a sample replay stays labelled as a sample.
  const feed = useMemo(
    () =>
      given ??
      (replay
        ? runId && client
          ? supabaseReplayFeed(client, runId, { speed: replay })
          : replayFeed(sc.events, scenarioRunId(sc), { speed: replay, mode: "preview" })
        : runId && client
          ? supabaseFeed(client, runId)
          : previewFeed(sc.events, scenarioRunId(sc))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [given, runId, client, sc, replay, take],
  );
  const base = runId ? `/board?run=${encodeURIComponent(runId)}` : `/board?scenario=${sc.id}`;
  const { board, errors, animateAfterSeq, entry } = useRunEvents(feed);
  // Hazel's pose and the reaction to play, from the applied rows; history rows set the pose without a reaction.
  const hazel = useMemo(() => hazelState(board.events, animateAfterSeq), [board.events, animateAfterSeq]);
  // the drawer lists the run's own portfolio (its run_started row names the seed), so seed 99's L0037 isn't seed 13's
  const seed = useMemo(() => portfolioSeed(board.events, feed.mode), [board.events, feed.mode]);
  const [selection, setSelection] = useState<Selection>(null);
  // One auxiliary panel at a time: opening one replaces the other, and the tab that looks selected is always
  // the panel that is visible. null is the plain board.
  const [open, setOpen] = useState<PanelId | null>(null);
  const [focusPanel, setFocusPanel] = useState(false); // opened from a tab: move focus into the panel
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

  const isOpen = (id: PanelId) => open === id;
  const close = (id: PanelId) => {
    setOpen((o) => (o === id ? null : o));
    tabRefs.current[id]?.focus(); // back to the tab that opens it
  };
  const toggle = (id: PanelId) => {
    if (open === id) return close(id);
    setFocusPanel(true);
    setOpen(id);
  };
  const closeDrawer = () => close("drawer");
  // Escape closes the open panel from anywhere on the board (inside a panel its own handler does the same).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setOpen(null);
      tabRefs.current[open]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const onCases = useCallback((list: BoardCase[], active: number | null) => setCases({ list, active }), []);
  // The case on screen: the one picked with the case bar (or framed by the camera), else the case of the latest row.
  const [shownCase, setShownCase] = useState<"all" | number | null>(null);
  const onShown = useCallback((s: "all" | number | null) => setShownCase(s), []);
  const caseIndex = typeof shownCase === "number" ? shownCase : cases.active;
  const shownLead = caseIndex !== null ? (cases.list[caseIndex]?.lead ?? null) : null;
  // a case the viewer picked from the panel's list wins over what the camera frames
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [runId]);
  const activeLead = picked && cases.list.some((c) => c.lead === picked) ? picked : shownLead;
  const pickCase = useCallback((lead: string | null) => {
    setPicked(lead);
    if (lead) setFocusRequest({ cardId: lead, replay: true }); // move the camera to the case, and lay its evidence out again
  }, []);
  // a case's detail page on the dashboard: the same run, with that case's lead loan
  const caseHref = useCallback((leadId: string) => dashboardHref({ run: runId, scenario: runId ? undefined : sc.id, portfolio: seed }, leadId), [runId, sc.id, seed]);

  const selectFromBoard = useCallback((next: Selection) => {
    setSelection(next);
    if (next) {
      // inspecting a card or a thread opens the evidence inspector; focus stays on the board
      setFocusPanel(false);
      setOpen("evidence");
    }
    if (next?.kind === "card") {
      setDrawerLoanId(next.id);
      setDrawerNotice(null);
    }
  }, []);
  const selectFromDrawer = (loan: Loan) => {
    setDrawerLoanId(loan.loan_id);
    const result = resolveDrawerSelection(board, loan.loan_id, "api");
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
        <header className="relative z-30 flex flex-col items-center gap-0 px-[var(--wall)] pt-0">
                    <CaseSummary
                      showSample={feed.mode !== "preview"}
                      board={board}
                      leadId={activeLead}
                      detailHref={activeLead ? caseHref(activeLead) : null}
                      leads={cases.list.map((c) => c.lead)}
                      picked={picked}
                      onPick={pickCase}
                    />
{/* the wordmark is the visible brand; the status line is for screen readers only */}
          {/* the wordmark is also the way back to the landing page */}
          <Link href="/" aria-label="Threadpull, back to the landing page" title="Back to the landing page" className="relative z-30 -mt-2 rounded-md focus-visible:outline-2 focus-visible:outline-terracotta">
            <img src="/brand/threadpull-wordmark.png" alt="" draggable={false} className="h-[clamp(100px,18vh,190px)] w-auto select-none" />
          </Link>
          <div className="sr-only">
            <StatusPlaque board={board} mode={feed.mode} runId={feed.runId} cases={cases.list} activeCase={cases.active} />
          </div>
          <RoomNav
            isOpen={isOpen}
            onToggle={toggle}
            onBoard={() => setOpen(null)}
            dashboardHref={dashboardHref({ run: runId, scenario: runId ? undefined : sc.id, portfolio: seed })}
            croHref={runId ? `/cro?run=${encodeURIComponent(runId)}` : null}
            panelIds={panelIds}
            tabRefs={tabRefs}
          />
          {!runId && (
            <label className="absolute right-[var(--wall)] top-3 z-30 flex items-center gap-2 rounded-sm border border-walnut/20 bg-paper/90 px-2 py-1 text-[12px] text-walnut shadow-[0_3px_8px_rgb(0_0_0/0.2)]">
              <span className="font-semibold">Sample situation</span>
              {/* keeps the replay speed when you switch situation */}
              <select
                value={sc.id}
                title={sc.summary}
                onChange={(e) => router.push(`/board?scenario=${e.target.value}${replay ? `&replay=${replay}` : ""}`)}
                className="rounded-sm border border-walnut/25 bg-paper px-1 py-0.5"
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* Replay: the same rows, played back in order so Hazel's thinking can be watched again */}
          <div className="absolute right-[var(--wall)] top-[3.6rem] z-30 flex items-center gap-2 rounded-sm border border-walnut/20 bg-paper/90 px-2 py-1 text-[12px] text-walnut shadow-[0_3px_8px_rgb(0_0_0/0.2)]">
            {replay ? (
              <>
                <span className="font-semibold">Replay</span>
                <select
                  aria-label="Replay speed"
                  value={replay}
                  onChange={(e) => router.push(`${base}&replay=${e.target.value}`)}
                  className="rounded-sm border border-walnut/25 bg-paper px-1 py-0.5"
                >
                  {[...new Set([0.5, 1, 2, 4, 8, replay])].sort((a, b) => a - b).map((x) => (
                    <option key={x} value={x}>
                      {x}×
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setTake((n) => n + 1)} className="rounded-sm border border-walnut/25 bg-paper px-2 py-0.5 font-semibold hover:bg-white">
                  Restart
                </button>
                <button type="button" onClick={() => router.push(base)} className="rounded-sm px-1 py-0.5 underline">
                  Stop
                </button>
              </>
            ) : (
              <button type="button" onClick={() => router.push(`${base}&replay=2`)} className="rounded-sm px-1 py-0.5 font-semibold underline">
                ▶ Watch a replay
              </button>
            )}
          </div>
          <p className="absolute right-[var(--wall)] top-[7rem] hidden max-w-[15rem] text-right text-[13px] text-walnut/75 min-[1600px]:block">
            Find the ring. Protect the innocent. Decide the deal.
          </p>
        </header>

        <main className="relative flex min-h-0 flex-1 justify-center px-[var(--wall)] pb-[clamp(22px,3.5vh,40px)] pt-1">
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
                  onShown={onShown}
                  caseHref={caseHref}
                  entry={entry}
                />
                {runId && feed.mode !== "preview" && <RunProgressStrip events={board.events} runId={runId} />}
                {/* lamp light and the frame's inner shadow: on top, never taking clicks */}
                <div aria-hidden className="board-light pointer-events-none absolute inset-0 z-10" />
                <div aria-hidden className="board-recess pointer-events-none absolute inset-0 z-10" />
                <CaseRoomIntro />
                <div className="pointer-events-none absolute left-5 top-5 z-20 max-w-[70%] space-y-2">
                  {feed.mode === "preview" && (
                    <p className="w-fit rounded-sm border border-honey bg-paper px-3 py-1.5 text-xs font-medium text-walnut shadow-[0_4px_10px_rgb(0_0_0/0.4)]">
                      Sample data: made-up loans for demonstration, not a real investigation.
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

            <SidePanel id={panelIds.drawer} side="left" title="Filing drawer" open={open === "drawer"} onClose={closeDrawer} focusOnOpen={focusPanel} bottomClear offsetLeft="calc(40px + var(--hazel-w) * 0.87 + 12px - var(--wall))">
              {drawerNotice && (
                <p role="status" className={styles.notice}>
                  {drawerNotice}
                </p>
              )}
              <div className={styles.drawerBody}>
                <FilingDrawer
                  seed={seed ?? undefined}
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
              open={open === "evidence"}
              onClose={() => close("evidence")}
              focusOnOpen={focusPanel}
              bottomClear
              fit
            >
              <EvidencePanel board={board} selection={selection} mode={feed.mode} />
            </SidePanel>
            <SidePanel
              id={panelIds.notebook}
              side="right"
              title="Hazel's notebook"
              open={open === "notebook"}
              onClose={() => close("notebook")}
              focusOnOpen={focusPanel}
              bottomClear
              fit
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
        {/* her thought bubble and verdict stamp, above her head; they follow the live rows only */}
        <HazelThoughts events={board.events} animateAfterSeq={animateAfterSeq} />
      </div>
    </MotionConfig>
  );
}
