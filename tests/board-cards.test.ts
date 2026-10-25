// components/board/index-card-node.tsx: what a card face says and how large it renders.
import { describe, expect, test } from "bun:test";
import { essentialPx, FULL_ZOOM, sourcesInWords } from "@/components/board/index-card-node";
import { cardSize, LAYOUT } from "@/components/board/layout";

describe("card face text", () => {
  test("sources in plain words, never event or tool names", () => {
    expect(sourcesInWords([{ kind: "row", loan_id: "L1", field: "applicant_info.phone" }])).toBe("1 data-room row");
    expect(sourcesInWords([])).toBe("No sources recorded");
    expect(
      sourcesInWords([
        { kind: "row", loan_id: "L1", field: "x" },
        { kind: "crs", product: "tu_identity_verification", request_id: "r1" },
      ]),
    ).toBe("2 sources: data room, CRS");
  });
});

describe("rendered size", () => {
  test("at or above FULL_ZOOM the full face's 13px labels render at 12px or more", () => {
    expect(13 * FULL_ZOOM).toBeGreaterThanOrEqual(12);
  });

  test("below it, essential labels are sized from the zoom to render at about 12px, down to 0.45", () => {
    for (let z = 0.45; z < FULL_ZOOM; z += 0.01) expect(essentialPx(z) * z).toBeGreaterThanOrEqual(12);
  });

  test("the focused face (ID plus a row of stamps) still fits inside each card at the smallest zoom", () => {
    const z = 0.45;
    const stampRow = essentialPx(z) * 1.6;
    expect(16 + 52 + 12 + stampRow + 16).toBeLessThanOrEqual(LAYOUT.lead.h); // folder: padding, ID, gap, stamps, padding
    expect(20 + 40 + 12 + stampRow + 12).toBeLessThanOrEqual(LAYOUT.linked.h); // index card
  });

  test("a lead folder is clearly larger than a linked index card", () => {
    const lead = cardSize("PROOF-01", true), linked = cardSize("PROOF-02", false);
    expect(lead.w - linked.w).toBeGreaterThanOrEqual(50);
    expect(lead.h).toBeGreaterThan(linked.h);
  });
});
