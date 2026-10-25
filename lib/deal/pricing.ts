// Deal pricing (ticket 10, TEAM_BRIEF section 6): price = balance x (1 - PD x LGD) x (1 - margin), PD from the credit score tier.
// Every number here is an ASSUMPTION the analyst can change; the screen labels it "assumed". A loan with no credit score
// (only case loans have a CRS report) gets no default-risk haircut, just the margin.
import { z } from "zod";

export type Tier = { min_score: number; pd: number };
export type Assumptions = { tiers: Tier[]; lgd: number; margin: number };

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  tiers: [
    { min_score: 720, pd: 0.02 },
    { min_score: 660, pd: 0.05 },
    { min_score: 620, pd: 0.1 },
    { min_score: 580, pd: 0.18 },
    { min_score: 0, pd: 0.28 },
  ],
  lgd: 0.55,
  margin: 0.04,
};

/** What an analyst may type in: loss given default and margin, each between 0 and 1. */
export const AssumptionsInputSchema = z.object({ lgd: z.number().min(0).max(1), margin: z.number().min(0).max(1) });

export const withInputs = (base: Assumptions, input: { lgd?: number; margin?: number }): Assumptions => ({
  ...base, lgd: input.lgd ?? base.lgd, margin: input.margin ?? base.margin,
});

export const cents = (n: number) => Math.round(n * 100) / 100;

const byScoreDesc = (a: Assumptions) => [...a.tiers].sort((x, y) => y.min_score - x.min_score);

/** The score the best tier starts at: a scored loan below it is priced down ("Reprice"). */
export const topTierMin = (a: Assumptions) => byScoreDesc(a)[0].min_score;

/** Probability of default for a score, or null when the loan has no score. */
export function pdFor(score: number | null | undefined, a: Assumptions): number | null {
  if (score == null) return null;
  return byScoreDesc(a).find((t) => score >= t.min_score)?.pd ?? null;
}

export function priceLoan(balance: number, score: number | null | undefined, a: Assumptions): { price: number; pd: number | null } {
  const pd = pdFor(score, a);
  return { pd, price: cents(balance * (1 - (pd ?? 0) * a.lgd) * (1 - a.margin)) };
}
