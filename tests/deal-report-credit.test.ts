// Ticket 10: a real Hazel run that also pulled credit reports. The run's own check_run rows carry each loan's lowest bureau
// score, so the report prices and reprices from what the run recorded, with nothing typed in.
import { beforeAll, describe, expect, test } from "bun:test";
import { buildReport, buybackDemands, cents, documentRequests, type DealReport } from "@/lib/deal";
import { creditEventFacts, crsCreditReport } from "@/lib/crs";
import { Ledger } from "@/lib/ledger";
import { client, loanOf } from "./crs-replay";
import { dealRunWithCredit, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
const row = (id: string) => report.loans.find((l) => l.loan_id === id)!;
const loan = (id: string) => run.loans.find((l) => l.loan_id === id)!;
const balance = (id: string) => loan(id).funding_info.current_balance;
const creditRow = (id: string) => run.events.find((e) => e.type === "check_run" && e.tool === "crs_credit_report" && e.loan_ids[0] === id)!;

beforeAll(async () => {
  run = await dealRunWithCredit();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
});

describe("the score a credit report adds to the event log", () => {
  test("the lowest bureau score, and each bureau's, with no score for a bureau that returned no file", async () => {
    const out = await crsCreditReport(loanOf("P17"), new Ledger(), client());
    expect(creditEventFacts(out.result!)).toEqual({ score: 700, scores: { transunion: 760, equifax: null, experian: 700 } });
    const frozen = await crsCreditReport(loanOf("P15"), new Ledger(), client());
    expect(creditEventFacts(frozen.result!)).toEqual({ score: 740, scores: { transunion: null, equifax: 740, experian: 740 } });
  });
  test("a loan no bureau scored has no score", async () => {
    const out = await crsCreditReport(loanOf("P12"), new Ledger(), client()); // no file at any bureau
    expect(creditEventFacts(out.result!)).toEqual({ score: null, scores: { transunion: null, equifax: null, experian: null } });
  });
  test("Hazel's check_run row for a credit report carries it", () => {
    expect(creditRow(run.ids.clean).result).toMatchObject({ ok: true, score: 790 });
    expect(creditRow(run.ids.p03).result).toMatchObject({ ok: true, score: 660 });
    expect(creditRow(run.ids.p17).result).toMatchObject({ ok: true, score: 700, scores: { equifax: null } });
  });
});

describe("verdicts and prices from the run's own scores", () => {
  test("a thin file scored 660 is Reprice, at the 5% tier: balance x (1 - 5% x 55%) x (1 - 4%)", () => {
    expect(row(run.ids.p03)).toMatchObject({ verdict: "Reprice", hazel_status: "No material anomaly found", score: 660 });
    expect(row(run.ids.p03).price).toBe(cents(balance(run.ids.p03) * (1 - 0.05 * 0.55) * 0.96));
  });
  test("a clean borrower scored 790 is Clear, priced at the 2% tier", () => {
    expect(row(run.ids.clean)).toMatchObject({ verdict: "Clear", score: 790 });
    expect(row(run.ids.clean).price).toBe(cents(balance(run.ids.clean) * (1 - 0.02 * 0.55) * 0.96));
  });
  test("a frozen bureau and bureaus that disagree are Insufficient evidence, held out as Review", () => {
    for (const id of [run.ids.p15, run.ids.p17]) {
      expect(row(id)).toMatchObject({ hazel_status: "Insufficient evidence", verdict: "Review", price: null });
    }
    expect(row(run.ids.p15).reason).toContain("incomplete credit picture");
    expect(row(run.ids.p17).reason).toContain("the bureaus disagree");
  });
  test("all four verdicts appear, with the counts adding up to every loan", () => {
    expect(report.totals.counts).toEqual({ Exclude: 4, Review: 3, Reprice: 1, Clear: 992 });
    expect(Object.values(report.totals.counts).reduce((s, n) => s + n, 0)).toBe(1000);
  });
  test("only the four scored loans count as scored", () => {
    expect(report.totals.unscored).toBe(1000 - 4); // P01, P03, P15 and P17 have a score; P12 and P14 have none
  });
  test("an analyst's score for a loan wins over the run's", () => {
    const typed = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events, scores: new Map([[run.ids.p03, 800]]) });
    expect(typed.loans.find((l) => l.loan_id === run.ids.p03)).toMatchObject({ verdict: "Clear", score: 800 });
  });
});

describe("the drafts and the spend follow", () => {
  test("a document request for every held-out loan: the fraud alert and the two credit-picture loans", () => {
    expect(documentRequests(report).map((d) => d.loan_id).sort()).toEqual([run.ids.fraudAlert, run.ids.p15, run.ids.p17].sort());
  });
  test("buyback demands still cover only the excluded ring", () => {
    expect(buybackDemands(report).flatMap((d) => d.loans.map((l) => l.loan_id)).sort()).toEqual([run.ids.lead, run.ids.p12, run.ids.p14, run.ids.background].sort());
  });
  test("spend by tool: five identity checks and four credit reports, from the budget rows", () => {
    expect(report.spend.by_tool).toEqual([{ tool: "crs_credit_report", acorns: 24, calls: 4 }, { tool: "crs_identity_check", acorns: 15, calls: 5 }]);
    expect(report.spend.spent).toBe(39);
  });
});
