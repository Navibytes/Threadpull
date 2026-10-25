// The CRO page's derived figures (components/cro/figures.ts), on a real Hazel run and on hand-built reports. Every
// derivation the page prints is checked here, so a figure that stops reconciling fails a test before it reaches a CRO.
import { beforeAll, describe, expect, test } from "bun:test";
import { headline, loansWith, reconcile, REVIEW_LABEL, reviewState, riskRows, spendBreakdown } from "@/components/cro/figures";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { buildReport, dispositionRow, type DealReport, type LoanRow } from "@/lib/deal";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
beforeAll(async () => {
  run = await dealRun();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
});

function decide(r: DealReport, verdicts: string[], by = "CRO"): DealReport {
  let events: Event[] = [...run.events];
  for (const verdict of verdicts) {
    const ids = r.loans.filter((l) => l.verdict === verdict).map((l) => l.loan_id);
    const built = dispositionRow({ run_id: run.run_id, loan_ids: ids, decision: "approve", decided_by: by },
      (id) => { const l = r.loans.find((x) => x.loan_id === id); return l && { proposed: l.proposed_verdict, status_seq: l.event_seqs[0] }; }, run.events.at(-1)!.budget);
    if (!built.ok) throw new Error(built.error);
    events = [...events, EventSchema.parse({ run_id: run.run_id, seq: events.at(-1)!.seq + 1, ts: "2026-10-24T21:00:00Z", ...built.row })];
  }
  return buildReport({ run_id: run.run_id, loans: run.loans, events });
}

describe("principal, exclusions, holds and the bid", () => {
  test("every loan is in exactly one place: the money and the loan counts both split", () => {
    const x = reconcile(report);
    expect(x.splits).toBe(true);
    expect(x.loans.inBid + x.loans.excluded + x.loans.held).toBe(x.loans.all);
    expect(Math.round((x.inBid + x.excluded + x.held) * 100)).toBe(Math.round(x.principal * 100));
  });

  test("the in-bid principal is what is left after the excluded and held loans, summed from the loan rows themselves", () => {
    const x = reconcile(report);
    const investigatedOut = report.loans.filter((l) => l.verdict === "Exclude" || l.verdict === "Review").reduce((s, l) => s + l.balance, 0);
    expect(Math.round((x.excluded + x.held) * 100)).toBe(Math.round(investigatedOut * 100));
    expect(x.inBid).toBeCloseTo(x.principal - investigatedOut, 2);
  });

  test("the bid is the in-bid principal less a pricing adjustment, and the adjustment is never negative", () => {
    const x = reconcile(report);
    expect(x.adjustment).toBeGreaterThanOrEqual(0);
    expect(x.inBid - x.adjustment).toBeCloseTo(x.bid, 2);
    expect(x.bid).toBe(report.totals.proposed_price);
  });

  test("balance under review is not part of the split: it overlaps the excluded and held balances", () => {
    const t = report.totals;
    expect(t.balance_under_review).toBeLessThanOrEqual(t.excluded_balance + t.held_out_balance + 0.005);
    // once a person has decided, it falls while the excluded and held balances do not
    const after = decide(report, ["Exclude", "Review"]);
    expect(after.totals.balance_under_review).toBe(0);
    expect(after.totals.excluded_balance).toBe(t.excluded_balance);
    expect(reconcile(after).splits).toBe(true);
  });

  test("a report whose counts do not split says so instead of printing a false identity", () => {
    const broken = structuredClone(report);
    broken.totals.counts.Exclude += 1; // the counts no longer add up to the loans
    broken.totals.bid_loans = broken.totals.loans; // ... and the bid still claims every loan
    expect(reconcile(broken).splits).toBe(false);
  });

  test("the headline is read from the totals and names nothing the report does not carry", () => {
    const t = report.totals;
    const h = headline(report);
    expect(h).toContain(`${t.bid_loans.toLocaleString("en-US")} of ${t.loans.toLocaleString("en-US")} loans`);
    if (t.counts.Exclude) expect(h).toContain(`exclude ${t.counts.Exclude}`);
    if (t.counts.Review) expect(h).toContain(`hold ${t.counts.Review} for a person`);
    expect(h).not.toMatch(/fraud|guilty|criminal/i);
  });

  test("the loan lists behind each figure are the loans with that verdict", () => {
    expect(loansWith(report, "Exclude")).toHaveLength(report.totals.counts.Exclude);
    expect(loansWith(report, "Review")).toHaveLength(report.totals.counts.Review);
  });
});

describe("AI-proposed or human-confirmed", () => {
  test("a fresh run is proposed by code and waiting for a person", () => {
    const s = reviewState(report.loans);
    expect(s.total).toBeGreaterThan(0);
    expect(s.confirmed).toBe(0);
    expect(s.state).toBe("awaiting");
    expect(REVIEW_LABEL[s.state]).toBe("AI-proposed · awaiting human review");
  });

  test("it is confirmed only when a person has decided every loan that needed a decision", () => {
    const some = decide(report, ["Exclude"]);
    const s1 = reviewState(some.loans);
    expect(["partial", "confirmed"]).toContain(s1.state);
    expect(s1.confirmed).toBeGreaterThan(0);
    const all = decide(report, ["Exclude", "Review"]);
    const s2 = reviewState(all.loans);
    expect(s2.pending).toBe(all.loans.filter((l) => l.proposed_verdict !== "Clear" && !l.confirmed).length);
    if (s2.pending === 0) expect(s2.state).toBe("confirmed");
  });

  test("a run that flagged nothing asks for no decision", () => {
    const none: LoanRow[] = report.loans.filter((l) => l.proposed_verdict === "Clear");
    expect(reviewState(none)).toEqual({ state: "none", total: 0, confirmed: 0, pending: 0 });
    expect(reviewState([])).toEqual({ state: "none", total: 0, confirmed: 0, pending: 0 });
  });
});

describe("the investigation's spend", () => {
  test("per-tool acorns add up to the spend, and the estimate is the price list times the case loans", () => {
    const s = spendBreakdown(report);
    expect(s.toolsMatchSpend).toBe(true);
    expect(s.everything.total).toBe(s.everything.caseLoans * s.everything.perLoan);
    expect(s.everything.parts.reduce((n, p) => n + p.acorns, 0)).toBe(s.everything.perLoan);
    expect(s.tools.reduce((n, t) => n + t.share, 0)).toBeCloseTo(s.spent ? 1 : 0, 5);
    expect(s.saved).toBe(Math.max(0, s.everything.total - s.spent));
  });
});

describe("risk by ring and dealer", () => {
  test("each row carries the loans behind it and the event rows it comes from", () => {
    const rows = riskRows(report);
    expect(rows.length).toBe(report.concentration.rings.length + report.concentration.by_dealer.length);
    for (const row of rows) {
      expect(row.loanIds.length).toBeGreaterThan(0);
      expect(row.seqs.length).toBeGreaterThan(0);
      expect(row.balance).toBeGreaterThan(0);
    }
    for (const row of rows.filter((r) => r.kind === "dealer")) {
      const d = report.concentration.by_dealer.find((x) => x.dealer_id === row.key)!;
      expect(row.loanIds).toHaveLength(d.flagged_loans);
      expect(row.share).toBe(d.share);
    }
  });
});
