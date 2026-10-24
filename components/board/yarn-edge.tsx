"use client";

import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";
import { threadWidth, type BoardThread } from "@/lib/events";
import { Pushpin } from "./pushpin";

// `animate`: the thread arrived after the board loaded, so it is drawn in. `retract`: its clue_explained row
// arrived after the board loaded, so the suspicion yarn is pulled back; otherwise an explained thread shows
// only its fact line.
export type YarnEdgeType = Edge<{ thread: BoardThread; animate: boolean; retract: boolean }, "yarn">;

const INSET = 12; // yarn ends this far inside a card's edge, under its pin

// Where the line between two card centres meets each card's edge (pulled in by INSET).
function endpoints(a: InternalNode, b: InternalNode) {
  const box = (n: InternalNode) => {
    const w = n.measured.width ?? 260, h = n.measured.height ?? 180;
    return { cx: n.internals.positionAbsolute.x + w / 2, cy: n.internals.positionAbsolute.y + h / 2, hw: w / 2, hh: h / 2 };
  };
  const A = box(a), B = box(b);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  const at = (P: typeof A, sx: number, sy: number) => {
    const s = Math.min((P.hw - INSET) / Math.max(Math.abs(sx), 1e-6), (P.hh - INSET) / Math.max(Math.abs(sy), 1e-6));
    return { x: P.cx + sx * s, y: P.cy + sy * s };
  };
  return { s: at(A, dx, dy), t: at(B, -dx, -dy) };
}

// Yarn sags a little between pins.
export function yarnPath(sx: number, sy: number, tx: number, ty: number) {
  const sag = 14 + Math.hypot(tx - sx, ty - sy) * 0.07;
  const cx = (sx + tx) / 2;
  const cy = (sy + ty) / 2 + sag;
  return {
    path: `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`,
    labelX: (sx + 2 * cx + tx) / 4,
    labelY: (sy + 2 * cy + ty) / 4,
  };
}

const DRAW_S = 0.7;

function Yarn({ id, source, target, data, selected }: EdgeProps<YarnEdgeType>) {
  const a = useInternalNode(source);
  const b = useInternalNode(target);
  const reduce = useReducedMotion();
  if (!a || !b || !data) return null;
  const { thread, animate, retract } = data;
  const explained = thread.explained;
  const { s, t } = endpoints(a, b);
  const { path, labelX, labelY } = yarnPath(s.x, s.y, t.x, t.y);
  const shadow = yarnPath(s.x + 2, s.y + 4, t.x + 2, t.y + 4).path;
  const w = threadWidth(thread.weight);
  const drawIn = animate && !reduce;
  const pullBack = retract && !reduce;
  const showSuspicion = !explained || pullBack;
  // The tag sits in the gap between the cards: when the full text wouldn't fit, a short one (details in the panel).
  const full = explained
    ? `${thread.kind} · explained · ${explained.ruleId ?? explained.explainedBy}`
    : `${thread.kind} · ${thread.weight.toFixed(2)}`;
  const short = explained ? `${thread.kind} · explained` : thread.kind;
  const label = Math.hypot(t.x - s.x, t.y - s.y) > full.length * 6.2 + 28 ? full : short;

  return (
    <>
      {/* invisible wide path: what you click to select the thread */}
      <BaseEdge id={id} path={path} interactionWidth={26} style={{ stroke: "transparent" }} />

      {selected && <path d={path} fill="none" stroke="rgb(240 194 126 / 0.45)" strokeWidth={w + 10} strokeLinecap="round" />}

      {/* the fact stays on the board after an explanation: a pale dashed line */}
      {explained && (
        <motion.path
          d={path}
          fill="none"
          stroke="rgb(214 228 196 / 0.85)"
          strokeWidth={1.6}
          strokeDasharray="7 6"
          strokeLinecap="round"
          initial={pullBack ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: pullBack ? DRAW_S : 0, duration: 0.4 }}
          pointerEvents="none"
        />
      )}

      {showSuspicion && (
        <motion.g
          initial={drawIn ? { opacity: 1 } : false}
          animate={{ opacity: explained ? 0 : 1 }}
          transition={{ delay: explained ? DRAW_S * 0.8 : 0, duration: 0.25 }}
          pointerEvents="none"
        >
          <motion.path
            d={shadow}
            fill="none"
            stroke="rgb(0 0 0 / 0.35)"
            strokeWidth={w + 0.5}
            strokeLinecap="round"
            initial={drawIn ? { pathLength: 0 } : false}
            animate={{ pathLength: explained ? 0 : 1 }}
            transition={{ duration: DRAW_S, ease: "easeInOut" }}
          />
          <motion.path
            d={path}
            fill="none"
            stroke="#c0462f"
            strokeWidth={w}
            strokeLinecap="round"
            initial={drawIn ? { pathLength: 0 } : false}
            animate={{ pathLength: explained ? 0 : 1 }}
            transition={{ duration: DRAW_S, ease: "easeInOut" }}
          />
          {/* fibre twist */}
          <motion.path
            d={path}
            fill="none"
            stroke="rgb(255 220 200 / 0.35)"
            strokeWidth={Math.max(0.8, w / 3)}
            strokeDasharray="1.5 4"
            strokeLinecap="round"
            initial={drawIn ? { pathLength: 0 } : false}
            animate={{ pathLength: explained ? 0 : 1 }}
            transition={{ duration: DRAW_S, ease: "easeInOut" }}
          />
        </motion.g>
      )}

      <EdgeLabelRenderer>
        {/* pins where the yarn is tied to each card, above the cards */}
        {[s, t].map((p, i) => (
          <div
            key={i}
            aria-hidden
            className="pointer-events-none absolute"
            style={{ transform: `translate(-50%, -62%) translate(${p.x}px, ${p.y}px)`, zIndex: 1002 }}
          >
            <Pushpin color="red" size={15} />
          </div>
        ))}
        {/* positioned by a plain wrapper: Motion owns the transform of the element it animates */}
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{ transform: `translate(-50%, 0) translate(${labelX}px, ${labelY + w / 2 + 8}px)`, zIndex: 1001 }}
        >
          <motion.span
            className={`relative block whitespace-nowrap px-2 py-0.5 text-[11px] font-medium shadow-[0_3px_6px_rgb(0_0_0/0.45)] ${
              explained ? "bg-[#e3ecd6] text-walnut" : "bg-paper text-walnut"
            }`}
            initial={drawIn ? { opacity: 0, y: -4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: drawIn ? DRAW_S : 0, duration: 0.3 }}
          >
            <span aria-hidden className="tape absolute -top-1.5 left-1/2 h-2.5 w-8 -translate-x-1/2 rotate-2" />
            {label}
          </motion.span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const YarnEdge = memo(Yarn);
