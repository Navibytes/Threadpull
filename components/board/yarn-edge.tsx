"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useStore,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";
import { sharedLabel, threadWidth, type BoardThread } from "@/lib/events";
import { EASE_OUT, PinPop } from "./entrance";
import { ENTRANCE, type ThreadEnter } from "./entrance-plan";
import type { IndexCardNodeType } from "./index-card-node";
import { essentialPx, FULL_ZOOM } from "./index-card-node";
import { LAYOUT } from "./layout";
import { Pushpin } from "./pushpin";

// `enter`: when this thread's pins press in, its yarn is drawn and its label appears (seconds from mount, from
// entrance-plan.ts), or null when it is simply on the wall. `retract`: its clue_explained row arrived after the
// board loaded, so the suspicion yarn is pulled back; otherwise an explained thread shows only its fact line.
export type YarnEdgeType = Edge<{ thread: BoardThread; enter: ThreadEnter | null; retract: boolean }, "yarn">;

const INSET = 6; // yarn ends this far inside a card's edge, under its pin: inside the card's margin, clear of text

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

// Yarn sags a little between pins (the same sag the layout plans for).
export function yarnPath(sx: number, sy: number, tx: number, ty: number) {
  const cx = (sx + tx) / 2;
  const cy = (sy + ty) / 2 + LAYOUT.threadSag(Math.hypot(tx - sx, ty - sy));
  return {
    path: `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`,
    at: (u: number) => ({
      x: (1 - u) ** 2 * sx + 2 * (1 - u) * u * cx + u * u * tx,
      y: (1 - u) ** 2 * sy + 2 * (1 - u) * u * cy + u * u * ty,
    }),
  };
}

type Box = { x: number; y: number; w: number; h: number };

// Every card's box as drawn now, including a lead's taped note, which hangs below and to the right.
function cardBoxes(lookup: Map<string, InternalNode>): Box[] {
  return [...lookup.values()].map((n) => {
    const d = n.data as IndexCardNodeType["data"];
    const note = d?.lead && d.card.note;
    return {
      x: n.internals.positionAbsolute.x,
      y: n.internals.positionAbsolute.y,
      w: (n.measured.width ?? 260) + (note ? 28 : 0),
      h: (n.measured.height ?? LAYOUT.cardH) + (note ? LAYOUT.leadNoteH : 0),
    };
  });
}

// Tags render at about 12px or more: below FULL_ZOOM their font grows as the board zooms out, like the cards'
// essential labels. Width and height scale with the font (11px Plex: about 6.3px a character plus padding).
const tagPx = (zoom: number) => (zoom >= FULL_ZOOM ? 12 : essentialPx(zoom));
const labelWidth = (text: string, px: number) => (text.length * 6.3 + 18) * (px / 11);
const SPOTS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];

// Where the tag hangs: the first point along the thread (from the middle outwards) where it touches no card.
// Tries the full text first, then the short one; if nothing is clear, the short text at the middle.
function placeLabel(at: (u: number) => { x: number; y: number }, drop: number, texts: string[], cards: Box[], px: number) {
  for (const text of texts) {
    const w = labelWidth(text, px);
    for (const u of SPOTS) {
      const p = at(u);
      const r = { x: p.x - w / 2, y: p.y + drop, w, h: px * 1.8 };
      const clear = cards.every((c) => r.x + r.w < c.x - 4 || c.x + c.w < r.x - 4 || r.y + r.h < c.y - 4 || c.y + c.h < r.y - 4);
      if (clear) return { text, x: p.x, y: p.y + drop };
    }
  }
  const p = at(0.5);
  return { text: texts[texts.length - 1], x: p.x, y: p.y + drop };
}

const DRAW_S = 0.7; // pulling the yarn back when a check explains it (clue_explained): slower than drawing it in, on purpose
const RETRACT = { duration: DRAW_S, ease: "easeInOut" } as const;

