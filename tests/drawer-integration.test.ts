import { describe, expect, test } from "bun:test";
import { resolveDrawerSelection } from "@/components/board/drawer-selection";
import { PREVIEW_EVENTS, emptyBoard, reduceEvents } from "@/lib/events";
import { bestFit, cardsOutOfView } from "@/components/board/framing";

describe("drawer to investigator selection", () => {
  const board = reduceEvents(PREVIEW_EVENTS);

  test("resolves an existing card by exact ID without changing the event-derived board", () => {
    const before = JSON.stringify(board);
    expect(resolveDrawerSelection(board, "PV-01", "api")).toEqual({ cardId: "PV-01", message: null });
    expect(JSON.stringify(board)).toBe(before);
  });

  test("absent IDs, partial IDs, and an empty investigation never produce a card", () => {
    for (const id of ["L0037", "PV-0", "pv-01"]) {
      const result = resolveDrawerSelection(board, id, "api");
      expect(result.cardId).toBeNull();
      expect(result.message).toContain(`${id} is not on the active investigation board`);
    }
    expect(resolveDrawerSelection(emptyBoard, "L0001", "api").cardId).toBeNull();
    expect(board.cards).toHaveLength(2);
    expect(board.threads).toHaveLength(1);
  });

  test("synthetic drawer records cannot masquerade as matching investigation loans", () => {
    const result = resolveDrawerSelection(board, "PV-01", "preview");
    expect(result.cardId).toBeNull();
    expect(result.message).toContain("synthetic drawer preview file");
  });

  test("single-card focus respects the current dragged position and Hazel's keep-out area", () => {
    const card = { x: 2300, y: 1400, w: 370, h: 300 };
    const pane = { w: 820, h: 575 };
    const hazel = { x: 530, y: 255, w: 290, h: 320 };
    const viewport = bestFit(card, pane, hazel);
    expect(cardsOutOfView(new Map([["L0001", card]]), viewport, pane, hazel)).toEqual([]);
    expect(viewport.zoom).toBeGreaterThan(0.62);
  });
});
