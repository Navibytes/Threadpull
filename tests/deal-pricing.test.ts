// Ticket 10: the price formula from the brief, price = balance x (1 - PD x LGD) x (1 - margin), PD by score tier.
import { describe, expect, test } from "bun:test";
import { AssumptionsInputSchema, DEFAULT_ASSUMPTIONS as A, pdFor, priceLoan, topTierMin, withInputs } from "@/lib/deal";

describe("probability of default by score tier (720+ 2%, 660-719 5%, 620-659 10%, 580-619 18%, below 580 28%)", () => {
  test("tier edges", () => {
    const at = (s: number) => pdFor(s, A);
    expect([at(850), at(720), at(719), at(660), at(659), at(620), at(619), at(580), at(579), at(300)]).toEqual([0.02, 0.02, 0.05, 0.05, 0.1, 0.1, 0.18, 0.18, 0.28, 0.28]);
  });
  test("no score means no tier", () => {
    expect([pdFor(null, A), pdFor(undefined, A)]).toEqual([null, null]);
  });
  test("the best tier starts at 720", () => {
    expect(topTierMin(A)).toBe(720);
  });
});

describe("price", () => {
  test("a prime score: 10,000 x (1 - 2% x 55%) x (1 - 4%) = 9,494.40", () => {
    expect(priceLoan(10000, 790, A)).toEqual({ pd: 0.02, price: 9494.4 });
  });
  test("a subprime score: 10,000 x (1 - 28% x 55%) x (1 - 4%) = 8,121.60", () => {
    expect(priceLoan(10000, 540, A)).toEqual({ pd: 0.28, price: 8121.6 });
  });
  test("an unscored loan gets the margin only: 10,000 x (1 - 4%) = 9,600", () => {
    expect(priceLoan(10000, null, A)).toEqual({ pd: null, price: 9600 });
  });
  test("prices are rounded to cents", () => {
    expect(priceLoan(12345.67, null, A).price).toBe(11851.84);
  });
  test("a lower score never prices higher", () => {
    const prices = [800, 700, 640, 600, 500].map((s) => priceLoan(50000, s, A).price);
    expect([...prices].sort((x, y) => y - x)).toEqual(prices);
  });
});

describe("analyst assumptions", () => {
  test("loss given default and margin can be changed, the tiers are kept", () => {
    const b = withInputs(A, { lgd: 0.8, margin: 0.1 });
    expect([b.lgd, b.margin, b.tiers]).toEqual([0.8, 0.1, A.tiers]);
    expect(priceLoan(10000, 540, b).price).toBe(6984); // 10,000 x (1 - 28% x 80%) x 90%
    expect(withInputs(A, {}).lgd).toBe(A.lgd);
  });
  test("the inputs must be between 0 and 1", () => {
    expect(AssumptionsInputSchema.safeParse({ lgd: 0.6, margin: 0.05 }).success).toBe(true);
    expect(AssumptionsInputSchema.safeParse({ lgd: 1.5, margin: 0.05 }).success).toBe(false);
    expect(AssumptionsInputSchema.safeParse({ lgd: 0.5, margin: -0.01 }).success).toBe(false);
  });
});
