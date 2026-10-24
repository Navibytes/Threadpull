"use client";

import {
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type FitViewOptions,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BoardState } from "@/lib/events";
import { AutoFrame } from "./auto-frame";
import { CorkSurface } from "./cork-surface";
import { IndexCardNode, type IndexCardNodeType } from "./index-card-node";
import { layoutBoard } from "./layout";
import { YarnEdge, type YarnEdgeType } from "./yarn-edge";

export type Selection = { kind: "card" | "thread"; id: string } | null;

const nodeTypes = { indexCard: IndexCardNode };
const edgeTypes = { yarn: YarnEdge };

// The right side is kept clear for Hazel, who stands at the board's bottom-right corner.
const FIT: FitViewOptions = { padding: { top: "70px", bottom: "60px", left: "60px", right: "36%" }, maxZoom: 1.15 };

// Draws BoardState only. Cards can be dragged and the view panned or zoomed, but nothing here adds,
// removes or restyles evidence: that comes from event rows through the reducer. Rows up to
// `animateAfterSeq` were history when the board loaded and appear in place; later rows animate in.
export function Corkboard({
  board,
  animateAfterSeq,
  onSelect,
}: {
  board: BoardState;
  animateAfterSeq: number;
  onSelect: (s: Selection) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<IndexCardNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<YarnEdgeType>([]);
  const moved = useRef(new Set<string>()); // cards the viewer dragged keep their spot; the rest follow the layout
  const userMoved = useRef(false); // the viewer panned or zoomed by hand

  const layout = useMemo(() => layoutBoard(board.cards, board.threads), [board.cards, board.threads]);

  // The active case: the cluster of the latest row that names a card on the board.
  const focusIds = useMemo(() => {
    for (let i = board.events.length - 1; i >= 0; i--) {
      const id = board.events[i].loan_ids.find((l) => layout.has(l));
      if (id === undefined) continue;
      const cluster = layout.get(id)!.cluster;
      return [...layout].filter(([, p]) => p.cluster === cluster).map(([cid]) => cid);
    }
    return [];
  }, [board.events, layout]);

  useEffect(() => {
    setNodes((prev) =>
      board.cards.map((card): IndexCardNodeType => {
        const old = prev.find((n) => n.id === card.id);
        const spot = layout.get(card.id)!;
        const position = old && moved.current.has(card.id) ? old.position : { x: spot.x, y: spot.y };
        const lead = card.pinnedBy === "lead_opened";
        return {
          ...old,
          id: card.id,
          type: "indexCard",
          position,
          zIndex: lead ? 2 : 1,
          data: { card, lead, animate: card.firstSeq > animateAfterSeq },
        };
      }),
    );
  }, [board.cards, layout, animateAfterSeq, setNodes]);

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
      onMoveStart={(event) => {
        if (event) userMoved.current = true; // programmatic fits have no event
      }}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesConnectable={false}
      deleteKeyCode={null}
      fitView
      fitViewOptions={FIT}
      attributionPosition="top-right"
      minZoom={0.3}
      maxZoom={2}
      style={{ background: "transparent" }}
      aria-label="Corkboard: evidence cards and the threads between them"
    >
      <CorkSurface />
      <AutoFrame focusIds={focusIds} userMoved={userMoved} options={FIT} />
      <Controls
        showInteractive={false}
        position="bottom-left"
        fitViewOptions={FIT}
        onFitView={() => {
          userMoved.current = false;
        }}
      />
    </ReactFlow>
  );
}
