// Provisional mirror of the SKELETON §8 event envelope, used by the board until lib/contracts/event.ts
// is agreed with the team. When the contract lands, replace these with its inferred types; the feed,
// reducer and components only depend on the names below.
import type { LoanStatus } from "@/lib/contracts/loan";

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

export type EventType = (typeof EVENT_TYPES)[number];

// Where a fact came from. Only `crs` refs carry a RequestID; the board never invents one.
export type SourceRef =
  | { kind: "crs"; request_id: string; product?: string }
  | { kind: "row"; loan_id: string; field: string }
  | { kind: "tool"; seq: number }
  | { kind: "rule"; rule_id: string }
  | { kind: "doc"; doc_id: string };

export type RunEvent = {
  run_id: string;
  seq: number;
  ts: string;
  type: EventType;
  loan_ids: string[];
  tool: string | null;
  result: Record<string, unknown> | null;
  sources: SourceRef[];
  note: string | null;
  budget: { spent: number; limit: number } | null;
  simulated: boolean;
};

export type { LoanStatus };
