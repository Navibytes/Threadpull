"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  crsRequestIds,
  loanName,
  NOT_PROOF,
  sharedLabel,
  sharedPhrase,
  threadWidth,
  type BoardCard,
  type BoardState,
  type BoardThread,
  type FeedMode,
  type SourceRef,
} from "@/lib/events";
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
      className="panel-paper min-h-0 flex-1 overflow-y-auto rounded-lg p-5"
    >
      <h2 className="font-display text-xl font-semibold">Evidence</h2>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card ? `card:${card.id}` : thread ? `thread:${thread.id}` : "empty"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
        >
          {card && <CardDetails card={card} board={board} mode={mode} />}
          {thread && <ThreadDetails thread={thread} mode={mode} />}
          {!card && !thread && <Empty board={board} />}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

function Empty({ board }: { board: BoardState }) {
  return (
    <div className="mt-3 space-y-4 text-sm leading-relaxed">
      <p>Select a card or a red thread on the board to see what it is and where it comes from.</p>
      <div className="rounded border border-walnut/10 bg-cream/60 p-3 text-[13px]">
        <p className="font-medium">How to read the board</p>
        <p className="mt-1">Each card is a loan application. A red thread joins two loans that share a detail, such as a phone number.</p>
        <p className="mt-1">{NOT_PROOF} A pale dashed thread is a match that was checked and has an innocent explanation.</p>
      </div>
      <details className="text-[13px]">
        <summary className="cursor-pointer font-medium">Technical details</summary>
        <p className="mt-1 text-walnut/80">
          {board.cards.length} cards · {board.threads.length} threads · last event seq {board.lastSeq}. Thread thickness is
          1 + 8 × weight, where weight reflects how rare the shared detail is across the loans. It is a design weight, not a
          fraud probability.
        </p>
      </details>
    </div>
  );
}

// What a kind of source is, in words: what it can and can't establish.
const SOURCE_MEANING: Record<string, string> = {
  row: "The loan file itself (the data room). It shows what the application says.",
  crs: "A CRS credit-bureau lookup. It checks the applicant against an outside record.",
  document: "A document attached to the loan, read as data.",
  lookup: "A public-record lookup.",
  rule: "A saved ruling from an earlier question.",
  human: "An answer from a person.",
  event: "An earlier step in this investigation.",
};
function whereFrom(sources: SourceRef[]): string[] {
  return [...new Set(sources.map((s) => s.kind))].map((k) => SOURCE_MEANING[k]).filter(Boolean);
}

const PINNED_BECAUSE: Partial<Record<string, string>> = {
  lead_opened: "Hazel opened this loan as the one to investigate.",
  link_found: "It was added because it shares a detail with another loan.",
};

