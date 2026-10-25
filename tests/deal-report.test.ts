// Ticket 10: the CRO report on a real Hazel run (seed 13, the ring, a fraud alert and a clean loan). The figures are recomputed
// here from the raw loans, so the report is checked against arithmetic and not against itself.
import { beforeAll, describe, expect, test } from "bun:test";
import type { Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { TOOL_SPECS } from "@/lib/contracts/tool-result";
import { buildReport, cents, DEFAULT_ASSUMPTIONS, type DealReport, withInputs } from "@/lib/deal";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
const balance = (l: Loan) => l.funding_info.current_balance;
const sum = (xs: number[]) => cents(xs.reduce((s, x) => s + x, 0));
const row = (id: string) => report.loans.find((l) => l.loan_id === id)!;
const loan = (id: string) => run.loans.find((l) => l.loan_id === id)!;

beforeAll(async () => {
  run = await dealRun();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
});

describe("verdicts on the run", () => {
  test("the ring's loans are Exclude, the fraud alert is Review, the clean loan is Clear", () => {
    const { lead, p12, p14, background, fraudAlert, clean } = run.ids;
    expect([lead, p12, p14, background].map((id) => row(id).verdict)).toEqual(["Exclude", "Exclude", "Exclude", "Exclude"]);
    expect(row(fraudAlert).verdict).toBe("Review");
    expect(row(clean).verdict).toBe("Clear");
    expect(row(background).reason_kind).toBe("ring_link"); // excluded through the lead, not through a CRS check of its own
  });
  test("only the loans the run closed are listed; every other loan is counted at base price", () => {
    expect(report.totals.reviewed).toBe(6);
    expect(report.totals.not_reviewed).toBe(994);
    expect(report.loans.map((l) => l.verdict).slice(0, 5)).toEqual(["Exclude", "Exclude", "Exclude", "Exclude", "Review"]);
    expect(report.totals.counts).toEqual({ Exclude: 4, Review: 1, Reprice: 0, Clear: 995 });
  });
  test("rows cite the status row and the CRS RequestID behind them", () => {
    const lead = row(run.ids.lead);
    const status = run.events.find((e) => e.type === "status_changed" && e.loan_ids[0] === run.ids.lead)!;
    expect(lead.event_seqs).toEqual([status.seq]);
    expect(lead.request_ids).toHaveLength(1);
    expect(status.sources).toContainEqual({ kind: "crs", product: "tu_identity", request_id: lead.request_ids[0] });
  });
});

describe("totals", () => {
  test("total principal is the sum of every loan's current balance", () => {
    expect(report.totals.total_principal).toBe(sum(run.loans.map(balance)));
    expect(report.totals.loans).toBe(1000);
  });
  test("the bid prices every loan except the excluded and held-out ones at balance x (1 - 4%), as assumed", () => {
    const out = new Set([run.ids.lead, run.ids.p12, run.ids.p14, run.ids.background, run.ids.fraudAlert]);
    const expected = sum(run.loans.filter((l) => !out.has(l.loan_id)).map((l) => cents(balance(l) * 0.96)));
    expect(report.totals.proposed_price).toBe(expected);
    expect(report.totals.bid_loans).toBe(995);
  });
  test("excluded and held-out balances are the loans' own balances", () => {
    const { lead, p12, p14, background, fraudAlert } = run.ids;
    expect(report.totals.excluded_balance).toBe(sum([lead, p12, p14, background].map((id) => balance(loan(id)))));
    expect(report.totals.held_out_balance).toBe(balance(loan(fraudAlert)));
  });
  test("balance under review is the flagged loans' balances (Investigate), clean loans excluded", () => {
    const flagged = [run.ids.lead, run.ids.p12, run.ids.p14, run.ids.background, run.ids.fraudAlert];
    expect(report.totals.balance_under_review).toBe(sum(flagged.map((id) => balance(loan(id)))));
  });
  test("every figure lists the event rows behind it", () => {
    const statusSeq = (id: string) => run.events.find((e) => e.type === "status_changed" && e.loan_ids[0] === id)!.seq;
    const flagged = [run.ids.lead, run.ids.p12, run.ids.p14, run.ids.background, run.ids.fraudAlert];
    expect(report.refs.balance_under_review).toEqual(flagged.map(statusSeq).sort((a, b) => a - b));
    expect(report.refs.held_out).toEqual([statusSeq(run.ids.fraudAlert)]);
    expect(report.refs.excluded).toHaveLength(4);
  });
});

describe("concentration", () => {
  test("by dealer: flagged balance, the dealer's own total, and the share between them", () => {
    const d = report.concentration.by_dealer;
    expect(sum(d.map((x) => x.flagged_balance))).toBe(report.totals.balance_under_review);
    for (const x of d) {
      expect(x.dealer_balance).toBe(sum(run.loans.filter((l) => l.submission.dealer_id === x.dealer_id).map(balance)));
      expect(x.share).toBeGreaterThan(0);
      expect(x.share).toBeLessThanOrEqual(1);
      expect(x.event_seqs.length).toBe(x.flagged_loans);
    }
    expect(d.map((x) => x.flagged_balance)).toEqual([...d.map((x) => x.flagged_balance)].sort((a, b) => b - a));
  });
  test("a ring joins investigated loans by links nobody has taken down, and cites the link rows", () => {
    const ring = report.concentration.rings[0];
    expect(ring.ring_id).toBe("ring-1");
    expect(ring.loan_ids).toContain(run.ids.lead);
    expect(ring.loan_ids.length).toBeGreaterThanOrEqual(2);
    expect(ring.loan_ids).not.toContain(run.ids.clean);
    expect(ring.balance).toBe(sum(ring.loan_ids.map((id) => balance(loan(id)))));
    const links = run.events.filter((e) => e.type === "link_found").map((e) => e.seq);
    expect(ring.event_seqs.some((s) => links.includes(s))).toBe(true);
  });
  test("a link that was taken down no longer joins a ring", () => {
    const ring = report.concentration.rings[0];
    const edge = ring.edge_ids[0];
    const takenDown: Event = { ...run.events.find((e) => e.type === "link_found")!, type: "clue_explained", seq: run.events.length + 1,
      result: { edge_ids: ring.edge_ids, explained_by: "check_address", reason: "test" } };
    const after = buildReport({ run_id: run.run_id, loans: run.loans, events: [...run.events, takenDown] });
    expect(edge).toBeDefined();
    expect(after.concentration.rings.flatMap((r) => r.edge_ids)).not.toContain(edge);
  });
});

describe("spend against checking everything", () => {
  test("spent comes from the ledger's last budget, and the CRS tools are summed from TOOL_SPECS", () => {
    expect(report.spend.spent).toBe(15);
    expect(report.spend.limit).toBe(60);
    const perLoan = TOOL_SPECS.crs_identity_check.acorns + TOOL_SPECS.crs_credit_report.acorns + TOOL_SPECS.crs_fraud_finder.acorns + TOOL_SPECS.crs_reverse_phone.acorns;
    expect(report.spend.per_case_loan).toBe(perLoan);
    expect(report.spend.case_loans).toBe(run.loans.filter((l) => l.kind === "case").length);
    expect(report.spend.check_everything).toBe(report.spend.case_loans * perLoan);
    expect(report.spend.saved).toBe(report.spend.check_everything - 15);
  });
  test("by tool, from the budget_spent rows, and the rows are cited", () => {
    expect(report.spend.by_tool).toEqual([{ tool: "crs_identity_check", acorns: 15, calls: 5 }]);
    expect(report.spend.event_seqs).toEqual(run.events.filter((e) => e.type === "budget_spent").map((e) => e.seq));
  });
});

describe("analyst assumptions and scores", () => {
  test("a bigger margin lowers the bid", () => {
    const higher = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events, assumptions: withInputs(DEFAULT_ASSUMPTIONS, { margin: 0.1 }) });
    expect(higher.totals.proposed_price).toBeLessThan(report.totals.proposed_price);
    expect(higher.assumptions.margin).toBe(0.1);
  });
  test("a known low score on a clean loan makes it Reprice, at the lower price", () => {
    const scored = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events, scores: new Map([[run.ids.clean, 540]]) });
    expect(scored.loans.find((l) => l.loan_id === run.ids.clean)!.verdict).toBe("Reprice");
    expect(scored.loans.find((l) => l.loan_id === run.ids.clean)!.price).toBe(cents(balance(loan(run.ids.clean)) * (1 - 0.28 * 0.55) * 0.96));
    expect(scored.totals.counts.Reprice).toBe(1);
    expect(scored.totals.unscored).toBe(999);
    expect(scored.totals.proposed_price).toBeLessThan(report.totals.proposed_price);
  });
  test("an unscored loan is counted as unscored, not as prime", () => {
    expect(report.totals.unscored).toBe(1000);
  });
});

describe("a run that did not finish, or rows that do not belong", () => {
  test("no events: nothing investigated, every loan at base price, no spend", () => {
    const empty = buildReport({ run_id: "none", loans: run.loans, events: [] });
    expect([empty.totals.reviewed, empty.totals.excluded_balance, empty.spend.spent, empty.concentration.rings.length]).toEqual([0, 0, 0, 0]);
    expect(empty.totals.proposed_price).toBe(sum(run.loans.map((l) => cents(balance(l) * 0.96))));
  });
  test("a status row for an unknown loan, or with an unknown status, is ignored", () => {
    const base = run.events.find((e) => e.type === "status_changed")!;
    const odd: Event[] = [
      { ...base, seq: 900, loan_ids: ["L9999"] },
      { ...base, seq: 901, loan_ids: [run.ids.clean], result: { status: "Probably fine", reason: "x" } },
    ];
    const r = buildReport({ run_id: run.run_id, loans: run.loans, events: [...run.events, ...odd] });
    expect(r.totals.reviewed).toBe(6);
    expect(r.loans.find((l) => l.loan_id === run.ids.clean)!.verdict).toBe("Clear");
  });
});
