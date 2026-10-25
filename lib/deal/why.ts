// "Why loan X?" (ticket 14, SKELETON section 10): an answer built by code from the run's own event rows, every line with the
// event number it comes from. No model writes it, so it cannot add a fact the log does not hold. It refuses when the run has no
// event for the loan. Notes Hazel wrote are repeated as recorded, except any that break the wording rules.
import type { Event } from "@/lib/contracts/event";
import type { LoanStatus } from "@/lib/contracts/loan";
import type { DealReport } from "./report";
import type { Verdict } from "./verdicts";
import { breaksWording } from "./wording";

export type WhyStep = { seq: number; type: string; tool: string | null; note: string };
export type Why = {
  loan_id: string;
  verdict: Verdict | null; // null when the run opened the loan but never closed it
  proposed_verdict: Verdict | null;
  hazel_status: LoanStatus | null;
  reason: string | null;
  answer: string;
  steps: WhyStep[];
  event_seqs: number[];
};

export function whyLoan(report: DealReport, events: readonly Event[], loanId: string): { ok: true; why: Why } | { ok: false; status: 404; error: string } {
  const mine = events.filter((e) => e.loan_ids.includes(loanId)).sort((a, b) => a.seq - b.seq);
  if (!mine.length) return { ok: false, status: 404, error: `the run has no event for ${loanId}, so there is nothing to explain` };

  const steps = mine.map((e) => ({ seq: e.seq, type: e.type, tool: e.tool, note: breaksWording(e.note) ? "(note withheld: it breaks the wording rules)" : e.note }));
  const row = report.loans.find((l) => l.loan_id === loanId);
  const event_seqs = steps.map((s) => s.seq);
  if (!row)
    return { ok: true, why: { loan_id: loanId, verdict: null, proposed_verdict: null, hazel_status: null, reason: null, steps, event_seqs,
      answer: `The run looked at ${loanId} but did not close it, so there is no verdict. Every event recorded for it is listed.` } };

  // the name and reason a person typed are repeated as typed, unless they break the wording rules
  const typed = (text: string) => (breaksWording(text) ? "(withheld: it breaks the wording rules)" : text);
  const decided = row.confirmed
    ? ` ${typed(row.confirmed.decided_by)} ${row.confirmed.decision === "approve" ? "approved" : "overrode"} it as ${row.verdict} (event #${row.confirmed.seq})${row.confirmed.reason ? `: ${typed(row.confirmed.reason)}` : ""}.`
    : "";
  const answer = `${loanId} is proposed ${row.proposed_verdict} because the run closed it as "${row.hazel_status}"${row.reason ? `: ${row.reason}` : ""} (event #${row.event_seqs[0]}).${decided}`;
  return { ok: true, why: { loan_id: loanId, verdict: row.verdict, proposed_verdict: row.proposed_verdict, hazel_status: row.hazel_status, reason: row.reason, answer, steps, event_seqs } };
}
