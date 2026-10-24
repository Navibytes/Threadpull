// DRAFT for team review. The event row (SKELETON §8): one row per step in the Supabase `events` table,
// insert-only, the corkboard's only input. Encodes §8 as written; anything §8 leaves open is marked
// "open:" and listed in docs/contracts-event-review.md instead of being decided here.
import { z } from "zod";
import { SourceRefSchema } from "./tool-result";

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

export const EventSchema = z.object({
  run_id: z.string().min(1),
  seq: z.number().int().positive(),
  ts: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ts must be a timestamp"),
  type: EventTypeSchema,
  loan_ids: z.array(z.string()),
  tool: z.string().nullable(), // open: §8 always shows a tool; run_started and similar have none
  result: z.record(z.string(), z.unknown()), // open: per-type payloads are not defined in §8
  sources: z.array(SourceRefSchema), // the team's SourceRef (tool-result.ts): a tool's sources go in unchanged
  note: z.string(),
  budget: BudgetSchema,
  simulated: z.boolean(),
});

export type EventType = z.infer<typeof EventTypeSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type Event = z.infer<typeof EventSchema>;
