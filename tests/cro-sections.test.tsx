// Ticket 10: what the CRO screen says, rendered on a real Hazel run (static markup, as the drawer tests do).
import { beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Actions } from "@/components/cro/actions";
import { Concentration, LoansTable, Spend, Totals } from "@/components/cro/sections";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { buildReport, buybackDemands, dispositionRow, documentRequests, type DealReport } from "@/lib/deal";
import type { ReportBundle } from "@/lib/deal/service";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
const bundleOf = (r: DealReport): ReportBundle => ({ report: r, buyback_demands: buybackDemands(r), document_requests: documentRequests(r),
  run: { run_id: r.run_id, spec: "data/patterns/seed13.json", seed: 13 } });
const noop = async () => null;
const actions = (r: DealReport) => renderToStaticMarkup(<Actions bundle={bundleOf(r)} busy={false} onDecide={noop} inputs={{ lgd: "0.55", margin: "0.04" }} setInputs={() => {}} onApply={() => {}} />);

/** The same run after a person approved every loan the screen proposed to exclude or hold out. */
function decided(): DealReport {
  const ids = (v: string) => report.loans.filter((l) => l.verdict === v).map((l) => l.loan_id);
  let events: Event[] = [...run.events];
  for (const verdict of ["Exclude", "Review"]) {
    const built = dispositionRow({ run_id: run.run_id, loan_ids: ids(verdict), decision: "approve", decided_by: "CRO" },
      (id) => { const l = report.loans.find((x) => x.loan_id === id); return l && { proposed: l.proposed_verdict, status_seq: l.event_seqs[0] }; }, run.events.at(-1)!.budget);
    if (!built.ok) throw new Error(built.error);
    events = [...events, EventSchema.parse({ run_id: run.run_id, seq: events.at(-1)!.seq + 1, ts: "2026-10-24T21:00:00Z", ...built.row })];
  }
  return buildReport({ run_id: run.run_id, loans: run.loans, events });
}

beforeAll(async () => {
  run = await dealRun();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
});

describe("the deal and the spend", () => {
  test("the five figures, with the price labelled assumed and the events cited", () => {
    const html = renderToStaticMarkup(<Totals r={report} />);
    for (const t of ["Total principal", "Proposed bid", "Balance under review", "Excluded", "Held out of the bid"]) expect(html).toContain(t);
    expect(html).toContain("$29,186,302");
    expect(html).toContain("assumed");
    expect(html).toContain("from events #22");
  });
  test("a card with nothing to cite says so instead of 'from no events'", () => {
    const html = renderToStaticMarkup(<Totals r={decided()} />);
    expect(html).toContain("nothing here, so nothing to cite");
    expect(html).not.toContain("from no events");
  });
  test("spend against checking everything", () => {
    const html = renderToStaticMarkup(<Spend r={report} />);
    expect(html).toContain("15 acorns");
    expect(html).toContain("240");
    expect(html).toContain("Saved <b");
    expect(html).toContain("crs_identity_check");
  });
});

describe("where the risk sits", () => {
  test("by dealer and by ring, and the loans flagged on their own evidence are named as in no ring", () => {
    const html = renderToStaticMarkup(<Concentration r={report} />);
    expect(html).toContain("SUNLINE AUTO GROUP");
    expect(html).toContain("ring-1");
    expect(html).toContain(`${run.ids.p14}, ${run.ids.fraudAlert}`.split(", ").sort().join(", "));
    expect(html).toContain("in no ring");
  });
  test("an empty run has nothing to concentrate", () => {
    const empty = buildReport({ run_id: "none", loans: run.loans, events: [] });
    expect(renderToStaticMarkup(<Concentration r={empty} />)).toContain("nothing to concentrate");
  });
});

describe("proposed actions", () => {
  test("Exclude, Reprice and Protect, each with its approval and the drafts", () => {
    const html = actions(report);
    for (const t of ["Exclude", "Reprice", "Protect", "Approve exclusion (4)", "Approve hold (1)", "Buyback demands", "Document requests", "Recalculate the bid", "Override…"]) expect(html).toContain(t);
    expect(html).toContain("1,000 of 1,000 loans have no credit score yet");
  });
  test("the override form stays closed until asked for, and nothing is sent by rendering", () => {
    const html = actions(report);
    expect(html).not.toContain("Reason (required");
    expect(html).not.toContain("Record override");
  });
  test("once a person has decided, the buttons give way to a plain statement", () => {
    const html = actions(decided());
    expect(html).toContain("All 4 loans decided by a person.");
    expect(html).toContain("All 1 loan decided by a person.");
    expect(html).not.toContain("Approve exclusion");
    expect(html).not.toContain("Approve hold");
  });
});

describe("every investigated loan", () => {
  test("verdict, status, reason and the evidence behind each row", () => {
    const html = renderToStaticMarkup(<LoansTable loans={report.loans} />);
    expect(html).toContain("Exclude + buyback");
    expect(html).toContain("TransUnion identity: 2201 + 2202");
    expect(html).toContain("fraud alert on file: needs the CRO");
    expect(html).toContain("CRS da8f3b3b");
  });
  test("a decided loan shows who decided and the override's reason", () => {
    const events = [...run.events];
    const built = dispositionRow({ run_id: run.run_id, loan_ids: [run.ids.fraudAlert], decision: "override", final_verdict: "Clear", reason: "CRO confirmed the alert was lifted.", decided_by: "CRO" },
      (id) => { const l = report.loans.find((x) => x.loan_id === id); return l && { proposed: l.proposed_verdict, status_seq: l.event_seqs[0] }; }, run.events.at(-1)!.budget);
    if (!built.ok) throw new Error(built.error);
    events.push(EventSchema.parse({ run_id: run.run_id, seq: events.at(-1)!.seq + 1, ts: "2026-10-24T21:00:00Z", ...built.row }));
    const html = renderToStaticMarkup(<LoansTable loans={buildReport({ run_id: run.run_id, loans: run.loans, events }).loans} />);
    expect(html).toContain("Human-confirmed disposition");
    expect(html).toContain("overridden by CRO");
    expect(html).toContain("CRO confirmed the alert was lifted.");
  });
  test("a run that closed nothing says so", () => {
    expect(renderToStaticMarkup(<LoansTable loans={[]} />)).toContain("has not closed any loan yet");
  });
});
