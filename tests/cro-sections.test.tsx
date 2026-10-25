// Ticket 10: what the CRO screen says, rendered on a real Hazel run (static markup, as the drawer tests do).
import { beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionDrawer } from "@/components/cro/decision-drawer";
import { Efficiency } from "@/components/cro/efficiency";
import { ledgerEntries, type Digest } from "@/components/cro/findings";
import { Masthead, RunOffer } from "@/components/cro/masthead";
import { PriceLedger } from "@/components/cro/price-ledger";
import { Recommendation } from "@/components/cro/recommendation";
import { RiskTable } from "@/components/cro/risk-table";
import { LoansTable } from "@/components/cro/sections";
import { SourceLedger } from "@/components/cro/source-ledger";
import { WhyRecommended } from "@/components/cro/why-recommended";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { buildReport, buybackDemands, dispositionRow, documentRequests, type DealReport } from "@/lib/deal";
import type { ReportBundle } from "@/lib/deal/service";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, report: DealReport;
const bundleOf = (r: DealReport): ReportBundle => ({ report: r, buyback_demands: buybackDemands(r), document_requests: documentRequests(r),
  run: { run_id: r.run_id, spec: "data/patterns/seed13.json", seed: 13 } });
const noop = async () => null;
const drawer = (r: DealReport, scope: { label: string; loanIds: string[] } | null = null) =>
  renderToStaticMarkup(<DecisionDrawer bundle={bundleOf(r)} open onClose={() => {}} onDecide={noop} busy={false} who="CRO" setWho={() => {}} scope={scope} clearScope={() => {}} />);
const rec = (r: DealReport) => renderToStaticMarkup(<Recommendation r={r} onReview={() => {}} boardHref="/board?run=x" />);
const price = (r: DealReport) => renderToStaticMarkup(<PriceLedger r={r} busy={false} inputs={{ lgd: "0.55", margin: "0.04" }} setInputs={() => {}} onApply={() => {}} />);

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

// Real Hazel runs on seed 13 for the deal tests and the local demo run. The model is a scripted stand-in (no API key, no network);
// the CRS answers are the real sandbox responses recorded on 2026-10-24 (tests/crs-replay.ts); everything else is the real loop.

describe("masthead and run choice", () => {
  const digests: Digest[] = [
    { run_id: "small", loans: 3, reviewed: 3, excluded: 0, held: 0, spent: 1, limit: 60, events: 20 },
    { run_id: "full", loans: 1000, reviewed: 18, excluded: 6, held: 1, spent: 60, limit: 60, events: 111 },
  ];
  test("names the run, says who has decided, and links to the other pages", () => {
    const html = renderToStaticMarkup(<Masthead r={report} runs={[{ run_id: report.run_id } as never]} digests={[]} runId={report.run_id} onRun={() => {}} boardHref="/board?run=x" />);
    for (const t of [report.run_id, "AI-proposed · awaiting human review", "Home", "Board", "Dashboard", "Recorded run"]) expect(html).toContain(t);
  });
  test("each run in the picker says how big it is", () => {
    const html = renderToStaticMarkup(<Masthead r={null} runs={[{ run_id: "small" }, { run_id: "full" }] as never} digests={digests} runId="small" onRun={() => {}} boardHref="/board" />);
    expect(html).toContain("small · 3 loans · 3 investigated");
    expect(html).toContain("full · 1,000 loans · 18 investigated");
  });
  test("a small run is offered the full one, in words, with a button; nothing is switched by rendering", () => {
    const html = renderToStaticMarkup(<RunOffer offer={digests[1]} current={digests[0]} onSwitch={() => {}} />);
    expect(html).toContain("This run covers only 3 loans");
    expect(html).toContain("Show the 1,000-loan run");
    expect(renderToStaticMarkup(<RunOffer offer={null} current={digests[0]} onSwitch={() => {}} />)).toBe("");
  });
});

describe("01 the recommendation", () => {
  test("leads with the proposed bid and its basis, then what stays out, and the one action", () => {
    const html = rec(report);
    for (const t of ["The recommendation", "Hazel proposes a bid of", "Assumed", "Excluded", "Held for a person", "Review &amp; Decide"]) expect(html).toContain(t);
    expect(html).toContain("not a market quote");
    expect(html).toContain("995");
  });
  test("footnote marks point at the source ledger", () => {
    const html = rec(report);
    expect(html).toContain('href="#src-bid"');
    expect(html).toContain('href="#src-excluded"');
  });
  test("once a person has decided, the stamp says so", () => {
    expect(rec(decided())).toMatch(/Human-confirmed|Confirmed by a person/);
  });
});

describe("02 why this recommendation", () => {
  test("findings with evidence, and what is not established", () => {
    const html = renderToStaticMarkup(<WhyRecommended r={report} />);
    for (const t of ["Why this recommendation?", "What this does not establish", "sandbox"]) expect(html).toContain(t);
    expect(html).toContain("no material anomaly found");
  });
  test("never calls a loan safe, innocent or fraudulent", () => {
    const html = renderToStaticMarkup(<WhyRecommended r={report} />);
    expect(html).not.toMatch(/\bsafe\b|innocent|fraudster|guilty|criminal/i);
  });
});

