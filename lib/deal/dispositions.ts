// Dispositions (ticket 10): the CRO approves a proposed verdict or overrides it. An override needs a reason. Each decision is
// a `disposition_recorded` row in the run's event log, so the log stays the one record every number can be traced to.
import { z } from "zod";
import type { Budget, Event } from "@/lib/contracts/event";
import type { EventRow } from "@/lib/event-rows";
import { VerdictSchema, type Verdict } from "./verdicts";

export const DispositionInputSchema = z
  .object({
    run_id: z.string().min(1),
    loan_ids: z.array(z.string().regex(/^L\d{4}$/)).min(1).max(200),
    decision: z.enum(["approve", "override"]),
    final_verdict: VerdictSchema.optional(), // overrides only: what the CRO wants instead
    reason: z.string().trim().optional(),
    decided_by: z.string().trim().min(1).max(80),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "override") return;
    if (!v.final_verdict) ctx.addIssue({ code: "custom", path: ["final_verdict"], message: "an override needs the verdict you want instead" });
    if (!v.reason || v.reason.length < 10) ctx.addIssue({ code: "custom", path: ["reason"], message: "an override needs a reason (at least 10 characters)" });
  });
export type DispositionInput = z.infer<typeof DispositionInputSchema>;

const ResultSchema = z.object({
  decision: z.enum(["approve", "override"]),
  decided_by: z.string(),
  reason: z.string().nullable(),
  items: z.array(z.object({ loan_id: z.string(), proposed_verdict: VerdictSchema, final_verdict: VerdictSchema })),
});

export type Confirmed = {
  seq: number;
  decision: "approve" | "override";
  decided_by: string;
  reason: string | null;
  proposed_verdict: Verdict;
  final_verdict: Verdict;
};

/** The latest decision per loan, read from the event log (a malformed row is skipped, never guessed at). */
export function confirmedByLoan(events: readonly Event[]): Map<string, Confirmed> {
  const out = new Map<string, Confirmed>();
  for (const e of events) {
    if (e.type !== "disposition_recorded") continue;
    const r = ResultSchema.safeParse(e.result);
    if (!r.success) continue;
    for (const item of r.data.items)
      out.set(item.loan_id, { seq: e.seq, decision: r.data.decision, decided_by: r.data.decided_by, reason: r.data.reason,
        proposed_verdict: item.proposed_verdict, final_verdict: item.final_verdict });
  }
  return out;
}

/** What the screen proposed for a loan, and the event row that shows why. */
export type Proposal = { proposed: Verdict; status_seq: number };

export function dispositionRow(
  input: DispositionInput,
  proposalOf: (loanId: string) => Proposal | undefined,
  budget: Budget,
): { ok: true; row: EventRow } | { ok: false; error: string } {
  const items: { loan_id: string; proposed_verdict: Verdict; final_verdict: Verdict }[] = [];
  const sources: EventRow["sources"] = [];
  for (const loan_id of input.loan_ids) {
    const p = proposalOf(loan_id);
    if (!p) return { ok: false, error: `${loan_id} has no investigation in this run, so there is nothing to approve or override` };
    const final = input.decision === "approve" ? p.proposed : input.final_verdict!;
    if (input.decision === "override" && final === p.proposed) return { ok: false, error: `${loan_id} is already proposed as ${p.proposed}; to keep it, approve instead` };
    items.push({ loan_id, proposed_verdict: p.proposed, final_verdict: final });
    sources.push({ kind: "event", run_id: input.run_id, seq: p.status_seq });
  }
  const verdicts = [...new Set(items.map((i) => i.final_verdict))].join(", ");
  return {
    ok: true,
    row: {
      type: "disposition_recorded", loan_ids: input.loan_ids, tool: null,
      result: { decision: input.decision, decided_by: input.decided_by, reason: input.reason?.length ? input.reason : null, items },
      sources,
      note: `${input.decision === "approve" ? "Approved" : "Overridden"} by ${input.decided_by}: ${items.length} loan${items.length === 1 ? "" : "s"} now ${verdicts}.`,
      budget, simulated: false,
    },
  };
}