function Yarn({ id, source, target, data, selected }: EdgeProps<YarnEdgeType>) {
  const a = useInternalNode(source);
  const b = useInternalNode(target);
  const lookup = useStore((st) => st.nodeLookup);
  const zoom = useStore((st) => Math.round(st.transform[2] * 40) / 40);
  const px = tagPx(zoom);
  const reduce = useReducedMotion();
  // wait until both cards are measured: before that the yarn would be drawn along a guessed path and jump
  if (!a || !b || !data || !a.measured.width || !b.measured.width) return null;
  const { thread, retract } = data;
  const enter = reduce ? null : data.enter; // reduced motion shows the finished board at once
  const explained = thread.explained;
  const { s, t } = endpoints(a, b);
  const { path, at } = yarnPath(s.x, s.y, t.x, t.y);
  const shadow = yarnPath(s.x + 2, s.y + 4, t.x + 2, t.y + 4).path;
  const w = threadWidth(thread.weight);
  const drawIn = !!enter;
  // drawing in follows the plan; pulling back after an explanation keeps its own, slower timing
  const drawTransition = enter ? { duration: ENTRANCE.yarnMs / 1000, delay: enter.yarn, ease: EASE_OUT } : RETRACT;
  const pathTransition = explained ? RETRACT : drawTransition;
  const pullBack = retract && !reduce;
  const maskId = `reveal-${id.replace(/[^\w-]/g, "_")}`;
  const revealFact = !!enter && !pullBack; // an explained thread on the wall draws its dashed fact line in, along the same curve
  const showSuspicion = !explained || pullBack;
  // The tag hangs off the thread clear of every card; a short text when the full one won't fit (details in the panel).
  const name = sharedLabel(thread.kind); // what the two loans share, in words; the weight is in the details panel
  const texts = explained ? [`${name} · explained`, name, "Explained"] : [name, name.replace(/ (number|address)$/, "")];
  // the label sits on the thread itself, like a strip of tape holding it down; the search moves it along the
  // thread until it clears every card
  const tag = placeLabel(at, 0, texts, cardBoxes(lookup), px);

  return (
    <>
      {/* invisible wide path: what you click to select the thread */}
      <BaseEdge id={id} path={path} interactionWidth={26} style={{ stroke: "transparent" }} />

      {selected && <path d={path} fill="none" stroke="rgb(240 194 126 / 0.45)" strokeWidth={w + 10} strokeLinecap="round" />}

      {explained && revealFact && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={-20000} y={-20000} width={40000} height={40000}>
            <motion.path
              d={path}
              fill="none"
              stroke="#fff"
              strokeWidth={14}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={drawTransition}
            />
          </mask>
        </defs>
      )}

      {/* the fact stays on the board after an explanation: a pale dashed line */}
      {explained && (
        <motion.path
          mask={revealFact ? `url(#${maskId})` : undefined}
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
            transition={pathTransition}
          />
          <motion.path
            d={path}
            fill="none"
            stroke="#c0462f"
            strokeWidth={w}
            strokeLinecap="round"
            initial={drawIn ? { pathLength: 0 } : false}
            animate={{ pathLength: explained ? 0 : 1 }}
            transition={pathTransition}
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
            transition={pathTransition}
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
            {/* suspicion is tied with red; an explained thread (a fact only) with brass */}
            <PinPop delay={enter?.pins}>
              <Pushpin color={explained ? "brass" : "red"} size={15} />
            </PinPop>
          </div>
        ))}
        {/* positioned by a plain wrapper: Motion owns the transform of the element it animates */}
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{ transform: `translate(-50%, -50%) translate(${tag.x}px, ${tag.y}px)`, zIndex: 1001 }}
        >
          {/* the tilt sits on a plain element so the label's own transform is free for its reveal */}
          <div style={{ rotate: explained ? "1deg" : "-1.5deg" }}>
            <motion.span
              className={`relative block whitespace-nowrap px-[1.1em] py-[0.2em] font-medium text-walnut shadow-[0_2px_4px_rgb(0_0_0/0.35)] ${
                explained ? "bg-[#e3ecd6]" : "bg-[#fbf6e6]"
              }`}
              style={{ fontSize: px }}
              initial={enter ? { opacity: 0, transform: "translateY(-4px)" } : false}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={enter ? { duration: ENTRANCE.labelMs / 1000, delay: enter.label, ease: EASE_OUT } : { duration: 0 }}
            >
              {/* a strip of tape across each end holds the label onto the thread */}
              <span aria-hidden className="tape absolute -left-1.5 top-1/2 h-[120%] w-4 -translate-y-1/2 -rotate-12" />
              <span aria-hidden className="tape absolute -right-1.5 top-1/2 h-[120%] w-4 -translate-y-1/2 rotate-12" />
              {tag.text}
            </motion.span>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const YarnEdge = memo(Yarn);
