// The CRO report (ticket 10, SKELETON section 10): totals, concentration, spend and a verdict per investigated loan, built
// by plain code from the loans and one run's event log. Nothing here comes from a model, and every figure lists the event
// rows (`event_seqs`) behind it. Prices are assumptions (see pricing.ts); the spend comparison is arithmetic over TOOL_SPECS.
import type { Event } from "@/lib/contracts/event";
import { LOAN_STATUSES, type Loan, type LoanStatus } from "@/lib/contracts/loan";
import { TOOL_SPECS, type ToolName } from "@/lib/contracts/tool-result";
import { confirmedByLoan, type Confirmed } from "./dispositions";
import { cents, DEFAULT_ASSUMPTIONS, priceLoan, topTierMin, type Assumptions } from "./pricing";
import { FLAGGED_STATUSES, outOfBid, reasonKind, VERDICTS, verdictFor, type ReasonKind, type Verdict } from "./verdicts";

/** Every CRS tool run on every case loan: the policy "check everything" is measured against. */
export const CHECK_EVERYTHING_TOOLS = ["crs_identity_check", "crs_credit_report", "crs_fraud_finder", "crs_reverse_phone"] as const satisfies readonly ToolName[];

export type LoanRow = {
  loan_id: string;
  dealer_id: string;
  dealer_name: string;
  balance: number;
  status: LoanStatus; // "Human-confirmed disposition" once a person has decided
  hazel_status: LoanStatus; // what the run itself concluded
  reason: string | null;
  reason_kind: ReasonKind;
  proposed_verdict: Verdict;
  verdict: Verdict; // the CRO's decision if there is one, else the proposal
  confirmed: Confirmed | null;
  score: number | null;
  price: number | null; // null when the loan is out of the bid
  event_seqs: number[];
  request_ids: string[]; // CRS RequestIDs cited by the status row
};
export type DealerConcentration = { dealer_id: string; dealer_name: string; dealer_balance: number; flagged_loans: number; flagged_balance: number; share: number; event_seqs: number[] };
export type Ring = { ring_id: string; loan_ids: string[]; balance: number; dealers: string[]; edge_ids: string[]; event_seqs: number[] };

export type DealReport = {
  run_id: string;
  run: { events: number; last_seq: number; model: string | null; note: string | null };
  assumptions: Assumptions;
  totals: {
    loans: number; reviewed: number; not_reviewed: number; unscored: number;
    total_principal: number; proposed_price: number; bid_loans: number;
    balance_under_review: number; excluded_balance: number; held_out_balance: number;
    counts: Record<Verdict, number>;
  };
  concentration: { by_dealer: DealerConcentration[]; rings: Ring[] };
  spend: {
    spent: number; limit: number | null;
    case_loans: number; per_case_loan: number; check_everything: number; saved: number;
    by_tool: { tool: string; acorns: number; calls: number }[];
    event_seqs: number[];
  };
  loans: LoanRow[];
  refs: { balance_under_review: number[]; excluded: number[]; held_out: number[] };
};

const text = (v: unknown) => (typeof v === "string" ? v : null);
const status = (v: unknown): LoanStatus | null => (LOAN_STATUSES as readonly string[]).includes(v as string) ? (v as LoanStatus) : null;
const sum = (xs: Iterable<number>) => cents([...xs].reduce((s, x) => s + x, 0));
const ORDER: Record<Verdict, number> = { Exclude: 0, Review: 1, Reprice: 2, Clear: 3 };

/** The credit scores the run itself recorded: a crs_credit_report check_run row carries the lowest bureau score (lib/crs creditEventFacts). */
function scoresInEvents(events: readonly Event[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events)
    if (e.type === "check_run" && e.tool === "crs_credit_report" && e.result.ok === true && typeof e.result.score === "number" && e.loan_ids[0])
      out.set(e.loan_ids[0], e.result.score);
  return out;
}

