// Portfolio Intelligence figures: each has a stated definition, counts each thing once, and is null/empty when
// the data isn't there.
import { describe, expect, test } from "bun:test";
import { LOAN_STATUSES } from "@/lib/contracts/loan";
import { createPreviewLoans } from "@/components/drawer/preview-loan-source";
import { computeDashboard, runMetrics, statusBreakdown } from "@/lib/dashboard/metrics";
import { describeEvent } from "@/lib/dashboard/describe";
import { PREVIEW_EVENTS, type RunEvent } from "@/lib/events";

const loans = createPreviewLoans();
const ev = (seq: number, type: RunEvent["type"], extra: Partial<RunEvent> = {}): RunEvent => ({
  run_id: "r1",
  seq,
  ts: `2026-10-24T12:00:${String(seq).padStart(2, "0")}Z`,
  type,
  loan_ids: [],
  tool: null,
  result: {},
  sources: [],
  note: "",
  budget: { spent: seq, limit: 60 },
  simulated: false,
  ...extra,
});

const run: RunEvent[] = [
  ev(1, "run_started"),
  ev(2, "lead_opened", { loan_ids: ["L0001"] }),
  ev(3, "link_found", { loan_ids: ["L0001", "L0002"], result: { edge_id: "e1", kind: "phone", weight: 0.4 }, sources: [{ kind: "row", loan_id: "L0001", field: "applicant_info.phone" }] }),
  ev(4, "link_found", { loan_ids: ["L0001", "L0003"], result: { edge_id: "e2", kind: "address", weight: 0.2 } }),
  ev(5, "check_run", { loan_ids: ["L0001"], tool: "crs_identity_check", sources: [{ kind: "crs", product: "tu_identity_verification", request_id: "req-1" }] }),
  ev(6, "check_run", { loan_ids: ["L0002"], tool: "check_address" }),
  ev(7, "clue_explained", {
    loan_ids: ["L0001", "L0003"],
    result: { edge_ids: ["e2"], explained_by: "check_address", reason: "an apartment building" },
    sources: [{ kind: "event", run_id: "r1", seq: 6 }],
  }),
  ev(8, "status_changed", { loan_ids: ["L0001"], result: { status: "Investigate", reason: "x" } }),
  ev(9, "disposition_recorded", { loan_ids: ["L0001"] }),
  ev(10, "run_finished", { budget: { spent: 4, limit: 60 } }),
];

describe("run figures", () => {
  const m = runMetrics(run)!;

  test("each figure follows its definition", () => {
    expect(m.casesInvestigated).toBe(1);
    expect(m.checks).toBe(2);
    expect(m.crsChecks).toBe(1);
    expect(m.linksFound).toBe(2);
    expect(m.linksExplained).toBe(1);
    expect(m.dispositions).toBe(1);
    expect(m.crsRequestIds).toBe(1);
    expect(m.sourceRefs).toEqual({ row: 1, crs: 1, event: 1 });
    expect(m.budget).toEqual({ spent: 4, limit: 60 }); // the last row's budget, not a sum
  });

  test("a row delivered twice, or a thread explained twice, counts once", () => {
    const again = runMetrics([...run, run[4], run[1]])!;
    expect(again.rows).toBe(10);
    expect(again.checks).toBe(2);
    expect(again.casesInvestigated).toBe(1);
    const twice = runMetrics([...run.slice(0, 7), ev(11, "clue_explained", { loan_ids: ["L0001", "L0003"], result: { edge_ids: ["e2"], explained_by: "check_address", reason: "again" }, sources: [{ kind: "event", run_id: "r1", seq: 6 }] })])!;
    expect(twice.linksExplained).toBe(1);
  });

  test("an explanation that doesn't cite its proof takes nothing down", () => {
    const uncited = run.map((e) => (e.type === "clue_explained" ? { ...e, sources: [] } : e));
    expect(runMetrics(uncited)!.linksExplained).toBe(0);
  });

  test("recent rows are newest first and capped", () => {
    expect(m.recent.map((e) => e.seq).slice(0, 3)).toEqual([10, 9, 8]);
    expect(runMetrics(run, 4)!.recent).toHaveLength(4);
  });

  test("no rows means no run, not a run of zeros", () => {
    expect(runMetrics([])).toBeNull();
    expect(computeDashboard(null, null)).toEqual({ loansLoaded: null, statuses: null, run: null });
  });

  test("the sample fixture is simulated end to end", () => {
    const s = runMetrics(PREVIEW_EVENTS)!;
    expect(s.simulatedRows).toBe(s.rows);
  });
});

describe("status breakdown", () => {
  test("every loan is counted once, and the buckets add up to the portfolio", () => {
    const b = statusBreakdown(loans, []);
    expect(b.total).toBe(loans.length);
    expect(LOAN_STATUSES.reduce((n, s) => n + b.counts[s], 0)).toBe(loans.length);
    expect(b.fromRun).toBe(0);
  });

  test("a status set in the run replaces the loan file's, once per loan", () => {
    const before = statusBreakdown(loans, []);
    const withRun = statusBreakdown(loans, [
      ev(1, "status_changed", { loan_ids: ["L0001"], result: { status: "Investigate" } }),
      ev(2, "status_changed", { loan_ids: ["L0001"], result: { status: "Insufficient evidence" } }),
      ev(3, "status_changed", { loan_ids: ["L9999"], result: { status: "Investigate" } }),
      ev(4, "status_changed", { loan_ids: ["L0002"], result: { status: "Looks fine" } }),
    ]);
    expect(withRun.total).toBe(loans.length);
    expect(LOAN_STATUSES.reduce((n, s) => n + withRun.counts[s], 0)).toBe(loans.length);
    expect(withRun.fromRun).toBe(1);
    expect(withRun.counts["Insufficient evidence"]).toBe(before.counts["Insufficient evidence"] + (loans[0].status === "Insufficient evidence" ? 0 : 1));
    expect(withRun.outsidePortfolio).toBe(1);
    expect(withRun.ignoredRows).toBe(1);
  });
});

describe("audit sentences", () => {
  test("reword the row's own fields and say little when the row says little", () => {
    expect(describeEvent(run[2]).title).toBe("Shared phone number: Loan L0001 and Loan L0002");
    expect(describeEvent(run[6])).toEqual({ title: "Explained a connection", detail: "an apartment building" });
    expect(describeEvent(run[7]).title).toBe("Loan L0001 set to Investigate");
    expect(describeEvent(ev(1, "recovery")).detail).toBeNull();
  });
});
