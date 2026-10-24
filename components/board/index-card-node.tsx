"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { BoardCard } from "@/lib/events";
import { cardTilt } from "./layout";
import { StatusChip } from "./status-chip";

export type IndexCardNodeType = Node<{ card: BoardCard }, "indexCard">;

// The pin sits on the card's top edge; yarn is tied to it and the card tilts around it.
export const PIN_Y = 10;

const hidden = { top: PIN_Y, opacity: 0, pointerEvents: "none" } as const;

function IndexCard({ data, selected }: NodeProps<IndexCardNodeType>) {
  const { card } = data;
  return (
    <div
      className="relative w-64"
      style={{ transform: `rotate(${cardTilt(card.id)}deg)`, transformOrigin: `50% ${PIN_Y}px` }}
    >
      <Handle id="pin-in" type="target" position={Position.Top} isConnectable={false} style={hidden} />
      <Handle id="pin-out" type="source" position={Position.Top} isConnectable={false} style={hidden} />

      <article
        className={`index-card rounded-[3px] px-4 pb-3 pt-7 shadow-[0_2px_3px_rgb(74_55_40/0.2),0_10px_18px_-8px_rgb(74_55_40/0.45)] transition-shadow duration-150 ${
          selected ? "outline-2 outline-terracotta outline-offset-2" : ""
        }`}
      >
        <header className="-mx-4 -mt-1 h-[18px] bg-paper px-4">
          <p className="text-[11px] font-medium uppercase leading-[18px] tracking-[0.14em] text-walnut/80">
            Loan application
          </p>
        </header>
        <h3 className="mt-1.5 bg-paper text-xl font-semibold leading-6">{card.id}</h3>

        <div className="mt-[11px] space-y-[5px] text-[13px] leading-[17px]">
          <div>
            <StatusChip status={card.status} />
          </div>
          <p>
            Pinned by <span className="font-medium">{card.pinnedBy}</span> · seq {card.firstSeq}
          </p>
          <p>
            {card.sources.length} source{card.sources.length === 1 ? "" : "s"}
            {card.simulated && (
              <span className="ml-2 rounded-sm bg-honey/25 px-1.5 py-px text-[11px] font-semibold tracking-[0.08em]">
                SIMULATED
              </span>
            )}
          </p>
        </div>
      </article>

      <Pin />
    </div>
  );
}

function Pin() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[1px_2px_1px_rgb(74_55_40/0.45)]"
      style={{ top: PIN_Y }}
    >
      <defs>
        <radialGradient id="brass" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f4dca0" />
          <stop offset="55%" stopColor="#c9a35a" />
          <stop offset="100%" stopColor="#8a6a2e" />
        </radialGradient>
      </defs>
      <circle cx="9" cy="9" r="7" fill="url(#brass)" />
    </svg>
  );
}

export const IndexCardNode = memo(IndexCard);
