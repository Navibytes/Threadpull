// Pure reduction of a run's event rows into what the corkboard draws. Same rows in, same board out,
// so a refresh or a replay reproduces the board exactly. Rows already applied (seq <= lastSeq) are ignored.
import { ClueExplainedResultSchema } from "@/lib/contracts/event";
import { LOAN_STATUSES, type EventType, type LoanStatus, type RunEvent, type SourceRef } from "./types";

export type BoardCard = {
  id: string;
  kind: "loan";
  status: LoanStatus;
  firstSeq: number;
  lastSeq: number;
  pinnedBy: EventType; // the row that first put this card on the board
  tool: string | null;
  ts: string;
  note: string | null;
  sources: SourceRef[];
  simulated: boolean;
};

// Why a thread came down: copied from the clue_explained row, with the row's own sources (the check's event
// row or a saved rule, required by the contract). The thread itself is kept: the shared fact stays inspectable.
export type ThreadExplanation = {
  seq: number;
  ts: string;
  explainedBy: string;
  ruleId: string | null;
  reason: string;
  sources: SourceRef[];
  simulated: boolean;
};

export type BoardThread = {
  id: string;
  kind: string;
  a: string;
  b: string;
  weight: number;
  firstSeq: number;
  lastSeq: number;
  tool: string | null;
  ts: string;
  note: string | null;
  sources: SourceRef[];
  simulated: boolean;
  explained: ThreadExplanation | null;
};

export type BoardState = {
  runId: string | null;
  lastSeq: number;
  cards: BoardCard[]; // in order of first appearance
  threads: BoardThread[];
  events: RunEvent[]; // every applied row, including types the board doesn't draw yet
};

export const emptyBoard: BoardState = { runId: null, lastSeq: 0, cards: [], threads: [], events: [] };

// SKELETON §6: yarn thickness in px = 1 + 8 × weight. A design choice, not a fraud statistic.
export const threadWidth = (weight: number) => 1 + 8 * Math.min(1, Math.max(0, weight));

function pinCard(cards: BoardCard[], id: string, e: RunEvent): BoardCard[] {
  const existing = cards.find((c) => c.id === id);
  if (existing) return cards.map((c) => (c === existing ? { ...c, lastSeq: e.seq } : c));
  const card: BoardCard = {
    id,
    kind: "loan",
    status: "Not reviewed",
    firstSeq: e.seq,
    lastSeq: e.seq,
    pinnedBy: e.type,
    tool: e.tool,
    ts: e.ts,
    note: e.type === "lead_opened" ? e.note : null,
    sources: e.sources.filter((s) => s.kind !== "row" || s.loan_id === id),
    simulated: e.simulated,
  };
  return [...cards, card];
}

export function applyEvent(state: BoardState, e: RunEvent): BoardState {
  if (e.seq <= state.lastSeq) return state;
  if (state.runId !== null && e.run_id !== state.runId) return state;
  let { cards, threads } = state;

  if (e.type === "lead_opened") {
    for (const id of e.loan_ids) cards = pinCard(cards, id, e);
  }

  if (e.type === "link_found" && e.loan_ids.length >= 2 && e.result) {
    const [a, b] = e.loan_ids;
    cards = pinCard(pinCard(cards, a, e), b, e);
    const id = String(e.result.edge_id ?? `${e.result.kind}-${a}-${b}`);
    const thread: BoardThread = {
      id,
      kind: String(e.result.kind ?? "link"),
      a,
      b,
      weight: Number(e.result.weight ?? 0),
      firstSeq: threads.find((t) => t.id === id)?.firstSeq ?? e.seq,
      lastSeq: e.seq,
      tool: e.tool,
      ts: e.ts,
      note: e.note,
      sources: e.sources,
      simulated: e.simulated,
      explained: threads.find((t) => t.id === id)?.explained ?? null,
    };
    threads = threads.some((t) => t.id === id) ? threads.map((t) => (t.id === id ? thread : t)) : [...threads, thread];
  }

  // A closed lead's status, decided by code (close_lead). Only an exact status word changes the card; a loan not
  // yet on the board is pinned, since a decision about it is part of the run.
  if (e.type === "status_changed") {
    const status = LOAN_STATUSES.find((s) => s === e.result.status);
    if (status)
      for (const id of e.loan_ids) {
        cards = pinCard(cards, id, e);
        cards = cards.map((c) => (c.id === id ? { ...c, status } : c));
      }
  }

  // Only the agreed payload takes a thread down; anything else is kept in the log and changes nothing.
  if (e.type === "clue_explained") {
    const r = ClueExplainedResultSchema.safeParse(e.result);
    const cites = e.sources.some((s) => s.kind === "event" || s.kind === "rule"); // hard rule 3
    if (r.success && cites) {
      const explained: ThreadExplanation = {
        seq: e.seq,
        ts: e.ts,
        explainedBy: r.data.explained_by,
        ruleId: r.data.rule_id ?? null,
        reason: r.data.reason,
        sources: e.sources,
        simulated: e.simulated,
      };
      const ids = new Set(r.data.edge_ids);
      threads = threads.map((t) => (ids.has(t.id) && !t.explained ? { ...t, explained } : t));
    }
  }

  return { runId: e.run_id, lastSeq: e.seq, cards, threads, events: [...state.events, e] };
}

export const reduceEvents = (events: RunEvent[], from: BoardState = emptyBoard) =>
  [...events].sort((x, y) => x.seq - y.seq).reduce(applyEvent, from);
