"use client";

import { Panel, useNodesInitialized, useReactFlow, useStore, type InternalNode } from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { bestFit, boundsOf, cardsOutOfView, planFrame, type Box } from "./framing";
import type { IndexCardNodeType } from "./index-card-node";
import { LAYOUT } from "./layout";

export type BoardCase = { index: number; lead: string; ids: string[] };
export type CardFocusRequest = { cardId: string };

// A card's box on the board as drawn now (after any drag). Fitting includes a lead's hanging note; deciding
// whether a card is on screen uses the card itself.
function liveBox(n: InternalNode, withNote = true): Box {
  const data = n.data as IndexCardNodeType["data"];
  const note = withNote && data?.lead && data.card.note ? LAYOUT.leadNoteH : 0;
  return {
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    w: n.measured.width ?? 260,
    h: (n.measured.height ?? LAYOUT.cardH) + note,
  };
}

// The camera: follows the active case (or shows everything while that stays readable), and never hides
// cards silently: when some are out of view, the case bar says how many and lets you move between cases.
// Following stops when you pan, zoom or pick a case yourself; "Follow latest" hands it back.
export function BoardCamera({
  cases,
  activeCase,
  keepClear,
  focusRequest,
  showSeq,
  onToggleSeq,
  onShown,
}: {
  cases: BoardCase[];
  activeCase: number | null;
  keepClear: RefObject<HTMLElement | null>;
  focusRequest?: CardFocusRequest | null;
  showSeq: boolean;
  onToggleSeq: () => void;
  onShown?: (shown: "all" | number | null) => void; // the case the camera is framing, for the case summary
}) {
  const { setViewport, setNodes, setEdges, zoomIn, zoomOut } = useReactFlow();
  const measured = useNodesInitialized();
  const reduce = useReducedMotion();
  const nodeLookup = useStore((s) => s.nodeLookup);
  const [vx, vy, zoom] = useStore((s) => s.transform);
  const paneW = useStore((s) => s.width);
  const paneH = useStore((s) => s.height);
  const domNode = useStore((s) => s.domNode);
  const [following, setFollowing] = useState(true);
  const [shown, setShown] = useState<"all" | number | null>(null); // what the camera last framed
  useEffect(() => onShown?.(shown), [shown, onShown]);
  const framedOnce = useRef(false);
  const handledFocus = useRef<CardFocusRequest | null>(null);

  // Hazel's corner, in pane pixels
  const keepOut = useCallback((): Box | null => {
    const el = keepClear.current?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !domNode) return null;
    const k = el.getBoundingClientRect(), p = domNode.getBoundingClientRect();
    const x = Math.max(k.left, p.left) - p.left, y = Math.max(k.top, p.top) - p.top;
    const w = Math.min(k.right, p.right) - p.left - x, h = Math.min(k.bottom, p.bottom) - p.top - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  }, [keepClear, domNode]);

  const boxesFor = useCallback(
    (ids?: string[], withNote = true) => {
      const out = new Map<string, Box>();
      for (const [id, n] of nodeLookup) if (!ids || ids.includes(id)) out.set(id, liveBox(n, withNote));
      return out;
    },
    [nodeLookup],
  );

  const go = useCallback(
    (target: "all" | number, animate = true) => {
      const pane = { w: paneW, h: paneH };
      const all = boundsOf([...boxesFor().values()]);
      if (!all) return;
      let vp;
      if (target === "all") vp = bestFit(all, pane, keepOut());
      else {
        const b = boundsOf([...boxesFor(cases[target]?.ids).values()]);
        if (!b) return;
        vp = bestFit(b, pane, keepOut());
      }
      setShown(target);
      void setViewport(vp, { duration: animate && !reduce ? 450 : 0 });
    },
    [paneW, paneH, boxesFor, keepOut, cases, setViewport, reduce],
  );

  // Following: frame everything while readable, otherwise the active case. Runs when cards arrive, the
  // active case changes or the board is resized. The first framing is instant (no sweep on page load).
  const caseKey = activeCase === null ? "" : `${activeCase}:${cases[activeCase]?.ids.length ?? 0}`;
  const cardCount = nodeLookup.size;
  useEffect(() => {
    // Let a pending drawer action win over automatic following in this render.
    if (focusRequest && handledFocus.current !== focusRequest && nodeLookup.has(focusRequest.cardId)) return;
    if (!following || !measured || cardCount === 0 || paneW === 0) return;
    const pane = { w: paneW, h: paneH };
    const all = boundsOf([...boxesFor().values()]);
    const active = activeCase === null ? null : boundsOf([...boxesFor(cases[activeCase]?.ids).values()]);
    const plan = planFrame(all, active, pane, keepOut());
    if (!plan) return;
    const animate = framedOnce.current && !reduce;
    framedOnce.current = true;
    setShown(plan.target === "all" ? "all" : activeCase);
    void setViewport(plan.viewport, { duration: animate ? 450 : 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, measured, cardCount, caseKey, paneW, paneH]);

  useEffect(() => {
    if (!focusRequest || handledFocus.current === focusRequest || !measured || paneW === 0) return;
    const box = boxesFor([focusRequest.cardId]).get(focusRequest.cardId);
    if (!box) return; // Only event-backed nodes already in React Flow may be focused.
    handledFocus.current = focusRequest;
    setFollowing(false);
    const caseIndex = cases.findIndex((item) => item.ids.includes(focusRequest.cardId));
    setShown(caseIndex >= 0 ? caseIndex : null);
    setNodes((nodes) => nodes.map((node) => ({ ...node, selected: node.id === focusRequest.cardId })));
    setEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })));
    void setViewport(bestFit(box, { w: paneW, h: paneH }, keepOut()), { duration: reduce ? 0 : 450 });
  }, [focusRequest, measured, paneW, paneH, boxesFor, cases, keepOut, reduce, setNodes, setEdges, setViewport]);

  // Viewer panned or zoomed by hand: stop following (React Flow passes an event only for user moves).
  useEffect(() => {
    const el = domNode;
    if (!el) return;
    // a zoom anywhere on the board, or a drag that starts on empty cork (not on a card or a control)
    const onWheel = (e: Event) => {
      if (!(e.target as HTMLElement | null)?.closest(".react-flow__panel")) setFollowing(false);
    };
    const onPointer = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest(".react-flow__pane")) setFollowing(false);
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("pointerdown", onPointer);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointer);
    };
  }, [domNode]);

  const outOfView = useMemo(
    () => cardsOutOfView(boxesFor(undefined, false), { x: vx, y: vy, zoom }, { w: paneW, h: paneH }, keepOut()),
    // the transform is the trigger; boxes and keep-out are read fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vx, vy, zoom, paneW, paneH, nodeLookup, cardCount],
  );

  if (cardCount === 0) return null;

  const current = typeof shown === "number" ? shown : null;
  const step = (d: number) => {
    const from = current ?? activeCase ?? 0;
    const next = (from + d + cases.length) % cases.length;
    setFollowing(false);
    go(next);
  };
  const zoomBy = (dir: 1 | -1) => {
    setFollowing(false);
    void (dir > 0 ? zoomIn : zoomOut)({ duration: reduce ? 0 : 200 });
  };
  const btn =
    "grid min-h-8 min-w-8 place-items-center rounded-[3px] px-1.5 font-semibold hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-walnut";
  const lens = current !== null ? `${current + 1}/${cases.length}` : cases.length > 1 ? "all" : "1/1";

  // The case plate, in the board's lower-right corner: a brass magnifier with the case number, then the
  // case controls, the zoom and the event-numbers debug toggle. The out-of-view count sits just above it.
  return (
    <Panel position="bottom-right" className="!m-3">
      <div className="flex flex-col items-end gap-2">
        {outOfView.length > 0 && (
          <p role="status" className="brass-plate rounded-[3px] px-2.5 py-1 text-[13px] font-semibold">
            {outOfView.length} {outOfView.length === 1 ? "card" : "cards"} out of view
          </p>
        )}
        <nav aria-label="Cases on the board" className="brass-plate flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-[13px]">
          <span aria-hidden className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-[#6b4f1c] bg-[radial-gradient(circle_at_35%_30%,#f3f6f4,#b9c6c8_70%)] text-[13px] font-bold text-walnut shadow-[inset_0_2px_4px_rgb(0_0_0/0.25)]">
            {lens}
          </span>
          {cases.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label="Previous case" className={btn}>
                <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 2.5 4 6l3.5 3.5" /></svg>
              </button>
              <span className="min-w-[9.5rem] text-center font-semibold" aria-live="polite">
                {current !== null ? `Case ${current + 1} of ${cases.length} · ${cases[current]?.lead}` : `All ${cases.length} cases`}
              </span>
              <button type="button" onClick={() => step(1)} aria-label="Next case" className={btn}>
                <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
              </button>
            </>
          )}
          <span aria-hidden className="mx-1 h-5 w-px bg-black/25" />
          <button type="button" onClick={() => { setFollowing(false); go("all"); }} className={btn}>
            Show all
          </button>
          {!following && (
            <button type="button" onClick={() => setFollowing(true)} className={btn}>
              Follow latest
            </button>
          )}
          <span aria-hidden className="mx-1 h-5 w-px bg-black/25" />
          <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out" className={btn}>
            <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 6h7" /></svg>
          </button>
          <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in" className={btn}>
            <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 6h7M6 2.5v7" /></svg>
          </button>
          <button type="button" aria-pressed={showSeq} onClick={onToggleSeq} className={btn}>
            Event numbers: {showSeq ? "on" : "off"}
          </button>
        </nav>
      </div>
    </Panel>
  );
}
