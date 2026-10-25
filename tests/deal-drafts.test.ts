// Ticket 10: the drafted outputs. Templates in code, wording that states findings and never a conclusion about a person.
import { beforeAll, describe, expect, test } from "bun:test";
import { buildReport, buybackDemands, documentRequests, type DealReport } from "@/lib/deal";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
beforeAll(async () => {
  run = await dealRun();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
});

describe("buyback demands", () => {
  test("one per dealer, covering exactly the excluded loans, largest first", () => {
    const demands = buybackDemands(report);
    const excluded = report.loans.filter((l) => l.verdict === "Exclude");
    expect(demands.flatMap((d) => d.loans.map((l) => l.loan_id)).sort()).toEqual(excluded.map((l) => l.loan_id).sort());
    expect(new Set(demands.map((d) => d.dealer_id)).size).toBe(demands.length);
    expect(demands.map((d) => d.total_balance)).toEqual([...demands.map((d) => d.total_balance)].sort((a, b) => b - a));
  });
  test("each loan lists its balance, its basis and the audit-log events and CRS RequestID behind it", () => {
    const [demand] = buybackDemands(report);
    for (const l of demand.loans) {
      const row = report.loans.find((r) => r.loan_id === l.loan_id)!;
      expect(l).toMatchObject({ balance: row.balance, basis: row.reason, event_seqs: row.event_seqs, request_ids: row.request_ids });
      expect(demand.text).toContain(l.loan_id);
      expect(demand.text).toContain(`audit log events ${l.event_seqs.map((s) => `#${s}`).join(", ")}`);
      for (const id of l.request_ids) expect(demand.text).toContain(id);
    }
    expect(demand.total_balance).toBe(Math.round(demand.loans.reduce((s, l) => s + l.balance, 0) * 100) / 100);
  });
  test("it is a draft for review, addressed to the dealer, citing the run", () => {
    const [demand] = buybackDemands(report);
    expect(demand.text.split("\n")[0]).toBe("DRAFT for review by the CRO and legal. Not sent.");
    expect(demand.text).toContain(`To: ${demand.dealer_name} (dealer ${demand.dealer_id})`);
    expect(demand.text).toContain(`Run ${run.run_id}`);
  });
  test("nothing is drafted when nothing is excluded", () => {
    expect(buybackDemands(buildReport({ run_id: "none", loans: run.loans, events: [] }))).toEqual([]);
  });
});

describe("document requests", () => {
  test("one per held-out (Review) loan, and only those", () => {
    const requests = documentRequests(report);
    expect(requests.map((r) => r.loan_id)).toEqual([run.ids.fraudAlert]);
  });
  test("the request states the open point, lists documents, and names the extra one for a fraud alert", () => {
    const [r] = documentRequests(report);
    expect(r.reason).toContain("fraud alert on file");
    expect(r.documents).toContain("Signed credit application");
    expect(r.documents.some((d) => d.includes("fraud alert"))).toBe(true);
    expect(r.text).toContain("stays out of our bid");
    expect(r.text).toContain(`audit log events ${r.event_seqs.map((s) => `#${s}`).join(", ")}`);
    expect(r.text.split("\n")[0]).toContain("DRAFT");
  });
});

describe("wording rules (SKELETON: never claim)", () => {
  test("no draft calls anyone a fraudster or innocent, or treats a score as a probability", () => {
    const all = [...buybackDemands(report).map((d) => d.text), ...documentRequests(report).map((d) => d.text)].join("\n");
    expect(all).not.toMatch(/fraudster|innocent|guilty|criminal|probability|proven/i);
    expect(all).toContain("findings for review, not conclusions about any borrower");
  });
});
