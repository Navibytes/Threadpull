// What the CRO page says about WHY: the run's findings grouped by what the code recorded for each loan, what is not
// established, which recorded run to present, and the source ledger every printed number points to. Pure and read-only:
// every sentence is built from a DealReport's own fields (reasons, statuses, balances, RequestIDs, event numbers). Nothing is
// scored, summed or judged here that the report does not already carry, and a loan that merely had no anomaly is never
// called safe, sound or innocent.
import type { DealReport, LoanRow, Verdict } from "@/lib/deal";
import { reconcile, reviewState } from "./figures";

const cents = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** What TransUnion and the bureaus' message codes mean (CLAUDE.md, "CRS Credit API — rules that bite"). Shown only for codes the loan's own reason names. */
export const CODE_MEANING: Record<string, string> = {
  "2201": "SSN not associated with the name",
  "2202": "date of birth doesn't match the file",
  "2101": "address doesn't match",
  "2301": "reported deceased",
  "2401": "fraud alert on file",
};

export type Finding = {
  key: string;
  verdict: Verdict; // what the run proposes for these loans
  label: string; // the proposal in words: "Exclude", "Hold for a person", "Not flagged"
  heading: string;
  detail: string | null;
  loanIds: string[];
  balance: number;
  seqs: number[];
  crsIds: number; // distinct CRS RequestIDs the loans' status rows cite (sandbox calls)
  ownCrs: number; // how many of these loans have a CRS RequestID of their own
};

export const VERDICT_LABEL: Record<Verdict, string> = { Exclude: "Exclude", Review: "Hold for a person", Reprice: "Reprice", Clear: "Not flagged" };

const loansWord = (n: number) => (n === 1 ? "loan" : "loans");

function describe(kind: LoanRow["reason_kind"], rows: LoanRow[]): { heading: string; detail: string | null } {
  const n = rows.length;
  const reasons = uniq(rows.map((l) => l.reason).filter((x): x is string => !!x));
  switch (kind) {
    case "hard_identity": {
      const codes = uniq(reasons.flatMap((x) => x.match(/\b2[0-9]{3}\b/g) ?? [])).filter((c) => c in CODE_MEANING);
      const deceased = reasons.some((x) => /deceased/.test(x));
      const meaning = [...codes.map((c) => `${c}: ${CODE_MEANING[c]}`), ...(deceased && !codes.includes("2301") ? ["a bureau reports the file as deceased"] : [])];
      return { heading: `${plural(n, "loan")} failed an identity check`, detail: meaning.length ? meaning.join("; ") : reasons[0] ?? null };
    }
    case "ring_link": {
      const shared = reasons[0]?.match(/\(([^)]+)\)/)?.[1];
      return { heading: `${plural(n, "loan")} share${n === 1 ? "s" : ""} unexplained links with a loan whose identity failed`, detail: shared ? `Shared: ${shared}. A shared detail is a lead, not proof.` : reasons[0] ?? null };
    }
    case "fraud_alert":
      return { heading: `${plural(n, "loan")} ${n === 1 ? "has" : "have"} a fraud alert on file`, detail: reasons[0] ?? null };
    case "open_question":
      return { heading: `${plural(n, "loan")} ${n === 1 ? "waits" : "wait"} on a question nobody has answered`, detail: reasons[0] ?? null };
    case "soft_link":
      return { heading: `${plural(n, "loan")} ${n === 1 ? "has" : "have"} a strong link nobody has explained`, detail: reasons[0] ?? null };
    default:
      return { heading: `${plural(n, "loan")} could not be settled`, detail: reasons.slice(0, 2).join("; ") || null };
  }
}

