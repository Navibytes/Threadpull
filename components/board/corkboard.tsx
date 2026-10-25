"use client";

import { ReactFlow, useEdgesState, useNodesState, type OnSelectionChangeParams } from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { loanName, sharedLabel, type BoardState } from "@/lib/events";
import { BoardCamera, type BoardCase, type CardFocusRequest } from "./board-camera";
import { CorkSurface } from "./cork-surface";
import { EMPTY_PLAN, planBoardEntrance, planEntrance, shiftPlan } from "./entrance-plan";
import { cardFinding, IndexCardNode, type IndexCardNodeType } from "./index-card-node";
import { layoutBoard } from "./layout";
import type { BoardEntry } from "./use-run-events";
import { YarnEdge, type YarnEdgeType } from "./yarn-edge";

export type Selection = { kind: "card" | "thread"; id: string } | null;

const nodeTypes = { indexCard: IndexCardNode };
const edgeTypes = { yarn: YarnEdge };

// Draws BoardState only. Cards can be dragged and the view panned or zoomed, but nothing here adds,
// removes or restyles evidence: that comes from event rows through the reducer. Rows up to
// `animateAfterSeq` were history when the board loaded and appear in place; later rows animate in.
// `keepClear` is the element whose box the camera keeps cards out of (Hazel's corner).
// The camera takes 450ms to reach a case; its cards are thrown down while it is still arriving.
const CASE_REPLAY_LEAD_MS = 180;

