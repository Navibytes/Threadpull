// find_connections(entity_id) (SKELETON §7): 0 acorns, one graph query, every link cited.
import type { GraphEdge, NodeKind } from "@/lib/contracts/graph";
import { toolError, toolOk, type SourceRef, type ToolResult } from "@/lib/contracts/tool-result";
import type { EvidenceGraph } from "./graph";
import { baseWeight, LINK_MIN_WEIGHT } from "./weights";

const MAX_LOANS_LISTED = 50;

export type AttributeSummary = { entity_id: string; kind: NodeKind; value: string; shared_by: number; weight: number; explained: boolean };
export type Neighbor = { loan_id: string; score: number; edge_ids: string[] };
export type LoanConnections = {
  entity_id: string; kind: "loan";
  attributes: AttributeSummary[]; // what this loan carries and how rare each value is
  edges: GraphEdge[]; // links at or above LINK_MIN_WEIGHT, plus every withdrawn one that was
  neighbors: Neighbor[]; // loans linked by those edges, by pair score (every shared value, same origin counted once)
  weaker_links: number; // links below LINK_MIN_WEIGHT, counted but not listed
};
export type EntityConnections = {
  entity_id: string; kind: NodeKind; value: string; shared_by: number; weight: number;
  loan_ids: string[]; // up to MAX_LOANS_LISTED
  explained: boolean;
};

const dedupe = (refs: SourceRef[]) => [...new Map(refs.map((r) => [JSON.stringify(r), r])).values()];

export function findConnections(graph: EvidenceGraph, entityId: string): ToolResult<LoanConnections | EntityConnections | null> {
  if (graph.hasLoan(entityId)) return toolOk("find_connections", loanConnections(graph, entityId), loanSources(graph, entityId));
  if (graph.hasEntity(entityId)) {
    const loans = graph.loansOf(entityId), kind = graph.kind(entityId);
    const all = graph.graph.edges(entityId).map((e) => graph.graph.getEdgeAttribute(e, "source"));
    const result: EntityConnections = {
      entity_id: entityId, kind, value: graph.value(entityId), shared_by: loans.length,
      weight: baseWeight(kind, loans.length), loan_ids: loans.slice(0, MAX_LOANS_LISTED),
      explained: loans.length > 1 && graph.edge(entityId, loans[0], loans[1]).explained,
    };
    return toolOk("find_connections", result, dedupe(all).slice(0, MAX_LOANS_LISTED));
  }
  return toolError("find_connections", `unknown entity ${entityId}: pass a loan id or an entity id (kind:value, from attributes)`);
}

function loanConnections(graph: EvidenceGraph, loanId: string): LoanConnections {
  const all = graph.edgesOf(loanId);
  const raw = (e: GraphEdge) => (e.explained ? graph.rawWeight(e.entity_id, e.a, e.b) : e.weight);
  const edges = all.filter((e) => raw(e) >= LINK_MIN_WEIGHT);

  const attributes = graph.entitiesOf(loanId).map((entity): AttributeSummary => {
    const mine = all.filter((e) => e.entity_id === entity);
    return {
      entity_id: entity, kind: graph.kind(entity), value: graph.value(entity), shared_by: graph.sharedBy(entity),
      weight: Math.max(0, ...mine.map((e) => e.weight)), explained: mine.length > 0 && mine.every((e) => e.explained),
    };
  });

  const byLoan = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const other = e.a === loanId ? e.b : e.a;
    byLoan.set(other, [...(byLoan.get(other) ?? []), e]);
  }
  const neighbors = [...byLoan].map(([loan_id, es]): Neighbor => ({
    loan_id, score: graph.pairScore(loanId, loan_id), edge_ids: es.map((e) => e.edge_id),
  })).sort((p, q) => q.score - p.score || p.loan_id.localeCompare(q.loan_id));

  return { entity_id: loanId, kind: "loan", attributes, edges, neighbors, weaker_links: all.length - edges.length };
}

function loanSources(graph: EvidenceGraph, loanId: string): SourceRef[] {
  const linked = graph.edgesOf(loanId, LINK_MIN_WEIGHT).flatMap((e) => e.sources);
  return dedupe(linked.length ? linked : [{ kind: "row", loan_id: loanId, field: "loan_id" }]);
}
