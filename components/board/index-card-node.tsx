"use client";

import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { memo, useRef } from "react";
import { cardFinding, loanName, loanShortName, type BoardCard, type CardFinding, type SourceRef } from "@/lib/events";

export { cardFinding };
import { ImpactFx, PinStrike } from "./entrance";
import { atRest, EASE_OUT, NO_SHUDDER, SHUDDER, slam } from "./entrance-motion";
import { ENTRANCE, secs, type CardEnter } from "./entrance-plan";
import { cardSize, cardTilt } from "./layout";
import { Pushpin } from "./pushpin";
import { StatusChip } from "./status-chip";

// `enter`: when this card's paper is thrown down and its pin strikes (seconds from mount, from entrance-plan.ts), or
// null when it is simply on the wall: history appears in place, and the board's entrance plan covers the rest.
// `lead`: first pinned by lead_opened, so it is drawn as the case folder.
// `showSeq`: the board's "event numbers" debug option.
// `finding`: why the card is on the board, from its recorded threads (cardFinding).
export type IndexCardNodeType = Node<
  { card: BoardCard; enter: CardEnter | null; enterKey: number; lead: boolean; showSeq: boolean; finding: CardFinding | null; detailHref: string | null },
  "indexCard"
>;

// Yarn is drawn edge to edge (see YarnEdge); React Flow still needs a handle on each card.
const hiddenHandle = { top: "50%", left: "50%", width: 1, height: 1, opacity: 0, pointerEvents: "none" } as const;

// Sources in plain words: "1 data-room row", "2 sources: data room, CRS".
const SOURCE_WORD: Record<SourceRef["kind"], string> = {
  row: "data room",
  document: "document",
  crs: "CRS",
  lookup: "lookup",
  rule: "saved rule",
  human: "human answer",
  event: "earlier event",
};
export function sourcesInWords(sources: SourceRef[]) {
  if (sources.length === 0) return "No sources recorded";
  if (sources.length === 1 && sources[0].kind === "row") return "1 data-room row";
  const kinds = [...new Set(sources.map((s) => SOURCE_WORD[s.kind]))];
  return `${sources.length} source${sources.length === 1 ? "" : "s"}: ${kinds.join(", ")}`;
}

// Level of detail. At or above FULL_ZOOM every label renders at 12px or more, so the full face shows. Below it
// the card shows its essentials only (ID, LEAD tab, SIMULATED and CRS stamps), sized from the zoom so they
// still render at about 12px; everything else is in the evidence inspector.
export const FULL_ZOOM = 0.93;
export const essentialPx = (zoom: number) => Math.min(28, Math.max(13, 12.4 / zoom)); // CSS px for small labels
const idPx = (zoom: number, lead: boolean, full: boolean) =>
  full ? (lead ? 30 : 22) : Math.min(lead ? 52 : 40, Math.max(lead ? 30 : 22, (lead ? 24 : 20) / zoom));