describe("03 how the price is built", () => {
  test("principal, less excluded and held, is the principal in the bid; less the assumed adjustment, the bid", () => {
    const html = price(report);
    for (const t of ["Total principal", "Excluded", "Held for a person", "Principal in the bid", "Pricing adjustment", "Proposed bid", "$29,186,301.68"]) expect(html).toContain(t);
    expect(html).toContain("−$");
  });
  test("balance under review is set apart, with the warning that it is not a further deduction", () => {
    const html = price(report);
    expect(html).toContain("Balance under review");
    expect(html).toContain("not a further deduction");
  });
  test("a report whose counts do not split prints a warning and no working", () => {
    const broken = structuredClone(report);
    broken.totals.counts.Exclude += 1;
    broken.totals.bid_loans = broken.totals.loans;
    const html = price(broken);
    expect(html).toContain("do not add up");
    expect(html).not.toContain("Pricing adjustment");
  });
  test("the assumptions can be changed, and say they are assumed", () => {
    const html = price(report);
    expect(html).toContain("Recalculate the bid");
    expect(html).toContain("loss given default");
  });
});

describe("04 where the risk sits", () => {
  test("by dealer and by ring, and the loans flagged on their own evidence are named as in no ring", () => {
    const html = renderToStaticMarkup(<RiskTable r={report} onDecide={() => {}} />);
    expect(html).toContain("SUNLINE AUTO GROUP");
    expect(html).toContain("Ring 1");
    expect(html).toContain("in no ring");
    expect(html).toContain("Decide on these loans");
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('href="#src-risk"');
  });
  test("an empty run has nothing to concentrate", () => {
    const empty = buildReport({ run_id: "none", loans: run.loans, events: [] });
    expect(renderToStaticMarkup(<RiskTable r={empty} onDecide={() => {}} />)).toContain("nothing to concentrate");
  });
});

describe("06 what the investigation cost", () => {
  test("acorns spent, where they went, and the estimate marked as an estimate", () => {
    const html = renderToStaticMarkup(<Efficiency r={report} />);
    expect(html).toContain(">15<");
    expect(html).toContain("240");
    expect(html).toContain("Estimate");
    expect(html).toContain("crs identity check");
    expect(html).toContain("not a second run");
    expect(html).toContain("no dollar cost");
  });
  test("a run with no case loans shows no comparison", () => {
    const none = structuredClone(report);
    none.spend.case_loans = 0;
    none.spend.check_everything = 0;
    expect(renderToStaticMarkup(<Efficiency r={none} />)).toContain("No comparison is shown");
  });
});

describe("09 sources and assumptions", () => {
  test("one numbered entry per figure, each with its meaning, formula, fields and audit-log rows", () => {
    const html = renderToStaticMarkup(<SourceLedger r={report} />);
    for (const e of ledgerEntries(report)) {
      expect(html).toContain(`id="src-${e.id}"`);
      expect(html).toContain(e.title);
    }
    for (const t of ["Means", "Formula", "Source fields", "Audit-log rows", "Assumed", "Derived", "Estimate", "funding_info.current_balance"]) expect(html).toContain(t);
  });
});

describe("the decision panel", () => {
  test("says what is being approved, then Exclude, Reprice and Protect each with its approval and the drafts", () => {
    const html = drawer(report);
    for (const t of ["What you are approving", report.run_id, "In the bid", "Excluded", "Held", "not market prices", "Exclude", "Reprice", "Protect", "Approve exclusion (4)…", "Approve hold (1)…", "Buyback demands", "Document requests", "Override…", "Deciding as"]) expect(html).toContain(t);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Close the decision panel");
    expect(html).toContain("AI proposal, not yet decided");
    expect(html).toContain("nothing is sent");
  });
  test("an approval needs a confirmation first: the panel opens with no confirmation or override form showing", () => {
    const html = drawer(report);
    expect(html).not.toContain("Yes, record");
    expect(html).not.toContain("Reason (required");
    expect(html).not.toContain("Record override");
  });
  test("once a person has decided, the buttons give way to a plain statement and the loans say who decided", () => {
    const html = drawer(decided());
    expect(html).toContain("All 4 loans decided by a person.");
    expect(html).toContain("All 1 loan decided by a person.");
    expect(html).not.toContain("Approve exclusion");
    expect(html).not.toContain("Approve hold");
    expect(html).toContain("Human decision: approved by CRO");
    expect(html).toContain("Human-confirmed");
  });
  test("closed, it renders nothing", () => {
    expect(renderToStaticMarkup(<DecisionDrawer bundle={bundleOf(report)} open={false} onClose={() => {}} onDecide={noop} busy={false} who="CRO" setWho={() => {}} scope={null} clearScope={() => {}} />)).toBe("");
  });
  test("opened from a ring, it shows only that ring's loans and says so", () => {
    const ring = report.concentration.rings[0];
    const html = drawer(report, { label: "Ring 1", loanIds: ring.loan_ids });
    expect(html).toContain("Showing only the loans in Ring 1");
    expect(html).toContain("Show every loan");
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
  test("a loan with no finding is 'Not flagged', never 'Clear'", () => {
    const html = renderToStaticMarkup(<LoansTable loans={report.loans} />);
    expect(html).not.toMatch(/>Clear</);
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
