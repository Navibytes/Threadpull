// Board state is a pure function of the run's event rows (CLAUDE.md hard rule 2).
import { describe, expect, test } from "bun:test";
import { applyEvent, emptyBoard, PREVIEW_EVENTS, previewFeed, reduceEvents, threadWidth, type RunEvent } from "@/lib/events";

describe("preview fixture", () => {
  test("is labeled simulated and never cites CRS", () => {
    for (const e of PREVIEW_EVENTS) {
      expect(e.simulated).toBe(true);
      expect(e.sources.some((s) => s.kind === "crs")).toBe(false);
    }
  });

  test("uses ids outside the portfolio range", () => {
    for (const e of PREVIEW_EVENTS) for (const id of e.loan_ids) expect(id).not.toMatch(/^L\d{4}$/);
  });

  test("feed delivers every row in seq order", () => {
    let got: RunEvent[] = [];
    previewFeed([...PREVIEW_EVENTS].reverse()).subscribe((rows) => (got = rows));
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});

describe("board state", () => {
  const board = reduceEvents(PREVIEW_EVENTS);

  test("pins one card per loan and one thread per link_found", () => {
    expect(board.cards.map((c) => c.id)).toEqual(["PV-01", "PV-02"]);
    expect(board.threads).toHaveLength(1);
    expect(board.threads[0]).toMatchObject({ id: "e-phone-preview", kind: "phone", a: "PV-01", b: "PV-02", weight: 0.33 });
    expect(board.cards.every((c) => c.status === "Not reviewed")).toBe(true);
  });

  test("records the seq behind every card and thread", () => {
    expect(board.cards.map((c) => c.firstSeq)).toEqual([2, 3]);
    expect(board.threads[0].firstSeq).toBe(3);
    expect(board.lastSeq).toBe(3);
  });

  test("ignores rows already applied and is order-independent", () => {
    expect(PREVIEW_EVENTS.reduce(applyEvent, board)).toBe(board);
    expect(reduceEvents([...PREVIEW_EVENTS].reverse())).toEqual(board);
  });

  test("ignores rows from another run", () => {
    const other = { ...PREVIEW_EVENTS[2], run_id: "other", seq: 9 };
    expect(applyEvent(board, other)).toBe(board);
  });

  test("starts empty", () => {
    expect(reduceEvents([])).toEqual(emptyBoard);
  });

  test("yarn thickness is 1 + 8 × weight, clamped", () => {
    expect(threadWidth(0)).toBe(1);
    expect(threadWidth(0.5)).toBe(5);
    expect(threadWidth(2)).toBe(9);
  });
});
