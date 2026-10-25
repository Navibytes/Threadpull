// Ticket 14: "why loan X?" answered from the run's own events, each step with its event number; a refusal when the run has none.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReport } from "@/lib/deal";
import { whyFor } from "@/lib/deal/service";
import { whyLoan } from "@/lib/deal/why";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { dealRunWithCredit, type DealRun } from "./deal-run";

let run: DealRun;
const report = (events: readonly Event[]) => buildReport({ run_id: run.run_id, loans: run.loans, events });

beforeAll(async () => { run = await dealRunWithCredit(); });

describe("the answer", () => {
  test("a closed loan: its verdict, the status the run gave it and why, with the status row's event number", () => {
    const out = whyLoan(report(run.events), run.events, run.ids.lead);
    if (!out.ok) throw new Error(out.error);
    const row = report(run.events).loans.find((l) => l.loan_id === run.ids.lead)!;
    expect(out.why).toMatchObject({ loan_id: run.ids.lead, verdict: "Exclude", proposed_verdict: "Exclude", hazel_status: "Investigate", reason: row.reason });
    expect(out.why.answer).toContain(`${run.ids.lead} is proposed Exclude because the run closed it as "Investigate"`);
    expect(out.why.answer).toContain(`(event #${row.event_seqs[0]})`);
  });
  test("every step is a real event row for the loan, in order, and nothing else is listed", () => {
    const out = whyLoan(report(run.events), run.events, run.ids.lead);
    if (!out.ok) throw new Error(out.error);
    const expected = run.events.filter((e) => e.loan_ids.includes(run.ids.lead)).map((e) => e.seq);
    expect(out.why.steps.map((s) => s.seq)).toEqual(expected);
    expect(out.why.event_seqs).toEqual(expected);
    expect(expected).toEqual([...expected].sort((a, b) => a - b));
    expect(out.why.steps.some((s) => s.type === "status_changed")).toBe(true);
    expect(out.why.steps.some((s) => s.type === "check_run" && s.tool === "crs_identity_check")).toBe(true);
  });
  test("a person's decision is part of the answer, with the reason they gave", () => {
    const last = run.events.at(-1)!;
    const decision = EventSchema.parse({ run_id: run.run_id, seq: last.seq + 1, ts: "2026-10-25T01:00:00Z", type: "disposition_recorded", loan_ids: [run.ids.lead], tool: null,
      result: { decision: "override", decided_by: "Ana", reason: "Documents arrived and match", items: [{ loan_id: run.ids.lead, proposed_verdict: "Exclude", final_verdict: "Review" }] },
      sources: [], note: "Overridden by Ana.", budget: last.budget, simulated: false });
    const events = [...run.events, decision];
    const out = whyLoan(report(events), events, run.ids.lead);
    if (!out.ok) throw new Error(out.error);
    expect(out.why).toMatchObject({ verdict: "Review", proposed_verdict: "Exclude" });
    expect(out.why.answer).toContain(`Ana overrode it as Review (event #${decision.seq}): Documents arrived and match.`);
    expect(out.why.event_seqs.at(-1)).toBe(decision.seq);
  });
  test("a loan the run opened but never closed has no verdict, and the answer says so", () => {
    const events = run.events.filter((e) => !(e.type === "status_changed" && e.loan_ids[0] === run.ids.lead));
    const out = whyLoan(report(events), events, run.ids.lead);
    if (!out.ok) throw new Error(out.error);
    expect(out.why).toMatchObject({ verdict: null, proposed_verdict: null, hazel_status: null });
    expect(out.why.answer).toContain("did not close it");
    expect(out.why.steps.length).toBeGreaterThan(0);
  });
  test("a note that breaks the wording rules is withheld, not repeated", () => {
    const events = run.events.map((e) => (e.type === "check_run" && e.loan_ids.includes(run.ids.lead) ? { ...e, note: "This borrower is a fraudster." } : e));
    const out = whyLoan(report(events), events, run.ids.lead);
    if (!out.ok) throw new Error(out.error);
    expect(JSON.stringify(out.why)).not.toContain("fraudster");
    expect(out.why.steps.some((s) => s.note.startsWith("(note withheld"))).toBe(true);
  });
});

describe("the refusal", () => {
  const untouched = () => run.loans.find((l) => !run.events.some((e) => e.loan_ids.includes(l.loan_id)))!.loan_id;

  test("no event for the loan means no answer", () => {
    const id = untouched();
    const out = whyLoan(report(run.events), run.events, id);
    expect(out).toEqual({ ok: false, status: 404, error: `the run has no event for ${id}, so there is nothing to explain` });
  });
});

describe("through the service", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tp-why-"));
    mkdirSync(join(root, run.run_id));
    writeFileSync(join(root, run.run_id, "events.jsonl"), run.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const deps = () => ({ root, loans: run.loans });

  test("answers for an investigated loan", async () => {
    const out = await whyFor(run.run_id, run.ids.p12, deps());
    expect(out.ok && out.why.loan_id).toBe(run.ids.p12);
  });
  test("refuses a loan the run never touched, an unknown run and a malformed loan id", async () => {
    const id = run.loans.find((l) => !run.events.some((e) => e.loan_ids.includes(l.loan_id)))!.loan_id;
    expect(await whyFor(run.run_id, id, deps())).toMatchObject({ ok: false, status: 404 });
    expect(await whyFor("no-such-run", run.ids.lead, deps())).toMatchObject({ ok: false, status: 404 });
    for (const bad of ["37", "L37", "../x", "L0037 "]) expect(await whyFor(run.run_id, bad, deps())).toMatchObject({ ok: false, status: 400 });
  });
});
