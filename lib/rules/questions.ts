// ask_human and the answer that becomes a rule. Hazel words the question; code routes it, scores its confidence
// and gives the reason (CLAUDE.md rule 1). A link a saved rule already covers is never asked about (ask once).
import {
  QuestionSchema, RuleWhenSchema, type EvidenceItem, type Question, type QuestionReason, type QuestionTopic,
  type Recipient, type Rule, type RuleContext, type RuleWhen,
} from "@/lib/contracts/rule";
import type { SourceRef } from "@/lib/contracts/tool-result";
import { currentRules, nextQuestionId, nextRuleId, type RuleStore } from "./store";
import { matchRule, type RuleMatch } from "./rules";

/** Who answers each kind of question (TEAM_BRIEF: asking the right person). */
export const ROUTES: Record<QuestionTopic, Recipient> = {
  policy: "CRO", fraud_alert: "CRO",
  partial_data: "credit analyst", bureau_disagreement: "credit analyst",
  buyback: "legal",
  sanctions: "compliance",
};
export const route = (topic: QuestionTopic): Recipient => ROUTES[topic];

/** Support for the innocent explanation as a percent: for / (for + against). 50 with no evidence. Not a probability. */
export function confidence(evidence: { for: EvidenceItem[]; against: EvidenceItem[] }): number {
  const sum = (xs: EvidenceItem[]) => xs.reduce((s, x) => s + x.weight, 0);
  const f = sum(evidence.for), a = sum(evidence.against);
  return f + a === 0 ? 50 : Math.round((100 * f) / (f + a));
}

/** Evidence pulling both ways means the sources disagree; otherwise nobody has ruled on this before. */
export const reasonFor = (evidence: { for: EvidenceItem[]; against: EvidenceItem[] }): QuestionReason =>
  evidence.for.some((x) => x.weight > 0) && evidence.against.some((x) => x.weight > 0) ? "sources disagree" : "no precedent";

export type AskInput = {
  run_id: string;
  loan_ids: string[];
  question: string; // Hazel's wording
  topic: QuestionTopic;
  context: RuleContext;
  evidence: { for: EvidenceItem[]; against: EvidenceItem[] };
  proposed_rule: RuleWhen | null;
  sources: SourceRef[];
};

/** `question_asked.result` (SKELETON §8; shape proposed to C). */
export type QuestionAskedResult = Pick<Question, "question" | "topic" | "to" | "confidence" | "reason"> & { question_id: string };

export type AskOutcome =
  | { status: "asked"; question: Question; event: { result: QuestionAskedResult; loan_ids: string[]; sources: SourceRef[] } }
  | { status: "already_asked"; question: Question } // same open question: the loan is added, nobody is asked twice
  | { status: "rule_applies"; match: Extract<RuleMatch, { status: "match" }> } // ask once: apply the rule instead
  | { status: "check_first"; match: Extract<RuleMatch, { status: "missing" }> }; // a rule may cover it once these facts are checked

const sameContext = (a: RuleContext, b: RuleContext) =>
  a.link_kind === b.link_kind && a.group_size === b.group_size && a.tenure_on_credit_file === b.tenure_on_credit_file;

export async function askHuman(store: RuleStore, input: AskInput, now = new Date()): Promise<AskOutcome> {
  const match = matchRule(await currentRules(store), input.context);
  if (match.status === "match") return { status: "rule_applies", match };
  if (match.status === "missing") return { status: "check_first", match };

  const open = (await store.questions()).find((q) => q.status === "pending" && q.topic === input.topic && sameContext(q.context, input.context));
  if (open) {
    const merged = { ...open, loan_ids: [...new Set([...open.loan_ids, ...input.loan_ids])].sort() };
    await store.saveQuestion(merged);
    return { status: "already_asked", question: merged };
  }

  const question = QuestionSchema.parse({
    id: await nextQuestionId(store), run_id: input.run_id, loan_ids: [...new Set(input.loan_ids)].sort(),
    question: input.question.trim(), topic: input.topic, to: route(input.topic),
    confidence: confidence(input.evidence), reason: reasonFor(input.evidence), confidence_basis: input.evidence,
    context: input.context, proposed_rule: input.proposed_rule, sources: input.sources,
    asked_at: now.toISOString(), status: "pending", answer: null,
  });
  await store.saveQuestion(question);
  const { id, question: text, topic, to, confidence: c, reason } = question;
  return { status: "asked", question, event: { result: { question_id: id, question: text, topic, to, confidence: c, reason }, loan_ids: question.loan_ids, sources: question.sources } };
}

export type AnswerInput = {
  question_id: string;
  decision: "yes" | "no";
  text: string; // the person's words; a "yes" saves them as the rule's reason_text
  answered_by: string;
  when?: RuleWhen; // the person's edited scope; defaults to the question's proposed_rule
  rule_id?: string; // update this rule (new version) instead of creating one
};

/** `question_answered.result` (SKELETON §8; shape proposed to C). */
export type QuestionAnsweredResult = { question_id: string; decision: "yes" | "no"; answered_by: string; rule_id: string | null; version: number | null };

/** Record a person's answer. A "yes" with a scope creates or updates a rule, append-only; a "no" saves no rule. */
export async function answerQuestion(store: RuleStore, input: AnswerInput, now = new Date()):
  Promise<{ question: Question; rule: Rule | null; event: { result: QuestionAnsweredResult; loan_ids: string[]; sources: SourceRef[] } }> {
  const q = (await store.questions()).find((x) => x.id === input.question_id);
  if (!q) throw new Error(`unknown question ${input.question_id}`);
  if (q.status !== "pending") throw new Error(`question ${q.id} is already answered`);
  const text = input.text.trim(), by = input.answered_by.trim(), at = now.toISOString();
  if (!text || !by) throw new Error("an answer needs the person's words and who gave it");

  let rule: Rule | null = null;
  if (input.decision === "yes") {
    const scope = input.when ?? q.proposed_rule;
    if (!scope) throw new Error(`question ${q.id} has no proposed scope: pass when`);
    const when = RuleWhenSchema.parse(scope);
    const versions = await store.ruleVersions();
    const id = input.rule_id ?? await nextRuleId(store);
    if (input.rule_id && !versions.some((r) => r.id === id)) throw new Error(`unknown rule ${id}`);
    const version = Math.max(0, ...versions.filter((r) => r.id === id).map((r) => r.version)) + 1;
    rule = { id, created_from: `question ${q.id}, answered by ${by} at ${at}`, when, then: "explain_link",
      reason_text: text, version, ruled_at: at, confirmed_by: by };
    await store.addRuleVersion(rule);
  }
  const question: Question = { ...q, status: "answered",
    answer: { decision: input.decision, text, answered_by: by, answered_at: at, rule_id: rule?.id ?? null } };
  await store.saveQuestion(question);
  return {
    question, rule,
    event: {
      result: { question_id: q.id, decision: input.decision, answered_by: by, rule_id: rule?.id ?? null, version: rule?.version ?? null },
      loan_ids: q.loan_ids,
      sources: [{ kind: "human", question_id: q.id, answered_by: by }, ...(rule ? [{ kind: "rule" as const, rule_id: rule.id, version: rule.version }] : [])],
    },
  };
}
