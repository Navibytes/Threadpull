// components/board/framing.ts: fit around Hazel's corner, frame everything only while it stays readable,
// and count the cards that are not on screen.
import { describe, expect, test } from "bun:test";
import { bestFit, cardsOutOfView, FRAMING, planFrame, safeAreas, type Box } from "@/components/board/framing";

// the cork at 1280x720 is about 820 x 575; Hazel covers roughly its bottom-right 290 x 320
const PANE = { w: 820, h: 575 };
const HAZEL: Box = { x: 530, y: 255, w: 290, h: 320 };

describe("framing", () => {
  test("Hazel standing at the lower left: fits go right of her or above her", () => {
    const left: Box = { x: 0, y: 255, w: 290, h: 320 };
    expect(safeAreas(PANE, left)).toEqual([
      { x: 290, y: 0, w: 530, h: 575 },
      { x: 0, y: 0, w: 820, h: 255 },
    ]);
    const tall = bestFit({ x: 0, y: 0, w: 300, h: 900 }, PANE, left);
    expect(tall.x).toBeGreaterThanOrEqual(290); // the case lands right of her
  });

  test("a fit never uses Hazel's corner: left of her or above her", () => {
    const areas = safeAreas(PANE, HAZEL);
    expect(areas).toEqual([
      { x: 0, y: 0, w: 530, h: 575 },
      { x: 0, y: 0, w: 820, h: 255 },
    ]);
    // a wide, short case fits better above her, a tall one beside her
    const wide = bestFit({ x: 0, y: 0, w: 1400, h: 200 }, PANE, HAZEL);
    const tall = bestFit({ x: 0, y: 0, w: 300, h: 900 }, PANE, HAZEL);
    expect(wide.zoom).toBeCloseTo((820 - 92) / 1400, 3);
    expect(tall.zoom).toBeCloseTo((575 - 84) / 900, 3);
  });

  test("everything is framed while readable, otherwise the active case", () => {
    const small = { x: 0, y: 0, w: 700, h: 300 };
    expect(planFrame(small, small, PANE, HAZEL)?.target).toBe("all");
    const big = { x: 0, y: 0, w: 3200, h: 1500 };
    const active = { x: 0, y: 0, w: 700, h: 300 };
    const plan = planFrame(big, active, PANE, HAZEL)!;
    expect(plan.target).toBe("case");
    expect(plan.viewport.zoom).toBeGreaterThanOrEqual(FRAMING.minReadableZoom);
  });

  test("counts cards that are off the pane or behind Hazel", () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const boxes = new Map<string, Box>([
      ["on", { x: 40, y: 40, w: 250, h: 180 }],
      ["off-right", { x: 900, y: 40, w: 250, h: 180 }],
      ["half-off", { x: 700, y: 40, w: 250, h: 180 }],
      ["behind-hazel", { x: 560, y: 300, w: 250, h: 180 }],
    ]);
    expect(cardsOutOfView(boxes, vp, PANE, HAZEL).sort()).toEqual(["behind-hazel", "half-off", "off-right"]);
    expect(cardsOutOfView(boxes, vp, PANE, null).sort()).toEqual(["half-off", "off-right"]);
  });
});
