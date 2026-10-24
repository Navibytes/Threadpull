// DRAFT for team review. The event row (SKELETON §8): one row per step in the Supabase `events` table,
// insert-only, the corkboard's only input. Encodes §8 as written; anything §8 leaves open is marked
// "open:" and listed in docs/contracts-event-review.md instead of being decided here.
import { z } from "zod";
import { SourceRefSchema, ToolNameSchema } from "./tool-result";

export const EVENT_TYPES = [
  "run_started",
  "lead_opened",
  "check_run",
  "link_found",
  "clue_explained",
  "lead_dropped",
  "status_changed",
  "budget_spent",
  "question_asked",
  "question_answered",
  "rule_applied",
  "attack_detected",
  "recovery",
  "disposition_recorded",
  "run_finished",
] as const;

export const EventTypeSchema = z.enum(EVENT_TYPES);

export const BudgetSchema = z.object({ spent: z.number(), limit: z.number() });

// Agreed with A (docs/contracts-event-review.md, question 2). Other types' results stay open.

// clue_explained: which threads drop and why. A dealer burst isn't a thread, so its edge_ids can be empty
// (the burst's loans are in loan_ids). Weight after an explanation is always 0 (SKELETON §6), so it isn't sent.
export const ClueExplainedResultSchema = z
  .object({
    edge_ids: z.array(z.string()),
    explained_by: z.union([ToolNameSchema, z.literal("rule")]),
    rule_id: z.string().optional(),
    reason: z.string().min(1),
  })
  .refine((r) => r.explained_by !== "rule" || !!r.rule_id, { message: "rule_id is required when explained_by is rule" });

// attack_detected: line numbers and rule ids only, never document text (lib/evidence attackEvent builds it).
// Strict, so a field carrying text can't slip into the event log that the memo model reads.
export const AttackDetectedResultSchema = z.strictObject({
  doc_id: z.string(),
  rules: z.array(z.string()),
  lines: z.array(z.number().int().positive()),
  unexpected_lines: z.array(z.number().int().positive()),
  invisible_characters: z.boolean(),
  withheld_fields: z.array(z.string()),
});

export const EventSchema = z.object({
  run_id: z.string().min(1),
  seq: z.number().int().positive(),
  ts: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ts must be a timestamp"),
  type: EventTypeSchema,
  loan_ids: z.array(z.string()),
  tool: z.string().nullable(), // open: §8 always shows a tool; run_started and similar have none
  result: z.record(z.string(), z.unknown()), // checked per type below where agreed; open for the rest
  sources: z.array(SourceRefSchema), // the team's SourceRef (tool-result.ts): a tool's sources go in unchanged
  note: z.string(),
  budget: BudgetSchema,
  simulated: z.boolean(),
}).superRefine((e, ctx) => {
  const check = (schema: z.ZodType) => {
    const r = schema.safeParse(e.result);
    if (!r.success)
      for (const i of r.error.issues) ctx.addIssue({ code: "custom", path: ["result", ...i.path], message: i.message });
  };
  if (e.type === "clue_explained") {
    check(ClueExplainedResultSchema);
    // hard rule 3: a dropped thread points at the check that explained it, or at a saved rule
    if (!e.sources.some((s) => s.kind === "event" || s.kind === "rule"))
      ctx.addIssue({ code: "custom", path: ["sources"], message: "clue_explained must cite the check's event row or a rule" });
  }
  if (e.type === "attack_detected") check(AttackDetectedResultSchema);
});

export type EventType = z.infer<typeof EventTypeSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type Event = z.infer<typeof EventSchema>;
export type ClueExplainedResult = z.infer<typeof ClueExplainedResultSchema>;
export type AttackDetectedResult = z.infer<typeof AttackDetectedResultSchema>;
