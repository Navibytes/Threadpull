// The CRO page's "why" and "what is not established" (components/cro/findings.ts), checked on a real Hazel run: every
// sentence comes from the report, no loan is called safe because nothing was found, and the demo run is offered, never chosen.
import { beforeAll, describe, expect, test } from "bun:test";
import { digestOf, findings, ledgerEntries, suggestRun, unestablished, VERDICT_LABEL, type Digest } from "@/components/cro/findings";
import { reconcile } from "@/components/cro/figures";
import { buildReport, type DealReport } from "@/lib/deal";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
beforeAll(async () => {
  run = await dealRun();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
});

describe("why this recommendation", () => {
  test("every investigated loan is in exactly one finding, and the balances add up to the loans' own", () => {
    const f = findings(report);
    const ids = f.flatMap((x) => x.loanIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(report.loans.map((l) => l.loan_id).sort());
    const total = f.reduce((s, x) => s + x.balance, 0);
    expect(total).toBeCloseTo(report.loans.reduce((s, l) => s + l.balance, 0), 2);
  });

  test("exclusions come first, then holds, then loans with no finding", () => {
    const order = findings(report).map((x) => x.verdict);
    const rank = { Exclude: 0, Review: 1, Reprice: 2, Clear: 3 } as const;
    expect([...order].sort((a, b) => rank[a] - rank[b])).toEqual(order);
    expect(order[0]).toBe("Exclude");
  });

  test("a failed identity check says which codes, in words, and cites its CRS evidence", () => {
    const hard = findings(report).find((x) => x.heading.includes("failed an identity check"))!;
    expect(hard.detail).toMatch(/2201: SSN not associated with the name/);
    expect(hard.detail).toMatch(/2202: date of birth doesn't match the file/);
    expect(hard.crsIds).toBeGreaterThan(0);
    expect(hard.seqs.length).toBeGreaterThan(0);
  });

  test("a link is called a lead, and the loans linked to a failed identity are not called fraud", () => {
    const ring = findings(report).find((x) => x.heading.includes("unexplained links"));
    if (ring) expect(ring.detail).toMatch(/lead, not proof/);
    for (const f of findings(report)) expect(`${f.heading} ${f.detail ?? ""}`).not.toMatch(/fraudster|guilty|criminal|\bsafe\b|innocent/i);
  });

  test("no anomaly found is never described as safe, sound or verified", () => {
    const none = findings(report).find((x) => x.key === "none");
    if (none) {
      expect(none.heading).toContain("no material anomaly found");
      expect(none.detail).toMatch(/not a verification/);
      expect(none.label).toBe("Not flagged");
    }
    expect(VERDICT_LABEL.Clear).toBe("Not flagged");
  });
});

describe("what is not established", () => {
  test("says no person has confirmed anything, how many loans were not investigated, and how many have no score", () => {
    const lines = unestablished(report).join("\n");
    expect(lines).toContain("No person has confirmed any of this yet");
    expect(lines).toContain(`${report.totals.not_reviewed.toLocaleString("en-US")} loans of ${report.totals.loans.toLocaleString("en-US")} were not investigated`);
    expect(lines).toContain(`${report.totals.unscored.toLocaleString("en-US")} loans have no credit score`);
  });
  test("separates real sandbox checks from simulated stand-ins", () => {
    expect(unestablished(report).join("\n")).toMatch(/sandbox calls.*simulated reference stand-ins/);
  });
});

describe("which run to present", () => {
  const d = (run_id: string, loans: number, reviewed: number, events = 20): Digest => ({ run_id, loans, reviewed, excluded: 0, held: 0, spent: 0, limit: 60, events });
  test("a small run on screen is offered the best full-portfolio run, and nothing is chosen for the reader", () => {
    const digests = [d("small", 3, 3), d("full-a", 1000, 14, 100), d("full-b", 1000, 18, 111)];
    expect(suggestRun(digests, "small")?.run_id).toBe("full-b");
  });
  test("no offer when the run on screen is already a full portfolio, or when no full run exists", () => {
    expect(suggestRun([d("full", 1000, 18), d("small", 3, 3)], "full")).toBeNull();
    expect(suggestRun([d("small", 3, 3), d("tiny", 3, 3)], "small")).toBeNull();
    expect(suggestRun([d("small", 3, 3), d("empty", 1000, 0)], "small")).toBeNull(); // a full tape with nothing investigated is not a credible demo
  });
  test("a digest is read from the report's totals", () => {
    const x = digestOf(report);
    expect(x.loans).toBe(report.totals.loans);
    expect(x.reviewed).toBe(report.totals.reviewed);
    expect(x.spent).toBe(report.spend.spent);
  });
});

describe("the source ledger", () => {
  test("every printed number has a numbered entry with a meaning, a formula and source fields", () => {
    const e = ledgerEntries(report);
    for (const id of ["principal", "excluded", "held", "inbid", "adjustment", "bid", "review", "risk", "spend", "estimate"]) {
      const entry = e.find((x) => x.id === id)!;
      expect(entry).toBeDefined();
      expect(entry.meaning.length).toBeGreaterThan(10);
      expect(entry.formula.length).toBeGreaterThan(5);
      expect(entry.fields.length).toBeGreaterThan(3);
    }
    expect(e.map((x) => x.n)).toEqual(e.map((_, i) => i + 1));
  });
  test("modelled prices are marked Assumed, derived figures Derived, and the comparison an Estimate", () => {
    const by = Object.fromEntries(ledgerEntries(report).map((x) => [x.id, x.basis]));
    expect(by.bid).toBe("Assumed");
    expect(by.adjustment).toBe("Assumed");
    expect(by.inbid).toBe("Derived");
    expect(by.estimate).toBe("Estimate");
    expect(by.excluded).toBe("From the run");
  });
  test("the in-bid note's loan counts are the reconciliation's own", () => {
    const x = reconcile(report);
    expect(ledgerEntries(report).find((e) => e.id === "inbid")!.note).toContain(`${x.loans.inBid.toLocaleString("en-US")} + ${x.loans.excluded} + ${x.loans.held} = ${x.loans.all.toLocaleString("en-US")}`);
  });
});
