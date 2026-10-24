"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";
import type { BoardState } from "@/lib/events";
import { IndexCardNode, type IndexCardNodeType } from "./index-card-node";
import { cardPosition } from "./layout";
import { YarnEdge, type YarnEdgeType } from "./yarn-edge";

export type Selection = { kind: "card" | "thread"; id: string } | null;

const nodeTypes = { indexCard: IndexCardNode };
const edgeTypes = { yarn: YarnEdge };

// Draws BoardState only. Cards can be dragged and the view panned or zoomed, but nothing here adds,
// removes or restyles evidence: that comes from event rows through the reducer.
export function Corkboard({ board, onSelect }: { board: BoardState; onSelect: (s: Selection) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<IndexCardNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<YarnEdgeType>([]);
  const moved = useRef(new Set<string>()); // cards the viewer dragged keep their spot; the rest follow the layout

  useEffect(() => {
    setNodes((prev) =>
      board.cards.map((card, i) => {
        const old = prev.find((n) => n.id === card.id);
        const position = old && moved.current.has(card.id) ? old.position : cardPosition(i);
        return { ...old, id: card.id, type: "indexCard", position, data: { card } };
      }),
    );
  }, [board.cards, setNodes]);

  useEffect(() => {
    setEdges((prev) =>
      board.threads.map((thread) => {
        const old = prev.find((e) => e.id === thread.id);
        return {
          ...old,
          id: thread.id,
          type: "yarn",
          source: thread.a,
          target: thread.b,
          sourceHandle: "pin-out",
          targetHandle: "pin-in",
          zIndex: 1, // yarn runs over the cards, pin to pin
          data: { thread },
        };
      }),
    );
  }, [board.threads, setEdges]);

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
      elevateNodesOnSelect={false} // keep the yarn above a selected card
      deleteKeyCode={null}
      fitView
      // the right side is kept clear for Hazel, who stands at the board's bottom-right corner
      fitViewOptions={{ padding: { top: "80px", bottom: "48px", left: "56px", right: "32%" }, maxZoom: 1.2 }}
      attributionPosition="top-right"
      minZoom={0.3}
      maxZoom={2}
      style={{ background: "transparent" }}
      aria-label="Corkboard: evidence cards and the threads between them"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgb(74 55 40 / 0.16)" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