export function buildReport(input: {
  run_id: string;
  loans: readonly Loan[];
  events: readonly Event[];
  scores?: ReadonlyMap<string, number>; // loan id -> credit score, only where a CRS credit report was pulled
  assumptions?: Assumptions;
  note?: string | null;
}): DealReport {
  const a = input.assumptions ?? DEFAULT_ASSUMPTIONS;
  const top = topTierMin(a);
  const events = [...input.events].sort((x, y) => x.seq - y.seq);
  const byId = new Map(input.loans.map((l) => [l.loan_id, l]));
  const recorded = scoresInEvents(events);
  const scoreOf = (id: string) => input.scores?.get(id) ?? recorded.get(id) ?? null; // an analyst's score wins over the run's
  const confirmed = confirmedByLoan(events);

  // the last valid status the run gave each loan (a malformed row never replaces a good one)
  const statusRow = new Map<string, Event>();
  for (const e of events) if (e.type === "status_changed" && e.loan_ids[0] && status(e.result.status)) statusRow.set(e.loan_ids[0], e);

  const rows: LoanRow[] = [];
  for (const [loan_id, e] of statusRow) {
    const loan = byId.get(loan_id);
    const hazel = status(e.result.status);
    if (!loan || !hazel) continue;
    const reason = text(e.result.reason);
    const score = scoreOf(loan_id);
    const proposed = verdictFor({ status: hazel, reason, score, topTierMin: top });
    const done = confirmed.get(loan_id) ?? null;
    const verdict = done?.final_verdict ?? proposed;
    const balance = loan.funding_info.current_balance;
    rows.push({
      loan_id, dealer_id: loan.submission.dealer_id, dealer_name: loan.submission.dealer_name, balance,
      status: done ? "Human-confirmed disposition" : hazel, hazel_status: hazel, reason, reason_kind: reasonKind(reason),
      proposed_verdict: proposed, verdict, confirmed: done, score,
      price: outOfBid(verdict) ? null : priceLoan(balance, score, a).price,
      event_seqs: [e.seq, ...(done ? [done.seq] : [])],
      request_ids: e.sources.flatMap((s) => (s.kind === "crs" ? [s.request_id] : [])),
    });
  }
  rows.sort((x, y) => ORDER[x.verdict] - ORDER[y.verdict] || x.loan_id.localeCompare(y.loan_id));

  // ---- totals: investigated loans by verdict, every other loan at base price
  const investigated = new Set(rows.map((r) => r.loan_id));
  const rest = input.loans.filter((l) => !investigated.has(l.loan_id));
  const restPrice = (l: Loan) => priceLoan(l.funding_info.current_balance, scoreOf(l.loan_id), a).price;
  const restVerdict = (l: Loan): Verdict => { const s = scoreOf(l.loan_id); return s != null && s < top ? "Reprice" : "Clear"; };
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const r of rows) counts[r.verdict]++;
  for (const l of rest) counts[restVerdict(l)]++;

  const flagged = rows.filter((r) => FLAGGED_STATUSES.includes(r.hazel_status));
  const underReview = flagged.filter((r) => !r.confirmed);
  const seqs = (rs: LoanRow[]) => rs.flatMap((r) => r.event_seqs).sort((x, y) => x - y);
  const excluded = rows.filter((r) => r.verdict === "Exclude");
  const heldOut = rows.filter((r) => r.verdict === "Review");

  // ---- concentration by dealer (loans the run flagged, whatever the CRO later decided)
  const dealerBalance = new Map<string, number>();
  for (const l of input.loans) dealerBalance.set(l.submission.dealer_id, (dealerBalance.get(l.submission.dealer_id) ?? 0) + l.funding_info.current_balance);
  const dealers = new Map<string, LoanRow[]>();
  for (const r of flagged) dealers.set(r.dealer_id, [...(dealers.get(r.dealer_id) ?? []), r]);
  const by_dealer: DealerConcentration[] = [...dealers].map(([dealer_id, rs]) => {
    const dealer_balance = cents(dealerBalance.get(dealer_id) ?? 0);
    const flagged_balance = sum(rs.map((r) => r.balance));
    return { dealer_id, dealer_name: rs[0].dealer_name, dealer_balance, flagged_loans: rs.length, flagged_balance,
      share: dealer_balance ? Math.round((flagged_balance / dealer_balance) * 10000) / 10000 : 0, event_seqs: seqs(rs) };
  }).sort((x, y) => y.flagged_balance - x.flagged_balance);

  // ---- rings: loans the run is investigating, joined by links nobody has taken down
  const explained = new Set(events.filter((e) => e.type === "clue_explained").flatMap((e) => (Array.isArray(e.result.edge_ids) ? e.result.edge_ids.map(String) : [])));
  const investigating = new Map(rows.filter((r) => r.hazel_status === "Investigate").map((r) => [r.loan_id, r]));
  const parent = new Map([...investigating.keys()].map((id) => [id, id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const links = events.filter((e) => e.type === "link_found" && e.loan_ids.length === 2 && !explained.has(String(e.result.edge_id))
    && investigating.has(e.loan_ids[0]) && investigating.has(e.loan_ids[1]));
  for (const e of links) parent.set(find(e.loan_ids[0]), find(e.loan_ids[1]));
  const groups = new Map<string, string[]>();
  for (const id of investigating.keys()) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  const rings: Ring[] = [...groups.values()].filter((ids) => ids.length > 1).map((ids) => {
    const members = ids.map((id) => investigating.get(id)!);
    const own = links.filter((e) => ids.includes(e.loan_ids[0]));
    return { ring_id: "", loan_ids: ids.sort(), balance: sum(members.map((m) => m.balance)),
      dealers: [...new Set(members.map((m) => m.dealer_name))].sort(), edge_ids: [...new Set(own.map((e) => String(e.result.edge_id)))],
      event_seqs: [...new Set([...seqs(members), ...own.map((e) => e.seq)])].sort((x, y) => x - y) };
  }).sort((x, y) => y.balance - x.balance).map((r, i) => ({ ...r, ring_id: `ring-${i + 1}` }));

  // ---- spend against checking everything
  const paid = events.filter((e) => e.type === "budget_spent");
  const byTool = new Map<string, { acorns: number; calls: number }>();
  for (const e of paid) {
    const t = byTool.get(e.tool ?? "unknown") ?? { acorns: 0, calls: 0 };
    byTool.set(e.tool ?? "unknown", { acorns: t.acorns + (typeof e.result.acorns === "number" ? e.result.acorns : 0), calls: t.calls + 1 });
  }
  const last = events.at(-1);
  const per_case_loan = CHECK_EVERYTHING_TOOLS.reduce((s, t) => s + TOOL_SPECS[t].acorns, 0);
  const case_loans = input.loans.filter((l) => l.kind === "case").length;
  const spent = last?.budget.spent ?? 0;

  const bid = [...rows.filter((r) => r.price !== null).map((r) => r.price as number), ...rest.map(restPrice)];
  return {
    run_id: input.run_id,
    run: { events: events.length, last_seq: last?.seq ?? 0, model: text(events.find((e) => e.type === "run_started")?.result.model), note: input.note ?? null },
    assumptions: a,
    totals: {
      loans: input.loans.length, reviewed: rows.length, not_reviewed: rest.length,
      unscored: input.loans.filter((l) => scoreOf(l.loan_id) === null).length,
      total_principal: sum(input.loans.map((l) => l.funding_info.current_balance)), proposed_price: sum(bid), bid_loans: bid.length,
      balance_under_review: sum(underReview.map((r) => r.balance)), excluded_balance: sum(excluded.map((r) => r.balance)), held_out_balance: sum(heldOut.map((r) => r.balance)),
      counts,
    },
    concentration: { by_dealer, rings },
    spend: {
      spent, limit: last?.budget.limit ?? null, case_loans, per_case_loan, check_everything: case_loans * per_case_loan,
      saved: Math.max(0, case_loans * per_case_loan - spent),
      by_tool: [...byTool].map(([tool, v]) => ({ tool, ...v })).sort((x, y) => y.acorns - x.acorns),
      event_seqs: paid.map((e) => e.seq),
    },
    loans: rows,
    refs: { balance_under_review: seqs(underReview), excluded: seqs(excluded), held_out: seqs(heldOut) },
  };
}
