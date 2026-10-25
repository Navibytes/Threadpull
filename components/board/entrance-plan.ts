// Paper → Pin → Thread: the one sequence the corkboard uses whenever evidence appears on screen. A paper is thrown
// onto the board and slams down, a pin is struck through it, and only then does the yarn shoot to its partner, snap
// taut and settle, and its label appear. The same plan serves two triggers (see planBoardEntrance):
//   - entering the board: everything already recorded is put back on the wall, staggered. Nothing here claims
//     the evidence was just found; it is the same rows, laid out again.
//   - a live row: only what that row added (a new card, a new thread, or both) animates, and everything already
//     on the board stays where it is.
// This file only decides *when*; entrance.tsx and the card and yarn components decide how it looks. Pure and
// deterministic: the same board and the same sequence numbers always give the same delays, so a replay matches a
// live run, and no randomness or clock is read.

// Durations are far above the usual 300ms for UI on purpose: this is the rare moment a board is laid out, and the
// brief asks for it to feel physical. Everything below that is not a landing or a strike stays quick.
export const ENTRANCE = {
  paperMs: 420, // a paper is thrown, slams, squashes, rebounds and wobbles to rest
  impactAt: 0.56, // the paper hits the cork this far through its animation
  pinLeadMs: 300, // the pin starts falling this far into the paper's animation, just after it lands
  pinMs: 200, // the pin falls, strikes, rebounds and rests
  pinStrikeAt: 0.52, // the pin hits the paper this far through its own animation
  tiePinMs: 140, // the pins that tie a yarn at each end are quicker
  vibrateMs: 190, // the paper shudders where the pin went in
  yarnLeadMs: 140, // a beat between the pins landing and the yarn starting: the card is secured before the thread begins
  yarnDrawMs: 280, // the yarn shoots from pin to pin along a taut line
  yarnSettleMs: 170, // then snaps and sags into its resting curve
  labelMs: 200, // the label appears once the yarn has finished
  staggerMaxMs: 340, // gap between consecutive cards on a small board: each slam and pin reads on its own before the next
  budgetMs: 1800, // the planned sequence finishes within this, however many cards there are; the yarn can only mount after React Flow has measured the cards, which adds about 0.2s on a large board
  fxCardLimit: 12, // up to this many cards animating at once get dust, ripple and shudder; beyond it the board overlaps and keeps only the slam and pins
} as const;

// Dev only: slows every duration and delay (the rehearsal page sets it) so the feel can be checked frame by frame.
export const entranceTime = { scale: 1 };
export const secs = (ms: number) => (Math.round(ms) / 1000) * entranceTime.scale;

// Delays in seconds from when the element mounts (what Motion takes), already scaled by entranceTime.
export type CardEnter = { paper: number; pin: number; fx: boolean };
export type ThreadEnter = { pins: number; yarn: number; label: number };
export type EntrancePlan = { cards: Map<string, CardEnter>; threads: Map<string, ThreadEnter>; totalMs: number };

export type PlanCard = { id: string; firstSeq: number };
export type PlanThread = { id: string; a: string; b: string; firstSeq: number };

export const EMPTY_PLAN: EntrancePlan = { cards: new Map(), threads: new Map(), totalMs: 0 };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const inOrder = <T extends { id: string; firstSeq: number }>(items: T[]) =>
  [...items].sort((x, y) => x.firstSeq - y.firstSeq || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

// The gap between consecutive items so that `count` of them, each needing `tailMs` after it starts, finish inside the budget.
const spacing = (count: number, tailMs: number) =>
  count > 1 ? clamp((ENTRANCE.budgetMs - tailMs) / (count - 1), 0, ENTRANCE.staggerMaxMs) : 0;

// Plans the cards in `animateCards` and the threads in `animateThreads`; anything else is already on the board.
// Cards go in the order they were pinned (firstSeq), each a stagger after the one before; on a big board the gap
// shrinks until the slams overlap. A thread waits for the pins of the cards it joins that are animating, then its
// end pins strike, a beat passes, its yarn shoots across and settles, and its label appears.
export function planEntrance(
  cards: PlanCard[],
  threads: PlanThread[],
  animateCards: ReadonlySet<string>,
  animateThreads: ReadonlySet<string>,
): EntrancePlan {
  const paperToPinEnd = ENTRANCE.pinLeadMs + ENTRANCE.pinMs;
  const yarnTotal = ENTRANCE.yarnDrawMs + ENTRANCE.yarnSettleMs;
  const threadMs = ENTRANCE.yarnLeadMs + yarnTotal + ENTRANCE.labelMs;
  const plan: EntrancePlan = { cards: new Map(), threads: new Map(), totalMs: 0 };
  const pinReady = new Map<string, number>();

  const newCards = inOrder(cards.filter((c) => animateCards.has(c.id)));
  const cardGap = spacing(newCards.length, paperToPinEnd + threadMs);
  const fx = newCards.length <= ENTRANCE.fxCardLimit;
  newCards.forEach((c, i) => {
    const start = i * cardGap;
    plan.cards.set(c.id, { paper: secs(start), pin: secs(start + ENTRANCE.pinLeadMs), fx });
    pinReady.set(c.id, start + paperToPinEnd);
    plan.totalMs = Math.max(plan.totalMs, start + Math.max(paperToPinEnd, ENTRANCE.pinLeadMs + ENTRANCE.pinMs * ENTRANCE.pinStrikeAt + ENTRANCE.vibrateMs));
  });

  const newThreads = inOrder(threads.filter((t) => animateThreads.has(t.id)));
  // Threads between cards that are already on the board have nothing to wait for, so space them out instead.
  const threadGap = newCards.length === 0 ? spacing(newThreads.length, threadMs) : 0;
  newThreads.forEach((t, j) => {
    const ready = Math.max(pinReady.get(t.a) ?? 0, pinReady.get(t.b) ?? 0) + j * threadGap;
    const yarn = ready + ENTRANCE.yarnLeadMs;
    plan.threads.set(t.id, { pins: secs(ready), yarn: secs(yarn), label: secs(yarn + yarnTotal) });
    plan.totalMs = Math.max(plan.totalMs, ready + threadMs);
  });

  return plan;
}

const idsOf = <T extends { id: string }>(items: T[]) => new Set(items.map((i) => i.id));

// The same plan, starting `ms` later.
export function shiftPlan(plan: EntrancePlan, ms: number): EntrancePlan {
  const d = secs(ms);
  const r = (x: number) => Math.round((x + d) * 1000) / 1000;
  return {
    cards: new Map([...plan.cards].map(([id, c]) => [id, { ...c, paper: r(c.paper), pin: r(c.pin) }])),
    threads: new Map([...plan.threads].map(([id, t]) => [id, { pins: r(t.pins), yarn: r(t.yarn), label: r(t.label) }])),
    totalMs: plan.totalMs + ms,
  };
}

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
