// Matching a link against saved rules, and taking its strings down when one applies (CLAUDE.md rule 3: a saved rule).
// A rule applies only when every condition holds; an unchecked fact never counts as holding.
import type { Rule, RuleContext, RuleWhen } from "@/lib/contracts/rule";
import type { GraphEdge } from "@/lib/contracts/graph";
import type { SourceRef } from "@/lib/contracts/tool-result";
import type { EvidenceGraph } from "@/lib/graph";
import type { CheckEventRef, ClueExplained } from "@/lib/evidence";

export type RuleMatch =
  | { status: "match"; rule: Rule } // apply it, citing the rule
  | { status: "missing"; rule: Rule; missing: string[] } // would apply if these facts were checked first
  | { status: "outside_scope"; rules: Rule[] } // rules exist for this kind of link, none covers it: ask again
  | { status: "no_rule" }; // no precedent: ask

type Verdict = "holds" | "fails" | "missing";

function condition(key: keyof RuleWhen, expected: unknown, ctx: RuleContext): Verdict {
  switch (key) {
    case "link_kind": return ctx.link_kind === expected ? "holds" : "fails";
    case "min_group_size": return ctx.group_size === null ? "missing" : ctx.group_size >= (expected as number) ? "holds" : "fails";
    case "max_group_size": return ctx.group_size === null ? "missing" : ctx.group_size <= (expected as number) ? "holds" : "fails";
    case "tenure_on_credit_file": return ctx.tenure_on_credit_file === null ? "missing" : ctx.tenure_on_credit_file === expected ? "holds" : "fails";
  }
}

const factOf: Record<keyof RuleWhen, string> = {
  link_kind: "link_kind", min_group_size: "group_size", max_group_size: "group_size", tenure_on_credit_file: "tenure_on_credit_file",
};

/** Which saved rule, if any, covers this link. The most specific match wins, then the newest version. */
export function matchRule(rules: readonly Rule[], ctx: RuleContext): RuleMatch {
  const sameKind = rules.filter((r) => r.when.link_kind === ctx.link_kind);
  if (!sameKind.length) return { status: "no_rule" };
  const judged = sameKind.map((rule) => {
    const verdicts = (Object.entries(rule.when) as [keyof RuleWhen, unknown][])
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, condition(k, v, ctx)] as const);
    return { rule, verdicts };
  });
  const specific = (a: Rule, b: Rule) =>
    Object.keys(b.when).length - Object.keys(a.when).length || b.version - a.version || a.id.localeCompare(b.id);
  const holding = judged.filter((j) => j.verdicts.every(([, v]) => v === "holds")).map((j) => j.rule).sort(specific);
  if (holding.length) return { status: "match", rule: holding[0] };
  const close = judged.filter((j) => !j.verdicts.some(([, v]) => v === "fails")).sort((a, b) => specific(a.rule, b.rule));
  if (close.length) {
    const missing = [...new Set(close[0].verdicts.filter(([, v]) => v === "missing").map(([k]) => factOf[k]))];
    return { status: "missing", rule: close[0].rule, missing };
  }
  return { status: "outside_scope", rules: sameKind };
}

export const ruleSource = (rule: Rule): SourceRef => ({ kind: "rule", rule_id: rule.id, version: rule.version });

/** `rule_applied.result` (SKELETON §8; shape proposed to C). */
export type RuleAppliedResult = { rule_id: string; version: number; edge_ids: string[]; reason_text: string };

/**
 * Apply a matched rule to one loan's links through one shared attribute (e.g. its employer): each unexplained link
 * drops to weight 0, kept, citing the rule. Returns the `rule_applied` and `clue_explained` payloads, or null when
 * nothing was left to take down. `at` is the event row of the check that supplied the facts, when there is one.
 */
export function applyRule(graph: EvidenceGraph, rule: Rule, loanId: string, entity: string,
  opts: { at?: CheckEventRef; simulated: boolean }): { applied: RuleAppliedResult; clue: ClueExplained; edges: GraphEdge[] } | null {
  if (rule.then !== "explain_link") return null;
  if (!graph.hasLoan(loanId) || !graph.hasEntity(entity) || graph.kind(entity) !== rule.when.link_kind) return null;
  const pending = graph.edgesOf(loanId).filter((e) => e.entity_id === entity && !e.explained);
  if (!pending.length) return null;
  const sources: SourceRef[] = [ruleSource(rule), ...(opts.at ? [{ kind: "event" as const, ...opts.at }] : [])];
  const edges = pending.map((e) => graph.explainEdge(e.edge_id, { check: "rule", reason: rule.reason_text, sources }));
  const edge_ids = edges.map((e) => e.edge_id).sort();
  const loan_ids = [...new Set(edges.flatMap((e) => [e.a, e.b]))].sort();
  return {
    edges,
    applied: { rule_id: rule.id, version: rule.version, edge_ids, reason_text: rule.reason_text },
    clue: { loan_ids, result: { edge_ids, explained_by: "rule", rule_id: rule.id, reason: rule.reason_text }, sources, simulated: opts.simulated,
      links: [...pending].sort((x, y) => x.edge_id.localeCompare(y.edge_id)) },
  };
}
