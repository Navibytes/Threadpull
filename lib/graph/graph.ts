// The evidence graph: loans connect to the attributes they carry (bipartite, graphology); loan-to-loan
// links are projected through each shared attribute on demand. Explanations never delete a link.
import { MultiUndirectedGraph, UndirectedGraph } from "graphology";
import { connectedComponents } from "graphology-components";
import type { Loan } from "@/lib/contracts/loan";
import { ExplanationSchema, type Explanation, type GraphEdge, type NodeKind } from "@/lib/contracts/graph";
import type { SourceRef } from "@/lib/contracts/tool-result";
import {
  attributesOf, baseWeight, CLUSTER_MIN_SCORE, entityId, HOUSEHOLD_FADE, householdEvidence, LINK_MIN_WEIGHT, PERSONAL_KINDS,
} from "./weights";

type NodeAttrs = { kind: NodeKind; value: string };
type LinkAttrs = { origin: string; source: SourceRef };

export type Lead = { loan_id: string; score: number; origins: Record<string, number> };
export type Cluster = { cluster_id: string; loan_ids: string[]; edge_ids: string[]; score: number };

const EDGE_ID_RE = /^e-([a-z_]+)-(.+)-(L\d{4})-(L\d{4})$/;
const round = (x: number) => Math.round(x * 1e4) / 1e4;

export class EvidenceGraph {
  readonly graph = new MultiUndirectedGraph<NodeAttrs, LinkAttrs>();
  private readonly loans = new Map<string, Loan>();
  private readonly explanations = new Map<string, Explanation>(); // by entity_id or edge_id
  private readonly households = new Map<string, SourceRef[] | null>();
  private readonly loansCache = new Map<string, string[]>();

  constructor(loans: Iterable<Loan>) {
    for (const loan of loans) {
      const id = loan.loan_id;
      if (this.loans.has(id)) throw new Error(`duplicate loan_id ${id}`);
      this.loans.set(id, loan);
      this.graph.addNode(id, { kind: "loan", value: id });
      const person = `person:${id}`;
      this.graph.addNode(person, { kind: "person", value: `${loan.applicant_info.first_name} ${loan.applicant_info.last_name}` });
      this.graph.addEdge(id, person, { origin: "borrower", source: { kind: "row", loan_id: id, field: "applicant_info" } });
      for (const attr of attributesOf(loan)) {
        const node = entityId(attr.kind, attr.value);
        this.graph.mergeNode(node, { kind: attr.kind, value: attr.value });
        this.graph.addEdge(id, node, { origin: attr.origin, source: attr.source });
      }
    }
  }

  get loanIds(): string[] { return [...this.loans.keys()]; }
  hasLoan(id: string) { return this.loans.has(id); }
  hasEntity(id: string) { return this.graph.hasNode(id) && !this.isLoan(id) && this.kind(id) !== "person"; }
  kind(node: string): NodeKind { return this.graph.getNodeAttribute(node, "kind"); }
  value(node: string): string { return this.graph.getNodeAttribute(node, "value"); }
  private isLoan(node: string) { return this.kind(node) === "loan"; }

  /** Attribute nodes a loan carries (not its person node). */
  entitiesOf(loanId: string): string[] {
    return this.graph.neighbors(loanId).filter((n) => this.kind(n) !== "person");
  }

  /** Loans carrying an attribute. The graph's shape is fixed after construction, so this is cached. */
  loansOf(entity: string): string[] {
    let loans = this.loansCache.get(entity);
    if (!loans) this.loansCache.set(entity, (loans = this.graph.neighbors(entity).filter((n) => this.isLoan(n)).sort()));
    return loans;
  }

  /** How many loans in the pool share an attribute: the n in its rarity weight. */
  sharedBy(entity: string) { return this.loansOf(entity).length; }

  edgeId(entity: string, x: string, y: string) {
    const [a, b] = x < y ? [x, y] : [y, x];
    return `e-${this.kind(entity)}-${entity.slice(entity.indexOf(":") + 1)}-${a}-${b}`;
  }

