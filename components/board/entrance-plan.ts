// Paper → Pin → Thread: the one sequence the corkboard uses whenever evidence appears on screen. A card's paper
// drops and settles, its pin presses in as the paper lands, then the yarn that ties it to its partner is drawn
// and its label is revealed. The same plan serves two triggers (see planBoardEntrance):
//   - entering the board: everything already recorded is put back on the wall, staggered. Nothing here claims
//     the evidence was just found; it is the same rows, laid out again.
//   - a live row: only what that row added (a new card, a new thread, or both) animates, and everything already
//     on the board stays where it is.
// This file only decides *when*; entrance.tsx and the card and yarn components decide how it looks. Pure and
// deterministic: the same board and the same sequence numbers always give the same delays, so a replay matches a
// live run, and no randomness or clock is read.

export const ENTRANCE = {
  paperMs: 240, // a paper drops, tilts into place and settles
  pinMs: 120, // a pin pops and presses in
  pinLeadMs: 190, // the pin starts this far into the paper's drop, so it lands as the paper settles
  yarnLeadMs: 60, // the yarn starts as its end pins press in
  yarnMs: 300, // the yarn is drawn along the real curve
  labelMs: 160, // the label is revealed once the yarn is drawn
  staggerMaxMs: 80, // gap between consecutive cards when there are few
  budgetMs: 1300, // the planned sequence finishes within this, however many cards there are; the yarn can only mount after React Flow has measured the cards, which adds about 0.2s on a large board, so the end-to-end entrance lands near 1.5s
} as const;

// Delays in seconds (what Motion takes).
export type CardEnter = { paper: number; pin: number };
export type ThreadEnter = { pins: number; yarn: number; label: number };
export type EntrancePlan = { cards: Map<string, CardEnter>; threads: Map<string, ThreadEnter>; totalMs: number };

export type PlanCard = { id: string; firstSeq: number };
export type PlanThread = { id: string; a: string; b: string; firstSeq: number };

export const EMPTY_PLAN: EntrancePlan = { cards: new Map(), threads: new Map(), totalMs: 0 };

const sec = (ms: number) => Math.round(ms) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const inOrder = <T extends { id: string; firstSeq: number }>(items: T[]) =>
  [...items].sort((x, y) => x.firstSeq - y.firstSeq || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

// The gap between consecutive items so that `count` of them, each needing `tailMs` after it starts, finish inside the budget.
const spacing = (count: number, tailMs: number) =>
  count > 1 ? clamp((ENTRANCE.budgetMs - tailMs) / (count - 1), 0, ENTRANCE.staggerMaxMs) : 0;

// Plans the cards in `animateCards` and the threads in `animateThreads`; anything else is already on the board.
// Cards go in the order they were pinned (firstSeq), each a stagger after the one before. A thread waits for the
// pins of the cards it joins that are animating, then its end pins press in, its yarn is drawn, its label appears.
export function planEntrance(
  cards: PlanCard[],
  threads: PlanThread[],
  animateCards: ReadonlySet<string>,
  animateThreads: ReadonlySet<string>,
): EntrancePlan {
  const paperToPinEnd = ENTRANCE.pinLeadMs + ENTRANCE.pinMs;
  const threadMs = ENTRANCE.yarnLeadMs + ENTRANCE.yarnMs + ENTRANCE.labelMs;
  const plan: EntrancePlan = { cards: new Map(), threads: new Map(), totalMs: 0 };
  const pinReady = new Map<string, number>();

  const newCards = inOrder(cards.filter((c) => animateCards.has(c.id)));
  const cardGap = spacing(newCards.length, paperToPinEnd + threadMs);
  newCards.forEach((c, i) => {
    const start = i * cardGap;
    plan.cards.set(c.id, { paper: sec(start), pin: sec(start + ENTRANCE.pinLeadMs) });
    pinReady.set(c.id, start + paperToPinEnd);
    plan.totalMs = Math.max(plan.totalMs, start + paperToPinEnd);
  });

  const newThreads = inOrder(threads.filter((t) => animateThreads.has(t.id)));
  // Threads between cards that are already on the board have nothing to wait for, so space them out instead.
  const threadGap = newCards.length === 0 ? spacing(newThreads.length, threadMs) : 0;
  newThreads.forEach((t, j) => {
    const ready = Math.max(pinReady.get(t.a) ?? 0, pinReady.get(t.b) ?? 0) + j * threadGap;
    const yarn = ready + ENTRANCE.yarnLeadMs;
    plan.threads.set(t.id, { pins: sec(ready), yarn: sec(yarn), label: sec(yarn + ENTRANCE.yarnMs) });
    plan.totalMs = Math.max(plan.totalMs, ready + threadMs);
  });

  return plan;
}

const idsOf = <T extends { id: string }>(items: T[]) => new Set(items.map((i) => i.id));

// The two triggers, planned from the board and two sequence numbers:
//   `entrySeq`: set once per feed hydration (the board was entered), the last seq that was history then. Every card
//     and thread up to it is re-laid on the wall.
//   `animateAfterSeq`: rows after it arrived live; the cards and threads they added animate.
// Each trigger is planned on its own clock (a live row never waits behind a re-entry), and an item is only ever
// planned once: a live row that is also inside the entry range keeps its re-entry slot.
export function planBoardEntrance(
  board: { cards: PlanCard[]; threads: PlanThread[] },
  opts: { animateAfterSeq: number; entrySeq: number | null },
): EntrancePlan {
  const { cards, threads } = board;
  const { animateAfterSeq, entrySeq } = opts;
  const reentry =
    entrySeq === null
      ? EMPTY_PLAN
      : planEntrance(cards, threads, idsOf(cards.filter((c) => c.firstSeq <= entrySeq)), idsOf(threads.filter((t) => t.firstSeq <= entrySeq)));
  const live = planEntrance(
    cards,
    threads,
    idsOf(cards.filter((c) => c.firstSeq > animateAfterSeq && !reentry.cards.has(c.id))),
    idsOf(threads.filter((t) => t.firstSeq > animateAfterSeq && !reentry.threads.has(t.id))),
  );
  return {
    cards: new Map([...reentry.cards, ...live.cards]),
    threads: new Map([...reentry.threads, ...live.threads]),
    totalMs: Math.max(reentry.totalMs, live.totalMs),
  };
}