/** The run's findings, strongest first: exclusions, then holds, then what was investigated without a finding. Grouped by the AI proposal, not by any later human decision. */
export function findings(r: DealReport): Finding[] {
  const groups = new Map<string, LoanRow[]>();
  for (const l of r.loans) {
    const flagged = l.hazel_status === "Investigate" || l.hazel_status === "Insufficient evidence";
    const key = flagged ? `${l.proposed_verdict}:${l.reason_kind}:${l.hazel_status}` : "none";
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const order: Record<Verdict, number> = { Exclude: 0, Review: 1, Reprice: 2, Clear: 3 };
  const out: Finding[] = [];
  for (const [key, rows] of groups) {
    const seqs = uniq(rows.flatMap((l) => l.event_seqs)).sort((a, b) => a - b);
    const crsIds = uniq(rows.flatMap((l) => l.request_ids)).length;
    const ownCrs = rows.filter((l) => l.request_ids.length > 0).length;
    const balance = cents(rows.reduce((s, l) => s + l.balance, 0));
    const loanIds = rows.map((l) => l.loan_id);
    if (key === "none") {
      const priced = rows.filter((l) => l.proposed_verdict === "Reprice").length;
      out.push({
        key, verdict: "Clear", label: VERDICT_LABEL.Clear, loanIds, balance, seqs, crsIds, ownCrs,
        heading: `${plural(rows.length, "investigated loan")}: no material anomaly found`,
        detail: `The checks that ran found nothing. That is not a verification that ${rows.length === 1 ? "it is" : "they are"} sound.${priced ? ` ${plural(priced, "loan")} ${priced === 1 ? "is" : "are"} priced down for credit score.` : ""}`,
      });
      continue;
    }
    const v = rows[0].proposed_verdict;
    out.push({ key, verdict: v, label: VERDICT_LABEL[v], loanIds, balance, seqs, crsIds, ownCrs, ...describe(rows[0].reason_kind, rows) });
  }
  return out.sort((a, b) => order[a.verdict] - order[b.verdict] || b.balance - a.balance);
}

/** What the page does NOT establish, each line read from the report. */
export function unestablished(r: DealReport): string[] {
  const t = r.totals;
  const s = reviewState(r.loans);
  const lines: string[] = [];
  if (s.state === "awaiting") lines.push("No person has confirmed any of this yet. Every action here is proposed by code.");
  if (s.state === "partial") lines.push(`${plural(s.pending, "proposed action")} still ${s.pending === 1 ? "waits" : "wait"} for a person.`);
  if (t.not_reviewed > 0) lines.push(`${plural(t.not_reviewed, "loan")} of ${t.loans.toLocaleString("en-US")} ${t.not_reviewed === 1 ? "was" : "were"} not investigated. ${t.not_reviewed === 1 ? "It stays" : "They stay"} in the bid at base price.`);
  if (t.unscored > 0) lines.push(`${plural(t.unscored, "loan")} ${t.unscored === 1 ? "has" : "have"} no credit score, so the price carries no default haircut for ${t.unscored === 1 ? "it" : "them"}, only the margin.`);
  if (r.concentration.rings.length) lines.push("A ring is a set of flagged loans still joined by links nobody has explained. A shared detail is a lead, not proof.");
  lines.push("CRS identity and credit checks are sandbox calls. Address and employer lookups, where a run used them, are simulated reference stand-ins.");
  return lines;
}

/** One line about a recorded run, for choosing which to present. */
export type Digest = { run_id: string; loans: number; reviewed: number; excluded: number; held: number; spent: number; limit: number | null; events: number };
export const digestOf = (r: DealReport): Digest => ({
  run_id: r.run_id, loans: r.totals.loans, reviewed: r.totals.reviewed, excluded: r.totals.counts.Exclude, held: r.totals.counts.Review,
  spent: r.spend.spent, limit: r.spend.limit, events: r.run.events,
});

/** When the run on screen is a small one and a full-portfolio run is recorded, the one to offer. Never chosen for the reader: the page only offers it. */
export function suggestRun(digests: readonly Digest[], selected: string | null): Digest | null {
  const current = digests.find((d) => d.run_id === selected);
  if (!current || current.loans >= 100) return null;
  const big = digests.filter((d) => d.loans >= 500 && d.reviewed > 0 && d.run_id !== selected);
  return big.sort((a, b) => b.reviewed - a.reviewed || b.events - a.events || b.run_id.localeCompare(a.run_id))[0] ?? null;
}

export type Basis = "From the run" | "Derived" | "Assumed" | "Estimate";
export type LedgerEntry = { id: string; n: number; title: string; basis: Basis; meaning: string; formula: string; fields: string; seqs: number[]; loanIds: string[]; note?: string };

/** The numbers the page prints, each with its meaning, formula, source fields and the event rows and loans behind it. */
export function ledgerEntries(r: DealReport): LedgerEntry[] {
  const x = reconcile(r);
  const t = r.totals;
  const a = r.assumptions;
  const ids = (v: Verdict) => r.loans.filter((l) => l.verdict === v).map((l) => l.loan_id);
  const spent = r.spend;
  const entries: Omit<LedgerEntry, "n">[] = [
    { id: "principal", title: "Total principal", basis: "From the run", meaning: "What every loan in the portfolio is owed today. It is not a price.",
      formula: "sum of every loan's current balance", fields: "funding_info.current_balance, all loans in the portfolio", seqs: [], loanIds: [] },
    { id: "excluded", title: "Excluded", basis: "From the run", meaning: "Loans the run proposes to remove from the purchase, after a failed identity check or an unexplained link to a loan whose identity failed.",
      formula: "sum of current balance of the loans proposed as Exclude", fields: "funding_info.current_balance; the run's status rows", seqs: r.refs.excluded, loanIds: ids("Exclude") },
    { id: "held", title: "Held for a person", basis: "From the run", meaning: "Loans kept out of the bid until one named person answers: conflicting or partial evidence, a fraud alert, or an open question.",
      formula: "sum of current balance of the loans proposed as Review", fields: "funding_info.current_balance; the run's status rows", seqs: r.refs.held_out, loanIds: ids("Review") },
    { id: "inbid", title: "Principal in the bid", basis: "Derived", meaning: "The principal that stays in the purchase before pricing.",
      formula: "total principal − excluded − held", fields: "derived from the three lines above", seqs: [], loanIds: [],
      note: `${x.loans.inBid.toLocaleString("en-US")} + ${x.loans.excluded} + ${x.loans.held} = ${x.loans.all.toLocaleString("en-US")} loans, so no loan is counted twice or left out. ${t.not_reviewed.toLocaleString("en-US")} of the loans in the bid were not investigated.` },
    { id: "adjustment", title: "Pricing adjustment", basis: "Assumed", meaning: "How far the bid sits below the principal in the bid: the margin, plus a default haircut for loans that have a credit score.",
      formula: "principal in the bid − proposed bid", fields: "assumptions: loss given default, margin, credit-score tier table", seqs: [], loanIds: [],
      note: `Loss given default ${Math.round(a.lgd * 100)}%, margin ${Math.round(a.margin * 100)}%. ${(t.loans - t.unscored).toLocaleString("en-US")} of ${t.loans.toLocaleString("en-US")} loans have a score. These are inputs, not market prices.` },
    { id: "bid", title: "Proposed bid", basis: "Assumed", meaning: "What the code would pay for the loans in the bid, under the assumptions above.",
      formula: "sum over the loans in the bid of balance × (1 − default chance × loss given default) × (1 − margin)", fields: "funding_info.current_balance; credit scores the run pulled; the tier table", seqs: [], loanIds: [],
      note: `Default chance by credit-score tier: ${a.tiers.map((tier) => `${tier.min_score}+ ${Math.round(tier.pd * 100)}%`).join(", ")}.` },
    { id: "review", title: "Balance under review", basis: "From the run", meaning: "Loans the run flagged that nobody has decided yet. It overlaps the exclusions and holds, so it is never a further deduction.",
      formula: "sum of current balance of loans set to Investigate or Insufficient evidence, less those a person has decided", fields: "the run's status rows; the decisions recorded in the audit log", seqs: r.refs.balance_under_review, loanIds: [] },
    { id: "risk", title: "Risk by ring and dealer", basis: "From the run", meaning: "Flagged balance by the links that still join loans, and by the dealer that sold them.",
      formula: "ring: loans still joined by an open link · dealer: flagged balance ÷ everything that dealer sold", fields: "link_found and clue_explained rows; submission.dealer_id", seqs: r.concentration.rings.flatMap((g) => g.event_seqs).concat(r.concentration.by_dealer.flatMap((d) => d.event_seqs)), loanIds: [] },
    { id: "spend", title: "Acorns spent", basis: "From the run", meaning: "The checking budget the run used. Acorns are Threadpull's unit, not dollars.",
      formula: "the budget on the run's last audit-log row", fields: "budget.spent and budget.limit; one budget_spent row per paid check", seqs: spent.event_seqs, loanIds: [] },
    { id: "estimate", title: "Cost of checking everything", basis: "Estimate", meaning: "What checking every case loan with every CRS tool would take. Arithmetic over the price list, not a second run.",
      formula: `${spent.case_loans} case loans × ${spent.per_case_loan} acorns = ${spent.check_everything}`, fields: "the tool price list (lib/contracts/tool-result.ts)", seqs: [], loanIds: [] },
  ];
  return entries.map((e, i) => ({ ...e, seqs: uniq(e.seqs).sort((p, q) => p - q), n: i + 1 }));
}

export const refNumber = (r: DealReport, id: string) => ledgerEntries(r).find((e) => e.id === id)?.n ?? 0;
