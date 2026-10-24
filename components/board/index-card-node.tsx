"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";
import { crsRequestIds, type BoardCard, type SourceRef } from "@/lib/events";
import { cardTilt, cardWidth } from "./layout";
import { Pushpin } from "./pushpin";
import { StatusChip } from "./status-chip";

// `animate`: the card arrived after the board loaded, so it pins in; history appears in place.
// `lead`: first pinned by lead_opened, so it is the centre of its cluster.
export type IndexCardNodeType = Node<{ card: BoardCard; animate: boolean; lead: boolean }, "indexCard">;

// Yarn is drawn edge to edge (see YarnEdge); React Flow still needs a handle on each card.
const hiddenHandle = { top: "50%", left: "50%", width: 1, height: 1, opacity: 0, pointerEvents: "none" } as const;

const SOURCE_WORD: Record<SourceRef["kind"], string> = {
  row: "data room",
  document: "document",
  crs: "CRS",
  lookup: "lookup",
  rule: "rule",
  human: "human answer",
  event: "earlier event",
};

function hash(id: string) {
  let h = 7;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const SHADOW = "drop-shadow(0px 2px 2px rgb(0 0 0 / 0.45)) drop-shadow(0px 10px 12px rgb(0 0 0 / 0.38))";
const SHADOW_LIFTED = "drop-shadow(0px 4px 3px rgb(0 0 0 / 0.5)) drop-shadow(0px 20px 22px rgb(0 0 0 / 0.5))";

function IndexCard({ data, selected }: NodeProps<IndexCardNodeType>) {
  const { card, animate, lead } = data;
  const reduce = useReducedMotion();
  const tilt = cardTilt(card.id);
  const h = hash(card.id);
  const width = cardWidth(card.id) + (lead ? 14 : 0);
  const kinds = [...new Set(card.sources.map((s) => SOURCE_WORD[s.kind]))];
  const crs = crsRequestIds(card.sources);

  return (
    <motion.div
      className="relative"
      style={{ width, transformOrigin: "50% 12px" }}
      initial={animate && !reduce ? { opacity: 0, y: -16, rotate: tilt - 4, scale: 1.03, filter: SHADOW_LIFTED } : false}
      animate={{ opacity: 1, y: selected ? -3 : 0, rotate: tilt, scale: 1, filter: selected ? SHADOW_LIFTED : SHADOW }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 24, mass: 0.8 }}
    >
      <Handle id="pin-in" type="target" position={Position.Top} isConnectable={false} style={hiddenHandle} />
      <Handle id="pin-out" type="source" position={Position.Top} isConnectable={false} style={hiddenHandle} />

      <div
        className={`card-frame relative rounded-[2px] transition-[outline-color] duration-150 ${
          selected ? "outline-2 outline-offset-4 outline-amber" : "outline-2 outline-offset-4 outline-transparent"
        }`}
      >
        <article
          className={`paper worn-${h % 4} px-4 pb-3.5 pt-6 text-walnut`}
          style={{ backgroundPosition: `0 0, ${-(h % 400)}px ${-(h % 260)}px` }}
        >
          <header className="flex items-baseline justify-between gap-2 border-b border-terracotta/45 pb-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-walnut/85">
              {lead ? "Lead · loan application" : "Loan application"}
            </p>
            <p className="shrink-0 font-mono text-[10.5px] text-walnut/80">seq {card.firstSeq}</p>
          </header>
          <h3 className={`mt-1.5 font-semibold leading-tight tracking-tight ${lead ? "text-[1.6rem]" : "text-[1.3rem]"}`}>
            {card.id}
          </h3>

          <div className="mt-2 space-y-1.5 text-[12.5px] leading-[1.35]">
            <StatusChip status={card.status} />
            <p>
              Pinned by <span className="font-medium">{card.pinnedBy}</span>
              {card.tool && <span className="text-walnut/80"> · {card.tool}</span>}
            </p>
            <p className="text-walnut/85">
              {card.sources.length} source{card.sources.length === 1 ? "" : "s"}
              {kinds.length > 0 && <>: {kinds.join(", ")}</>}
            </p>
            {crs.length > 0 && (
              <p className="truncate font-mono text-[11px]" title={crs.join(", ")}>
                CRS RequestID {crs[0]}
                {crs.length > 1 && ` +${crs.length - 1}`}
              </p>
            )}
            {card.simulated && (
              <span className="inline-block rounded-sm bg-honey/30 px-1.5 py-px text-[10px] font-semibold tracking-[0.1em]">
                SIMULATED
              </span>
            )}
          </div>
        </article>

        {/* the lead's own note from its lead_opened row, taped to the card's bottom margin (never over its text) */}
        {lead && card.note && (
          <div
            className="sticky-note absolute -bottom-[66px] -right-7 w-[148px] px-2.5 pb-2 pt-3 shadow-[0_6px_10px_-4px_rgb(0_0_0/0.5)]"
            style={{ transform: `rotate(${2 + (h % 4)}deg)` }}
          >
            <span aria-hidden className="tape pointer-events-none absolute -top-1 left-1/2 h-4 w-12 -translate-x-1/2 -rotate-3" />
            <p className="font-hand text-[17px] leading-[1.05] text-walnut line-clamp-3">{card.note}</p>
          </div>
        )}
      </div>

      {/* decoration: pin at the top, tape across a corner on some cards; both stay in the card's margins */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-7px] -translate-x-1/2">
        <Pushpin color={lead ? "red" : "brass"} size={lead ? 24 : 20} />
      </div>
      {h % 3 === 0 && (
        <span
          aria-hidden
          className="tape pointer-events-none absolute -left-[22px] -top-[2px] h-4 w-14 -rotate-45"
        />
      )}
    </motion.div>
  );
}

export const IndexCardNode = memo(IndexCard);
