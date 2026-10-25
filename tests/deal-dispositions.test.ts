// Ticket 10: Approve and Override. An override needs a reason; each decision is a disposition_recorded row in the event log
// and sets the loan to Human-confirmed disposition.
import { beforeAll, describe, expect, test } from "bun:test";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { buildReport, confirmedByLoan, DispositionInputSchema, dispositionRow, type DealReport, type DispositionInput } from "@/lib/deal";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
beforeAll(async () => {
  run = await dealRun();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
});

const proposalOf = (r: DealReport) => (id: string) => {
  const l = r.loans.find((x) => x.loan_id === id);
  return l && { proposed: l.proposed_verdict, status_seq: l.event_seqs[0] };
};
const budget = () => run.events.at(-1)!.budget;
/** Append a disposition the way the API route will: stamp run_id, seq and ts, validate against the event contract. */
function record(input: DispositionInput, events: readonly Event[] = run.events): Event[] {
  const built = dispositionRow(input, proposalOf(buildReport({ run_id: run.run_id, loans: run.loans, events })), budget());
  if (!built.ok) throw new Error(built.error);
  return [...events, EventSchema.parse({ run_id: run.run_id, seq: events.at(-1)!.seq + 1, ts: "2026-10-24T21:00:00Z", ...built.row })];
}
const base = (over: Partial<DispositionInput>): DispositionInput => ({ run_id: "r13-sample", loan_ids: ["L0037"], decision: "approve", decided_by: "CRO", ...over });

describe("the input", () => {
  test("an approval needs nothing more", () => {
    expect(DispositionInputSchema.safeParse(base({})).success).toBe(true);
  });
  test("an override needs a verdict and a reason of at least 10 characters", () => {
    expect(DispositionInputSchema.safeParse(base({ decision: "override" })).success).toBe(false);
    expect(DispositionInputSchema.safeParse(base({ decision: "override", final_verdict: "Clear" })).success).toBe(false);
    expect(DispositionInputSchema.safeParse(base({ decision: "override", final_verdict: "Clear", reason: "too short" })).success).toBe(false);
    expect(DispositionInputSchema.safeParse(base({ decision: "override", final_verdict: "Clear", reason: "Dealer sent the original file." })).success).toBe(true);
  });
  test("loan ids must look like loan ids, and someone must be named as the decider", () => {
    expect(DispositionInputSchema.safeParse(base({ loan_ids: ["37"] })).success).toBe(false);
    expect(DispositionInputSchema.safeParse(base({ loan_ids: [] })).success).toBe(false);
    expect(DispositionInputSchema.safeParse(base({ decided_by: "  " })).success).toBe(false);
  });
});

describe("recording a decision", () => {
  test("an approval keeps the proposal, and the row fits the event contract and cites the status row", () => {
    const built = dispositionRow(base({ loan_ids: [run.ids.lead, run.ids.p12] }), proposalOf(report), budget());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.row.type).toBe("disposition_recorded");
    expect(built.row.result).toMatchObject({ decision: "approve", decided_by: "CRO", items: [{ loan_id: run.ids.lead, proposed_verdict: "Exclude", final_verdict: "Exclude" }, { loan_id: run.ids.p12, final_verdict: "Exclude" }] });
    expect(built.row.sources).toEqual([
      { kind: "event", run_id: "r13-sample", seq: report.loans.find((l) => l.loan_id === run.ids.lead)!.event_seqs[0] },
      { kind: "event", run_id: "r13-sample", seq: report.loans.find((l) => l.loan_id === run.ids.p12)!.event_seqs[0] },
    ]);
    expect(EventSchema.safeParse({ run_id: "r13-sample", seq: 99, ts: "2026-10-24T21:00:00Z", ...built.row }).success).toBe(true);
  });
  test("an override records the new verdict and the reason", () => {
    const events = record(base({ loan_ids: [run.ids.fraudAlert], decision: "override", final_verdict: "Clear", reason: "CRO confirmed the alert was lifted." }));
    const done = confirmedByLoan(events).get(run.ids.fraudAlert)!;
    expect(done).toMatchObject({ decision: "override", proposed_verdict: "Review", final_verdict: "Clear", reason: "CRO confirmed the alert was lifted.", decided_by: "CRO" });
  });
  test("a loan the run never investigated cannot be approved", () => {
    const built = dispositionRow(base({ loan_ids: ["L0001"] }), proposalOf(report), budget());
    expect(built).toEqual({ ok: false, error: expect.stringContaining("L0001 has no investigation") });
  });
  test("overriding to the verdict already proposed is refused: approve instead", () => {
    const built = dispositionRow(base({ loan_ids: [run.ids.lead], decision: "override", final_verdict: "Exclude", reason: "Same as proposed here." }), proposalOf(report), budget());
    expect(built.ok).toBe(false);
  });
});

describe("what a decision does to the report", () => {
  test("an approved loan becomes Human-confirmed disposition, keeps its verdict, and leaves 'under review'", () => {
    const after = buildReport({ run_id: run.run_id, loans: run.loans, events: record(base({ loan_ids: [run.ids.lead] })) });
    const lead = after.loans.find((l) => l.loan_id === run.ids.lead)!;
    expect([lead.status, lead.hazel_status, lead.verdict]).toEqual(["Human-confirmed disposition", "Investigate", "Exclude"]);
    expect(lead.event_seqs).toHaveLength(2);
    expect(after.totals.balance_under_review).toBe(Math.round((report.totals.balance_under_review - run.loans.find((l) => l.loan_id === run.ids.lead)!.funding_info.current_balance) * 100) / 100);
    expect(after.totals.excluded_balance).toBe(report.totals.excluded_balance); // still excluded
  });
  test("overriding a held-out loan to Clear puts it back in the bid at base price", () => {
    const events = record(base({ loan_ids: [run.ids.fraudAlert], decision: "override", final_verdict: "Clear", reason: "CRO confirmed the alert was lifted." }));
    const after = buildReport({ run_id: run.run_id, loans: run.loans, events });
    const l = after.loans.find((x) => x.loan_id === run.ids.fraudAlert)!;
    expect([l.verdict, l.status]).toEqual(["Clear", "Human-confirmed disposition"]);
    expect(l.price).toBe(Math.round(run.loans.find((x) => x.loan_id === run.ids.fraudAlert)!.funding_info.current_balance * 0.96 * 100) / 100);
    expect(after.totals.held_out_balance).toBe(0);
    expect(after.totals.proposed_price).toBeGreaterThan(report.totals.proposed_price);
  });
  test("the latest decision for a loan wins", () => {
    const first = record(base({ loan_ids: [run.ids.fraudAlert], decision: "override", final_verdict: "Clear", reason: "First thought: the alert was lifted." }));
    const second = record(base({ loan_ids: [run.ids.fraudAlert], decision: "override", final_verdict: "Exclude", reason: "Second thought: it was not lifted." }), first);
    expect(confirmedByLoan(second).get(run.ids.fraudAlert)!.final_verdict).toBe("Exclude");
  });
  test("a malformed disposition row is skipped, never guessed at", () => {
    const bad: Event = { ...run.events.at(-1)!, type: "disposition_recorded", seq: 500, result: { decision: "approve" } };
    expect(confirmedByLoan([bad]).size).toBe(0);
  });
});
