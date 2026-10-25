// Ask once, remember forever (SKELETON §9, TEAM_BRIEF): the question Hazel asks a person, and the rule an answer becomes.
// Code sets the recipient, confidence and reason; Hazel only words the question.
import { z } from "zod";
import { NodeKindSchema } from "./graph";
import { SourceRefSchema } from "./tool-result";

export const RECIPIENTS = ["CRO", "credit analyst", "legal", "compliance"] as const;
export const QUESTION_REASONS = ["no precedent", "sources disagree"] as const;
export const QUESTION_TOPICS = ["policy", "fraud_alert", "partial_data", "bureau_disagreement", "buyback", "sanctions"] as const;

export const RecipientSchema = z.enum(RECIPIENTS);
export const QuestionReasonSchema = z.enum(QUESTION_REASONS);
export const QuestionTopicSchema = z.enum(QUESTION_TOPICS);

/** A rule's scope. Closed set of conditions: a rule can only say what these fields can express. */
export const RuleWhenSchema = z.strictObject({
  link_kind: NodeKindSchema,
  min_group_size: z.number().int().positive().optional(), // e.g. employer headcount
  max_group_size: z.number().int().positive().optional(),
  tenure_on_credit_file: z.boolean().optional(),
});

/** The facts about one link a rule is matched against. null = not checked yet. */
export const RuleContextSchema = z.object({
  link_kind: NodeKindSchema,
  group_size: z.number().int().nonnegative().nullable(),
  tenure_on_credit_file: z.boolean().nullable(),
});

export const RuleSchema = z.object({
  id: z.string().regex(/^R-\d{3,}$/),
  created_from: z.string().min(1), // "question q-003, answered by CRO at 2026-10-24T22:42Z"
  when: RuleWhenSchema,
  then: z.literal("explain_link"),
  reason_text: z.string().min(1),
  version: z.number().int().positive(),
  ruled_at: z.string(),
  confirmed_by: z.string().min(1),
});

/** One labelled piece of evidence behind a question's confidence. Weights are design choices, not probabilities. */
export const EvidenceItemSchema = z.object({
  label: z.string().min(1),
  weight: z.number().nonnegative(),
  sources: z.array(SourceRefSchema),
});

export const AnswerSchema = z.object({
  decision: z.enum(["yes", "no"]),
  text: z.string().min(1), // the person's own words
  answered_by: z.string().min(1),
  answered_at: z.string(),
  rule_id: z.string().nullable(), // the rule a "yes" created or updated
});

export const QuestionSchema = z.object({
  id: z.string().regex(/^q-\d{3,}$/),
  run_id: z.string().min(1),
  loan_ids: z.array(z.string()).min(1),
  question: z.string().min(1),
  topic: QuestionTopicSchema,
  to: RecipientSchema,
  confidence: z.number().int().min(0).max(100), // support for the innocent explanation, from confidence_basis
  reason: QuestionReasonSchema,
  confidence_basis: z.object({ for: z.array(EvidenceItemSchema), against: z.array(EvidenceItemSchema) }),
  context: RuleContextSchema.nullable(), // the link asked about; null for a question that is not about a link
  proposed_rule: RuleWhenSchema.nullable(), // the scope a "yes" adopts unless the person edits it
  sources: z.array(SourceRefSchema),
  asked_at: z.string(),
  status: z.enum(["pending", "answered"]),
  answer: AnswerSchema.nullable(),
});

export type Recipient = z.infer<typeof RecipientSchema>;
export type QuestionReason = z.infer<typeof QuestionReasonSchema>;
export type QuestionTopic = z.infer<typeof QuestionTopicSchema>;
export type RuleWhen = z.infer<typeof RuleWhenSchema>;
export type RuleContext = z.infer<typeof RuleContextSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type Question = z.infer<typeof QuestionSchema>;