  private household(x: string, y: string): SourceRef[] | null {
    const key = x < y ? `${x}|${y}` : `${y}|${x}`;
    if (!this.households.has(key)) this.households.set(key, householdEvidence(this.loans.get(x)!, this.loans.get(y)!));
    return this.households.get(key)!;
  }

  private explanationOf(entity: string, x: string, y: string) {
    return this.explanations.get(this.edgeId(entity, x, y)) ?? this.explanations.get(entity) ?? null;
  }

  /** Weight before any explanation: rarity, then the household fade for personal and address links. */
  rawWeight(entity: string, x: string, y: string): number {
    const kind = this.kind(entity), w = baseWeight(kind, this.sharedBy(entity));
    return (PERSONAL_KINDS.has(kind) || kind === "address") && this.household(x, y) ? w * HOUSEHOLD_FADE : w;
  }

  /** Current weight: 0 once explained. */
  weight(entity: string, x: string, y: string): number {
    return this.explanationOf(entity, x, y) ? 0 : this.rawWeight(entity, x, y);
  }

  /** The full link between two loans through one shared attribute. */
  edge(entity: string, x: string, y: string): GraphEdge {
    const [a, b] = x < y ? [x, y] : [y, x];
    const kind = this.kind(entity);
    const fades = PERSONAL_KINDS.has(kind) || kind === "address";
    const household = fades ? this.household(a, b) : null;
    const sources = [a, b].flatMap((l) => this.graph.edges(l, entity).map((e) => this.graph.getEdgeAttribute(e, "source")));
    const explanation = this.explanationOf(entity, a, b);
    return {
      edge_id: this.edgeId(entity, a, b), kind, a, b, entity_id: entity,
      shared_by: this.sharedBy(entity),
      origin: this.graph.getEdgeAttribute(this.graph.edges(a, entity)[0], "origin"),
      weight: round(explanation ? 0 : this.rawWeight(entity, a, b)),
      household: household !== null,
      sources: [...sources, ...(household ?? [])],
      explained: explanation !== null,
      explanation_ref: explanation,
    };
  }

  /** Look up a link by its edge_id. */
  edgeById(edgeId: string): GraphEdge | null {
    const m = edgeId.match(EDGE_ID_RE);
    if (!m) return null;
    const [, kind, value, a, b] = m, entity = `${kind}:${value}`;
    if (!this.graph.hasNode(entity) || !this.graph.hasEdge(a, entity) || !this.graph.hasEdge(b, entity)) return null;
    return this.edge(entity, a, b);
  }

  /** Every link from a loan, optionally only those whose weight before explanation reaches minRaw. */
  edgesOf(loanId: string, minRaw = 0): GraphEdge[] {
    const out: GraphEdge[] = [];
    for (const entity of this.entitiesOf(loanId)) {
      if (minRaw > 0 && !this.couldReach(entity, minRaw)) continue;
      for (const other of this.loansOf(entity))
        if (other !== loanId && this.rawWeight(entity, loanId, other) >= minRaw) out.push(this.edge(entity, loanId, other));
    }
    return out.sort((p, q) => q.weight - p.weight || p.edge_id.localeCompare(q.edge_id));
  }

  // Fading only lowers a weight, so an attribute whose base weight is below the bar can never reach it.
  private couldReach(entity: string, min: number) { return baseWeight(this.kind(entity), this.sharedBy(entity)) >= min; }

  /** Withdraw every link through one attribute (an apartment building, a large employer). */
  explainEntity(entity: string, explanation: Explanation): GraphEdge[] {
    if (!this.hasEntity(entity)) throw new Error(`unknown entity ${entity}`);
    this.explanations.set(entity, ExplanationSchema.parse(explanation));
    const loans = this.loansOf(entity);
    return loans.flatMap((x, i) => loans.slice(i + 1).map((y) => this.edge(entity, x, y)));
  }

