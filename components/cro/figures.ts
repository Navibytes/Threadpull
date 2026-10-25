// What the CRO page says about the report's numbers: how they relate, what each one means, and what each is computed from.
// Pure, and read only from the DealReport (lib/deal/report.ts): nothing here estimates, rounds a figure differently from the
// report, or adds a number the report does not carry. Where a figure is derived (a subtraction of two report totals), the
// derivation is stated and tested, never silent.
import { CHECK_EVERYTHING_TOOLS, type DealReport, type LoanRow, type Verdict } from "@/lib/deal";
import { TOOL_SPECS } from "@/lib/contracts/tool-result";

const cents = (n: number) => Math.round(n * 100) / 100;

/** The decisions a person is asked to make: investigated loans whose proposal is not "Clear". */
export const needsDecision = (l: LoanRow) => l.proposed_verdict !== "Clear";

export type ReviewState = "none" | "awaiting" | "partial" | "confirmed";

/** Where the recommendation stands: proposed by code, or confirmed by a person, loan by loan. */
export function reviewState(loans: readonly LoanRow[]): { state: ReviewState; total: number; confirmed: number; pending: number } {
  const asked = loans.filter(needsDecision);
  const confirmed = asked.filter((l) => l.confirmed).length;
  const state: ReviewState = asked.length === 0 ? "none" : confirmed === 0 ? "awaiting" : confirmed === asked.length ? "confirmed" : "partial";
  return { state, total: asked.length, confirmed, pending: asked.length - confirmed };
}

export const REVIEW_LABEL: Record<ReviewState, string> = {
  none: "Nothing flagged for a decision",
  awaiting: "AI-proposed · awaiting human review",
  partial: "Partly confirmed by a person",
  confirmed: "Human-confirmed",
};

export type Reconciliation = {
  principal: number; // every loan's current balance
  inBid: number; // principal of the loans that stay in the bid (derived: principal - excluded - held)
  excluded: number;
  held: number;
  adjustment: number; // inBid - proposed price: the assumed default haircut and margin (derived)
  bid: number; // the report's proposed price
  loans: { all: number; inBid: number; excluded: number; held: number };
  /** The identity the page prints: principal = inBid + excluded + held. False means the report is inconsistent and the page says so. */
  splits: boolean;
};

export function reconcile(r: DealReport): Reconciliation {
  const t = r.totals;
  const inBid = cents(t.total_principal - t.excluded_balance - t.held_out_balance);
  const loans = { all: t.loans, inBid: t.bid_loans, excluded: t.counts.Exclude, held: t.counts.Review };
  return {
    principal: t.total_principal, inBid, excluded: t.excluded_balance, held: t.held_out_balance,
    adjustment: cents(inBid - t.proposed_price), bid: t.proposed_price, loans,
    // the loan counts must split the same way as the money, or the derived in-bid figure cannot be trusted
    splits: loans.inBid + loans.excluded + loans.held === loans.all && inBid >= t.proposed_price - 0.005,
  };
}

/** The headline, in one sentence read from the report's own totals. */
export function headline(r: DealReport): string {
  const x = reconcile(r);
  const parts = [`Bid on ${x.loans.inBid.toLocaleString("en-US")} of ${x.loans.all.toLocaleString("en-US")} loans`];
  if (x.loans.excluded) parts.push(`exclude ${x.loans.excluded}`);
  if (x.loans.held) parts.push(`hold ${x.loans.held} for a person`);
  return parts.join(", ");
}

const ids = (rows: readonly LoanRow[]) => rows.map((l) => l.loan_id);
export const loansWith = (r: DealReport, v: Verdict) => ids(r.loans.filter((l) => l.verdict === v));

export type Spend = {
  spent: number;
  limit: number | null;
  tools: { tool: string; calls: number; acorns: number; share: number }[];
  /** Whether the per-tool rows add up to the spend the run's budget rows report. */
  toolsMatchSpend: boolean;
  /** The estimate: each case loan checked with every CRS tool, from the tool price list. Arithmetic, not a second run. */
  everything: { caseLoans: number; perLoan: number; total: number; parts: { tool: string; acorns: number }[] };
  saved: number;
};

export function spendBreakdown(r: DealReport): Spend {
  const s = r.spend;
  const used = s.by_tool.reduce((n, t) => n + t.acorns, 0);
  return {
    spent: s.spent,
    limit: s.limit,
    tools: s.by_tool.map((t) => ({ ...t, share: s.spent ? t.acorns / s.spent : 0 })),
    toolsMatchSpend: used === s.spent,
    everything: {
      caseLoans: s.case_loans, perLoan: s.per_case_loan, total: s.check_everything,
      parts: CHECK_EVERYTHING_TOOLS.map((tool) => ({ tool, acorns: TOOL_SPECS[tool].acorns })),
    },
    saved: s.saved,
  };
}

export type Risk = { key: string; kind: "ring" | "dealer"; name: string; detail: string; loanIds: string[]; balance: number; share: number | null; seqs: number[] };

/** Rings and dealers in one list the page can sort, each with the loans behind it. */
export function riskRows(r: DealReport): Risk[] {
  const byDealerLoans = (dealerId: string) => r.loans.filter((l) => l.dealer_id === dealerId && (l.hazel_status === "Investigate" || l.hazel_status === "Insufficient evidence")).map((l) => l.loan_id);
  return [
    ...r.concentration.rings.map((g): Risk => ({
      key: g.ring_id, kind: "ring", name: g.ring_id.replace("ring-", "Ring "), detail: `${g.dealers.join(", ")} · joined by ${g.edge_ids.length} open ${g.edge_ids.length === 1 ? "link" : "links"}`,
      loanIds: g.loan_ids, balance: g.balance, share: null, seqs: g.event_seqs,
    })),
    ...r.concentration.by_dealer.map((d): Risk => ({
      key: d.dealer_id, kind: "dealer", name: d.dealer_name, detail: `${d.dealer_id} · ${d.flagged_loans} flagged of its book`,
      loanIds: byDealerLoans(d.dealer_id), balance: d.flagged_balance, share: d.share, seqs: d.event_seqs,
    })),
  ];
}
