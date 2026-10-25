// The Paper → Pin → Thread plan: when each card's paper and pin, and each thread's pins, yarn and label, start.
// Pure and deterministic. Nothing here renders; the visuals are checked in a browser.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PinPop } from "@/components/board/entrance";
import {
  EMPTY_PLAN,
  ENTRANCE,
  planBoardEntrance,
  planEntrance,
  type PlanCard,
  type PlanThread,
} from "@/components/board/entrance-plan";

const card = (id: string, firstSeq: number): PlanCard => ({ id, firstSeq });
const thread = (id: string, a: string, b: string, firstSeq: number): PlanThread => ({ id, a, b, firstSeq });
const ms = (s: number) => Math.round(s * 1000);

// the PREVIEW board: a lead, a second card, one thread (seqs 2, 3, 3)
const preview = { cards: [card("PV-01", 2), card("PV-02", 3)], threads: [thread("e1", "PV-01", "PV-02", 3)] };

describe("entering the board", () => {
  const plan = planBoardEntrance(preview, { animateAfterSeq: 3, entrySeq: 3 });

  test("each card's paper lands, then its pin presses in, then the yarn is drawn, then the label appears", () => {
    const [a, b, t] = [plan.cards.get("PV-01")!, plan.cards.get("PV-02")!, plan.threads.get("e1")!];
    expect(a.paper).toBe(0); // the first card starts at once
    expect(ms(a.pin - a.paper)).toBe(ENTRANCE.pinLeadMs); // the pin lands as the paper settles
    expect(b.paper).toBeGreaterThan(a.paper); // short stagger, in the order the cards were pinned
    const pinsDone = Math.max(a.pin, b.pin) + ENTRANCE.pinMs / 1000;
    expect(t.pins).toBeGreaterThanOrEqual(pinsDone - 0.001); // the thread waits for its cards' pins
    expect(ms(t.yarn - t.pins)).toBe(ENTRANCE.yarnLeadMs);
    expect(ms(t.label - t.yarn)).toBe(ENTRANCE.yarnMs); // the label is revealed after the yarn is drawn
  });

  test("finishes within the budget", () => {
    expect(plan.totalMs).toBeGreaterThan(0);
    expect(plan.totalMs).toBeLessThanOrEqual(ENTRANCE.budgetMs);
  });

  test("the same board always gives the same plan, whatever order it arrives in", () => {
    const shuffled = planBoardEntrance({ cards: [...preview.cards].reverse(), threads: preview.threads }, { animateAfterSeq: 3, entrySeq: 3 });
    expect(shuffled.cards).toEqual(plan.cards);
    expect(shuffled.threads).toEqual(plan.threads);
  });

  test("a large board still finishes inside the budget, with the stagger squeezed", () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`C${String(i).padStart(2, "0")}`, i + 1));
    const threads = cards.slice(1).map((c, i) => thread(`t${i}`, "C00", c.id, c.firstSeq));
    const big = planBoardEntrance({ cards, threads }, { animateAfterSeq: 99, entrySeq: 99 });
    expect(big.cards.size).toBe(40);
    expect(big.threads.size).toBe(39);
    expect(big.totalMs).toBeLessThanOrEqual(ENTRANCE.budgetMs);
    const starts = cards.map((c) => big.cards.get(c.id)!.paper);
    expect(starts).toEqual([...starts].sort((x, y) => x - y)); // still in the order they were pinned
  });

  test("with no entry and no live rows nothing animates", () => {
    expect(planBoardEntrance(preview, { animateAfterSeq: 3, entrySeq: null })).toEqual(EMPTY_PLAN);
    expect(planBoardEntrance(preview, { animateAfterSeq: Number.POSITIVE_INFINITY, entrySeq: null }).cards.size).toBe(0); // before the history is in
  });
});

describe("a live link_found row", () => {
  test("a new card animates its paper and pin first, then the new yarn", () => {
    const plan = planBoardEntrance(preview, { animateAfterSeq: 2, entrySeq: null });
    expect([...plan.cards.keys()]).toEqual(["PV-02"]); // the lead is already on the wall: it is not touched
    const c = plan.cards.get("PV-02")!;
    const t = plan.threads.get("e1")!;
    expect(c.paper).toBe(0);
    expect(t.pins).toBeGreaterThanOrEqual(c.pin + ENTRANCE.pinMs / 1000 - 0.001);
    expect(t.yarn).toBeGreaterThan(c.pin);
    expect(plan.totalMs).toBeLessThanOrEqual(ENTRANCE.budgetMs);
  });

  test("when both cards already exist only the thread animates, at once", () => {
    const board = { cards: [card("A", 1), card("B", 2)], threads: [thread("e", "A", "B", 5)] };
    const plan = planBoardEntrance(board, { animateAfterSeq: 4, entrySeq: null });
    expect(plan.cards.size).toBe(0);
    expect(plan.threads.get("e")).toEqual({ pins: 0, yarn: ENTRANCE.yarnLeadMs / 1000, label: (ENTRANCE.yarnLeadMs + ENTRANCE.yarnMs) / 1000 });
  });

  test("several new threads between cards that are already there are spaced out", () => {
    const board = {
      cards: [card("A", 1), card("B", 2), card("C", 3)],
      threads: [thread("e1", "A", "B", 5), thread("e2", "A", "C", 6)],
    };
    const plan = planBoardEntrance(board, { animateAfterSeq: 4, entrySeq: null });
    expect(plan.threads.get("e2")!.yarn).toBeGreaterThan(plan.threads.get("e1")!.yarn);
  });

  test("a live row during an entrance runs on its own clock and is planned once", () => {
    const board = { cards: [card("A", 1), card("B", 2), card("N", 6)], threads: [thread("e1", "A", "B", 2), thread("e2", "A", "N", 6)] };
    const plan = planBoardEntrance(board, { animateAfterSeq: 5, entrySeq: 5 });
    expect(plan.cards.get("N")!.paper).toBe(0); // not queued behind the history cards
    expect(plan.cards.size).toBe(3);
    // an item inside both ranges keeps its entry slot instead of being planned twice
    const both = planBoardEntrance(board, { animateAfterSeq: 1, entrySeq: 6 });
    expect(both.cards.size).toBe(3);
  });
});

describe("planEntrance", () => {
  test("cards that are not animating count as already pinned", () => {
    const plan = planEntrance([card("A", 1), card("B", 2)], [thread("e", "A", "B", 2)], new Set(["B"]), new Set(["e"]));
    expect(plan.cards.has("A")).toBe(false);
    expect(plan.threads.get("e")!.pins).toBeCloseTo((ENTRANCE.pinLeadMs + ENTRANCE.pinMs) / 1000, 3);
  });
});

describe("pins", () => {
  const html = (delay?: number) => renderToStaticMarkup(createElement(PinPop, { delay, children: createElement("i") }));
  test("a pin in an entrance starts hidden; a pin that is simply there is not", () => {
    expect(html(0.19)).toContain("opacity:0");
    expect(html(undefined)).not.toContain("opacity:0");
  });
});