export function Corkboard({
  board,
  animateAfterSeq,
  onSelect,
  keepClear,
  focusRequest,
  onCases,
  onShown,
  caseHref,
  entry = null,
}: {
  board: BoardState;
  animateAfterSeq: number;
  onSelect: (s: Selection) => void;
  keepClear: RefObject<HTMLElement | null>;
  focusRequest?: CardFocusRequest | null;
  onCases?: (cases: BoardCase[], activeCase: number | null) => void; // for the room's status plaque
  onShown?: (shown: "all" | number | null) => void; // the case on screen (the case bar or the camera chose it)
  caseHref?: (leadId: string) => string; // where a case's "Case details" button goes (the dashboard)
  entry?: BoardEntry | null; // the board was just entered: lay the recorded evidence out again (once per entry)
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<IndexCardNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<YarnEdgeType>([]);
  const moved = useRef(new Set<string>()); // cards the viewer dragged keep their spot; the rest follow the layout
  const [showSeq, setShowSeq] = useState(false); // debug: show each card's event seq on its face

  const layout = useMemo(() => layoutBoard(board.cards, board.threads), [board.cards, board.threads]);

  // Paper → Pin → Thread (entrance-plan.ts). Two triggers share one plan: entering the board lays out what is
  // already recorded, staggered; a live row animates only what it added. The plan is read when a card or thread
  // first mounts and never again, so a card already on the wall is not touched by later rows, by a zoom, or by a
  // panel opening. Reduced motion plans nothing: the finished board is shown at once.
  const reduce = useReducedMotion();
  const replays = useRef(0); // each replay of a case is a new key for that case's cards and threads
  const entered = useRef<BoardEntry | null>(null); // the entry already laid out, so a rebuild of the same board doesn't replay it
  const plan = useMemo(
    () =>
      reduce
        ? EMPTY_PLAN
        : planBoardEntrance({ cards: board.cards, threads: board.threads }, { animateAfterSeq, entrySeq: entry && entered.current !== entry ? entry.seq : null }),
    [board.cards, board.threads, animateAfterSeq, entry, reduce],
  );

  // Cases in the order they were opened, each named by its lead (the first card of the case).
  const cases = useMemo<BoardCase[]>(() => {
    const byCase = new Map<number, string[]>();
    for (const card of board.cards) {
      const k = layout.get(card.id)?.cluster;
      if (k !== undefined) byCase.set(k, [...(byCase.get(k) ?? []), card.id]);
    }
    return [...byCase].sort(([a], [b]) => a - b).map(([index, ids]) => ({ index, lead: ids[0], ids }));
  }, [board.cards, layout]);

  // The active case: the case of the latest row that names a card on the board.
  const activeCase = useMemo(() => {
    for (let i = board.events.length - 1; i >= 0; i--) {
      const id = board.events[i].loan_ids.find((l) => layout.has(l));
      if (id !== undefined) return cases.findIndex((c) => c.ids.includes(id));
    }
    return null;
  }, [board.events, layout, cases]);

  useEffect(() => onCases?.(cases, activeCase), [cases, activeCase, onCases]);

  useEffect(() => {
    setNodes((prev) =>
      board.cards.map((card): IndexCardNodeType => {
        const old = prev.find((n) => n.id === card.id);
        const spot = layout.get(card.id)!;
        const position = old && moved.current.has(card.id) ? old.position : { x: spot.x, y: spot.y };
        const lead = card.pinnedBy === "lead_opened";
        const crs = card.sources.some((s) => s.kind === "crs");
        const finding = cardFinding(card.id, lead, board.threads);
        return {
          ...old,
          id: card.id,
          type: "indexCard",
          position,
          zIndex: lead ? 2 : 1,
          ariaLabel: `${lead ? "Lead loan application" : "Loan application"} ${loanName(card.id)} (ID ${card.id})${finding ? `: ${finding.text}` : ""}${card.simulated ? ", simulated" : ""}${crs ? ", CRS source" : ""}`,
          data: {
            card,
            lead,
            showSeq,
            finding,
            enter: old ? (old.data.enter ?? null) : (plan.cards.get(card.id) ?? null),
            enterKey: old ? old.data.enterKey : 0,
            detailHref: lead && caseHref ? caseHref(card.id) : null,
          },
        };
      }),
    );
  }, [board.cards, board.threads, layout, plan, showSeq, caseHref, setNodes]);

  useEffect(() => {
    setEdges((prev) =>
      board.threads.map((thread): YarnEdgeType => {
        const old = prev.find((e) => e.id === thread.id);
        return {
          ...old,
          id: thread.id,
          type: "yarn",
          source: thread.a,
          target: thread.b,
          ariaLabel: `${sharedLabel(thread.kind)} between ${loanName(thread.a)} and ${loanName(thread.b)}${thread.explained ? ", explained" : ""}`,
          sourceHandle: "pin-out",
          targetHandle: "pin-in",
          data: {
            thread,
            enter: old ? (old.data?.enter ?? null) : (plan.threads.get(thread.id) ?? null),
            enterKey: old?.data?.enterKey ?? 0,
            retract: !!thread.explained && thread.explained.seq > animateAfterSeq,
          },
        };
      }),
    );
  }, [board.threads, animateAfterSeq, plan, setEdges]);

  // The viewer stepped to or picked a case with the case controls: lay that case's evidence out again, once, a beat
  // after the camera starts moving. Only that case's cards and threads restart (a new key remounts their animation
  // wrappers); everything else on the wall stays where it is, and dragging, panning and zooming never come here.
  const replayCase = useCallback(
    (caseIndex: number) => {
      if (reduce) return;
      const ids = new Set(cases[caseIndex]?.ids ?? []);
      if (ids.size === 0) return;
      const threadIds = new Set(board.threads.filter((t) => ids.has(t.a) && ids.has(t.b)).map((t) => t.id));
      const next = shiftPlan(planEntrance(board.cards, board.threads, ids, threadIds), CASE_REPLAY_LEAD_MS);
      const key = ++replays.current;
      setNodes((prev) => prev.map((n) => (next.cards.has(n.id) ? { ...n, data: { ...n.data, enter: next.cards.get(n.id)!, enterKey: key } } : n)));
      setEdges((prev) => prev.map((e) => (next.threads.has(e.id) && e.data ? { ...e, data: { ...e.data, enter: next.threads.get(e.id)!, enterKey: key } } : e)));
    },
    [reduce, cases, board.cards, board.threads, setNodes, setEdges],
  );

  // After both effects above have read the plan: this entry has been laid out.
  useEffect(() => {
    entered.current = entry;
  }, [entry]);

  const handleSelection = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) =>
      onSelect(nodes[0] ? { kind: "card", id: nodes[0].id } : edges[0] ? { kind: "thread", id: edges[0].id } : null),
    [onSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onSelectionChange={handleSelection}
      onNodeDragStop={(_, node) => moved.current.add(node.id)}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesConnectable={false}
      deleteKeyCode={null}
      attributionPosition="top-right"
      minZoom={0.3}
      maxZoom={2}
      style={{ background: "transparent" }}
      aria-label="Corkboard: evidence cards and the threads between them"
    >
      <CorkSurface />
      <BoardCamera
        cases={cases}
        activeCase={activeCase}
        keepClear={keepClear}
        focusRequest={focusRequest}
        showSeq={showSeq}
        onToggleSeq={() => setShowSeq((v) => !v)}
        onVisitCase={replayCase}
        onShown={onShown}
      />
    </ReactFlow>
  );
}
