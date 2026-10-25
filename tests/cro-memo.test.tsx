// Ticket 14: what the CRO screen says about the memo and the "why" answer (static markup, as the other CRO screen tests do).
import { beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoView } from "@/components/cro/memo";
import { LoansTable } from "@/components/cro/sections";
import { WhyView } from "@/components/cro/why";
import { buildReport, type DealReport } from "@/lib/deal";
import type { Memo } from "@/lib/deal/memo";
import type { Why } from "@/lib/deal/why";
import { dealRun } from "./deal-run";

const memo: Memo = {
  run_id: "r13-sample", based_on_seq: 41, written_at: "2026-10-25T08:05:09.000Z", model: "claude-sonnet-5-5", assumptions: { lgd: 0.55, margin: 0.04 },
  sentences: [
    { section: "money", text: "The run spent 39 acorns of the 60 available.", event_seqs: [3, 7] },
    { section: "decision", text: "Exclude the four loans in ring-1.", event_seqs: [22] },
    { section: "findings", text: "L0037 shares a phone with L0190.", event_seqs: [4] },
  ],
  dropped: [{ text: "Everything here is certain.", reason: "no event reference" }],
  basis: { text: "Scripted stand-in for Claude.", event_seqs: [1, 41] },
};
const view = (over: Partial<Memo> = {}, stale = false) => renderToStaticMarkup(<MemoView stored={{ memo: { ...memo, ...over }, stale }} />);

describe("the memo", () => {
  test("sections come in a fixed order, whatever order the sentences arrived in", () => {
    const html = view();
    const at = (t: string) => html.indexOf(t);
    expect(at("Decision")).toBeGreaterThan(-1);
    expect(at("Decision")).toBeLessThan(at("What the run found"));
    expect(at("What the run found")).toBeLessThan(at("Money"));
    expect(html).not.toContain("What is not verified"); // no sentence in that section, so no heading
  });
  test("every sentence shows the events behind it", () => {
    const html = view();
    expect(html).toContain("The run spent 39 acorns of the 60 available.");
    expect(html).toContain("(events #3, #7)");
    expect(html).toContain("(event #22)");
    expect(html).toContain("(event #4)");
  });
  test("who wrote it, from which events, under which assumptions", () => {
    const html = view();
    for (const t of ["claude-sonnet-5-5", "2026-10-25 08:05 UTC", "events up to #41", "loss given default 55.0% and margin 4.0%"]) expect(html).toContain(t);
  });
  test("the run's basis is stated when it is a sample", () => {
    expect(view()).toContain("Basis of this run:");
    expect(view()).toContain("Scripted stand-in for Claude.");
    expect(view({ basis: null })).not.toContain("Basis of this run:");
  });
  test("a stale memo says the run has moved on", () => {
    expect(view({}, true)).toContain("new events since this memo was written");
    expect(view({}, false)).not.toContain("new events since this memo was written");
  });
  test("what code left out is listed with the reason", () => {
    const html = view();
    expect(html).toContain("1 sentence left out because code could not check it");
    expect(html).toContain("no event reference");
    expect(html).toContain("Everything here is certain.");
    expect(view({ dropped: [] })).not.toContain("left out");
  });
  test("a memo where nothing passed the checks says so, and is not an empty page", () => {
    const html = view({ sentences: [] });
    expect(html).toContain("No sentence passed the checks");
    expect(html).toContain("1 sentence left out");
  });
  test("it is a recommendation, not a decision", () => {
    expect(view()).toContain("not a decision and not an action against any borrower");
  });
});

describe("why this verdict", () => {
  const why: Why = {
    loan_id: "L0037", verdict: "Exclude", proposed_verdict: "Exclude", hazel_status: "Investigate", reason: "a bureau reports an identity mismatch",
    answer: 'L0037 is proposed Exclude because the run closed it as "Investigate": a bureau reports an identity mismatch (event #22).',
    steps: [{ seq: 4, type: "check_run", tool: "crs_identity_check", note: "Identity check on L0037." }, { seq: 22, type: "status_changed", tool: "close_lead", note: "Investigate." }],
    event_seqs: [4, 22],
  };
  test("the answer, then one line per event with its number", () => {
    const html = renderToStaticMarkup(<WhyView why={why} />);
    expect(html).toContain("(event #22).");
    const items = html.split("<li").slice(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("#4");
    expect(items[0]).toContain("crs_identity_check");
    expect(items[0]).toContain("Identity check on L0037.");
    expect(items[1]).toContain("#22");
  });

  describe("on the loans table", () => {
    let report: DealReport;
    beforeAll(async () => {
      const run = await dealRun();
      report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
    });
    test("every loan number is a button when the table knows its run, and none is when it does not", () => {
      const withRun = renderToStaticMarkup(<LoansTable loans={report.loans} runId="r13-sample" />);
      expect(withRun.split("aria-expanded=\"false\"").length - 1).toBe(report.loans.length); // one trace button per loan, each named by its loan id
      for (const l of report.loans) expect(withRun).toMatch(new RegExp(`<button[^>]*>${l.loan_id}</button>`));
      expect(withRun).toContain("trace its verdict");
      expect(withRun).not.toContain("Reading the events"); // closed until someone asks
      const without = renderToStaticMarkup(<LoansTable loans={report.loans} />);
      expect(without).not.toContain("aria-expanded");
      expect(without).not.toContain("trace its verdict");
    });
  });
});