function hash(id: string) {
  let h = 7;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const SHADOW = "drop-shadow(0px 2px 2px rgb(0 0 0 / 0.45)) drop-shadow(0px 10px 12px rgb(0 0 0 / 0.38))";
const SHADOW_LIFTED = "drop-shadow(0px 4px 3px rgb(0 0 0 / 0.5)) drop-shadow(0px 20px 22px rgb(0 0 0 / 0.5))";

// An inked rubber stamp. Only for facts the row carries: SIMULATED (row.simulated) and CRS (a crs source).
function Stamp({ kind, px, detail }: { kind: "simulated" | "crs"; px: number; detail?: string }) {
  return (
    <span
      className={`ink-stamp ink-${kind} inline-flex items-baseline gap-1.5 whitespace-nowrap`}
      style={{ fontSize: px, transform: `rotate(${kind === "simulated" ? -4 : 3}deg)` }}
      title={kind === "simulated" ? "Simulated: not a live verification" : detail}
    >
      {kind === "simulated" ? "Simulated" : "CRS"}
      {kind === "crs" && detail && <span className="font-medium normal-case tracking-normal opacity-90">{detail}</span>}
    </span>
  );
}

function IndexCard({ data, selected }: NodeProps<IndexCardNodeType>) {
  const { card, lead, showSeq, finding, detailHref } = data;
  const reduce = useReducedMotion();
  const enter = reduce ? null : data.enter; // reduced motion shows the finished board at once
  // Once its entrance has played, the card answers selection with the spring below. A replay of its case gives it a new
  // `enterKey`: its animation wrappers remount and the entrance plays again.
  const played = useRef({ key: data.enterKey, done: !enter });
  const entering = !!enter && !(played.current.key === data.enterKey && played.current.done);
  const shudders = !!enter?.fx; // the paper shudders where the pin goes in (only on small entrances)
  const zoom = useStore((s) => Math.round(s.transform[2] * 40) / 40); // quantized: re-render only on real zoom steps
  const full = zoom >= FULL_ZOOM;
  const label = full ? 13 : essentialPx(zoom);
  const tilt = cardTilt(card.id);
  const h = hash(card.id);
  const { w, h: height } = cardSize(card.id, lead);
  const crs = card.sources.filter((s) => s.kind === "crs");
  const crsDetail =
    crs.length === 1 && crs[0].kind === "crs" ? crs[0].product.replace(/_/g, " ") : crs.length > 1 ? `${crs.length} calls` : undefined;
  const showStatus = card.status !== "Not reviewed"; // shown once a status row has set a real status
  const showNote = lead && !!card.note && zoom >= 0.7; // the note's handwriting stays readable
  const origin = lead ? "calc(100% - 22px) 0" : "18px 0"; // the card hangs from its pin
  const thrown = enter ? slam(tilt, h) : null; // thrown the same way every time this card is laid out

  return (
    <motion.div
      key={data.enterKey}
      className="relative"
      style={{ width: w, height, transformOrigin: origin }}
      // Paper slammed onto the board: thrown from above and spun, it lands hard (squashed), rebounds, wobbles, rests.
      // transform and opacity only, on this wrapper; the node's size, position and handles never change. The shadow
      // stays put during the throw (animating a filter on every card is the expensive part): the thump under it is
      // ImpactFx, a separate layer.
      initial={thrown ? { opacity: 0, transform: thrown.frames[0], filter: SHADOW } : false}
      animate={{
        opacity: 1,
        transform: entering && thrown ? thrown.frames : atRest(tilt, selected),
        filter: selected ? SHADOW_LIFTED : SHADOW,
      }}
      transition={
        entering && thrown
          ? {
              opacity: { duration: secs(70), delay: enter.paper },
              transform: { duration: secs(ENTRANCE.paperMs), delay: enter.paper, times: thrown.times, ease: thrown.ease },
            }
          : reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 420, damping: 24, mass: 0.8 }
      }
      onAnimationComplete={() => {
        played.current = { key: data.enterKey, done: true };
      }}
    >
      {/* the impact: a dark thump under the edges and a puff of dust, behind the card, taking no space */}
      {enter?.fx && entering && <ImpactFx at={enter.paper + secs(ENTRANCE.paperMs * ENTRANCE.impactAt)} />}
      {/* everything the card holds, on a wrapper of its own so the pin's shudder never fights the slam's transform */}
      <motion.div
        className="relative h-full w-full"
        style={{ transformOrigin: origin }}
        initial={{ transform: NO_SHUDDER }}
        animate={{ transform: shudders ? [...SHUDDER.frames] : NO_SHUDDER }}
        transition={
          shudders && enter
            ? { duration: secs(ENTRANCE.vibrateMs), delay: enter.pin + secs(ENTRANCE.pinMs * ENTRANCE.pinStrikeAt), times: [...SHUDDER.times], ease: EASE_OUT }
            : { duration: 0 }
        }
      >
        <Handle id="pin-in" type="target" position={Position.Top} isConnectable={false} style={hiddenHandle} />
        <Handle id="pin-out" type="source" position={Position.Top} isConnectable={false} style={hiddenHandle} />

        {/* the folder's tab, above the folder */}
        {lead && (
          <span
            className="folder folder-tab absolute left-4 flex items-center px-3 font-semibold uppercase tracking-[0.14em] text-walnut"
            style={{ fontSize: label, height: label * 1.75, top: -label * 1.75 + 2 }}
          >
            {card.spotCheck ? "Spot check" : "Lead"}
          </span>
        )}

        <div
          className={`card-frame relative h-full rounded-[2px] transition-[outline-color] duration-150 ${
            selected ? "outline-2 outline-offset-4 outline-amber" : "outline-2 outline-offset-4 outline-transparent"
          }`}
        >
          <article
            className={`${lead ? "folder rounded-[3px] px-5 pb-4 pt-4" : `index-ruled worn-${h % 4} px-4 pb-3 pt-5`} flex h-full flex-col text-walnut`}
            style={{ backgroundPosition: lead ? undefined : `0 0, 0 0, ${-(h % 300)}px ${-(h % 200)}px` }}
          >
            <h3
              className="font-semibold leading-none tracking-tight tabular-nums"
              style={{ fontSize: idPx(zoom, lead, full) }}
              title={`Original ID: ${card.id}`}
            >
              {full ? loanName(card.id) : loanShortName(card.id)}
            </h3>

            {full && (
              <>
                {/* index cards: the head rule sits under the ID; the facts go on the ruled lines */}
                {!lead && <span aria-hidden className="mt-2 block h-[1.5px] bg-terracotta/55" />}
                {/* 2: why this loan is on the board */}
                <p
                  className={
                    lead
                      ? "mt-3 line-clamp-3 text-[14px] font-medium leading-[19px]"
                      : "mt-1 line-clamp-2 text-[13px] font-medium leading-[19px]"
                  }
                  title={finding?.text}
                >
                  {finding?.text ?? "A loan application on the board."}
                </p>
                {/* 3: its recorded status. A loan with no status row yet has no decision, which is not a status. */}
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2">
                  {showStatus ? (
                    <StatusChip status={card.status} />
                  ) : (
                    lead && <p className="text-[13px] leading-[22px] text-walnut/80">No decision recorded yet.</p>
                  )}
                  {!lead && finding?.explained && (
                    <span className="rounded-sm bg-sage/25 px-1.5 text-[13px] font-medium leading-5 text-[#3f5233]">Explained</span>
                  )}
                </div>
              </>
            )}

            <div className="mt-auto flex flex-wrap items-end gap-x-2.5 gap-y-1.5">
              {crs.length > 0 && <Stamp kind="crs" px={label} detail={full ? crsDetail : undefined} />}
              {/* a lead's case on the dashboard. nodrag/nopan: pressing it must not start moving the card */}
              {detailHref && (
                <Link
                  href={detailHref}
                  aria-label={`Case details for ${loanName(card.id)} on the dashboard`}
                  className="nodrag nopan ml-auto rounded-sm border border-walnut/40 bg-[#f4ead8] px-2 font-semibold leading-6 text-walnut shadow-[0_2px_3px_rgb(0_0_0/0.25)] hover:bg-white focus-visible:outline-2 focus-visible:outline-amber"
                  style={{ fontSize: label }}
                >
                  Case details &rarr;
                </Link>
              )}
              {showSeq && (
                <span
                  className="ml-auto rounded-sm bg-walnut/10 px-1 font-medium tabular-nums text-walnut"
                  style={{ fontSize: label }}
                  aria-label={`event seq ${card.firstSeq}`}
                >
                  seq {card.firstSeq}
                </span>
              )}
            </div>
          </article>

          {/* the lead's own note from its lead_opened row, taped to the folder's bottom margin (never over its text) */}
          {showNote && (
            <div
              className="sticky-note absolute top-[calc(100%-14px)] -right-7 w-[148px] px-2.5 pb-2 pt-3 shadow-[0_6px_10px_-4px_rgb(0_0_0/0.5)]"
              style={{ transform: `rotate(${2 + (h % 4)}deg)` }}
            >
              <span aria-hidden className="tape pointer-events-none absolute -top-1 left-1/2 h-4 w-12 -translate-x-1/2 -rotate-3" />
              <p className="font-hand text-[17px] leading-[1.05] text-walnut line-clamp-3">{card.note}</p>
            </div>
          )}
        </div>

        {/* decoration in the margins, clear of the text: the folder is pinned at its top-right corner, an index card
            at its top-left corner, some index cards also taped across the opposite corner */}
        <div
          aria-hidden
          className={`pointer-events-none absolute -translate-x-1/2 ${lead ? "left-[calc(100%-22px)] top-[-9px]" : "left-[18px] top-[-7px]"}`}
        >
          <PinStrike delay={enter?.pin} fx={enter?.fx}>
            <Pushpin color={lead ? "red" : "brass"} size={lead ? 24 : 20} />
          </PinStrike>
        </div>
        {!lead && h % 3 === 0 && (
          <span aria-hidden className="tape pointer-events-none absolute -right-[22px] -top-[2px] h-4 w-14 rotate-45" />
        )}
      </motion.div>
    </motion.div>
  );
}

export const IndexCardNode = memo(IndexCard);
