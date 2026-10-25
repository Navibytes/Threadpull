// The Paper → Pin → Thread entrance: when each card's paper and pin, and each thread's pins, yarn and label start
// (the plan), and the shapes of the motion (the keyframes). Pure and deterministic. Nothing here renders a board; the
// visuals and timings are checked in a browser.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PinStrike } from "@/components/board/entrance";
import { atRest, EASE_OUT, slam, strike, yarnSettle } from "@/components/board/entrance-motion";
import {
  EMPTY_PLAN,
  ENTRANCE,
  entranceTime,
  planBoardEntrance,
  planEntrance,
  shiftPlan,
  type PlanCard,
  type PlanThread,
} from "@/components/board/entrance-plan";

const card = (id: string, firstSeq: number): PlanCard => ({ id, firstSeq });
const thread = (id: string, a: string, b: string, firstSeq: number): PlanThread => ({ id, a, b, firstSeq });
const ms = (s: number) => Math.round(s * 1000);
const yarnTotal = ENTRANCE.yarnDrawMs + ENTRANCE.yarnSettleMs;

// the PREVIEW board: a lead, a second card, one thread (seqs 2, 3, 3)
const preview = { cards: [card("PV-01", 2), card("PV-02", 3)], threads: [thread("e1", "PV-01", "PV-02", 3)] };

describe("entering the board", () => {
  const plan = planBoardEntrance(preview, { animateAfterSeq: 3, entrySeq: 3 });

  test("papers slam, then pins strike, then a beat, then the yarn shoots, then the label appears", () => {
    const [a, b, t] = [plan.cards.get("PV-01")!, plan.cards.get("PV-02")!, plan.threads.get("e1")!];
    expect(a.paper).toBe(0); // the first card starts at once
    expect(ms(a.pin - a.paper)).toBe(ENTRANCE.pinLeadMs); // the pin falls just after the paper has landed
    expect(ENTRANCE.pinLeadMs).toBeGreaterThan(ENTRANCE.paperMs * ENTRANCE.impactAt);
    expect(b.paper).toBeGreaterThan(a.paper); // staggered, in the order the cards were pinned
    const pinsDone = Math.max(a.pin, b.pin) + ENTRANCE.pinMs / 1000;
    expect(t.pins).toBeGreaterThanOrEqual(pinsDone - 0.001); // the thread waits until its cards are secured
    expect(ms(t.yarn - t.pins)).toBe(ENTRANCE.yarnLeadMs); // a beat, then the yarn
    expect(ms(t.label - t.yarn)).toBe(yarnTotal); // the label is revealed only after the yarn has finished settling
  });

  test("a small board is dramatic but finishes within about two seconds", () => {
    expect(plan.totalMs).toBeGreaterThanOrEqual(1400);
    expect(plan.totalMs).toBeLessThanOrEqual(2000);
    expect(plan.totalMs).toBeLessThanOrEqual(ENTRANCE.budgetMs);
  });

  test("the same board always gives the same plan, whatever order it arrives in", () => {
    const shuffled = planBoardEntrance({ cards: [...preview.cards].reverse(), threads: preview.threads }, { animateAfterSeq: 3, entrySeq: 3 });
    expect(shuffled.cards).toEqual(plan.cards);
    expect(shuffled.threads).toEqual(plan.threads);
  });

  test("a large board overlaps its slams instead of playing them one by one, and drops the extras", () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`C${String(i).padStart(2, "0")}`, i + 1));
    const threads = cards.slice(1).map((c, i) => thread(`t${i}`, "C00", c.id, c.firstSeq));
    const big = planBoardEntrance({ cards, threads }, { animateAfterSeq: 99, entrySeq: 99 });
    expect(big.cards.size).toBe(40);
    expect(big.threads.size).toBe(39);
    expect(big.totalMs).toBeLessThanOrEqual(ENTRANCE.budgetMs);
    const starts = cards.map((c) => big.cards.get(c.id)!.paper);
    expect(starts).toEqual([...starts].sort((x, y) => x - y)); // still in the order they were pinned
    expect(starts[1] - starts[0]).toBeLessThan(ENTRANCE.paperMs / 1000); // the next paper is thrown before the last has landed
    expect(big.cards.get("C00")!.fx).toBe(false); // too many at once for dust, ripple and shudder
    expect(plan.cards.get("PV-01")!.fx).toBe(true);
  });

  test("with no entry and no live rows nothing animates", () => {
    expect(planBoardEntrance(preview, { animateAfterSeq: 3, entrySeq: null })).toEqual(EMPTY_PLAN);
    expect(planBoardEntrance(preview, { animateAfterSeq: Number.POSITIVE_INFINITY, entrySeq: null }).cards.size).toBe(0); // before the history is in
  });

  test("the dev playback speed stretches every delay and nothing else", () => {
    entranceTime.scale = 4;
    try {
      const slow = planBoardEntrance(preview, { animateAfterSeq: 3, entrySeq: 3 });
      expect(slow.cards.get("PV-02")!.pin).toBeCloseTo(plan.cards.get("PV-02")!.pin * 4, 2);
      expect(slow.threads.get("e1")!.label).toBeCloseTo(plan.threads.get("e1")!.label * 4, 2);
    } finally {
      entranceTime.scale = 1;
    }
  });
});