  /** Withdraw one link between two loans (a household phone). */
  explainEdge(edgeId: string, explanation: Explanation): GraphEdge {
    if (!this.edgeById(edgeId)) throw new Error(`unknown edge ${edgeId}`);
    this.explanations.set(edgeId, ExplanationSchema.parse(explanation));
    return this.edgeById(edgeId)!;
  }

  /**
   * Lead priority for one loan: for each origin, the strongest unexplained link it produced; summed.
   * Clues with the same origin count once, so a device and an IP from one submission add up to one clue.
   */
  score(loanId: string): Lead {
    const origins: Record<string, number> = {};
    for (const entity of this.entitiesOf(loanId)) {
      const origin = this.graph.getEdgeAttribute(this.graph.edges(loanId, entity)[0], "origin");
      for (const other of this.loansOf(entity)) {
        if (other === loanId) continue;
        const w = this.weight(entity, loanId, other);
        if (w > (origins[origin] ?? 0)) origins[origin] = w;
      }
    }
    for (const k of Object.keys(origins)) origins[k] = round(origins[k]);
    return { loan_id: loanId, score: round(Object.values(origins).reduce((s, w) => s + w, 0)), origins };
  }

  /** Every loan ranked by priority: which leads to open first. Not a fraud probability. */
  rankLeads(): Lead[] {
    return this.loanIds.map((id) => this.score(id)).sort((p, q) => q.score - p.score || p.loan_id.localeCompare(q.loan_id));
  }

  /** Pair score: per origin, the strongest unexplained link between two loans; summed (same origin counts once). */
  pairScore(x: string, y: string): number {
    const origins = new Map<string, number>();
    for (const entity of this.entitiesOf(x)) {
      if (!this.graph.hasEdge(y, entity)) continue;
      const origin = this.graph.getEdgeAttribute(this.graph.edges(x, entity)[0], "origin");
      origins.set(origin, Math.max(origins.get(origin) ?? 0, this.weight(entity, x, y)));
    }
    return round([...origins.values()].reduce((s, w) => s + w, 0));
  }

  /**
   * Connected clusters: two loans are joined when their pair score reaches minScore, strongest cluster first.
   * Only pairs sharing at least one value rare enough to list (LINK_MIN_WEIGHT) can reach it.
   */
  clusters(minScore = CLUSTER_MIN_SCORE): Cluster[] {
    const g = new UndirectedGraph<Record<string, never>, { score: number }>();
    for (const entity of this.graph.nodes()) {
      if (this.isLoan(entity) || this.kind(entity) === "person" || !this.couldReach(entity, LINK_MIN_WEIGHT)) continue;
      const loans = this.loansOf(entity);
      for (let i = 0; i < loans.length; i++)
        for (let j = i + 1; j < loans.length; j++) {
          const [a, b] = [loans[i], loans[j]];
          if (g.hasNode(a) && g.hasNode(b) && g.hasEdge(a, b)) continue;
          const score = this.pairScore(a, b);
          if (score < minScore) continue;
          g.mergeNode(a); g.mergeNode(b);
          g.addEdge(a, b, { score });
        }
    }
    return connectedComponents(g)
      .map((members) => {
        const loan_ids = members.sort(), set = new Set(loan_ids), edge_ids: string[] = [];
        let score = 0;
        g.forEachEdge((_, e, a, b) => {
          if (!set.has(a)) return;
          score += e.score;
          for (const entity of this.entitiesOf(a))
            if (this.graph.hasEdge(b, entity) && this.weight(entity, a, b) > 0) edge_ids.push(this.edgeId(entity, a, b));
        });
        return { cluster_id: `C-${loan_ids[0]}`, loan_ids, edge_ids: edge_ids.sort(), score: round(score) };
      })
      .sort((p, q) => q.score - p.score || p.cluster_id.localeCompare(q.cluster_id));
  }
}

export const buildGraph = (loans: Iterable<Loan>) => new EvidenceGraph(loans);
