"use client";

import { crsRequestIds, threadWidth, type BoardCard, type BoardState, type BoardThread, type FeedMode } from "@/lib/events";
import type { Selection } from "./corkboard";
import { SourceList } from "./source-list";
import { StatusChip } from "./status-chip";

export function EvidencePanel({ board, selection, mode }: { board: BoardState; selection: Selection; mode: FeedMode }) {
  const card = selection?.kind === "card" ? board.cards.find((c) => c.id === selection.id) : undefined;
  const thread = selection?.kind === "thread" ? board.threads.find((t) => t.id === selection.id) : undefined;

  return (
    <aside
      aria-label="Evidence details"
      aria-live="polite"
      className="w-[22rem] shrink-0 overflow-y-auto rounded-lg border border-walnut/10 bg-paper p-5 shadow-[0_2px_10px_rgb(74_55_40/0.12)]"
    >
      <h2 className="font-display text-xl font-semibold">Evidence</h2>
      {card && <CardDetails card={card} mode={mode} />}
      {thread && <ThreadDetails thread={thread} mode={mode} />}
      {!card && !thread && <Empty board={board} />}
    </aside>
  );
}

function Empty({ board }: { board: BoardState }) {
  return (
    <div className="mt-3 space-y-4 text-sm leading-relaxed">
      <p>Select a card or a thread on the board to see the evidence behind it.</p>
      <p className="text-walnut/80">
        {board.cards.length} cards · {board.threads.length} threads · last event seq {board.lastSeq}
      </p>
      <div className="rounded border border-walnut/10 bg-cream/60 p-3 text-[13px]">
        <p className="font-medium">Reading the yarn</p>
        <p className="mt-1">
          Thickness is 1 + 8 × weight, where weight reflects how rare the shared attribute is in the pool. It is a
          design weight, not a fraud probability. A connection is not proof.
        </p>
      </div>
    </div>
  );
}

function CardDetails({ card, mode }: { card: BoardCard; mode: FeedMode }) {
  return (
    <div className="mt-3 space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-walnut/80">Loan application</p>
        <p className="text-2xl font-semibold">{card.id}</p>
        <div className="mt-2">
          <StatusChip status={card.status} />
        </div>
      </div>
      {card.note && <p className="text-sm leading-relaxed">{card.note}</p>}
      <Provenance
        rows={[
          ["Pinned by", `${card.pinnedBy}${card.tool ? ` (${card.tool})` : ""}`],
          ["Event", `seq ${card.firstSeq}`],
          ["Time", card.ts],
        ]}
        mode={mode}
        simulated={card.simulated}
        requestIds={crsRequestIds(card.sources)}
      />
      <Section title="Sources">
        <SourceList sources={card.sources} />
      </Section>
    </div>
  );
}

function ThreadDetails({ thread, mode }: { thread: BoardThread; mode: FeedMode }) {
  return (
    <div className="mt-3 space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-walnut/80">Thread</p>
        <p className="text-2xl font-semibold">Shared {thread.kind}</p>
        <p className="mt-1 text-sm">
          {thread.a} ↔ {thread.b}
        </p>
      </div>
      {thread.note && <p className="text-sm leading-relaxed">{thread.note}</p>}
      <div className="rounded border border-walnut/10 bg-cream/60 p-3 text-[13px]">
        <p>
          Weight <span className="font-semibold">{thread.weight.toFixed(2)}</span> · yarn{" "}
          {threadWidth(thread.weight).toFixed(1)} px
        </p>
        <p className="mt-1 text-walnut/80">Design weight from rarity, not a fraud probability. A connection is not proof.</p>
      </div>
      <Provenance
        rows={[
          ["Found by", `${thread.tool ?? "unknown tool"}`],
          ["Event", `seq ${thread.firstSeq}`],
          ["Time", thread.ts],
          ["Edge id", thread.id],
        ]}
        mode={mode}
        simulated={thread.simulated}
        requestIds={crsRequestIds(thread.sources)}
      />
      <Section title="Sources">
        <SourceList sources={thread.sources} />
      </Section>
    </div>
  );
}

function Provenance({
  rows,
  mode,
  simulated,
  requestIds,
}: {
  rows: [string, string][];
  mode: FeedMode;
  simulated: boolean;
  requestIds: string[];
}) {
  return (
    <Section title="Provenance">
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
        <Row k="Mode" v={mode.toUpperCase()} />
        <Row k="Verification" v={simulated ? "simulated" : "live"} />
        <Row k="CRS RequestID" v={requestIds.length ? requestIds.join(", ") : "none (no CRS call on this row)"} />
      </dl>
    </Section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-walnut/80">{k}</dt>
      <dd className="break-words font-medium">{v}</dd>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-walnut/80">{title}</h3>
      {children}
    </section>
  );
}
