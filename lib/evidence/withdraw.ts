// Taking a string down (ticket 07, CLAUDE.md hard rule 3). An explanation check's result goes in; the links it
// proves innocent go to weight 0 in the evidence graph (kept, never deleted), and out comes the `clue_explained`
// event payload (SKELETON §8, shape agreed with C). Nothing changes unless the check succeeded and `explains` is
// true, and every row cites the check's own event row, so a withdrawn thread always points at its proof.
//
// check_employer has no withdraw: it never explains on its own (R-001 or a human does, ticket 11).
import type { Explanation, GraphEdge } from "@/lib/contracts/graph";
import type { SourceRef, ToolName, ToolResult } from "@/lib/contracts/tool-result";
import { entityId, type EvidenceGraph } from "@/lib/graph";
import type { AddressCheck, DealerTimeline, HouseholdCheck } from "./explanations";

/** The `check_run` event row that recorded the check. The withdrawal cites it. */
export type CheckEventRef = { run_id: string; seq: number };

/** `clue_explained.result` (SKELETON §8). Weight after is always 0, so it isn't sent. */
export type ClueExplainedResult = { edge_ids: string[]; explained_by: ToolName | "rule"; rule_id?: string; reason: string };

/** Everything the agent loop needs to write one `clue_explained` row. */
export type ClueExplained = {
  loan_ids: string[];
  result: ClueExplainedResult;
  sources: SourceRef[];
  simulated: boolean; // true when the proof came from a simulated stand-in (e.g. the address lookup)
};

type ExplainingTool = "check_address" | "check_household" | "dealer_timeline";

const eventSource = (at: CheckEventRef): SourceRef => ({ kind: "event", run_id: at.run_id, seq: at.seq });

function explanation(check: ExplainingTool, reason: string, sources: SourceRef[], at: CheckEventRef): Explanation {
  return { check, reason, sources: [eventSource(at), ...sources] };
}

function clue(tool: ExplainingTool, edges: GraphEdge[], loanIds: string[], reason: string, sources: SourceRef[],
  simulated: boolean, at: CheckEventRef): ClueExplained {
  return {
    loan_ids: [...new Set(loanIds)].sort(),
    result: { edge_ids: edges.map((e) => e.edge_id).sort(), explained_by: tool, reason },
    sources: [eventSource(at), ...sources],
    simulated,
  };
}

/**
 * check_address explained a shared address (a large apartment building): every link through that address drops.
 * Other links between the same loans (a phone, a bank account) stay: the building explains only the building.
 */
export function withdrawAddress(graph: EvidenceGraph, check: ToolResult<AddressCheck>, at: CheckEventRef): ClueExplained | null {
  const r = check.result;
  if (!check.ok || !r?.explains) return null;
  const entity = entityId("address", r.address_key);
  if (!graph.hasEntity(entity)) return null;
  const loans = graph.loansOf(entity);
  const pending = loans.flatMap((x, i) => loans.slice(i + 1).map((y) => graph.edge(entity, x, y))).filter((e) => !e.explained);
  if (!pending.length) return null; // already down: nothing new to show
  graph.explainEntity(entity, explanation("check_address", r.reason, check.sources, at));
  const dropped = pending.map((e) => graph.edgeById(e.edge_id)!);
  return clue("check_address", dropped, loans, r.reason, check.sources, check.simulated, at);
}

/**
 * check_household found one household (same phone and home, same last name or a listed co-applicant): the phone and
 * address links between those two loans drop. Only those two, since they are what the check proved; anything else
 * the pair shares stays up, and the building's links to other loans stay up.
 */
export function withdrawHousehold(graph: EvidenceGraph, check: ToolResult<HouseholdCheck | null>, at: CheckEventRef): ClueExplained | null {
  const r = check.result;
  if (!check.ok || !r?.explains) return null;
  if (!graph.hasLoan(r.loan_a) || !graph.hasLoan(r.loan_b)) return null;
  const shared = graph.entitiesOf(r.loan_a).filter((n) => graph.loansOf(n).includes(r.loan_b));
  const pending = shared.filter((n) => graph.kind(n) === "phone" || graph.kind(n) === "address")
    .map((n) => graph.edge(n, r.loan_a, r.loan_b)).filter((e) => !e.explained);
  if (!pending.length) return null;
  const why = explanation("check_household", r.reason, check.sources, at);
  const dropped = pending.map((e) => graph.explainEdge(e.edge_id, why));
  return clue("check_household", dropped, [r.loan_a, r.loan_b], r.reason, check.sources, check.simulated, at);
}

/**
 * dealer_timeline explained a burst (a month-end push the dealer repeats): one row per explained burst. A burst
 * isn't a link between two loans, so no thread drops (edge_ids is empty); the burst's loans are in loan_ids and the
 * row cites only their timestamps.
 */
export function withdrawBursts(check: ToolResult<DealerTimeline | null>, at: CheckEventRef): ClueExplained[] {
  const r = check.result;
  if (!check.ok || !r) return [];
  return r.bursts.filter((b) => b.explains).map((b) => {
    const inBurst = new Set(b.loan_ids);
    const sources = check.sources.filter((s) => s.kind === "row" && inBurst.has(s.loan_id));
    return clue("dealer_timeline", [], b.loan_ids, b.reason, sources, check.simulated, at);
  });
}
