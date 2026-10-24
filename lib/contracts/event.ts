// DRAFT for team review. The event row (SKELETON §8): one row per step in the Supabase `events` table,
// insert-only, the corkboard's only input. Encodes §8 as written; anything §8 leaves open is marked
// "open:" and listed in docs/contracts-event-review.md instead of being decided here.
import { z } from "zod";

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

// The two source kinds §8 shows. open: other kinds (tool result, saved rule, document) pass through
// unchecked until the team names them.
export const CrsSourceSchema = z.object({ kind: z.literal("crs"), request_id: z.string().min(1) });
export const RowSourceSchema = z.object({ kind: z.literal("row"), loan_id: z.string(), field: z.string() });
export const SourceRefSchema = z.union([CrsSourceSchema, RowSourceSchema, z.looseObject({ kind: z.string() })]);

export const BudgetSchema = z.object({ spent: z.number(), limit: z.number() });

export const EventSchema = z.object({
  run_id: z.string().min(1),
  seq: z.number().int().positive(),
  ts: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ts must be a timestamp"),
  type: EventTypeSchema,
  loan_ids: z.array(z.string()),
  tool: z.string().nullable(), // open: §8 always shows a tool; run_started and similar have none
  result: z.record(z.string(), z.unknown()), // open: per-type payloads are not defined in §8
  sources: z.array(SourceRefSchema),
  note: z.string(),
  budget: BudgetSchema,
  simulated: z.boolean(),
});

export type EventType = z.infer<typeof EventTypeSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type Event = z.infer<typeof EventSchema>;
