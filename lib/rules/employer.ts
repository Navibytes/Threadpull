// A shared-employer link, turned into the facts a rule is matched on and the evidence a question is scored on.
// Facts come only from tool results (check_employer; tenure when a caller has it, e.g. from a credit file's employments).
import type { EvidenceItem, RuleContext, RuleWhen } from "@/lib/contracts/rule";
import type { SourceRef, ToolResult } from "@/lib/contracts/tool-result";
import { LINK_MIN_WEIGHT, type EvidenceGraph } from "@/lib/graph";
import { LARGE_EMPLOYER_MIN_HEADCOUNT, type EmployerCheck } from "@/lib/evidence";

/** Above this share of an employer's staff borrowing through the pool, the employer stops looking like an explanation. */
export const STAFF_SHARE_RED_FLAG = 0.25;

/** Whether the credit file confirms the borrower's tenure at that employer, and the CRS call that says so. */
export type TenureFact = { value: boolean; sources: SourceRef[] };

export type EmployerLink = {
  context: RuleContext;
  evidence: { for: EvidenceItem[]; against: EvidenceItem[] };
  proposed_rule: RuleWhen; // the scope that would cover this link, offered to the person who answers
  sources: SourceRef[];
  simulated: boolean; // the headcount lookup is a simulated stand-in
};

export function employerLink(graph: EvidenceGraph, loanId: string, check: ToolResult<EmployerCheck>, tenure?: TenureFact): EmployerLink {
  const r = check.result, headcount = r.headcount;
  const lookup = check.sources.filter((s) => s.kind === "lookup");
  const support: EvidenceItem[] = [], against: EvidenceItem[] = [];

  if (headcount !== null && headcount >= r.loans_in_pool)
    support.push({ label: `${headcount.toLocaleString("en-US")} staff: room for all ${r.loans_in_pool} loans naming it`, weight: 1, sources: lookup });
  if (headcount !== null && r.loans_in_pool / headcount >= STAFF_SHARE_RED_FLAG)
    against.push({ label: `${Math.round((100 * r.loans_in_pool) / headcount)}% of its staff borrowed through this pool`, weight: 1, sources: lookup });
  if (tenure) (tenure.value ? support : against).push({
    label: tenure.value ? "tenure at this employer is on the credit file" : "the credit file does not show this employer",
    weight: 1, sources: tenure.sources,
  });

  // what else ties this loan to others, which an employer explanation would leave standing
  const others = graph.edgesOf(loanId, LINK_MIN_WEIGHT).filter((e) => e.kind !== "employer" && !e.explained);
  const rest = Object.entries(graph.score(loanId).origins).filter(([o]) => o !== "employer").reduce((s, [, w]) => s + w, 0);
  if (rest >= LINK_MIN_WEIGHT)
    against.push({ label: `other unexplained links (${others.map((e) => e.kind).filter((k, i, a) => a.indexOf(k) === i).join(", ") || "weak ones"})`,
      weight: Math.round(rest * 100) / 100, sources: others.flatMap((e) => e.sources).slice(0, 10) });

  return {
    context: { link_kind: "employer", group_size: headcount, tenure_on_credit_file: tenure?.value ?? null },
    evidence: { for: support, against },
    // only conditions this run can check: with no tenure fact, a scope that requires one could never match
    proposed_rule: {
      link_kind: "employer",
      min_group_size: headcount !== null && headcount < LARGE_EMPLOYER_MIN_HEADCOUNT ? headcount : LARGE_EMPLOYER_MIN_HEADCOUNT,
      ...(tenure ? { tenure_on_credit_file: true } : {}),
    },
    sources: [...check.sources.slice(0, 10), ...(tenure?.sources ?? [])],
    simulated: check.simulated,
  };
}

/** Default wording for the question, if Hazel's own isn't used. */
export const employerQuestion = (scope: RuleWhen) =>
  `Is a shared employer with ${scope.min_group_size?.toLocaleString("en-US")}+ staff a valid explanation${scope.tenure_on_credit_file ? " if tenure is on the credit file" : ""}?`;