function CardDetails({ card, board, mode }: { card: BoardCard; board: BoardState; mode: FeedMode }) {
  const links = board.threads.filter((t) => t.a === card.id || t.b === card.id);
  const meaning = whereFrom(card.sources);
  return (
    <div className="mt-3 space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-walnut/80">Loan application</p>
        <p className="text-2xl font-semibold">{loanName(card.id)}</p>
        <p className="text-sm text-walnut/80">Original ID: {card.id}</p>
        <div className="mt-2">
          {card.status !== "Not reviewed" ? <StatusChip status={card.status} /> : <p className="text-sm">No decision recorded yet.</p>}
        </div>
      </div>
      {PINNED_BECAUSE[card.pinnedBy] && <p className="text-sm leading-relaxed">{PINNED_BECAUSE[card.pinnedBy]}</p>}
      {card.note && (
        <p className="text-sm leading-relaxed">
          <span className="font-medium">Hazel&rsquo;s note: </span>
          {card.note}
        </p>
      )}
      <Section title="Connections">
        {links.length === 0 ? (
          <p className="text-sm text-walnut/80">No connections found yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {links.map((t) => (
              <li key={t.id}>
                {sharedLabel(t.kind)} with {loanName(t.a === card.id ? t.b : t.a)}
                {t.explained ? " (explained)" : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[13px] text-walnut/80">{NOT_PROOF}</p>
      </Section>
      <Section title="Where this comes from">
        {meaning.map((m) => (
          <p key={m} className="mb-1 text-sm">
            {m}
          </p>
        ))}
        <SourceList sources={card.sources} />
      </Section>
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
    </div>
  );
}

function ThreadDetails({ thread, mode }: { thread: BoardThread; mode: FeedMode }) {
  const a = loanName(thread.a), b = loanName(thread.b);
  const meaning = whereFrom(thread.sources);
  return (
    <div className="mt-3 space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-walnut/80">Connection</p>
        <p className="text-2xl font-semibold">{sharedLabel(thread.kind)}</p>
        <p className="mt-1 text-sm">
          {a} and {b} share {sharedPhrase(thread.kind)}.
        </p>
        <p className="text-sm text-walnut/80">
          Original IDs: {thread.a} and {thread.b}
        </p>
      </div>
      {thread.note && (
        <p className="text-sm leading-relaxed">
          <span className="font-medium">Hazel&rsquo;s note: </span>
          {thread.note}
        </p>
      )}
      <Section title="Why it matters">
        <p className="text-sm leading-relaxed">
          Applications that share a detail can be connected, but people also share phones, addresses and employers for
          ordinary reasons. {NOT_PROOF} The rarer the shared detail is across all the loans, the more it counts.
        </p>
      </Section>
      {thread.explained && <Explanation thread={thread} />}
      <Section title="Where this comes from">
        {meaning.map((m) => (
          <p key={m} className="mb-1 text-sm">
            {m}
          </p>
        ))}
        <SourceList sources={thread.sources} />
      </Section>
      <div className="rounded border border-walnut/10 bg-cream/60 p-3 text-[13px]">
        {thread.explained ? (
          <p>
            Weight <span className="font-semibold">{thread.weight.toFixed(2)}</span> when found, 0 after the explanation
          </p>
        ) : (
          <p>
            Weight <span className="font-semibold">{thread.weight.toFixed(2)}</span> · yarn{" "}
            {threadWidth(thread.weight).toFixed(1)} px
          </p>
        )}
        <p className="mt-1 text-walnut/80">A design weight from rarity, not a fraud probability.</p>
      </div>
      <Provenance
        rows={[
          ["Found by", `${thread.tool ?? "unknown tool"}`],
          ["Kind", thread.kind],
          ["Event", `seq ${thread.firstSeq}`],
          ["Time", thread.ts],
          ["Edge id", thread.id],
        ]}
        mode={mode}
        simulated={thread.simulated}
        requestIds={crsRequestIds(thread.sources)}
      />
    </div>
  );
}

// Why the suspicion came down, with the explanation's own sources (the check's event row or a saved rule).
function Explanation({ thread }: { thread: BoardThread }) {
  const x = thread.explained!;
  return (
    <section className="rounded border border-sage bg-sage/15 p-3 text-[13px]">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-walnut">Checked: there is an innocent explanation</h3>
      <p className="mt-1.5 leading-snug">{x.reason}</p>
      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-walnut/80">Explained by</dt>
        <dd className="font-medium">{x.explainedBy}{x.ruleId && ` (${x.ruleId})`}</dd>
        <dt className="text-walnut/80">Event</dt>
        <dd className="font-medium">seq {x.seq}</dd>
      </dl>
      <div className="mt-2">
        <SourceList sources={x.sources} />
      </div>
      <p className="mt-2 text-walnut/80">The shared detail stays on the board as a fact (the pale dashed thread), but it is no longer a reason to suspect.</p>
    </section>
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
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-walnut/80">Technical details</summary>
      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
        <Row k="Data" v={simulated ? "Simulated (made-up sample data)" : "Recorded"} />
        <Row k="Source feed" v={mode === "preview" ? "Built-in sample" : mode.toUpperCase()} />
        <Row k="CRS RequestID" v={requestIds.length ? requestIds.join(", ") : "none (no CRS call on this row)"} />
      </dl>
    </details>
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