describe("a live link_found row", () => {
  test("a new card slams and is pinned first, then the new yarn shoots to it", () => {
    const plan = planBoardEntrance(preview, { animateAfterSeq: 2, entrySeq: null });
    expect([...plan.cards.keys()]).toEqual(["PV-02"]); // the lead is already on the wall: it is not touched
    const c = plan.cards.get("PV-02")!;
    const t = plan.threads.get("e1")!;
    expect(c.paper).toBe(0);
    expect(t.pins).toBeGreaterThanOrEqual(c.pin + ENTRANCE.pinMs / 1000 - 0.001);
    expect(t.yarn).toBeGreaterThan(c.pin + ENTRANCE.pinMs / 1000); // the card is secured before the thread begins
    expect(plan.totalMs).toBeLessThanOrEqual(ENTRANCE.budgetMs);
  });

  test("when both cards already exist only the thread animates, at once", () => {
    const board = { cards: [card("A", 1), card("B", 2)], threads: [thread("e", "A", "B", 5)] };
    const plan = planBoardEntrance(board, { animateAfterSeq: 4, entrySeq: null });
    expect(plan.cards.size).toBe(0);
    expect(plan.threads.get("e")).toEqual({
      pins: 0,
      yarn: ENTRANCE.yarnLeadMs / 1000,
      label: (ENTRANCE.yarnLeadMs + yarnTotal) / 1000,
    });
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

describe("replaying one case", () => {
  const board = { cards: [card("A", 1), card("B", 2), card("Z", 3)], threads: [thread("e1", "A", "B", 2), thread("e2", "B", "Z", 3)] };

  test("only the chosen case's cards and threads are planned, a beat later, in the same order as the first time", () => {
    const first = planEntrance(board.cards, board.threads, new Set(["A", "B"]), new Set(["e1"]));
    const again = shiftPlan(first, 180);
    expect([...again.cards.keys()]).toEqual(["A", "B"]); // Z belongs to another case and is not touched
    expect([...again.threads.keys()]).toEqual(["e1"]);
    expect(again.cards.get("A")!.paper).toBe(0.18); // starts once the camera is on its way
    expect(again.cards.get("B")!.paper - again.cards.get("A")!.paper).toBeCloseTo(first.cards.get("B")!.paper - first.cards.get("A")!.paper, 3);
    expect(again.threads.get("e1")!.label - again.threads.get("e1")!.yarn).toBeCloseTo(yarnTotal / 1000, 3); // the shot is the same shape
    expect(again.totalMs).toBe(first.totalMs + 180);
  });

  test("replaying is the same plan every time", () => {
    const run = () => shiftPlan(planEntrance(board.cards, board.threads, new Set(["A", "B"]), new Set(["e1"])), 180);
    expect(run()).toEqual(run());
  });
});

describe("planEntrance", () => {
  test("cards that are not animating count as already pinned", () => {
    const plan = planEntrance([card("A", 1), card("B", 2)], [thread("e", "A", "B", 2)], new Set(["B"]), new Set(["e"]));
    expect(plan.cards.has("A")).toBe(false);
    expect(plan.threads.get("e")!.pins).toBeCloseTo((ENTRANCE.pinLeadMs + ENTRANCE.pinMs) / 1000, 3);
  });
});

describe("the slam", () => {
  const ids = ["PV-01", "PV-02", "L0412", "C07", "e-addr", "x"]
    .map((id) => [...id].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) | 0, 7))
    .map(Math.abs);

  test.each(ids.map((h) => [h] as const))("card %p: thrown from 110–160px up, spun 8–12°, and it ends exactly where the layout put it", (h) => {
    const tilt = 1.4;
    const s = slam(tilt, h);
    expect(s.rise).toBeGreaterThanOrEqual(110);
    expect(s.rise).toBeLessThanOrEqual(160);
    expect(s.spin).toBeGreaterThanOrEqual(8);
    expect(s.spin).toBeLessThanOrEqual(12);
    expect(s.frames.at(-1)).toBe(atRest(tilt)); // the final frame is the card's resting transform: no offset left behind
    expect(s.frames).toHaveLength(s.times.length);
    expect(s.ease).toHaveLength(s.frames.length - 1);
    expect(s.times[0]).toBe(0);
    expect(s.times.at(-1)).toBe(1);
    expect([...s.times].sort((a, b) => a - b)).toEqual(s.times);
  });

  test("it lands hard (squashed) at the impact time, then rebounds past rest before settling", () => {
    const s = slam(0, 0);
    expect(s.times[1]).toBe(ENTRANCE.impactAt);
    expect(s.frames[1]).toContain("scale(1.05, 0.93)"); // squash on impact
    expect(s.frames[2]).toMatch(/translate\(0px, -6px\)/); // rebound above rest
    expect(s.frames[3]).toMatch(/translate\(0px, 1.5px\)/); // wobble back below
  });

  test("the same card is thrown the same way every time", () => {
    expect(slam(2, 123456)).toEqual(slam(2, 123456));
    expect(slam(2, 123456).frames[0]).not.toBe(slam(2, 123457).frames[0]);
  });

  test("every frame uses the same transform functions, so the browser can interpolate them on the compositor", () => {
    const shape = (f: string) => f.replace(/-?\d+(\.\d+)?/g, "#");
    const frames = slam(3, 99).frames;
    expect(new Set(frames.map(shape)).size).toBe(1);
  });

  test("the paper, the pin and the yarn each take the time the brief gives them", () => {
    expect(ENTRANCE.paperMs).toBeGreaterThanOrEqual(350);
    expect(ENTRANCE.paperMs).toBeLessThanOrEqual(450);
    expect(ENTRANCE.pinMs).toBeGreaterThanOrEqual(150);
    expect(ENTRANCE.pinMs).toBeLessThanOrEqual(220);
    expect(yarnTotal).toBeGreaterThanOrEqual(350);
    expect(yarnTotal).toBeLessThanOrEqual(500);
  });
});

describe("the pin strike and the yarn snap", () => {
  test("the pin falls from above, is pressed in past rest, rebounds, and settles at rest", () => {
    const k = strike();
    expect(k.frames[0]).toContain("translateY(-30px)");
    expect(k.frames[1]).toBe("translateY(0px) scale(0.84)"); // struck
    expect(k.frames[2]).toContain("scale(1.1)"); // rebound
    expect(k.frames.at(-1)).toBe("translateY(0px) scale(1)");
    expect(k.times[1]).toBe(ENTRANCE.pinStrikeAt);
    expect(strike(true).frames[0]).toContain("translateY(-14px)"); // the tie pins at a yarn's ends travel less
  });

  test("the yarn is taut while it is drawn, then sags past its resting curve, rebounds, and rests at 1", () => {
    const y = yarnSettle();
    expect(y.sag[0]).toBe(0);
    expect(y.sag[1]).toBe(0); // still straight when the draw finishes
    expect(Math.max(...y.sag)).toBeGreaterThan(1); // overshoot
    expect(y.sag[3]).toBeLessThan(1); // rebound
    expect(y.sag.at(-1)).toBe(1); // the settled shape is exactly the resting curve
    expect(y.times[1]).toBeCloseTo(ENTRANCE.yarnDrawMs / yarnTotal, 5);
    expect(y.times.at(-1)).toBe(1);
    expect(EASE_OUT).toHaveLength(4);
  });
});

describe("pins", () => {
  const html = (delay?: number) => renderToStaticMarkup(createElement(PinStrike, { delay, children: createElement("i") }));
  test("a pin in an entrance starts hidden; a pin that is simply there is not", () => {
    expect(html(0.3)).toContain("opacity:0");
    expect(html(undefined)).not.toContain("opacity:0");
  });
});
