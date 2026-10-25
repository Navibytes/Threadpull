// Ticket 10: the CRO screen's number formats.
import { describe, expect, test } from "bun:test";
import { eventRefs, eventRefsShort, pct, plural, usd } from "@/components/cro/format";

describe("formats", () => {
  test("money, with and without cents", () => {
    expect(usd(29186301.68)).toBe("$29,186,302");
    expect(usd(29186301.68, true)).toBe("$29,186,301.68");
    expect(usd(0)).toBe("$0");
    expect(usd(1234.5, true)).toBe("$1,234.50");
  });
  test("percentages", () => {
    expect(pct(0.1347)).toBe("13.5%");
    expect(pct(1)).toBe("100.0%");
    expect(pct(0.02, 0)).toBe("2%");
  });
  test("event references read like the audit log", () => {
    expect(eventRefs([])).toBe("no events");
    expect(eventRefs([22])).toBe("event #22");
    expect(eventRefs([3, 14, 16])).toBe("events #3, #14, #16");
    expect(eventRefsShort([1, 2, 3])).toBe("events #1, #2, #3");
    expect(eventRefsShort([1, 2, 3, 4, 5, 6])).toBe("events #1, #2, #3 and 3 more");
  });
  test("plurals", () => {
    expect([plural(1, "loan"), plural(4, "loan"), plural(0, "loan"), plural(2, "dealer")]).toEqual(["1 loan", "4 loans", "0 loans", "2 dealers"]);
  });
});
