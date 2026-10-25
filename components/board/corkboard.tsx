"use client";

import { ReactFlow, useEdgesState, useNodesState, type OnSelectionChangeParams } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { BoardState } from "@/lib/events";
import { BoardCamera, type BoardCase, type CardFocusRequest } from "./board-camera";
import { CorkSurface } from "./cork-surface";
import { IndexCardNode, type IndexCardNodeType } from "./index-card-node";
import { layoutBoard } from "./layout";
import { YarnEdge, type YarnEdgeType } from "./yarn-edge";

export type Selection = { kind: "card" | "thread"; id: string } | null;

const nodeTypes = { indexCard: IndexCardNode };
const edgeTypes = { yarn: YarnEdge };

// Draws BoardState only. Cards can be dragged and the view panned or zoomed, but nothing here adds,
// removes or restyles evidence: that comes from event rows through the reducer. Rows up to
// `animateAfterSeq` were history when the board loaded and appear in place; later rows animate in.
// `keepClear` is the element whose box the camera keeps cards out of (Hazel's corner).
export function Corkboard({
  board,
  animateAfterSeq,
  onSelect,
  keepClear,
  focusRequest,
  onCases,
}: {
  board: BoardState;
  animateAfterSeq: number;
  onSelect: (s: Selection) => void;
  keepClear: RefObject<HTMLElement | null>;
  focusRequest?: CardFocusRequest | null;
  onCases?: (cases: BoardCase[], activeCase: number | null) => void; // for the room's status plaque
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<IndexCardNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<YarnEdgeType>([]);
  const moved = useRef(new Set<string>()); // cards the viewer dragged keep their spot; the rest follow the layout
  const [showSeq, setShowSeq] = useState(false); // debug: show each card's event seq on its face

  const layout = useMemo(() => layoutBoard(board.cards, board.threads), [board.cards, board.threads]);

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
        return {
          ...old,
          id: card.id,
          type: "indexCard",
          position,
          zIndex: lead ? 2 : 1,
          ariaLabel: `${lead ? "Lead loan application" : "Loan application"} ${card.id}${card.simulated ? ", simulated" : ""}${crs ? ", CRS source" : ""}`,
          data: { card, lead, showSeq, animate: card.firstSeq > animateAfterSeq },
        };
      }),
    );
  }, [board.cards, layout, animateAfterSeq, showSeq, setNodes]);

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
          sourceHandle: "pin-out",
          targetHandle: "pin-in",
          data: {
            thread,
            animate: thread.firstSeq > animateAfterSeq,
            retract: !!thread.explained && thread.explained.seq > animateAfterSeq,
          },
        };
      }),
    );
  }, [board.threads, animateAfterSeq, setEdges]);

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
      />
    </ReactFlow>
  );
}
