// The status a loan gets when Hazel closes it (CLAUDE.md rule 1: Claude never sets a status). Hazel may propose one;
// this code decides from the evidence gathered in the run, and the event records both when they differ.
// Thresholds are design choices. Frozen bureau / bureau disagreement (Insufficient evidence) arrive with the credit
// report (ticket 06); until then this decides between Investigate and No material anomaly found.
import type { LoanStatus } from "@/lib/contracts/loan";
import type { SourceRef } from "@/lib/contracts/tool-result";
import type { IdentityCheck } from "@/lib/crs";
import { CLUSTER_MIN_SCORE, type EvidenceGraph } from "@/lib/graph";

/** TU identity messages that are hard synthetic-identity signals (CLAUDE.md): SSN/name, DOB, deceased. */
export const HARD_CODES = new Set(["2201", "2202", "2301"]);
/** A fraud alert on file: not proof, but a person must look (the CRO). */
export const FRAUD_ALERT = "2401";

export type RunEvidence = {
  identity: ReadonlyMap<string, { check: IdentityCheck; sources: SourceRef[] }>;
  openQuestions: ReadonlySet<string>; // loans with a question nobody has answered yet
};

export type StatusDecision = { status: LoanStatus; reason: string; sources: SourceRef[] };

const hardCodes = (ev: RunEvidence, loanId: string) =>
  ev.identity.get(loanId)?.check.messages.map((m) => m.code).filter((c) => HARD_CODES.has(c)) ?? [];

export function decideStatus(graph: EvidenceGraph, loanId: string, ev: RunEvidence): StatusDecision {
  const own = ev.identity.get(loanId);
  const hard = hardCodes(ev, loanId);
  if (own && hard.length) return { status: "Investigate", reason: `TransUnion identity: ${hard.join(" + ")}`, sources: own.sources };
  if (own?.check.messages.some((m) => m.code === FRAUD_ALERT))
    return { status: "Investigate", reason: "fraud alert on file: needs the CRO", sources: own.sources };

  // strong unexplained links to a loan whose identity failed
  const partners = new Map<string, number>();
  for (const e of graph.edgesOf(loanId)) {
    if (e.explained) continue;
    const other = e.a === loanId ? e.b : e.a;
    if (!partners.has(other)) partners.set(other, graph.pairScore(loanId, other));
  }
  const strong = [...partners].filter(([, s]) => s >= CLUSTER_MIN_SCORE).sort((a, b) => b[1] - a[1]);
  const flagged = strong.filter(([other]) => hardCodes(ev, other).length);
  if (flagged.length) {
    const [other] = flagged[0];
    const links = graph.edgesOf(loanId).filter((e) => !e.explained && (e.a === other || e.b === other));
    return {
      status: "Investigate",
      reason: `strong unexplained links (${[...new Set(links.map((e) => e.kind))].join(", ")}) to ${other}, whose identity failed`,
      sources: [...links.flatMap((e) => e.sources), ...(ev.identity.get(other)?.sources ?? [])],
    };
  }
  if (ev.openQuestions.has(loanId))
    return { status: "Investigate", reason: "waiting on a question to a person", sources: [{ kind: "row", loan_id: loanId, field: "loan_id" }] };
  if (strong.length) {
    const [other, score] = strong[0];
    const links = graph.edgesOf(loanId).filter((e) => !e.explained && (e.a === other || e.b === other));
    return { status: "Investigate", reason: `strong unexplained link to ${other} (pair score ${score})`, sources: links.flatMap((e) => e.sources) };
  }
  const sources: SourceRef[] = own?.sources.length ? own.sources : [{ kind: "row", loan_id: loanId, field: "loan_id" }];
  return { status: "No material anomaly found", reason: own ? "identity verified; no strong unexplained link" : "no strong unexplained link", sources };
}
