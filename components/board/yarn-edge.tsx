"use client";

import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { threadWidth, type BoardThread } from "@/lib/events";

export type YarnEdgeType = Edge<{ thread: BoardThread }, "yarn">;

// Yarn hangs between two pins: a quadratic curve that sags a little with distance.
export function yarnPath(sx: number, sy: number, tx: number, ty: number) {
  const sag = 10 + Math.hypot(tx - sx, ty - sy) * 0.06;
  const cx = (sx + tx) / 2;
  const cy = Math.max(sy, ty) + sag;
  return {
    path: `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`,
    labelX: (sx + 2 * cx + tx) / 4,
    labelY: (sy + 2 * cy + ty) / 4,
  };
}

function Yarn({ id, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<YarnEdgeType>) {
  if (!data) return null;
  const { thread } = data;
  const w = threadWidth(thread.weight);
  const { path, labelX, labelY } = yarnPath(sourceX, sourceY, targetX, targetY);

  return (
    <>
      {selected && (
        <path d={path} fill="none" stroke="rgb(74 55 40 / 0.2)" strokeWidth={w + 10} strokeLinecap="round" />
      )}
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={28}
        style={{ stroke: "var(--color-terracotta)", strokeWidth: w, strokeLinecap: "round" }}
      />
      {/* fibre twist, purely decorative */}
      <path
        d={path}
        fill="none"
        stroke="rgb(255 251 244 / 0.35)"
        strokeWidth={Math.max(1, w / 3)}
        strokeDasharray="1 5"
        strokeLinecap="round"
        pointerEvents="none"
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute rounded-sm bg-paper/95 px-2 py-0.5 text-xs text-walnut shadow-sm"
          style={{
            transform: `translate(-50%, 0) translate(${labelX}px, ${labelY + w / 2 + 6}px)`,
            zIndex: 1001, // above the cards, like the yarn
          }}
        >
          shared {thread.kind} · weight {thread.weight.toFixed(2)}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const YarnEdge = memo(Yarn);
